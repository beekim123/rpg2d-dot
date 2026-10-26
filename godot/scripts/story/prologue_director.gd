extends Node
## Native coordination only; Progress owns checkpoint decisions and battle authorization.
signal changed
signal step_started(step: Dictionary)
signal step_completed(step: Dictionary)
const Book = preload("res://scripts/story/prologue_content.gd")
const Progress = preload("res://scripts/story/prologue_progress.gd")
const Session = preload("res://scripts/battle/battle_session.gd")
const OverlayScene = preload("res://scenes/story/prologue_overlay.tscn")
const LEGEND_IMAGES: Array[String] = ["scene.legend.sky","scene.legend.shatter","scene.legend.fall","scene.legend.fall","scene.legend.lamp","scene.legend.lamp"]
var reduced_motion: bool = false
var _world: Node
var _catalog: AssetCatalog
var _worlds: WorldData
var _codec: SaveCodec
var _audio: Node
var _words: Dictionary = {}
var _book: Book = Book.new()
var _rules: Progress = Progress.new()
var _overlay: Node
var _pending: Dictionary = {}
var _before: Dictionary = {}
var _event: String = ""
var _queued: bool = false
var _transitioning: bool = false
var _management: bool = false
var _resume_in_memory: bool = false
var _ending_seen: bool = false
var _continue_slot: int = -1
var _has_auto_record: bool = false
var _save_warning: String = ""
var _side_dialogue: bool = false

func setup(world: Node, catalog: AssetCatalog, worlds: WorldData, codec: SaveCodec, words: Dictionary, audio: Node, battle_book: RefCounted) -> Array[String]:
	_world = world
	_catalog = catalog
	_worlds = worlds
	_codec = codec
	_words = words.duplicate(true)
	_audio = audio
	var portraits: Array[String] = []
	for id: String in catalog.definitions:
		if catalog.definitions[id].get("category") == "portrait":
			portraits.append(id)
	var errors: Array[String] = _book.configure(catalog.cinematic_data("prologue"),words,portraits)
	if not errors.is_empty():
		return errors
	for id: String in LEGEND_IMAGES + ["char.finn_unarmed"]:
		if not catalog.definitions.has(id):
			return ["Missing prologue art: " + id]
	var templates: Dictionary = {}
	for id: String in ["prologue_ella","prologue_shade"]:
		var prepared: Dictionary = battle_book.prepare(id)
		if not prepared["ok"]:
			return ["Invalid story battle: " + id]
		templates[id] = prepared
	errors = _rules.configure(catalog.table_data("prologue.flow"),worlds,codec,_book,words,catalog.table_data("battle.support"),templates)
	if not errors.is_empty():
		return errors
	_overlay = OverlayScene.instantiate()
	add_child(_overlay)
	_overlay.setup(catalog,words)
	_overlay.segment_finished.connect(_finish_segment)
	_overlay.option_chosen.connect(_choose)
	_overlay.cancelled.connect(_cancel)
	_overlay.changed.connect(func() -> void: changed.emit())
	_overlay.sound_requested.connect(audio.play)
	_overlay.gesture_received.connect(audio.unlock)
	_overlay.settings_requested.connect(toggle_setting)
	_world.connect("map_entered",_on_map_entered)
	_world.connect("battle_closed",_on_battle_closed)
	_world.connect("dough_closed",_on_dough_closed)
	_world.persistence.changed.connect(_on_persistence_result)
	return []

func validate_story_state(state: Dictionary) -> String:
	return _rules.validate_save(state)
func prepare_new_game(state: Dictionary) -> Dictionary:
	return _rules.begin(state)
func startup(result: Dictionary) -> void:
	_resume_in_memory = result.get("ok",false) and not result.get("missing",false)
	show_title()
func is_modal() -> bool:
	return _transitioning or (_overlay != null and _overlay.is_active())
func blocks_persistence() -> bool:
	return _overlay != null and _overlay.is_active() and not _overlay.snapshot()["mode"] in ["title","new_confirm","ending"]
func snapshot() -> Dictionary:
	var data: Dictionary = _overlay.snapshot() if _overlay != null else {"mode":""}
	if _world.battle_active() and not _pending.is_empty():
		data["mode"] = "battle"
	data["step"] = _pending.get("id","")
	data["objective"] = objective()
	data["reduced"] = reduced_motion
	data["busy"] = _transitioning or (_overlay != null and _overlay.is_active())
	data["flags"] = _world.flags.duplicate(true)
	data["inventory"] = _world.inventory.duplicate(true)
	data["visual"] = _world.player.visual_id if is_instance_valid(_world.player) else ""
	return data
func objective() -> String:
	if not _world.loaded:
		return ""
	var state: Dictionary = _world.snapshot_state()
	var key: String = _rules.objective(state)
	if key.is_empty():
		return ""
	var lamps: int = 0
	for id: String in ["lv.lamp.bakery","lv.lamp.bridge","lv.lamp.square"]:
		lamps += int(id in state["lamps"])
	return _word(key).replace("{count}",str(lamps if key.ends_with(".lamps") else 0))
func warning() -> String:
	return _save_warning
func can_light_lamp() -> bool:
	return _rules.can_light_lamp(_world.snapshot_state())

func show_title() -> void:
	_pending = {}
	_before = {}
	_rules.cancel_battle()
	_transitioning = false
	_management = false
	_continue_slot = -1
	_has_auto_record = false
	for row: Dictionary in _world.persistence.summaries():
		if row["slot"] == 0:
			_has_auto_record = row["status"] != "empty"
		if row["status"] == "valid" and _continue_slot < 0:
			_continue_slot = row["slot"]
	_overlay.present_choices("title","prologue.ui.chapter",[{"id":"new","label":"title.new"},{"id":"continue","label":"title.continue","enabled":_resume_in_memory or _continue_slot>=0},{"id":"manage","label":"prologue.ui.title.manage"}],"game.motto","scene.legend.sky")
	_overlay.set_warning(_save_warning)
	changed.emit()

func try_interact() -> bool:
	if is_modal() or not _pending.is_empty() or not _world.flags.get("p.main_started",false):
		return false
	var offered: Dictionary = _rules.offer(_world.snapshot_state(),"interact")
	if offered.is_empty():
		if _world.map_data["id"] == "lv.bakery" and _world.flags.get("p.s03_done",false) and (not _world.flags.get("p.festival_started",false) or _world.flags.get("p.s09_done",false)):
			var anchor: Dictionary = _worlds.anchor_point("lv.bakery","dough_entry")
			if abs(_world.player.grid_position.x-int(anchor["x"]))+abs(_world.player.grid_position.y-int(anchor["y"])) <= 2:
				_overlay.present_choices("dough_offer","prologue.ui.dough.offer",[{"id":"start","label":"prologue.ui.dough.start"}])
				return true
		return false
	_start_step(offered,"interact")
	return true
func explore_changed() -> void:
	_update_visuals()
	_transitioning = not (_overlay != null and _overlay.is_active())
	if _queued:
		return
	_queued = true
	_probe.call_deferred()
func _probe() -> void:
	_queued = false
	_transitioning = false
	if not is_inside_tree() or _world.is_queued_for_deletion() or not _world.loaded or _world.battle_active() or _world.puzzle_active() or _world.dialogue_active() or _world.menu_active() or _world.persistence.is_busy() or _world.player.is_moving:
		changed.emit()
		return
	if _management:
		show_title()
		return
	if _overlay.is_active() or not _pending.is_empty():
		return
	var state: Dictionary = _world.snapshot_state()
	if not state["flags"].get("p.main_started",false):
		changed.emit()
		return
	if state["flags"].get("p.departed",false):
		if not _ending_seen:
			_show_ending()
		return
	for event: String in ["automatic","near"]:
		var offered: Dictionary = _rules.offer(state,event)
		if not offered.is_empty():
			_start_step(offered,event)
			return
	changed.emit()

func _start_step(step: Dictionary, event: String) -> void:
	_pending = step.duplicate(true)
	_before = _world.snapshot_state()
	_event = event
	var presentation: Dictionary = step["presentation"]
	step_started.emit(_pending.duplicate(true))
	match presentation["kind"]:
		"dialogue","ending":
			var images: Array = LEGEND_IMAGES if step["id"] == "legend" else []
			_overlay.present_segment(_book.segment(presentation["scene"],presentation["segment"]),images)
		"choice":
			_overlay.present_choices("choice",presentation["prompt"],presentation["choices"])
		"notice":
			_audio.play("confirm")
			_complete()
		"battle":
			if not _world.start_battle(presentation["battleId"],_rules.battle_inventory(_before),true):
				_abort("battle_setup_failed")
				return
			var session: Session = _world.battle_session() as Session
			if not _rules.authorize_battle(_before,step["id"],event,session):
				_pending = {}
				_world.close_battle()
				_abort("battle_authorization_failed")
				return
	_overlay.set_warning(_save_warning)
	changed.emit()
func _finish_segment() -> void:
	if _side_dialogue:
		_side_dialogue = false
		_overlay.close()
		explore_changed()
		return
	if not _pending.is_empty():
		_complete()
func _complete(choice: String = "", session: Session = null) -> void:
	var result: Dictionary = _rules.commit(_before,_pending["id"],_event,choice,session)
	if not result["ok"]:
		_abort(result["error"])
		return
	var finished: Dictionary = _pending.duplicate(true)
	_transitioning = true
	_overlay.close()
	_pending = {}
	_before = {}
	if not _world.apply_story_checkpoint(result["state"]):
		_abort("checkpoint_restore_failed")
		return
	_resume_in_memory = true
	step_completed.emit(finished)
	_world.persistence.autosave()
	_update_visuals()
	explore_changed()
	changed.emit()
func _choose(id: String) -> void:
	var context: String = _overlay.snapshot()["mode"]
	if context == "choice":
		_complete(id)
	elif context == "dough_offer":
		_overlay.close()
		_world.start_dough()
	elif context == "new_confirm":
		_world.start_new_game()
	elif context == "title":
		match id:
			"new":
				if _has_auto_record or _resume_in_memory:
					_overlay.present_choices("new_confirm","prologue.ui.title.confirm_new",[{"id":"begin","label":"title.new"}],"","scene.legend.sky")
				else:
					_world.start_new_game()
			"continue":
				if _resume_in_memory:
					_overlay.close()
					explore_changed()
				elif _continue_slot >= 0:
					_world.load_slot(_continue_slot)
			"manage":
				_overlay.close()
				_management = true
				if not _world.open_save_menu():
					show_title()
	elif context == "ending":
		if id == "title":
			show_title()
		else:
			_ending_seen = true
			_overlay.close()
			explore_changed()
	changed.emit()
func _cancel() -> void:
	var context: String = _overlay.snapshot()["mode"]
	if context == "new_confirm":
		show_title()
	elif context == "ending":
		_ending_seen = true
		_overlay.close()
		explore_changed()
	elif context in ["choice","dough_offer"]:
		_pending = {}
		_before = {}
		_overlay.close()
		explore_changed()
	changed.emit()
func _show_ending() -> void:
	_overlay.present_choices("ending","prologue.ui.title",[{"id":"explore","label":"prologue.ui.ending.explore"},{"id":"title","label":"prologue.ui.ending.return_title"}],"prologue.ui.ending.description")
	changed.emit()

func _on_battle_closed(id: String, session: RefCounted, previous: Dictionary, story: bool) -> void:
	if not story or _pending.is_empty() or _pending["presentation"].get("battleId") != id:
		return
	var result_session: Session = session as Session
	if result_session.snapshot().get("battle",{}).get("phase") == "won":
		_complete("",result_session)
		return
	_rules.cancel_battle()
	_pending = {}
	_before = {}
	var state: Dictionary = previous.duplicate(true)
	var safe: Dictionary = _worlds.safe_anchor("lv.town","lamp_shop_front",state["flags"])
	if safe["ok"]:
		state["mapId"] = safe["map_id"]
		state["player"]["x"] = safe["position"].x
		state["player"]["y"] = safe["position"].y
		_world.apply_story_checkpoint(state)
		_world.persistence.autosave()
	explore_changed()
func _on_map_entered(_id: String, _cell: Vector2i) -> void:
	explore_changed()
func _on_dough_closed(completed: bool, rewarded: bool) -> void:
	if completed:
		_side_dialogue = true
		var text: String = "prologue.ui.dough.reward" if rewarded else "prologue.ui.dough.again"
		_overlay.present_segment({"lines":[{"speaker":"name.brio","portrait":"portrait.brio","text":text}],"summary":text})
	else:
		explore_changed()
func _on_persistence_result(result: Dictionary) -> void:
	if result.get("action") in ["startup","auto","new","load","save","import"]:
		_save_warning = _word("prologue.ui.save.warning") if _world.persistence.auto_paused else ""
		if _overlay != null:
			_overlay.set_warning(_save_warning)
	if result.get("ok",false) and result.get("action") in ["new","load","import"]:
		_rules.cancel_battle()
		_resume_in_memory = true
		_ending_seen = false
		_management = false
		_pending = {}
		_before = {}
		_overlay.close()
		explore_changed()
	changed.emit()
func _update_visuals() -> void:
	if not _world.loaded or not is_instance_valid(_world.player):
		return
	var unarmed: bool = _world.flags.get("p.main_started",false) and not _world.flags.get("p.rod_taken",false)
	_world.player.set_visual_asset(_catalog,"char.finn_unarmed" if unarmed else _catalog.binding("player"))
func toggle_setting(key: String) -> void:
	if key == "mute":
		_audio.set_muted(not _audio.is_muted())
	elif key == "reduced":
		reduced_motion = not reduced_motion
	changed.emit()
func set_reduced(value: bool) -> void:
	reduced_motion = value
	changed.emit()
func _abort(error: String) -> void:
	push_error("Prologue presentation stopped safely: " + error)
	_transitioning = false
	_pending = {}
	_before = {}
	_overlay.close()
	changed.emit()
func _word(key: String) -> String:
	return String(_words.get(key,key))
func _exit_tree() -> void:
	_rules.cancel_battle()
