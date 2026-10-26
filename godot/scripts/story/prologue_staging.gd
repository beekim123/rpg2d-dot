extends Node2D
## Visual-only prologue staging. Flags, inventory, grid positions and battle results
## remain owned by the director and its pure checkpoint rules.
class LampEmber extends Node2D:
	func _draw() -> void:
		draw_rect(Rect2(0, 0, 2, 4), Color("ffe36b"))
		draw_rect(Rect2(2, 1, 2, 2), Color("fff6c8"))
		draw_rect(Rect2(1, -1, 1, 1), Color("f7b23a"))

var _world: Node
var _catalog: AssetCatalog
var _config: Dictionary = {}
var _step: Dictionary = {}
var _scene: Dictionary = {}
var _cast: Dictionary = {}
var _props: Dictionary = {}
var _followers: Dictionary = {}
var _hidden: Array[Dictionary] = []
var _tweens: Array[Tween] = []
var _seen_lines: Dictionary = {}
var _trail: Array[Vector2i] = []
var _player: Node
var _map_id: String = ""
var _reduced: bool = false
var _was_battle: bool = false
var _camera_owned: bool = false
var _closeup_layer: CanvasLayer
var _closeup_root: Control
var _closeup_image: TextureRect

func setup(world: Node, catalog: AssetCatalog, config: Dictionary) -> bool:
	if not _live(world) or not _valid_config(catalog, config):
		return false
	clear_stage()
	_clear_nodes(_props)
	_clear_nodes(_followers)
	_disconnect_player()
	if is_instance_valid(_world) and _world.is_connected("map_entered", _on_map_entered):
		_world.disconnect("map_entered", _on_map_entered)
	_world = world
	_catalog = catalog
	_config = config.duplicate(true)
	_trail.clear()
	_map_id = ""
	if not _world.is_connected("map_entered", _on_map_entered):
		_world.connect("map_entered", _on_map_entered)
	_build_closeup()
	refresh()
	return true

func begin_step(step: Dictionary) -> void:
	clear_stage()
	_step = step.duplicate(true)
	if not _usable() or _battle() or step.get("presentation", {}).get("kind") == "battle":
		refresh()
		return
	_scene = _config.get("steps", {}).get(step.get("id", ""), {}).duplicate(true)
	if _scene.is_empty() or _scene.get("map", _map_id) != _map_id:
		_scene = {}
		refresh()
		return
	for entity_id: String in _scene.get("hide_entities", []):
		_hide_entity(entity_id)
	for spec: Dictionary in _scene.get("cast", []):
		var sprite: AnimatedSprite2D = _spawn(spec)
		if sprite != null:
			_cast[spec["id"]] = sprite
	if _scene.has("camera"):
		_focus(_feet(_cell(_scene["camera"])) + Vector2(0, 24))
	_apply(_scene.get("enter", []), _reduced)
	refresh()

func show_line(index: int, summary: bool) -> void:
	if not _usable() or _scene.is_empty() or _battle():
		return
	var key: String = "summary" if summary else str(index)
	if _seen_lines.has(key):
		return
	_seen_lines[key] = true
	if summary:
		_stop_tweens()
		_apply(_scene.get("summary", []), true)
	else:
		_apply(_scene.get("lines", {}).get(key, []), _reduced)

func finish_step(_finished: Dictionary) -> void:
	clear_stage()
	refresh()

func set_reduced(value: bool) -> void:
	_reduced = value
	if value:
		# End at each explicit destination rather than leaving an interrupted pose.
		_stop_tweens()
		for sprite: AnimatedSprite2D in _cast.values() + _followers.values():
			if _live(sprite) and sprite.has_meta("stage_destination"):
				sprite.position = (sprite.get_meta("stage_destination") as Vector2).round()
				if sprite.get_meta("stage_hide_after", false):
					sprite.hide()

func clear_stage() -> void:
	_stop_tweens()
	_clear_nodes(_cast)
	for entry: Dictionary in _hidden:
		var sprite: Variant = entry["node"]
		if _live(sprite) and sprite.is_inside_tree():
			sprite.visible = entry["visible"]
	_hidden.clear()
	_step = {}
	_scene = {}
	_seen_lines.clear()
	if is_instance_valid(_closeup_root):
		_closeup_root.hide()
	_release_camera()

func refresh() -> void:
	if not _usable():
		return
	var current_map: String = _world.map_data["id"]
	if current_map != _map_id:
		_map_id = current_map
		_trail.clear()
	_bind_player()
	_prune(_cast)
	_prune(_props)
	_prune(_followers)
	if _battle() or _step.get("presentation", {}).get("kind") == "battle":
		_clear_nodes(_props)
		_clear_nodes(_followers)
		_release_camera()
		if is_instance_valid(_closeup_root):
			_closeup_root.hide()
		return
	_refresh_props()
	_refresh_followers()

func _process(_delta: float) -> void:
	if not _usable():
		return
	var battling: bool = _battle()
	if battling != _was_battle:
		_was_battle = battling
		refresh()
	if not battling:
		# Attached lamps follow the rendered feet, not the already committed grid cell.
		for spec: Dictionary in _config.get("props", []):
			var sprite: Variant = _props.get(spec["id"])
			if _live(sprite) and (spec.has("entity") or spec.has("player_offset")):
				var at: Variant = _position(spec)
				if at is Vector2:
					sprite.position = at.round()

func _refresh_props() -> void:
	var wanted: Dictionary = {}
	for spec: Dictionary in _config.get("props", []):
		if not _visible(spec) or spec["id"] in _scene.get("hide_props", []):
			continue
		var at: Variant = _position(spec)
		if not at is Vector2:
			continue
		wanted[spec["id"]] = true
		if not _live(_props.get(spec["id"])):
			var sprite: AnimatedSprite2D = _spawn(spec)
			if sprite != null:
				_props[spec["id"]] = sprite
	for id: String in _props.keys():
		if not wanted.has(id):
			_dispose(_props[id])
			_props.erase(id)

func _refresh_followers() -> void:
	var spec: Dictionary = _config.get("following", {})
	var enabled: bool = _world.flags.get("p.main_started", false) and _world.flags.get("p.s04_done", false) and not _world.flags.get("p.festival_started", false) and not _world.flags.get("p.attack_started", false)
	if not enabled:
		_clear_nodes(_followers)
		return
	for role: String in ["body", "astral"]:
		var delay: int = 1 if role == "body" else 2
		if _trail.size() <= delay or _trail[delay] == _player.grid_position or not _world.world_data.is_safe_entry(_world.map_data, _trail[delay]):
			if _live(_followers.get(role)):
				_followers[role].hide()
			continue
		var target: Vector2 = _feet(_trail[delay])
		if not _live(_followers.get(role)):
			var sprite: AnimatedSprite2D = _spawn({"id":"following_" + role, "asset":spec[role], "at":[_trail[delay].x, _trail[delay].y], "animation":"idle_down"})
			if sprite != null:
				_followers[role] = sprite
		var follower: Variant = _followers.get(role)
		if _live(follower):
			var was_visible: bool = follower.visible
			follower.visible = not _scene.get("hide_followers", false)
			if follower.position != target:
				var distance: Vector2 = (target - follower.position).abs()
				if not was_visible or distance.x + distance.y > 16:
					follower.position = target
				else:
					_move(follower, [target], 0.14, false, false)

func _on_map_entered(map_id: String, cell: Vector2i) -> void:
	var battle_step: Dictionary = _step.duplicate(true) if _step.get("presentation", {}).get("kind") == "battle" else {}
	clear_stage()
	_step = battle_step
	_clear_nodes(_props)
	_clear_nodes(_followers)
	if map_id != _map_id or _trail.is_empty() or _trail[0] != cell:
		_trail.clear()
	_map_id = map_id
	refresh()

func _bind_player() -> void:
	if _live(_player) and _player == _world.player:
		return
	_disconnect_player()
	_player = _world.player
	if _live(_player):
		_player.connect("step_finished", _on_player_step)
		if _trail.is_empty():
			_trail.append(_player.grid_position)

func _disconnect_player() -> void:
	if is_instance_valid(_player) and _player.is_connected("step_finished", _on_player_step):
		_player.disconnect("step_finished", _on_player_step)
	_player = null

func _on_player_step(cell: Vector2i) -> void:
	if _trail.is_empty() or _trail[0] != cell:
		_trail.push_front(cell)
	while _trail.size() > 8:
		_trail.pop_back()
	refresh()

func _apply(actions: Array, immediate: bool) -> void:
	for action: Dictionary in actions:
		var sprite: Variant = _cast.get(action.get("id", ""))
		match action["op"]:
			"show", "hide":
				if _live(sprite):
					sprite.visible = action["op"] == "show"
			"move":
				if _live(sprite):
					var points: Array[Vector2] = []
					for point: Array in action.get("path", []):
						points.append(_feet(_cell(point)))
					if action.has("to"):
						points.append(_feet(_cell(action["to"])))
					elif action.has("to_player_offset") and _live(_player):
						points.append(_player.position + _vector(action["to_player_offset"]))
					_move(sprite, points, float(action.get("seconds", 0.5)), immediate, action.get("hide_after", false))
			"asset":
				if _live(sprite):
					_set_asset(sprite, action["asset"], action.get("animation", "idle"))
			"animation":
				if _live(sprite):
					_play(sprite, action["animation"])
			"closeup":
				_show_closeup(action["asset"])
			"closeup_hide":
				_closeup_root.hide()
			"glow":
				if _live(sprite):
					var glow: LampEmber = sprite.get_node_or_null("LampEmber") as LampEmber
					if glow == null:
						glow = LampEmber.new()
						glow.name = "LampEmber"
						glow.position = sprite.offset + Vector2(11, 10)
						sprite.add_child(glow)
					glow.visible = action.get("visible", true)

func _spawn(spec: Dictionary) -> AnimatedSprite2D:
	var at: Variant = _position(spec)
	if not at is Vector2 or not _catalog.definitions.has(spec["asset"]):
		return null
	if spec.get("avoid_player", false) and _live(_player) and at == _player.position:
		return null
	var frames: SpriteFrames = _catalog.sprite_frames(spec["asset"])
	var animation: StringName = StringName(spec.get("animation", "idle"))
	if not frames.has_animation(animation):
		animation = &"idle" if frames.has_animation(&"idle") else frames.get_animation_names()[0]
	var sprite: AnimatedSprite2D = _catalog.animated_sprite(spec["asset"], animation, int(String(spec["id"]).hash()))
	sprite.name = "Story_" + spec["id"]
	sprite.position = at.round()
	var offset: Vector2 = _vector(spec.get("offset", [0, 0]))
	sprite.offset += offset
	sprite.set_meta("stage_pixel_offset", offset)
	sprite.visible = spec.get("visible", true)
	_world.actors.add_child(sprite)
	return sprite

func _position(spec: Dictionary) -> Variant:
	if spec.has("entity"):
		var entity: Node2D = _world.find_entity(spec["entity"])
		return entity.position if _live(entity) and entity.visible else null
	if spec.has("player_offset"):
		return _player.position + _vector(spec["player_offset"]) if _live(_player) else null
	if spec.has("anchor"):
		var anchor: Dictionary = _world.world_data.anchor_point(_map_id, spec["anchor"])
		return _feet(Vector2i(int(anchor["x"]), int(anchor["y"]))) if not anchor.is_empty() else null
	if spec.has("at"):
		var cell: Vector2i = _cell(spec["at"])
		if cell.x >= 0 and cell.y >= 0 and cell.x < _world.map_data["width"] and cell.y < _world.map_data["height"]:
			return _feet(cell)
	return null

func _move(sprite: AnimatedSprite2D, points: Array, seconds: float, immediate: bool, hide_after: bool) -> void:
	if points.is_empty():
		return
	var previous: Tween = sprite.get_meta("stage_motion", null) as Tween
	if previous != null and previous.is_running() and sprite.get_meta("stage_destination", Vector2.INF) == points.back():
		return
	if previous != null and previous.is_valid():
		previous.kill()
	for index: int in range(_tweens.size() - 1, -1, -1):
		if _tweens[index] == null or not _tweens[index].is_valid():
			_tweens.remove_at(index)
	sprite.set_meta("stage_destination", points.back())
	sprite.set_meta("stage_hide_after", hide_after)
	if immediate or _reduced or not is_inside_tree():
		sprite.position = (points.back() as Vector2).round()
		if hide_after:
			sprite.hide()
		return
	var tween: Tween = create_tween()
	_tweens.append(tween)
	sprite.set_meta("stage_motion", tween)
	var from: Vector2 = sprite.position
	for destination: Vector2 in points:
		var direction: Vector2 = destination - from
		var facing: String = "right" if absf(direction.x) >= absf(direction.y) and direction.x > 0 else "left" if absf(direction.x) >= absf(direction.y) else "down" if direction.y > 0 else "up"
		tween.tween_callback(_play.bind(sprite, "walk_" + facing))
		tween.tween_method(_place.bind(sprite), from, destination, maxf(0.01, seconds / points.size()))
		from = destination
	tween.tween_callback(_finish_motion.bind(sprite, hide_after))

func _place(value: Vector2, sprite: AnimatedSprite2D) -> void:
	if _live(sprite):
		sprite.position = value.round()

func _finish_motion(sprite: AnimatedSprite2D, hide_after: bool) -> void:
	if not _live(sprite):
		return
	if hide_after:
		sprite.hide()
	else:
		var animation: String = String(sprite.animation).replace("walk_", "idle_")
		_play(sprite, animation)

func _set_asset(sprite: AnimatedSprite2D, asset: String, animation: String) -> void:
	if not _catalog.definitions.has(asset):
		return
	sprite.sprite_frames = _catalog.sprite_frames(asset)
	sprite.offset = -_catalog.anchor(asset) + (sprite.get_meta("stage_pixel_offset", Vector2.ZERO) as Vector2)
	_play(sprite, animation)

func _play(sprite: AnimatedSprite2D, animation: String) -> void:
	if _live(sprite) and sprite.sprite_frames.has_animation(StringName(animation)):
		sprite.play(StringName(animation))

func _hide_entity(id: String) -> void:
	var sprite: Node2D = _world.find_entity(id)
	if _live(sprite):
		_hidden.append({"node":sprite, "visible":sprite.visible})
		sprite.hide()

func _visible(spec: Dictionary) -> bool:
	if spec.get("map", "*") not in ["*", _map_id]:
		return false
	for flag: String in spec.get("all", []):
		if not _world.flags.get(flag, false):
			return false
	for flag: String in spec.get("none", []):
		if _world.flags.get(flag, false):
			return false
	return true

func _focus(at: Vector2) -> void:
	if _world.has_method("set_story_camera"):
		_world.call("set_story_camera", at.round())
		_camera_owned = true

func _release_camera() -> void:
	if _camera_owned and _live(_world) and _world.has_method("clear_story_camera"):
		_world.call("clear_story_camera")
	_camera_owned = false

func _build_closeup() -> void:
	if is_instance_valid(_closeup_layer):
		_closeup_layer.queue_free()
	_closeup_layer = CanvasLayer.new()
	_closeup_layer.layer = 15
	add_child(_closeup_layer)
	_closeup_root = Control.new()
	_closeup_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_closeup_root.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_closeup_layer.add_child(_closeup_root)
	var panel: NinePatchRect = NinePatchRect.new()
	panel.position = Vector2(196, 62)
	panel.size = Vector2(88, 88)
	panel.texture = _catalog.frame_texture(_catalog.binding("panel"), 0)
	panel.patch_margin_left = 4
	panel.patch_margin_right = 4
	panel.patch_margin_top = 4
	panel.patch_margin_bottom = 4
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_closeup_root.add_child(panel)
	_closeup_image = TextureRect.new()
	_closeup_image.position = Vector2(204, 70)
	_closeup_image.size = Vector2(72, 72)
	_closeup_image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_closeup_image.stretch_mode = TextureRect.STRETCH_KEEP_CENTERED
	_closeup_image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_closeup_root.add_child(_closeup_image)
	_closeup_root.hide()

func _show_closeup(asset: String) -> void:
	if _catalog.definitions.has(asset):
		_closeup_image.texture = _catalog.frame_texture(asset, 0)
		_closeup_root.show()

func _usable() -> bool:
	return _live(_world) and _world.get("loaded") == true and _catalog != null and _live(_world.get("actors"))

func _battle() -> bool:
	return _world.has_method("battle_active") and _world.battle_active()

func _stop_tweens() -> void:
	for tween: Tween in _tweens:
		if tween != null and tween.is_valid():
			tween.kill()
	_tweens.clear()

func _clear_nodes(nodes: Dictionary) -> void:
	for node: Variant in nodes.values():
		_dispose(node)
	nodes.clear()

func _prune(nodes: Dictionary) -> void:
	for id: String in nodes.keys():
		if not _live(nodes[id]):
			nodes.erase(id)

func _dispose(node: Variant) -> void:
	if _live(node):
		node.hide()
		if node.get_parent() != null:
			node.get_parent().remove_child(node)
		node.queue_free()

func _exit_tree() -> void:
	clear_stage()
	_clear_nodes(_props)
	_clear_nodes(_followers)
	_disconnect_player()
	if is_instance_valid(_world) and _world.is_connected("map_entered", _on_map_entered):
		_world.disconnect("map_entered", _on_map_entered)

static func _live(value: Variant) -> bool:
	return is_instance_valid(value) and value is Node and not value.is_queued_for_deletion()

static func _cell(value: Array) -> Vector2i:
	return Vector2i(int(value[0]), int(value[1]))

static func _vector(value: Array) -> Vector2:
	return Vector2(float(value[0]), float(value[1]))

static func _feet(cell: Vector2i) -> Vector2:
	return GridActor.cell_feet(cell)

static func _valid_config(catalog: AssetCatalog, data: Dictionary) -> bool:
	if catalog == null or data.get("format") != "astra.prologue-staging/1" or not data.get("steps") is Dictionary or not data.get("props") is Array or not data.get("following") is Dictionary:
		return false
	for role: String in ["body", "astral"]:
		if not data["following"].get(role) is String or not catalog.definitions.has(data["following"][role]):
			return false
	if not _valid_specs(catalog, data["props"]):
		return false
	for step_id: Variant in data["steps"]:
		var scene: Variant = data["steps"][step_id]
		if not step_id is String or not scene is Dictionary or not scene.get("map") is String or not scene.get("cast", []) is Array or not scene.get("lines", {}) is Dictionary:
			return false
		if not _valid_specs(catalog, scene.get("cast", [])) or (scene.has("camera") and not _pair(scene["camera"])) or not _strings(scene.get("hide_entities", [])) or not _strings(scene.get("hide_props", [])) or not scene.get("hide_followers", false) is bool:
			return false
		var ids: Array = scene.get("cast", []).map(func(spec: Dictionary) -> String: return spec["id"])
		for actions: Variant in [scene.get("enter", []), scene.get("summary", [])] + scene["lines"].values():
			if not _valid_actions(catalog, actions, ids):
				return false
		for key: Variant in scene["lines"]:
			if not key is String or key.length() > 3 or not key.is_valid_int() or int(key) < 0 or str(int(key)) != key:
				return false
	return true

static func _valid_specs(catalog: AssetCatalog, specs: Array) -> bool:
	var ids: Dictionary = {}
	for spec: Variant in specs:
		if not spec is Dictionary or not spec.get("id") is String or spec["id"].is_empty() or ids.has(spec["id"]) or not spec.get("asset") is String or not catalog.definitions.has(spec["asset"]):
			return false
		ids[spec["id"]] = true
		var placements: int = 0
		for key: String in ["at", "anchor", "entity", "player_offset"]:
			if spec.has(key):
				placements += 1
				if (key in ["at", "player_offset"] and not _pair(spec[key])) or (key in ["anchor", "entity"] and not spec[key] is String):
					return false
		if placements != 1 or not _pair(spec.get("offset", [0, 0])) or not _strings(spec.get("all", [])) or not _strings(spec.get("none", [])) or not spec.get("map", "*") is String or not spec.get("animation", "idle") is String or not spec.get("visible", true) is bool or not spec.get("avoid_player", false) is bool:
			return false
	return true

static func _valid_actions(catalog: AssetCatalog, actions: Variant, ids: Array) -> bool:
	if not actions is Array:
		return false
	for action: Variant in actions:
		if not action is Dictionary or action.get("op") not in ["show", "hide", "move", "asset", "animation", "closeup", "closeup_hide", "glow"]:
			return false
		if action["op"] not in ["closeup", "closeup_hide"] and action.get("id") not in ids:
			return false
		if action["op"] in ["asset", "closeup"] and (not action.get("asset") is String or not catalog.definitions.has(action["asset"])):
			return false
		if action["op"] == "move":
			var seconds: Variant = action.get("seconds", 0.5)
			if not (seconds is int or seconds is float) or not is_finite(float(seconds)) or seconds <= 0 or seconds > 4 or not action.get("path", []) is Array or action.get("path", []).size() > 64 or not action.get("hide_after", false) is bool:
				return false
			if not action.has("to") and not action.has("to_player_offset") and action.get("path", []).is_empty():
				return false
			for point: Variant in action.get("path", []):
				if not _pair(point):
					return false
			for key: String in ["to", "to_player_offset"]:
				if action.has(key) and not _pair(action[key]):
					return false
		if action["op"] == "animation" and not action.get("animation") is String:
			return false
		if action["op"] == "asset" and not action.get("animation", "idle") is String:
			return false
		if action["op"] == "glow" and not action.get("visible", true) is bool:
			return false
	return true

static func _pair(value: Variant) -> bool:
	if not value is Array or value.size() != 2:
		return false
	for axis: Variant in value:
		if not (axis is int or axis is float) or not is_finite(float(axis)) or float(axis) != floorf(float(axis)) or absf(float(axis)) > 1024:
			return false
	return true

static func _strings(value: Variant) -> bool:
	return value is Array and value.all(func(item: Variant) -> bool: return item is String and not item.is_empty())
