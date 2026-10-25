extends SceneTree
## Exercise the same scene, movement requests, and physics updates as the game.

var _checks: int = 0
var _failures: Array[String] = []

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	_checks += 1
	if not condition:
		_failures.append(message)
		push_error("FAIL: " + message)

func _run() -> void:
	_check(FileAccess.file_exists("res://scenes/main.tscn"), "native main scene exists")
	if not _failures.is_empty():
		_finish()
		return
	var packed: PackedScene = load("res://scenes/main.tscn") as PackedScene
	_check(packed != null, "native main scene loads")
	if packed == null:
		_finish()
		return
	var world: Node = packed.instantiate()
	root.add_child(world)
	await process_frame
	_check(bool(world.get("loaded")), "map, manifest and UI load successfully")
	if not bool(world.get("loaded")):
		world.queue_free()
		_finish()
		return
	var player: Node2D = world.get("player") as Node2D
	var sprite: AnimatedSprite2D = player.get_node("Sprite") as AnimatedSprite2D
	_check(world.has_method("accessibility_state"), "world exposes a read-only accessibility snapshot")
	if not world.has_method("accessibility_state"):
		world.queue_free()
		await process_frame
		_finish()
		return
	var initial_accessibility: Dictionary = world.call("accessibility_state")
	_check(initial_accessibility == {"ready": true, "grid_x": 8, "grid_y": 12, "facing": "down", "moving": false}, "accessibility snapshot describes the ready player")
	initial_accessibility["grid_x"] = 999
	_check(player.get("grid_position") == Vector2i(8, 12), "mutating an accessibility snapshot cannot change gameplay")
	var catalog: RefCounted = world.get("catalog") as RefCounted
	_check(catalog.has_method("map_data") and catalog.has_method("locale") and catalog.has_method("binding"), "resource catalog resolves map, locale and bootstrap IDs")
	if not catalog.has_method("map_data") or not catalog.has_method("locale") or not catalog.has_method("binding"):
		world.queue_free()
		await process_frame
		_finish()
		return
	var map_id: String = catalog.call("binding", "map")
	var locale_id: String = catalog.call("binding", "locale")
	var detached_map: Dictionary = catalog.call("map_data", map_id)
	_check(detached_map.get("id") == "lantern.test", "logical pack map ID resolves source map")
	detached_map["spawn"]["x"] = 999
	_check(catalog.call("map_data", map_id)["spawn"]["x"] == 8, "map consumers cannot mutate cached source data")
	var detached_locale: Dictionary = catalog.call("locale", locale_id)
	detached_locale["game.title"] = "changed"
	_check(catalog.call("locale", locale_id)["game.title"] == "伴星 ASTRA", "locale consumers cannot mutate cached source data")
	var panel: NinePatchRect = world.get_node("HUD/TitlePanel") as NinePatchRect
	var controls_panel: NinePatchRect = world.get_node("HUD/ControlsPanel") as NinePatchRect
	_check(panel.texture != null and controls_panel.texture == panel.texture, "HUD resolves both panels from the resource service")
	var shadow: Sprite2D = player.get_node("Shadow") as Sprite2D
	_check(shadow.texture != null and shadow.offset == Vector2(-8, -8), "player shadow resolves its pack binding and anchor")
	var definitions: Dictionary = catalog.get("definitions")
	for asset_id: String in definitions:
		var texture: Texture2D = catalog.call("texture", asset_id) as Texture2D
		var definition: Dictionary = definitions[asset_id]
		_check(texture != null and texture.get_width() == int(definition["size"][0]) * int(definition["frames"]), "imported PNG strip dimensions: " + asset_id)
	_check(player.get("grid_position") == Vector2i(8, 12), "player starts at source map spawn")
	_check(player.position == Vector2(136, 208), "player feet align to tile bottom center")
	_check(sprite.offset == Vector2(-8, -24), "Finn atlas uses source foot anchor")
	_check(sprite.sprite_frames.get_frame_count("idle_down") == 24, "repeated idle frames preserve six-second rhythm")
	_check(sprite.sprite_frames.get_animation_speed("idle_down") == 4.0, "idle rhythm uses source fps")
	_check(sprite.sprite_frames.get_animation_speed("walk_right") == 8.0, "walk rhythm uses source fps")
	var first_walk: AtlasTexture = sprite.sprite_frames.get_frame_texture("walk_right", 0) as AtlasTexture
	_check(first_walk.region == Rect2(320, 0, 16, 24), "walk_right selects source frame 20")
	var label: Label = world.get_node("HUD/Title") as Label
	_check(label.text.contains("伴星"), "HUD reads localized title")
	var font: Font = label.get_theme_font("font")
	_check(font is FontFile and font.has_char("伴".unicode_at(0)), "bundled Fusion Pixel renders Chinese")
	_check((font as FontFile).antialiasing == TextServer.FONT_ANTIALIASING_NONE, "UI font has no antialiasing")
	_check(not (font as FontFile).allow_system_fallback, "UI uses the licensed bundled font only")
	_check(bool(world.call("request_move", Vector2i.RIGHT)), "production move request accepts free right tile")
	_check(world.call("accessibility_state") == {"ready": true, "grid_x": 9, "grid_y": 12, "facing": "right", "moving": true}, "accessibility snapshot publishes movement target and direction")
	_check(sprite.animation == &"walk_right", "moving selects directional walk animation")
	_check(not bool(world.call("request_move", Vector2i.DOWN)), "a pending grid step cannot be overwritten")
	await _wait_for_step(player)
	_check(player.get("grid_position") == Vector2i(9, 12), "successful move reaches adjacent grid cell")
	_check(player.position == Vector2(152, 208), "movement ends on exact integer foot position")
	_check(sprite.animation == &"idle_right", "stopped actor returns to directional idle")
	_check(not bool(world.call("accessibility_state")["moving"]), "accessibility snapshot reports completed movement")
	_check(bool(world.call("request_move", Vector2i.UP)), "approach Hob from west")
	await _wait_for_step(player)
	_check(player.get("grid_position") == Vector2i(9, 11), "approach ends west of Hob")
	_check(not bool(world.call("request_move", Vector2i.RIGHT)), "Hob blocks requested target tile")
	_check(player.get("grid_position") == Vector2i(9, 11), "blocked move preserves player grid position")
	_check(world.call("accessibility_state") == {"ready": true, "grid_x": 9, "grid_y": 11, "facing": "right", "moving": false}, "blocked movement publishes facing without changing grid position")
	_check(not bool(world.call("is_walkable", Vector2i(6, 6))), "house footprint blocks its upper-left tile")
	_check(not bool(world.call("is_walkable", Vector2i(10, 8))), "house footprint blocks its lower-right tile")
	_check(bool(world.call("is_walkable", Vector2i(5, 8))), "tile just outside house footprint stays open")
	_check(not bool(world.call("is_walkable", Vector2i(28, 5))), "water is blocked")
	_check(bool(world.call("is_walkable", Vector2i(28, 12))), "bridge crossing stays walkable")
	_check(not bool(world.call("is_walkable", Vector2i(0, 12))), "border is blocked")
	_check(not bool(world.call("request_move", Vector2i(1, 1))), "diagonal grid request is rejected")
	Input.action_press(&"move_down")
	await physics_frame
	await physics_frame
	Input.action_release(&"move_down")
	await _wait_for_step(player)
	_check(player.get("grid_position") == Vector2i(9, 12), "held input action reaches the production movement controller")
	var w_key: InputEventKey = InputEventKey.new()
	w_key.physical_keycode = KEY_W
	_check(InputMap.action_has_event(&"move_up", w_key), "physical W key is mapped to movement")
	var tree: AnimatedSprite2D = world.call("find_entity", "tree1") as AnimatedSprite2D
	var tree_origin: Vector2 = tree.position
	_check(tree.offset == Vector2(-16, -48), "tree atlas uses source root anchor")
	_check(tree.sprite_frames.get_frame_count("idle") == 12, "tree keeps all repeated idle frames")
	var hob: AnimatedSprite2D = world.call("find_entity", "hob") as AnimatedSprite2D
	_check(hob.is_playing(), "NPC idle is active")
	var lamp: AnimatedSprite2D = world.call("find_entity", "first_lamp") as AnimatedSprite2D
	_check(lamp.sprite_frames.has_animation("lit"), "lamp includes source flicker animation")
	await create_timer(0.4).timeout
	_check(tree.position == tree_origin, "tree animation never moves its root")
	_check(ProjectSettings.get_setting("threading/worker_pool/max_threads") == 1, "worker pool remains bounded")
	for setting: Dictionary in ProjectSettings.get_property_list():
		if setting["name"] == "rendering/driver/threads/thread_model":
			print("Godot thread model enum: ", setting["hint_string"])
	_check(ProjectSettings.get_setting("rendering/driver/threads/thread_model") == 1, "rendering stays in safe single-thread mode")
	world.queue_free()
	await process_frame
	_finish()

func _wait_for_step(player: Node) -> void:
	for tick in range(24):
		await physics_frame
		if not bool(player.get("is_moving")):
			return
	_check(false, "grid movement completes within 24 physics ticks")

func _finish() -> void:
	print("G0 smoke: %d checks, %d failures" % [_checks, _failures.size()])
	quit(0 if _failures.is_empty() else 1)
