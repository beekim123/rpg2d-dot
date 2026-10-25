extends Node2D
## Native battlefield presenter. Logical commits happen once, then events drive the pictures.
signal changed
signal close_requested
signal sound_requested(cue: String)
signal gesture_received
signal muted_changed(value: bool)
signal restarted
signal outcome_presented(phase: String)
const Controls = preload("res://scripts/battle/presentation/battle_controls.gd")
const EventPlayer = preload("res://scripts/battle/presentation/battle_event_player.gd")
const Unit = preload("res://scripts/battle/presentation/battle_unit_view.gd")
const Board = preload("res://scripts/battle/presentation/battle_board.gd")
const Hud = preload("res://scripts/battle/presentation/battle_hud.gd")
const MathRules = preload("res://scripts/battle/battle_math.gd")
var loaded: bool = false
var speed_mode: int = 0
var reduced_motion: bool = false
var muted: bool = false
var _controls: Controls = Controls.new()
var _math: MathRules = MathRules.new()
var _player: EventPlayer
var _board: Board
var _hud: Hud
var _catalog: AssetCatalog
var _prepared: Dictionary = {}
var _words: Dictionary = {}
var _shown: Dictionary = {}
var _after: Dictionary = {}
var _origin: Vector2i
var _units: Dictionary = {}
var _popups: Array = []
var _playing: bool = false
var _enemy_queued: bool = false
var _busy_message: String = ""
var _last_skill: String = ""
var _undo_from: Dictionary = {}
var _font: FontFile
var _mouse_navigation: bool = false
var _pointer: Vector2 = Vector2.ZERO
func setup(catalog: AssetCatalog, prepared: Dictionary, words: Dictionary, actor_layer: Node2D) -> bool:
	if not _controls.setup(prepared):
		return false
	_catalog = catalog
	_prepared = prepared.duplicate(true)
	_words = words.duplicate(true)
	_font = catalog.pixel_font()
	_math.configure(prepared["balance"])
	_origin = Vector2i(int(prepared["arena"]["x"]), int(prepared["arena"]["y"]))
	_shown = _controls.snapshot()["battle"]
	z_index = 20
	for actor: Dictionary in _shown["actors"]:
		for role: String in (["body"] if actor["kind"] == "starless" else ["body", "astral"]):
			var unit: Unit = Unit.new()
			unit.name = "Battle_" + actor["id"] + "_" + role
			unit.setup(catalog, actor, role, _prepared["art"][actor["id"]])
			actor_layer.add_child(unit)
			_units[actor["id"] + ":" + role] = unit
	_board = Board.new()
	_board.position = Vector2(_origin * 16)
	_board.z_as_relative = false
	_board.z_index = -1
	add_child(_board)
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	_hud = Hud.new()
	_hud.setup(catalog, words)
	layer.add_child(_hud)
	_hud.chosen.connect(choose_option)
	_hud.selection_changed.connect(func() -> void: changed.emit())
	_player = EventPlayer.new()
	add_child(_player)
	_player.started.connect(_event_started)
	_player.progressed.connect(_event_progressed)
	_player.ended.connect(_event_ended)
	_player.finished.connect(_playback_finished)
	loaded = true
	_sync_units()
	_refresh()
	return true
func _ready() -> void:
	if loaded:
		# The final theme becomes available when this scene enters the viewport.
		_refresh()
		_schedule_enemy()
func busy() -> bool:
	return _playing or _enemy_queued
func choose_option(id: String) -> bool:
	if not loaded or busy():
		return false
	return _accept(_controls.choose(id))
func choose_cell(cell: Vector2i) -> bool:
	if not loaded or busy() or _controls.mode not in ["move_body", "move_astral", "manifest", "target"]:
		return false
	_controls.set_cursor(cell)
	return _accept(_controls.confirm())
func set_animation_speed(index: int) -> void:
	speed_mode = posmod(index, 3)
	_player.speed = [1, 2, 0][speed_mode]
	for unit: Unit in _units.values():
		unit.set_speed(2.0 if speed_mode == 1 else 1.0)
	_refresh()
func _input(event: InputEvent) -> void:
	if not loaded or not is_inside_tree():
		return
	if event.is_pressed() and not event.is_echo():
		gesture_received.emit()
	if event is InputEventMouseMotion or event is InputEventMouseButton:
		_mouse_navigation = true
		_pointer = event.position
		if event is InputEventMouseMotion and _sync_pointer_cursor():
			_refresh()
		return
	if not event is InputEventKey or not event.pressed:
		return
	_mouse_navigation = false
	var viewport: Viewport = get_viewport()
	var key: Key = event.physical_keycode if event.physical_keycode != 0 else event.keycode
	if not event.echo and key in [KEY_C, KEY_R, KEY_M]:
		if key == KEY_C:
			set_animation_speed(speed_mode + 1)
		elif key == KEY_R:
			reduced_motion = not reduced_motion
			if reduced_motion:
				for unit: Unit in _units.values():
					unit.set_flash(false)
			_refresh()
		else:
			muted = not muted
			muted_changed.emit(muted)
			_refresh()
		viewport.set_input_as_handled()
		return
	if busy():
		viewport.set_input_as_handled()
		return
	var direction: Vector2i = Vector2i.ZERO
	match key:
		KEY_UP, KEY_W: direction = Vector2i.UP
		KEY_DOWN, KEY_S: direction = Vector2i.DOWN
		KEY_LEFT, KEY_A: direction = Vector2i.LEFT
		KEY_RIGHT, KEY_D: direction = Vector2i.RIGHT
	if direction != Vector2i.ZERO:
		if _controls.mode in ["move_body", "move_astral", "manifest", "target"]:
			_controls.set_cursor(_controls.cursor + direction)
		else:
			_hud.navigate(direction)
		_refresh()
		viewport.set_input_as_handled()
	elif not event.echo and key in [KEY_Z, KEY_SPACE, KEY_ENTER, KEY_KP_ENTER]:
		# A confirmation can synchronously remove this presenter. Consume it first.
		viewport.set_input_as_handled()
		if _controls.mode in ["move_body", "move_astral", "manifest", "target"]:
			_accept(_controls.confirm())
		else:
			_hud.confirm()
		viewport.set_input_as_handled()
	elif not event.echo and key in [KEY_X, KEY_ESCAPE]:
		viewport.set_input_as_handled()
		if _shown["phase"] != "active":
			close_requested.emit()
		else:
			_accept(_controls.cancel())
		viewport.set_input_as_handled()
func _unhandled_input(event: InputEvent) -> void:
	if not loaded or busy() or _controls.mode not in ["move_body", "move_astral", "manifest", "target"]:
		return
	if event is InputEventMouseButton and event.pressed:
		var local: Vector2 = get_viewport().get_canvas_transform().affine_inverse() * event.position - Vector2(_origin * 16)
		if not Rect2(Vector2.ZERO, Vector2(_shown["width"] * 16, _shown["height"] * 16)).has_point(local):
			return
		var cell: Vector2i = Vector2i(floori(local.x / 16), floori(local.y / 16))
		if cell != _controls.cursor:
			_controls.set_cursor(cell)
			_refresh()
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
			choose_cell(cell)
			get_viewport().set_input_as_handled()
func _sync_pointer_cursor() -> bool:
	if not _mouse_navigation or busy() or _controls.mode not in ["move_body", "move_astral", "manifest", "target"]:
		return false
	var local: Vector2 = get_viewport().get_canvas_transform().affine_inverse() * _pointer - Vector2(_origin * 16)
	if not Rect2(Vector2.ZERO, Vector2(_shown["width"] * 16, _shown["height"] * 16)).has_point(local):
		return false
	var cell: Vector2i = Vector2i(floori(local.x / 16), floori(local.y / 16))
	if cell == _controls.cursor:
		return false
	_controls.set_cursor(cell)
	return true
func _physics_process(_delta: float) -> void:
	for index: int in range(_popups.size() - 1, -1, -1):
		var popup: Dictionary = _popups[index]
		popup["age"] += 1
		popup["label"].position = popup["base"] - Vector2(0, 0 if reduced_motion else int(popup["age"]) / 6)
		if popup["age"] >= 36:
			popup["label"].queue_free()
			_popups.remove_at(index)
func ui_state() -> Dictionary:
	var screen: Vector2 = (get_viewport().get_canvas_transform() * Vector2(_origin * 16)).round()
	return {"snapshot": _controls.snapshot(), "mode": _controls.mode, "selection": _controls.selection(), "cursor": {"x": _controls.cursor.x, "y": _controls.cursor.y}, "busy": busy(), "speed": speed_mode, "reduced": reduced_motion, "muted": muted, "options": _hud.option_state(), "reachable": _controls.legal_cells(), "preview": _controls.preview(), "grid": {"x": screen.x, "y": screen.y, "size": 16}, "hint": _word(_controls.hint_key())}
func _accept(result: Dictionary) -> bool:
	if not result.get("ok", false):
		sound_requested.emit("deny")
		_refresh()
		return false
	if result.get("leave", false):
		close_requested.emit()
		return true
	sound_requested.emit("confirm")
	if result.get("reset", false):
		restarted.emit()
		for child: Node in get_children():
			if child is AnimatedSprite2D or child is Label:
				child.queue_free()
		_popups.clear()
		_shown = _controls.snapshot()["battle"]
		_sync_units()
		_refresh()
		_schedule_enemy()
	elif result.get("acted", false):
		_after = result["encounter"]
		_playing = true
		_player.play(result["events"])
		_refresh()
	else:
		_sync_pointer_cursor()
		_refresh()
	return true
func _schedule_enemy() -> void:
	if not loaded or _playing or _enemy_queued:
		return
	var state: Dictionary = _controls.snapshot()["battle"]
	if state["phase"] == "active" and _find(state, state["activeId"])["team"] == "enemy":
		_enemy_queued = true
		_run_enemy.call_deferred()
		_refresh()
func _run_enemy() -> void:
	if not is_inside_tree() or not loaded:
		return
	_enemy_queued = false
	_accept(_controls.advance_enemy())
func _event_started(event: Dictionary) -> void:
	var type: String = event["type"]
	var actor: Dictionary = _find(_shown, event.get("actorId", ""))
	var unit: Unit = _unit(event.get("actorId", ""), event.get("target", event.get("unit", "body")))
	match type:
		"move", "tether_pull", "knockback":
			_busy_message = _word("battle.action.moving")
		"skill":
			_last_skill = event["skillId"]
			_busy_message = _word("battle.skill." + _last_skill)
			actor["will"] = maxi(0, int(actor["will"]) - int(event["cost"]))
			var source: Unit = _unit(actor["id"], "astral")
			var target: Unit = _unit(event["targetId"], event["target"])
			if source != null and target != null:
				source.attack(target.position)
				_unit(actor["id"], "body").attack(target.position)
			sound_requested.emit("battle_cast")
		"damage":
			actor["hp"] = event["hp"]
			actor["shield"] = maxi(0, int(actor["shield"]) - int(event["absorbed"]))
			_busy_message = "%s -%d" % [_word("battle.hp"), event["damage"]]
			if unit != null:
				unit.hurt()
				unit.set_flash(not reduced_motion)
				_popup(unit.position - Vector2(0, unit.asset_height + 10), str(event["damage"]) if event["damage"] > 0 else _word("battle.shield") + str(event["absorbed"]), Color("f07a5a") if event["damage"] > 0 else Color("79c6ef"))
				var effect: String = _prepared["effects"]["laurel_bolt"] if _last_skill == "laurel_bolt" else _prepared["effects"]["enemy_hit"] if _find(_shown, event["sourceId"]).get("team") == "enemy" else _prepared["effects"]["damage"]
				_effect(effect, unit.position - Vector2(0, 12))
			for role: String in ["body", "astral"]:
				var shared: Unit = _unit(event["actorId"], role)
				if shared != null and shared.visible:
					shared.hurt()
					shared.set_flash(not reduced_motion)
			_freeze(true)
			sound_requested.emit("battle_hit")
		"heal", "shield", "will":
			var field: String = "hp" if type == "heal" else type
			actor[field] = event[field]
			_busy_message = _word("battle.action.heal" if type in ["heal", "will"] else "battle.action.guard")
			if unit != null:
				_popup(unit.position - Vector2(0, unit.asset_height + 8), "+" + str(event["amount"]), Color("c4e070"))
				_effect(_prepared["effects"]["heal"], unit.position - Vector2(0, 12))
			sound_requested.emit("battle_guard" if type == "shield" else "battle_heal")
		"marks": actor["lampMarks"] = event["marks"]
		"cheer":
			actor["cheered"] = true
			_busy_message = _word("battle.action.cheer")
			if unit != null:
				_popup(unit.position - Vector2(0, 38), _word("battle.status.cheered"), Color("5ad6c0"))
			sound_requested.emit("battle_guard")
		"cheer_used": actor.erase("cheered")
		"item":
			_shown.get("inventory", {})[event["itemId"]] = event["remaining"]
			_busy_message = _word("battle.item." + event["itemId"])
		"recall":
			var astral: Unit = _unit(actor["id"], "astral")
			if astral != null:
				_effect(_prepared["effects"]["recall"], astral.position - Vector2(0, 12))
				astral.hide()
			actor["astral"] = null
			actor["mode"] = "recalled"
			_busy_message = _word("battle.action.recall")
		"manifest":
			actor["astral"] = event["at"].duplicate(true)
			actor["mode"] = "manifested"
			_unit(actor["id"], "astral").show_actor(actor, _origin)
			_effect(_prepared["effects"]["manifest"], _unit(actor["id"], "astral").position - Vector2(0, 12))
			_busy_message = _word("battle.action.manifest")
		"ko":
			for role: String in ["body", "astral"]:
				var fallen: Unit = _unit(actor["id"], role)
				if fallen != null:
					fallen.hide()
		"cancelled_skill":
			actor["will"] = maxi(0, int(actor["will"]) - int(event["cost"]))
			_busy_message = _word("battle.action.miss" if event["outcome"] == "miss" else "battle.action.interrupted")
		"undo":
			_undo_from.clear()
			for key: String in _units:
				_undo_from[key] = _units[key].position
		"turn":
			_shown["activeId"] = event["actorId"]
		"outcome":
			_shown["phase"] = event["phase"]
			outcome_presented.emit(event["phase"])
			sound_requested.emit("battle_win" if event["phase"] == "won" else "battle_lose")
	_refresh()
func _event_progressed(event: Dictionary, tick: int, duration: int) -> void:
	var fraction: float = float(tick) / duration
	if event["type"] == "move":
		var path: Array = event["path"]
		var unit: Unit = _unit(event["actorId"], event["unit"])
		var distance: float = fraction * (path.size() - 1)
		var index: int = mini(floori(distance), path.size() - 1)
		var next: int = mini(index + 1, path.size() - 1)
		unit.position = _feet(path[index]).lerp(_feet(path[next]), distance - index).round()
		unit.walk(Vector2i(int(path[next]["x"]) - int(path[index]["x"]), int(path[next]["y"]) - int(path[index]["y"])))
	elif event["type"] in ["knockback", "tether_pull"] and event.get("to") != null:
		_unit(event["actorId"], event.get("unit", "astral")).position = _feet(event["from"]).lerp(_feet(event["to"]), fraction).round()
	elif event["type"] == "damage":
		if tick >= 3:
			_freeze(false)
		for role: String in ["body", "astral"]:
			var unit: Unit = _unit(event["actorId"], role)
			if unit != null:
				unit.set_flash(not reduced_motion and tick < 4)
				unit.sprite.position.x = 0 if reduced_motion or tick > 8 else (1 if tick % 2 == 0 else -1)
	elif event["type"] == "undo":
		for key: String in _undo_from:
			var unit: Unit = _units[key]
			var actor: Dictionary = _find(_after["battle"], unit.actor_id)
			if actor[unit.unit] != null:
				unit.position = (_undo_from[key] as Vector2).lerp(_feet(actor[unit.unit]), fraction).round()
	_redraw()
func _event_ended(event: Dictionary) -> void:
	if event["type"] in ["move", "knockback", "tether_pull"]:
		var role: String = event.get("unit", "astral")
		_find(_shown, event["actorId"])[role] = event["to"]
		var unit: Unit = _unit(event["actorId"], role)
		if unit != null:
			unit.idle()
	if event["type"] == "damage":
		_freeze(false)
		for role: String in ["body", "astral"]:
			var unit: Unit = _unit(event["actorId"], role)
			if unit != null:
				unit.set_flash(false)
				unit.sprite.position = Vector2.ZERO
func _playback_finished() -> void:
	if not loaded:
		return
	_shown = _after["battle"].duplicate(true)
	_playing = false
	_busy_message = ""
	_sync_units()
	_refresh()
	_schedule_enemy()
func _sync_units() -> void:
	for unit: Unit in _units.values():
		unit.show_actor(_find(_shown, unit.actor_id), _origin)
func _refresh() -> void:
	if not loaded:
		return
	var actor: Dictionary = _find(_shown, _shown["activeId"])
	if _shown["phase"] != "active":
		actor = _controls.active_actor()
	var hint: String = _busy_message if _playing and not _busy_message.is_empty() else _word(_controls.hint_key())
	var preview: Dictionary = _controls.preview() if not busy() else {}
	if not preview.is_empty():
		if not preview["ok"]:
			hint = _word("battle.error." + preview["error"])
		elif preview["type"] == "cheer":
			hint = _word("battle.preview.cheer")
		elif preview.has("damage"):
			var key: String = preview.get("effect", "damage")
			hint = _word("battle.preview." + key) + " " + str(preview[key])
	if _controls.mode == "target" and not busy():
		var selection: Dictionary = _controls.selection()
		var label: String = _word("battle.command.cheer")
		if selection["type"] == "skill":
			label = _word("battle.skill." + selection["skillId"])
			for skill: Dictionary in _prepared["skills"]["skills"]:
				if skill["id"] == selection["skillId"]:
					label += " (%s%d)" % [_word("battle.will"), skill["cost"]]
		elif selection["type"] == "item":
			label = _word("battle.item." + selection["itemId"])
		hint = label + " · " + hint
	_hud.show_state(_shown, actor, _prepared["art"][actor["id"]], _word(_prepared["presentation"]["title"]), hint, _timeline(), _prepared["art"], speed_mode, reduced_motion, muted, busy())
	_hud.set_options(_controls.options(), busy())
	_board.state = _shown
	_board.intents = _controls.snapshot()["intents"]
	_board.mode = "command" if busy() else _controls.mode
	_board.cursor = _controls.cursor
	_board.cells = _controls.legal_cells() if not busy() else []
	_redraw()
	changed.emit()
	_emit_layout_changed.call_deferred()
func _emit_layout_changed() -> void:
	if loaded and is_inside_tree():
		changed.emit()
func _timeline() -> Array:
	if _shown["phase"] != "active":
		return []
	var pool: Array = _shown["actors"].filter(func(a: Dictionary) -> bool: return a["hp"] > 0).duplicate(true)
	var ids: Array = []
	if pool.is_empty():
		return ids
	for index: int in 8:
		var ordered: Array = _math.order_timeline(pool)["value"]
		var first: Dictionary = ordered[0]
		ids.append(first["id"])
		for actor: Dictionary in pool:
			if actor["id"] == first["id"]:
				actor["readyAt"] = int(actor["readyAt"]) + int(_math.action_interval(actor["chart"]["spd"], "normal")["value"])
	return ids
func _redraw() -> void:
	_board.positions.clear()
	for key: String in _units:
		_board.positions[key] = _units[key].position - Vector2(_origin * 16)
	_board.queue_redraw()
	queue_redraw()
func _draw() -> void:
	if not loaded:
		return
	for actor: Dictionary in _shown["actors"]:
		var unit: Unit = _unit(actor["id"], "body")
		if actor["hp"] <= 0 or unit == null:
			continue
		var at: Vector2 = Vector2(unit.position.x - 10, _owner_top(actor["id"]) - 7)
		draw_rect(Rect2(at - Vector2(1, 1), Vector2(22, 5)), Color("1a1220"))
		draw_rect(Rect2(at, Vector2(20, 3)), Color("4a3040"))
		draw_rect(Rect2(at, Vector2(roundf(20.0 * float(actor["hp"]) / float(actor["maxHp"])), 3)), Color("86c440") if actor["team"] == "player" else Color("d6453a"))
		for mark: int in int(actor.get("lampMarks", 0)):
			var star: Vector2 = at + Vector2(mark * 5 + 1, -6)
			draw_rect(Rect2(star + Vector2(1, 0), Vector2(1, 3)), Color("ffe36b"))
			draw_rect(Rect2(star + Vector2(0, 1), Vector2(3, 1)), Color("ffe36b"))
		if actor["shield"] > 0:
			draw_string(_font, at + Vector2(22, 4), str(actor["shield"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("79c6ef"))
	var intents: Dictionary = _controls.snapshot()["intents"]
	for id: String in intents:
		var unit: Unit = _unit(id, "body")
		if unit == null or not unit.visible:
			continue
		var intent: Dictionary = intents[id]
		var label: String = _word("battle.intent.interrupted") + "·" + _word("battle.intent.reason." + intent["reason"]) if intent["status"] == "interrupted" else _word("battle.intent.short." + intent["mode"]) + " " + str(intent["expectedDamage"]) if intent.has("skillId") else _word("battle.intent.no_attack")
		var skill: String = _word("battle.skill." + intent["skillId"]) if intent.has("skillId") else _word("battle.intent.wait")
		var bubble: Vector2 = Vector2(unit.position.x, _owner_top(id) - 47)
		if (get_viewport().get_canvas_transform() * bubble).y < 54:
			bubble = Vector2(unit.position.x + 64, _owner_top(id) - 6)
		_box(bubble, [skill, label], Color("f07a5a") if intent["status"] == "ready" else Color("b09a8a"))
func _owner_top(id: String) -> float:
	var body: Unit = _unit(id, "body")
	var top: float = body.position.y - body.asset_height
	var astral: Unit = _unit(id, "astral")
	if astral != null and astral.visible and absf(astral.position.x - body.position.x) < 28 and absf(astral.position.y - body.position.y) < 28:
		top = minf(top, astral.position.y - astral.asset_height)
	return top
func _box(anchor: Vector2, lines: Array, color: Color) -> void:
	var width: float = 56
	for text: String in lines:
		width = maxf(width, _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x + 12)
	var screen: Vector2 = get_viewport().get_canvas_transform() * anchor
	screen.x = clampf(screen.x - width / 2, 6, 474 - width)
	screen.y = maxf(34, screen.y)
	var at: Vector2 = (get_viewport().get_canvas_transform().affine_inverse() * screen).round()
	draw_rect(Rect2(at, Vector2(width, 30)), Color("1c2a5a"))
	draw_rect(Rect2(at, Vector2(width, 30)), Color("edc565"), false, 1)
	for index: int in lines.size():
		draw_string(_font, at + Vector2(6, 12 + index * 13), lines[index], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, color if index == 1 else Color("fff6c8"))
func _popup(at: Vector2, text: String, color: Color) -> void:
	var label: Label = Label.new()
	label.text = text
	label.position = at - Vector2(_font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x / 2, 12)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font", _font)
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color("1a1220"))
	label.add_theme_constant_override("outline_size", 1)
	add_child(label)
	_popups.append({"label": label, "age": 0, "base": label.position})
func _effect(id: String, at: Vector2) -> void:
	if speed_mode == 2:
		return
	var sprite: AnimatedSprite2D = _catalog.animated_sprite(id, &"once")
	sprite.position = at.round()
	sprite.speed_scale = 2 if speed_mode == 1 else 1
	sprite.animation_finished.connect(sprite.queue_free)
	add_child(sprite)
func _freeze(frozen: bool) -> void:
	for unit: Unit in _units.values():
		unit.freeze(frozen)
func _unit(id: String, role: String) -> Unit:
	return _units.get(id + ":" + role) as Unit
func _feet(point: Dictionary) -> Vector2:
	return GridActor.cell_feet(_origin + Vector2i(int(point["x"]), int(point["y"])))
func _word(key: String) -> String:
	return String(_words.get(key, _words["battle.error.unknown_command"]))
static func _find(state: Dictionary, id: String) -> Dictionary:
	for actor: Dictionary in state["actors"]:
		if actor["id"] == id:
			return actor
	return {}
func _exit_tree() -> void:
	loaded = false
	if _player != null:
		_player.stop()
	for unit: Unit in _units.values():
		if is_instance_valid(unit):
			unit.queue_free()
	_units.clear()
