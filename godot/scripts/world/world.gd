class_name LanternWorld
extends Node2D
## Native map presentation; WorldData owns travel rules and AssetCatalog owns resource paths.

signal map_entered(map_id: String, cell: Vector2i)

@export var initial_map_id: String = ""

const DEFAULT_TERRAIN: Dictionary = {"grass": "tile.grass", "path": "tile.path", "bridge": "tile.bridge", "water": "tile.water", "border": "tile.grass"}
const TERRAIN_ROLES: Array[String] = ["grass", "path", "bridge", "water", "border"]
const DIRECTIONS: Array[Vector2i] = [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]
const INPUT_ACTIONS: Array[StringName] = [&"move_up", &"move_down", &"move_left", &"move_right"]

var loaded: bool = false
var map_data: Dictionary = {}
var catalog: AssetCatalog = AssetCatalog.new()
var world_data: WorldData = WorldData.new()
var flags: Dictionary = {}
var player: GridActor
var _entities: Dictionary = {}
var _strings: Dictionary = {}
var _terrain_sources: Dictionary = {}
var _edge_source: int = -1
var _last_accessibility_payload: String = ""

@onready var ground: TileMapLayer = $Ground
@onready var edges: TileMapLayer = $Edges
@onready var actors: Node2D = $Actors
@onready var camera: Camera2D = $Camera
@onready var title_label: Label = $HUD/Title
@onready var controls_label: Label = $HUD/Controls
@onready var title_panel: NinePatchRect = $HUD/TitlePanel
@onready var controls_panel: NinePatchRect = $HUD/ControlsPanel

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
	var panel_texture: AtlasTexture = catalog.frame_texture(catalog.binding("panel"), 0)
	title_panel.texture = panel_texture
	controls_panel.texture = panel_texture
	# G1a exposes movement only; dialogue and menu controls belong to later migration stages.
	controls_label.text = String(_strings["hint.controls"]).split("   ")[0]
	_install_input_actions()
	var start_id: String = initial_map_id if not initial_map_id.is_empty() else catalog.binding("map")
	if not enter_map(start_id):
		push_error("Initial map could not be entered: " + start_id)

func _physics_process(_delta: float) -> void:
	if not loaded:
		return
	if not player.is_moving:
		for index: int in range(INPUT_ACTIONS.size()):
			if Input.is_action_pressed(INPUT_ACTIONS[index]):
				request_move(DIRECTIONS[index])
				break

func _process(_delta: float) -> void:
	if loaded:
		_update_camera()

func request_move(direction: Vector2i) -> bool:
	if not loaded or player.is_moving or not direction in DIRECTIONS:
		return false
	player.face(direction)
	if not is_walkable(player.grid_position + direction):
		_publish_accessibility_state()
		return false
	player.begin_step(direction)
	_publish_accessibility_state()
	return true

func enter_map(map_id: String, at: Vector2i = Vector2i(-1, -1)) -> bool:
	if not world_data.validate_state(flags).is_empty():
		return false
	return _enter_validated_map(map_id, at)

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
	var facing: String = player.facing if is_instance_valid(player) else "down"
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
	_publish_accessibility_state()
	map_entered.emit(map_id, destination)
	return true

func accessibility_state() -> Dictionary:
	return {
		"ready": loaded,
		"map_id": String(map_data.get("id", "")),
		"grid_x": player.grid_position.x if player != null else -1,
		"grid_y": player.grid_position.y if player != null else -1,
		"facing": player.facing if player != null else "",
		"moving": player.is_moving if player != null else false,
	}

func _on_player_step_finished(cell: Vector2i) -> void:
	var result: Dictionary = world_data.transition(String(map_data["id"]), cell, flags)
	if bool(result.get("ok", false)):
		# transition has already validated all layouts and exits for these flags.
		if _enter_validated_map(String(result["map_id"]), result["position"]):
			return
	_refresh_ground_shadow()
	_publish_accessibility_state()

func _refresh_ground_shadow() -> void:
	var cell: Vector2i = player.grid_position
	var tile: String = String(map_data["rows"][cell.y])[cell.x]
	player.set_ground_shadow(catalog, _terrain_asset(_terrain_role(tile), map_data))

func _publish_accessibility_state() -> void:
	if not OS.has_feature("web") or not Engine.has_singleton("JavaScriptBridge"):
		return
	var payload: String = JSON.stringify({"state": accessibility_state(), "label": title_label.text})
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
		var animation: StringName = &"unlit" if entity["kind"] == "lamp" else &"idle"
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

func _update_camera() -> void:
	var focus: Vector2 = player.position - Vector2(0, 8)
	camera.position = Vector2(_camera_axis(focus.x, int(map_data["width"]) * 16, 480), _camera_axis(focus.y, int(map_data["height"]) * 16, 270))

func _camera_axis(focus: float, map_pixels: int, viewport_pixels: int) -> int:
	if map_pixels <= viewport_pixels:
		return floori(float(map_pixels) / 2.0)
	var half_viewport: int = floori(float(viewport_pixels) / 2.0)
	return clampi(roundi(focus), half_viewport, map_pixels - half_viewport)
