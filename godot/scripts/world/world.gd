class_name LanternWorld
extends Node2D
## Native map presentation; WorldData owns travel rules and AssetCatalog owns resource paths.

signal map_entered(map_id: String, cell: Vector2i)
signal battle_finished(battle_id: String, phase: String)
signal battle_closed(battle_id: String, session: RefCounted, previous: Dictionary, story: bool)
signal dough_closed(completed: bool, rewarded: bool)

const BattleBook = preload("res://scripts/resources/battle_catalog.gd")
const BattleView = preload("res://scripts/battle/presentation/battle_view.gd")
const BattleScene = preload("res://scenes/battle/battle_view.tscn")
const SoundService = preload("res://scripts/audio/audio_service.gd")
const Prologue = preload("res://scripts/story/prologue_director.gd")
const DoughView = preload("res://scripts/puzzles/dough_view.gd")

@export var initial_map_id: String = ""
@export var persistence_enabled: bool = true
@export var save_root: String = "user://astra/saves"
@export var enable_prologue: bool = true

const DEFAULT_TERRAIN: Dictionary = {"grass": "tile.grass", "path": "tile.path", "bridge": "tile.bridge", "water": "tile.water", "border": "tile.grass"}
const TERRAIN_ROLES: Array[String] = ["grass", "path", "bridge", "water", "border"]
const DIRECTIONS: Array[Vector2i] = [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]
const INPUT_ACTIONS: Array[StringName] = [&"move_up", &"move_down", &"move_left", &"move_right"]

var loaded: bool = false
var map_data: Dictionary = {}
var catalog: AssetCatalog = AssetCatalog.new()
var world_data: WorldData = WorldData.new()
var story_rules: StoryRules = StoryRules.new()
var flags: Dictionary = {}
var lamps: Array[String] = []
var steps: int = 0
var inventory: Dictionary = {"bread": 3}
var actor_memory: Dictionary = {}
var persistence: WorldPersistence = WorldPersistence.new()
var player: GridActor
var _entities: Dictionary = {}
var _strings: Dictionary = {}
var _terrain_sources: Dictionary = {}
var _edge_source: int = -1
var _last_accessibility_payload: String = ""
var _dialogue: WorldDialogue = WorldDialogue.new()
var _interlocutor_id: String = ""
var _interlocutor_animation: Dictionary = {}
var _save_controller: WorldSaveController = WorldSaveController.new()
var _save_transfer: SaveTransfer
var _restoring_state: bool = false
var _battle: BattleView
var _battle_book: BattleBook = BattleBook.new()
var _battle_before: Dictionary = {}
var _battle_camera: Vector2 = Vector2.ZERO
var _battle_id: String = ""
var _battle_materials: Dictionary = {}
var _audio_service: SoundService
var _battle_music: String = ""
var _battle_story: bool = false
var _prologue: Node
var _story_committing: bool = false
var _dough: DoughView
var _dough_before: Dictionary = {}

@onready var ground: TileMapLayer = $Ground
@onready var edges: TileMapLayer = $Edges
@onready var actors: Node2D = $Actors
@onready var camera: Camera2D = $Camera
@onready var title_label: Label = $HUD/Title
@onready var controls_label: Label = $HUD/Controls
@onready var title_panel: NinePatchRect = $HUD/TitlePanel
@onready var controls_panel: NinePatchRect = $HUD/ControlsPanel
@onready var dialogue_box: DialogueBox = $HUD/DialogueBox
@onready var speaking_marker: Label = $SpeakingMarker
@onready var save_menu: SaveMenu = $HUD/SaveMenu

func _ready() -> void:
	if not catalog.load_pack():
		return
	var maps: Dictionary = {}
	for map_id: String in catalog.map_ids():
		maps[map_id] = catalog.map_data(map_id)
	var errors: Array[String] = world_data.configure(maps)
	if not errors.is_empty():
		push_error("World data could not load: " + "; ".join(errors))
		return
	var font: FontFile = catalog.pixel_font()
	if font == null:
		push_error("Bundled Fusion Pixel font did not load")
		return
	_strings = catalog.locale(catalog.binding("locale"))
	if _strings.is_empty():
		push_error("Localized UI table did not load")
		return
	title_label.add_theme_font_override("font", font)
	controls_label.add_theme_font_override("font", font)
	speaking_marker.add_theme_font_override("font", font)
	speaking_marker.text = String(_strings["hint.speaking"])
	var panel_texture: AtlasTexture = catalog.frame_texture(catalog.binding("panel"), 0)
	title_panel.texture = panel_texture
	controls_panel.texture = panel_texture
	dialogue_box.configure(font, panel_texture, String(_strings["hint.dialogue"]))
	var portraits: Array[String] = []
	for asset_id: String in catalog.definitions:
		if catalog.definitions[asset_id].get("category") == "portrait":
			portraits.append(asset_id)
	var story_errors: Array[String] = story_rules.configure(catalog.story_scripts(), _strings, portraits)
	if not story_errors.is_empty():
		push_error("Dialogue content could not load: " + "; ".join(story_errors))
		return
	_dialogue.configure(story_rules, _read_story_flags, apply_story_flags)
	_dialogue.line_ready.connect(_on_dialogue_line)
	_dialogue.closed.connect(_on_dialogue_closed)
	dialogue_box.advance_requested.connect(_on_dialogue_advance)
	dialogue_box.visibility_progress_changed.connect(_publish_accessibility_state)
	var persistence_errors: Array[String] = persistence.configure(maps, save_root, persistence_enabled, snapshot_state, _restore_persistent_state, catalog.binding("map"))
	if not persistence_errors.is_empty():
		push_error("Save data could not configure: " + "; ".join(persistence_errors))
		return
	save_menu.configure(font, panel_texture, _strings)
	_save_transfer = SaveTransfer.new()
	_save_transfer.name = "SaveTransfer"
	_save_transfer.setup(self, _strings)
	_save_controller.configure(persistence, save_menu, _save_transfer, _strings, _saved_map_title, _can_persistence_action)
	_save_controller.changed.connect(_on_save_presentation_changed)
	persistence.changed.connect(_on_persistence_result)
	_battle_book.configure(catalog, world_data, _strings)
	_audio_service = SoundService.new()
	_audio_service.name = "AudioService"
	add_child(_audio_service)
	_audio_service.setup(catalog)
	_audio_service.changed.connect(_publish_accessibility_state)
	_audio_service.music("test_theme")
	var options: Dictionary = _runtime_options()
	if enable_prologue and not options["explore"] and options["battle"].is_empty():
		_prologue = Prologue.new()
		_prologue.name = "PrologueDirector"
		add_child(_prologue)
		var prologue_errors: Array[String] = _prologue.setup(self,catalog,world_data,persistence.codec,_strings,_audio_service,_battle_book)
		if not prologue_errors.is_empty():
			push_error("Prologue could not configure: " + str(prologue_errors))
			return
		# Bind Node callbacks rather than creating a Progress <-> Codec reference cycle.
		persistence.codec.set_story_validator(_validate_story_state)
		persistence.set_new_game_factory(_prepare_story_start)
		_prologue.changed.connect(_on_story_changed)
	controls_label.text = String(_strings["hint.explore"])
	_install_input_actions()
	var start_id: String = initial_map_id if not initial_map_id.is_empty() else catalog.binding("map")
	if not enter_map(start_id):
		push_error("Initial map could not be entered: " + start_id)
		return
	var startup_result: Dictionary = persistence.startup()
	if _prologue != null:
		_prologue.startup(startup_result)
	_start_battle_preview.call_deferred()

func _physics_process(_delta: float) -> void:
	if not loaded or battle_active() or puzzle_active() or _story_blocks_input() or dialogue_active() or menu_active() or persistence.is_busy():
		return
	if not player.is_moving:
		for index: int in range(INPUT_ACTIONS.size()):
			if Input.is_action_pressed(INPUT_ACTIONS[index]):
				request_move(DIRECTIONS[index])
				break

func _process(_delta: float) -> void:
	if loaded:
		_update_camera()

func _input(event: InputEvent) -> void:
	if loaded and event.is_pressed() and not event.is_echo():
		_audio_service.unlock()
	if not loaded or battle_active() or puzzle_active() or _story_blocks_input() or _save_controller.is_busy() or (event is InputEventKey and event.echo):
		return
	if _prologue != null and event is InputEventKey and event.pressed and event.physical_keycode == KEY_R:
		get_viewport().set_input_as_handled()
		_prologue.toggle_setting("reduced")
		return
	if event is InputEventKey and event.pressed and event.physical_keycode == KEY_M:
		_audio_service.set_muted(not _audio_service.is_muted())
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed(&"save_menu"):
		if menu_active():
			close_save_menu()
		else:
			open_save_menu()
		get_viewport().set_input_as_handled()
	elif menu_active() and event.is_action_pressed(&"save_cancel"):
		_save_controller.cancel()
		get_viewport().set_input_as_handled()
	elif menu_active() and event.is_action_pressed(&"save_confirm"):
		_save_controller.confirm()
		get_viewport().set_input_as_handled()

func _unhandled_input(event: InputEvent) -> void:
	if not loaded or battle_active() or puzzle_active() or _story_blocks_input() or menu_active() or persistence.is_busy() or (event is InputEventKey and event.echo):
		return
	if not dialogue_active():
		for index: int in INPUT_ACTIONS.size():
			if event.is_action_pressed(INPUT_ACTIONS[index]):
				get_viewport().set_input_as_handled()
				request_move(DIRECTIONS[index])
				return
	if event is InputEventKey and event.pressed and event.physical_keycode in [KEY_F5, KEY_F6]:
		if not flags.get("p.main_started",false):
			start_battle("prologue_ella" if event.physical_keycode == KEY_F5 else "prologue_shade")
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed(&"interact"):
		if dialogue_active():
			confirm_dialogue()
		else:
			interact()
		get_viewport().set_input_as_handled()
	elif dialogue_active() and event.is_action_pressed(&"dialogue_reveal"):
		reveal_dialogue()
		get_viewport().set_input_as_handled()

func request_move(direction: Vector2i) -> bool:
	if not loaded or battle_active() or puzzle_active() or _story_blocks_input() or dialogue_active() or menu_active() or persistence.is_busy() or player.is_moving or not direction in DIRECTIONS:
		return false
	player.face(direction)
	if not is_walkable(player.grid_position + direction):
		_refresh_interaction_hint()
		_publish_accessibility_state()
		return false
	player.begin_step(direction)
	_refresh_interaction_hint()
	_publish_accessibility_state()
	return true

func enter_map(map_id: String, at: Vector2i = Vector2i(-1, -1)) -> bool:
	if battle_active() or puzzle_active() or _story_blocks_input() or dialogue_active() or menu_active() or persistence.is_busy() or (is_instance_valid(player) and player.is_moving) or not world_data.validate_state(flags).is_empty():
		return false
	return _enter_validated_map(map_id, at)

func interact() -> bool:
	if not loaded or battle_active() or puzzle_active() or _story_blocks_input() or player.is_moving or dialogue_active() or menu_active() or persistence.is_busy():
		return false
	if _prologue != null and _prologue.try_interact():
		return true
	var target: Dictionary = _interaction_target()
	if target.is_empty():
		controls_label.text = String(_strings["hint.no_target"])
		return false
	if target["kind"] == "lamp":
		return open_save_menu() if String(target["id"]) in lamps else light_facing_lamp()
	_interlocutor_id = String(target["id"]) if target["kind"] == "npc" else ""
	_turn_interlocutor()
	var started: bool = _dialogue.begin(String(target["script"]))
	if not started:
		_restore_interlocutor()
		_interlocutor_id = ""
		controls_label.text = String(_strings["hint.interaction_failed"])
	return started

func snapshot_state() -> Dictionary:
	return {
		"version": 3,
		"mapId": String(map_data.get("id", "")),
		"player": {"x": player.grid_position.x, "y": player.grid_position.y, "facing": player.facing} if is_instance_valid(player) else {"x": 0, "y": 0, "facing": "down"},
		"followers": [],
		"actors": {},
		"actorMemory": actor_memory.duplicate(true),
		"flags": flags.duplicate(true),
		"lamps": lamps.duplicate(),
		"steps": steps,
		"inventory": inventory.duplicate(true),
	}

func restore_state(state: Dictionary) -> bool:
	if not _can_persistence_action() or menu_active() or _save_controller.is_busy():
		return false
	return _restore_persistent_state(state)

func save_slot(slot: int) -> Dictionary:
	if not _can_persistence_action() or _save_controller.is_busy():
		return persistence.report_failure("save.busy", "save")
	return persistence.save_slot(slot)

func load_slot(slot: int) -> Dictionary:
	if not _can_persistence_action() or _save_controller.is_busy():
		return persistence.report_failure("save.busy", "load")
	return persistence.load_slot(slot)

func import_save(text: String) -> Dictionary:
	if not _can_persistence_action() or _save_controller.is_busy():
		return persistence.report_failure("save.busy", "import")
	return persistence.import_save(text)

func export_save() -> Dictionary:
	if not _can_persistence_action() or _save_controller.is_busy():
		return persistence.report_failure("save.busy", "export")
	return persistence.export_save()

func start_new_game() -> Dictionary:
	if not _can_persistence_action() or _save_controller.is_busy():
		return persistence.report_failure("save.busy", "new")
	return persistence.start_new_game()

func menu_active() -> bool:
	return _save_controller.is_active()

func open_save_menu() -> bool:
	return _save_controller.open() if _can_persistence_action() and not _story_blocks_input() else false

func close_save_menu() -> void:
	_save_controller.close()

func light_facing_lamp() -> bool:
	if not _can_persistence_action() or menu_active() or _save_controller.is_busy():
		return false
	if _prologue != null and not _prologue.can_light_lamp():
		_audio_service.play("deny")
		controls_label.text = _strings["prologue.ui.hint.need_travel_lamp"]
		return false
	var target: Dictionary = _interaction_target()
	if target.is_empty() or target["kind"] != "lamp":
		persistence.report_failure("save.not_facing_lamp", "lamp")
		return false
	var result: Dictionary = persistence.codec.light_lamp(snapshot_state(), String(target["id"]))
	if not bool(result.get("ok", false)):
		persistence.report_failure(String(result.get("error", "save.unknown_lamp")), "lamp")
		return false
	if bool(result["newly_lit"]):
		_audio_service.play("lamp")
		lamps.assign(result["state"]["lamps"])
		_refresh_lamp_visuals()
		var saved: Dictionary = persistence.autosave()
		var message: String = "lamp.lit" if saved.get("ok",false) or not persistence.enabled else String(saved.get("error","save.io"))
		controls_label.text = String(_strings.get(message,_strings["save.failed"]))
	_publish_accessibility_state()
	if _prologue != null:
		_prologue.explore_changed()
	return true

func _restore_persistent_state(state: Dictionary) -> bool:
	if not _can_persistence_action():
		return false
	var validation: Dictionary = persistence.codec.validate(state)
	if not bool(validation.get("ok", false)):
		return false
	var normalized: Dictionary = validation["state"]
	var target_map: Dictionary = world_data.get_map(String(normalized["mapId"]), normalized["flags"])
	if target_map.is_empty() or not _can_render_map(target_map):
		return false
	var previous: Dictionary = snapshot_state()
	var position: Dictionary = normalized["player"]
	_restoring_state = true
	_assign_persistent_fields(normalized)
	if not _enter_validated_map(String(normalized["mapId"]), Vector2i(int(position["x"]), int(position["y"]))):
		_assign_persistent_fields(previous)
		_restoring_state = false
		return false
	player.face(_direction_for_facing(String(position["facing"])))
	_restoring_state = false
	_refresh_interaction_hint()
	_publish_accessibility_state()
	return true

func _assign_persistent_fields(state: Dictionary) -> void:
	flags = (state["flags"] as Dictionary).duplicate(true)
	lamps.assign(state["lamps"])
	steps = int(state["steps"])
	inventory = (state["inventory"] as Dictionary).duplicate(true)
	actor_memory = (state["actorMemory"] as Dictionary).duplicate(true)

func _can_persistence_action() -> bool:
	return loaded and not battle_active() and not puzzle_active() and is_instance_valid(player) and not player.is_moving and not dialogue_active() and not _restoring_state and (_story_committing or _prologue == null or not _prologue.blocks_persistence())

func _story_blocks_input() -> bool:
	return _prologue != null and _prologue.is_modal()
func story_state() -> Dictionary:
	return _prologue.snapshot() if _prologue != null else {"mode":"","step":"","enabled":false}
func _validate_story_state(state: Dictionary) -> String:
	return _prologue.validate_story_state(state)
func _prepare_story_start(state: Dictionary) -> Dictionary:
	return _prologue.prepare_new_game(state)
func apply_story_checkpoint(state: Dictionary) -> bool:
	_story_committing = true
	var restored: bool = _restore_persistent_state(state)
	_story_committing = false
	return restored
func _on_story_changed() -> void:
	$HUD.visible = not battle_active() and not puzzle_active() and not _story_blocks_input()
	if loaded:
		var map_title: String = String(_strings.get(map_data.get("name",""),""))
		title_label.text = map_title if flags.get("p.main_started",false) and not flags.get("p.departed",false) else String(_strings["game.title"]) + "  ·  " + map_title
		if not menu_active() and not dialogue_active() and not _story_blocks_input():
			_refresh_interaction_hint()
	_publish_accessibility_state()

func _saved_map_title(map_id: String) -> String:
	var source: Dictionary = world_data.get_map(map_id)
	return String(_strings.get(source.get("name", ""), ""))

func _on_save_presentation_changed() -> void:
	var show_controls: bool = not menu_active() and not dialogue_active()
	controls_panel.visible = show_controls
	controls_label.visible = show_controls
	if show_controls:
		_refresh_interaction_hint()
	_publish_accessibility_state()
	if _prologue != null:
		_prologue.explore_changed()

func _on_persistence_result(result: Dictionary) -> void:
	if not menu_active() and not dialogue_active():
		controls_label.text = String(_strings.get(result.get("status", ""), _strings["save.failed"]))
	_publish_accessibility_state()

func _refresh_lamp_visuals() -> void:
	for entity: Dictionary in map_data["entities"]:
		if entity["kind"] != "lamp":
			continue
		var sprite: AnimatedSprite2D = find_entity(String(entity["id"]))
		var animation: StringName = &"lit" if String(entity["id"]) in lamps else &"unlit"
		if sprite != null and sprite.animation != animation:
			sprite.play(animation)

func confirm_dialogue() -> void:
	if dialogue_active():
		dialogue_box.request_confirm()

func reveal_dialogue() -> void:
	if dialogue_active():
		dialogue_box.reveal_all()

func dialogue_active() -> bool:
	return _dialogue.is_active()

func dialogue_state() -> Dictionary:
	if not dialogue_active():
		return {"active": false, "script": "", "speaker": "", "text": "", "full_text": "", "revealed": false}
	var line: Dictionary = _dialogue.current_line()
	return {
		"active": true,
		"script": _dialogue.script_id,
		"speaker": String(_strings.get(line.get("speaker", ""), "")),
		"text": dialogue_box.visible_text(),
		"full_text": String(_strings.get(line.get("text", ""), "")),
		"revealed": dialogue_box.is_revealed(),
	}

func apply_story_flags(candidate: Dictionary) -> bool:
	if not loaded or battle_active() or player.is_moving or menu_active() or persistence.is_busy() or _restoring_state:
		return _reject_story_flags()
	if candidate == flags:
		return true
	var map_id: String = String(map_data["id"])
	var cell: Vector2i = player.grid_position
	if not world_data.validate_position(map_id, cell, candidate).is_empty():
		return _reject_story_flags()
	var next_map: Dictionary = world_data.get_map(map_id, candidate)
	if next_map.is_empty() or not _can_render_map(next_map):
		return _reject_story_flags()
	var layout_changed: bool = next_map["entities"] != map_data["entities"]
	var previous_flags: Dictionary = flags
	flags = candidate.duplicate(true)
	if layout_changed:
		if not _enter_validated_map(map_id, cell):
			flags = previous_flags
			return _reject_story_flags()
	else:
		map_data = next_map
		_refresh_interaction_hint()
	return true

func _read_story_flags() -> Dictionary:
	return flags.duplicate(true)

func _reject_story_flags() -> bool:
	_dialogue.cancel("Story flag transaction was rejected")
	return false

func _on_dialogue_line(line: Dictionary) -> void:
	controls_panel.hide()
	controls_label.hide()
	dialogue_box.show_line(String(_strings[line["speaker"]]), String(_strings[line["text"]]), catalog.frame_texture(String(line["portrait"]), 0))
	_update_speaking_marker(line)
	_publish_accessibility_state()

func _on_dialogue_advance() -> void:
	_audio_service.play("confirm")
	_dialogue.advance()

func _on_dialogue_closed(error: String) -> void:
	dialogue_box.close()
	speaking_marker.hide()
	_restore_interlocutor()
	_interlocutor_id = ""
	controls_panel.show()
	controls_label.show()
	_refresh_interaction_hint()
	if not error.is_empty():
		controls_label.text = String(_strings["hint.interaction_failed"])
	_publish_accessibility_state()
	if _prologue != null:
		_prologue.explore_changed()

func _interaction_target() -> Dictionary:
	return world_data.interaction_target(map_data, player.grid_position, _direction_for_facing(player.facing))

func _direction_for_facing(facing: String) -> Vector2i:
	var direction: Vector2i = Vector2i.DOWN
	match facing:
		"up": direction = Vector2i.UP
		"left": direction = Vector2i.LEFT
		"right": direction = Vector2i.RIGHT
	return direction

func _refresh_interaction_hint() -> void:
	if not loaded or battle_active() or dialogue_active() or menu_active():
		return
	if _prologue != null and flags.get("p.main_started",false):
		var warning: String = _prologue.warning()
		var goal: String = _prologue.objective()
		if not warning.is_empty():
			controls_label.text = warning
			return
		if not goal.is_empty():
			controls_label.text = String(_strings["prologue.ui.field.hint"]).replace("{goal}",goal)
			return
	var target: Dictionary = {} if player.is_moving else _interaction_target()
	var key: String = "hint.explore"
	if not target.is_empty():
		if target["kind"] == "lamp":
			key = "hint.lamp_menu" if String(target["id"]) in lamps else "hint.light_lamp"
		else:
			key = "hint.talk" if target["kind"] == "npc" else "hint.inspect"
	controls_label.text = String(_strings[key])

func _turn_interlocutor() -> void:
	var sprite: AnimatedSprite2D = find_entity(_interlocutor_id)
	if sprite == null or not _interlocutor_animation.is_empty():
		return
	var delta: Vector2 = player.position - sprite.position
	var facing: String = "down"
	if absf(delta.x) > absf(delta.y):
		facing = "right" if delta.x > 0 else "left"
	else:
		facing = "down" if delta.y >= 0 else "up"
	var animation: StringName = StringName("idle_" + facing)
	if not sprite.sprite_frames.has_animation(animation):
		return
	_interlocutor_animation = {"animation": sprite.animation, "frame": sprite.frame, "progress": sprite.frame_progress, "speed": sprite.speed_scale, "playing": sprite.is_playing()}
	sprite.play(animation)

func _restore_interlocutor() -> void:
	var sprite: AnimatedSprite2D = find_entity(_interlocutor_id)
	if sprite != null and not _interlocutor_animation.is_empty():
		sprite.speed_scale = float(_interlocutor_animation["speed"])
		sprite.play(StringName(_interlocutor_animation["animation"]))
		sprite.set_frame_and_progress(int(_interlocutor_animation["frame"]), float(_interlocutor_animation["progress"]))
		if not bool(_interlocutor_animation["playing"]):
			sprite.pause()
	_interlocutor_animation.clear()

func _update_speaking_marker(line: Dictionary) -> void:
	speaking_marker.hide()
	if line.is_empty():
		return
	var actor_id: String = "char." + String(line["portrait"]).trim_prefix("portrait.")
	var speaker_node: Node2D
	if actor_id == catalog.binding("player"):
		speaker_node = player
	else:
		for entity: Dictionary in map_data["entities"]:
			if entity["sprite"] == actor_id:
				speaker_node = find_entity(String(entity["id"]))
				if entity["id"] == _interlocutor_id:
					break
	if speaker_node != null:
		speaking_marker.position = speaker_node.position + Vector2(-6, -catalog.anchor(actor_id).y - 14)
		speaking_marker.show()

func _enter_validated_map(map_id: String, at: Vector2i) -> bool:
	var candidate: Dictionary = world_data.get_map(map_id, flags)
	if candidate.is_empty() or not _can_render_map(candidate):
		return false
	var destination: Vector2i = at
	if destination == Vector2i(-1, -1):
		var spawn: Dictionary = candidate["spawn"]
		destination = Vector2i(int(spawn["x"]), int(spawn["y"]))
	if not world_data.is_safe_entry(candidate, destination):
		return false
	var previous_map: String = String(map_data.get("id", ""))
	var facing: String = player.facing if is_instance_valid(player) else "down"
	_restore_interlocutor()
	loaded = false
	ground.clear()
	edges.clear()
	for child: Node in actors.get_children():
		actors.remove_child(child)
		child.queue_free()
	_entities.clear()
	map_data = candidate
	_build_ground()
	_build_entities()
	player = GridActor.new()
	player.name = "Player"
	player.facing = facing
	player.setup(catalog, destination)
	actors.add_child(player)
	_refresh_ground_shadow()
	player.step_finished.connect(_on_player_step_finished)
	title_label.text = String(_strings["game.title"]) + "  ·  " + String(_strings[map_data["name"]])
	_update_camera()
	loaded = true
	if dialogue_active():
		_turn_interlocutor()
		_update_speaking_marker(_dialogue.current_line())
	_refresh_interaction_hint()
	_publish_accessibility_state()
	map_entered.emit(map_id, destination)
	if not _restoring_state and not previous_map.is_empty() and previous_map != map_id:
		persistence.autosave()
	return true

func accessibility_state() -> Dictionary:
	var dialogue: Dictionary = dialogue_state()
	var menu: Dictionary = _save_controller.snapshot()
	var sorted_lamps: Array[String] = lamps.duplicate()
	sorted_lamps.sort()
	return {
		"story_ui": JSON.stringify(story_state()),
		"puzzle_ui": JSON.stringify(puzzle_state()),
		"audio_state": JSON.stringify(audio_state()),
		"battle_active": battle_active(),
		"battle_id": _battle_id if battle_active() else "",
		"battle_ui": JSON.stringify(_battle.ui_state()) if battle_active() and _battle.loaded else "{}",
		"ready": loaded,
		"map_id": String(map_data.get("id", "")),
		"grid_x": player.grid_position.x if player != null else -1,
		"grid_y": player.grid_position.y if player != null else -1,
		"facing": player.facing if player != null else "",
		"moving": player.is_moving if player != null else false,
		"dialogue_active": dialogue["active"],
		"speaker": dialogue["speaker"],
		"dialogue_text": dialogue["text"],
		"dialogue_revealed": dialogue["revealed"],
		"dialogue_script": dialogue["script"],
		"lamps": lamps.size(),
		"lit_lamps": ",".join(sorted_lamps),
		"save_menu": menu["open"],
		"save_status": persistence.last_status,
		"save_slot": menu["slot"],
		"save_confirming": menu["confirming"],
	}

func _on_player_step_finished(cell: Vector2i) -> void:
	_audio_service.play("step")
	steps = mini(steps + 1, SaveCodec.MAX_INTEGER)
	if map_data["id"] == "lv.bakery" and flags.get("q.dough_started",false) and map_data["exits"].any(func(door: Dictionary) -> bool: return Vector2i(int(door["x"]),int(door["y"])) == cell):
		var finished_visit: Dictionary = flags.duplicate(true)
		finished_visit["q.dough_started"] = false
		apply_story_flags(finished_visit)
	var result: Dictionary = world_data.transition(String(map_data["id"]), cell, flags)
	if bool(result.get("ok", false)):
		# transition has already validated all layouts and exits for these flags.
		if _enter_validated_map(String(result["map_id"]), result["position"]):
			return
	_refresh_ground_shadow()
	_refresh_interaction_hint()
	_publish_accessibility_state()
	if _prologue != null:
		_prologue.explore_changed()

func _refresh_ground_shadow() -> void:
	var cell: Vector2i = player.grid_position
	var tile: String = String(map_data["rows"][cell.y])[cell.x]
	player.set_ground_shadow(catalog, _terrain_asset(_terrain_role(tile), map_data))

func _publish_accessibility_state() -> void:
	if not OS.has_feature("web") or not Engine.has_singleton("JavaScriptBridge"):
		return
	var payload: String = JSON.stringify({"state": accessibility_state(), "label": String(_strings.get("battle.title." + _battle_id, title_label.text)) if battle_active() else title_label.text})
	if payload == _last_accessibility_payload:
		return
	_last_accessibility_payload = payload
	# A one-way snapshot for assistive tools and browser automation; no JS callback mutates gameplay.
	var script: String = "(() => { const canvas = document.getElementById('canvas'); if (!canvas) return; const snapshot = %s; Object.assign(canvas.dataset, snapshot.state); canvas.setAttribute('aria-label', snapshot.label); })();" % payload
	Engine.get_singleton("JavaScriptBridge").call("eval", script)

func is_walkable(cell: Vector2i) -> bool:
	return world_data.is_walkable(map_data, cell)

func find_entity(entity_id: String) -> AnimatedSprite2D:
	return _entities.get(entity_id) as AnimatedSprite2D

func _can_render_map(candidate: Dictionary) -> bool:
	if not _strings.has(candidate["name"]):
		return false
	for role: String in TERRAIN_ROLES:
		var asset_id: String = _terrain_asset(role, candidate)
		if not catalog.definitions.has(asset_id):
			return false
		var size: Array = catalog.definitions[asset_id]["size"]
		if int(size[0]) != 16 or int(size[1]) != 16:
			return false
	for entity: Dictionary in candidate["entities"]:
		if not catalog.definitions.has(String(entity["sprite"])):
			return false
	return true

func _terrain_asset(role: String, data: Dictionary) -> String:
	var terrain: Dictionary = data.get("terrain", {})
	return String(terrain.get(role, DEFAULT_TERRAIN[role]))

func _terrain_role(tile: String) -> String:
	match tile:
		"s": return "path"
		"b": return "bridge"
		"w": return "water"
		"t": return "border"
		_: return "grass"

func _build_ground() -> void:
	var tiles: TileSet = TileSet.new()
	tiles.tile_size = Vector2i(16, 16)
	var asset_sources: Dictionary = {}
	_terrain_sources.clear()
	for role: String in TERRAIN_ROLES:
		var asset_id: String = _terrain_asset(role, map_data)
		if not asset_sources.has(asset_id):
			asset_sources[asset_id] = asset_sources.size()
		_terrain_sources[role] = asset_sources[asset_id]
	asset_sources["tile.edge"] = asset_sources.size()
	_edge_source = int(asset_sources["tile.edge"])
	for asset_id: String in asset_sources:
		var atlas: TileSetAtlasSource = TileSetAtlasSource.new()
		atlas.texture = catalog.texture(asset_id)
		atlas.texture_region_size = Vector2i(16, 16)
		for frame_index: int in range(int(catalog.definitions[asset_id]["frames"])):
			atlas.create_tile(Vector2i(frame_index, 0))
		tiles.add_source(atlas, int(asset_sources[asset_id]))
	ground.tile_set = tiles
	edges.tile_set = tiles
	for y: int in range(int(map_data["height"])):
		for x: int in range(int(map_data["width"])):
			var cell: Vector2i = Vector2i(x, y)
			var tile: String = String(map_data["rows"][y])[x]
			var hash_value: int = ((x * 73856093) ^ (y * 19349663)) & 0xffffffff
			var role: String = _terrain_role(tile)
			var asset_id: String = _terrain_asset(role, map_data)
			var count: int = int(catalog.definitions[asset_id]["frames"])
			var idle: Dictionary = catalog.definitions[asset_id]["animations"].get("idle", {})
			var animated: bool = idle.get("frames", []).size() > 1
			var variant: int = 0 if animated else hash_value % count
			if asset_id == "tile.grass":
				variant = 0 if hash_value % 10 < 7 else 1 + hash_value % 3
			ground.set_cell(cell, int(_terrain_sources[role]), Vector2i(variant, 0))
			if tile == "g" and asset_id == "tile.grass" and _terrain_asset("path", map_data) == "tile.path":
				edges.set_cell(cell, _edge_source, Vector2i(_edge_mask(cell), 0))
			if animated:
				_add_decoration(asset_id, cell, y if tile == "w" else x * 11 + y * 23, -1)
			if tile == "t" and asset_id == "tile.grass":
				_add_decoration("prop.hedge", cell, x * 11 + y * 23)
			elif tile == "g" and asset_id == "tile.grass" and (x * 11 + y * 23) % 41 == 0:
				_add_decoration("prop.flower", cell, x * 11 + y * 23, -1)

func _edge_mask(cell: Vector2i) -> int:
	var mask: int = 0
	var neighbors: Array[Vector2i] = [Vector2i.UP, Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT]
	for index: int in range(neighbors.size()):
		var neighbor: Vector2i = cell + neighbors[index]
		if neighbor.x >= 0 and neighbor.y >= 0 and neighbor.x < int(map_data["width"]) and neighbor.y < int(map_data["height"]):
			if String(map_data["rows"][neighbor.y])[neighbor.x] == "s":
				mask |= 1 << index
	return mask

func _add_decoration(asset_id: String, cell: Vector2i, phase: int, layer: int = 0) -> void:
	var sprite: AnimatedSprite2D = catalog.animated_sprite(asset_id, &"idle", phase)
	sprite.position = GridActor.cell_feet(cell)
	sprite.z_index = layer
	actors.add_child(sprite)

func _build_entities() -> void:
	for entity: Dictionary in map_data["entities"]:
		var entity_id: String = entity["id"]
		var asset_id: String = entity["sprite"]
		var animation: StringName = &"idle"
		if entity["kind"] == "lamp":
			animation = &"lit" if String(entity["id"]) in lamps else &"unlit"
		var sprite: AnimatedSprite2D = catalog.animated_sprite(asset_id, animation, int(entity_id.hash()))
		sprite.name = entity_id
		sprite.position = GridActor.cell_feet(Vector2i(int(entity["x"]), int(entity["y"])))
		if asset_id.begins_with("tile."):
			sprite.z_index = -1
		actors.add_child(sprite)
		_entities[entity_id] = sprite

func _install_input_actions() -> void:
	var keys: Array[Array] = [[KEY_UP, KEY_W], [KEY_DOWN, KEY_S], [KEY_LEFT, KEY_A], [KEY_RIGHT, KEY_D]]
	for index: int in range(INPUT_ACTIONS.size()):
		var action: StringName = INPUT_ACTIONS[index]
		if InputMap.has_action(action):
			continue
		InputMap.add_action(action)
		for code: Key in keys[index]:
			var event: InputEventKey = InputEventKey.new()
			event.physical_keycode = code
			InputMap.action_add_event(action, event)
	var dialogue_actions: Dictionary = {
		&"interact": [KEY_Z, KEY_SPACE, KEY_ENTER, KEY_KP_ENTER],
		&"dialogue_reveal": [KEY_X],
		&"save_menu": [KEY_C, KEY_TAB],
		&"save_cancel": [KEY_X, KEY_ESCAPE],
		&"save_confirm": [KEY_Z],
	}
	for action: StringName in dialogue_actions:
		if InputMap.has_action(action):
			continue
		InputMap.add_action(action)
		for code: Key in dialogue_actions[action]:
			var event: InputEventKey = InputEventKey.new()
			event.physical_keycode = code
			InputMap.action_add_event(action, event)

func _update_camera() -> void:
	if battle_active():
		camera.position = _battle_camera
		return
	var focus: Vector2 = player.position - Vector2(0, 8)
	camera.position = Vector2(_camera_axis(focus.x, int(map_data["width"]) * 16, 480), _camera_axis(focus.y, int(map_data["height"]) * 16, 270))

func _camera_axis(focus: float, map_pixels: int, viewport_pixels: int) -> int:
	if map_pixels <= viewport_pixels:
		return floori(float(map_pixels) / 2.0)
	var half_viewport: int = floori(float(viewport_pixels) / 2.0)
	return clampi(roundi(focus), half_viewport, map_pixels - half_viewport)

func battle_active() -> bool:
	return is_instance_valid(_battle)

func puzzle_active() -> bool:
	return is_instance_valid(_dough)
func puzzle_state() -> Dictionary:
	return _dough.snapshot() if puzzle_active() else {"active":false}
func start_dough() -> bool:
	if not _can_persistence_action() or menu_active() or map_data["id"] != "lv.bakery" or not catalog.has_table("puzzle.dough"):
		return false
	var definition: Dictionary = catalog.table_data("puzzle.dough")
	var ready: Dictionary = snapshot_state()
	ready["flags"]["q.dough_started"] = true
	if not apply_story_checkpoint(ready):
		return false
	var view: DoughView = DoughView.new()
	view.name = "DoughView"
	add_child(view)
	if not view.setup(self,catalog,definition,_strings):
		view.queue_free()
		return false
	_dough_before = snapshot_state()
	_dough = view
	view.close_requested.connect(_close_dough)
	view.sound_requested.connect(_audio_service.play)
	view.mute_requested.connect(func() -> void: _audio_service.set_muted(not _audio_service.is_muted()))
	view.changed.connect(_publish_accessibility_state)
	$HUD.hide()
	_publish_accessibility_state()
	return true
func _close_dough(exit_room: bool = false) -> void:
	if not puzzle_active():
		return
	var view: DoughView = _dough
	var completed: bool = view.completed_once
	var state: Dictionary = _dough_before.duplicate(true)
	var local: Dictionary = view.snapshot()["state"]
	var rewarded: bool = completed and not state["flags"].get("q.dough_rewarded",false)
	state["steps"] = mini(SaveCodec.MAX_INTEGER,int(state["steps"])+view.moves)
	if completed:
		state["flags"]["q.dough_done"] = true
		if rewarded:
			state["flags"]["q.dough_rewarded"] = true
			for item: String in local["display"].get("reward",{}):
				state["inventory"][item] = mini(999,int(state["inventory"].get(item,0))+int(local["display"]["reward"][item]))
	if exit_room:
		state["flags"]["q.dough_started"] = false
		var transition: Dictionary = world_data.transition("lv.bakery",Vector2i(int(local["player"]["x"]),int(local["player"]["y"])),state["flags"])
		if transition["ok"]:
			state["mapId"] = transition["map_id"]
			state["player"]["x"] = transition["position"].x
			state["player"]["y"] = transition["position"].y
	_dough = null
	_dough_before = {}
	remove_child(view)
	view.queue_free()
	apply_story_checkpoint(state)
	persistence.autosave()
	$HUD.show()
	dough_closed.emit(completed,rewarded)
	_publish_accessibility_state()

func audio_state() -> Dictionary:
	return _audio_service.snapshot() if is_instance_valid(_audio_service) else {}

func start_battle(id: String, inventory_override: Variant = null, story_mode: bool = false) -> bool:
	if not _can_persistence_action() or menu_active() or _save_controller.is_busy():
		return false
	var prepared: Dictionary = _battle_book.prepare(id, flags)
	if not prepared["ok"]:
		controls_label.text = String(_strings["battle.error.setup"])
		return false
	if inventory_override != null:
		if not inventory_override is Dictionary:
			return false
		prepared["definition"]["inventory"] = inventory_override.duplicate(true)
	prepared["story_mode"] = story_mode
	var previous: Dictionary = snapshot_state()
	var arena: Dictionary = prepared["arena"]
	_restoring_state = true
	var entered: bool = _enter_validated_map(prepared["presentation"]["map"], Vector2i(int(arena["x"]) + 1, int(arena["y"]) + 3))
	_restoring_state = false
	if not entered:
		return false
	_battle_camera = Vector2((float(arena["x"]) + float(arena["width"]) / 2) * 16, (float(arena["y"]) + float(arena["height"]) / 2) * 16)
	camera.position = _battle_camera
	camera.force_update_scroll()
	var dim: ShaderMaterial = catalog.palette_dimmer(Rect2(Vector2(arena["x"] * 16, arena["y"] * 16), Vector2(arena["width"] * 16, arena["height"] * 16)))
	_battle_materials.clear()
	for node: CanvasItem in [ground, edges] + actors.get_children():
		_battle_materials[node] = node.material
		if dim != null:
			node.material = dim
	var view: BattleView = BattleScene.instantiate() as BattleView
	view.muted = _audio_service.is_muted()
	if _prologue != null:
		view.reduced_motion = _prologue.reduced_motion
	if not view.setup(catalog, prepared, _strings, actors):
		view.free()
		_restore_battle_materials()
		_restore_persistent_state(previous)
		return false
	_battle_before = previous
	_battle_id = id
	_battle = view
	_battle_story = story_mode
	view.name = "BattleView"
	view.changed.connect(_publish_accessibility_state)
	view.close_requested.connect(close_battle)
	view.gesture_received.connect(_audio_service.unlock)
	view.sound_requested.connect(_audio_service.play)
	view.muted_changed.connect(_audio_service.set_muted)
	view.restarted.connect(_restart_battle_sound)
	view.outcome_presented.connect(_on_battle_outcome_sound)
	if _prologue != null:
		view.reduced_changed.connect(_prologue.set_reduced)
	add_child(view)
	_battle_music = prepared["presentation"]["music"]
	_restart_battle_sound()
	player.hide()
	for entity: Dictionary in map_data["entities"]:
		if entity["kind"] == "npc" or String(entity["sprite"]).begins_with("astral."):
			var sprite: AnimatedSprite2D = find_entity(entity["id"])
			if sprite != null:
				sprite.hide()
	$HUD.hide()
	_publish_accessibility_state()
	return true

func close_battle() -> void:
	if not battle_active():
		return
	var id: String = _battle_id
	var phase: String = _battle.ui_state()["snapshot"]["battle"]["phase"]
	var view: BattleView = _battle
	var session: RefCounted = view.session_handle()
	var story: bool = _battle_story
	_audio_service.stop_effects()
	if not story:
		_audio_service.music("test_theme")
	_battle = null
	remove_child(view)
	view.queue_free()
	$HUD.show()
	_restore_battle_materials()
	var saved: Dictionary = _battle_before
	_battle_before = {}
	_battle_id = ""
	_battle_story = false
	if not _restore_persistent_state(saved):
		push_error("Battle preview could not restore its validated exploration snapshot")
	_publish_accessibility_state()
	battle_finished.emit(id, phase)
	battle_closed.emit(id,session,saved.duplicate(true),story)

func battle_session() -> RefCounted:
	return _battle.session_handle() if battle_active() else null

func _restart_battle_sound() -> void:
	_audio_service.stop_effects()
	_audio_service.music(_battle_music)

func _on_battle_outcome_sound(_phase: String) -> void:
	_audio_service.stop_effects()
	_audio_service.music("")

func _start_battle_preview() -> void:
	var requested: String = _runtime_options()["battle"]
	if requested in ["prologue_ella", "prologue_shade"]:
		start_battle(requested)

func _runtime_options() -> Dictionary:
	var result: Dictionary = {"battle":"","explore":false}
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--battle="):
			result["battle"] = argument.trim_prefix("--battle=")
		elif argument == "--explore":
			result["explore"] = true
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var value: Variant = Engine.get_singleton("JavaScriptBridge").call("eval", "JSON.stringify({battle:new URLSearchParams(location.search).get('battle')||'',explore:new URLSearchParams(location.search).get('explore')==='1'})", true)
		if value is String:
			var parsed: Variant = JSON.parse_string(value)
			if parsed is Dictionary:
				result.merge(parsed,true)
	if not result["battle"] in ["prologue_ella","prologue_shade"]:
		result["battle"] = ""
	return result

func _restore_battle_materials() -> void:
	for node: Variant in _battle_materials:
		if is_instance_valid(node):
			node.material = _battle_materials[node]
	_battle_materials.clear()
