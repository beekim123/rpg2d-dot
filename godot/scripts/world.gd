class_name LanternWorld
extends Node2D
## G0 native exploration foundation; authoritative sources remain in art/ and content/.

const MAP_PATH: String = "res://data/maps/lantern-test.json"
const TEXT_PATH: String = "res://data/i18n/zh-Hans.json"
const TILE_ASSETS: Array[String] = ["tile.grass", "tile.path", "tile.bridge", "tile.water", "tile.edge"]
const DIRECTIONS: Array[Vector2i] = [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]
const INPUT_ACTIONS: Array[StringName] = [&"move_up", &"move_down", &"move_left", &"move_right"]

var loaded: bool = false
var map_data: Dictionary = {}
var catalog: AssetCatalog = AssetCatalog.new()
var player: GridActor
var _entities: Dictionary = {}
var _last_accessibility_payload: String = ""

@onready var ground: TileMapLayer = $Ground
@onready var edges: TileMapLayer = $Edges
@onready var actors: Node2D = $Actors
@onready var camera: Camera2D = $Camera
@onready var title_label: Label = $HUD/Title
@onready var controls_label: Label = $HUD/Controls

func _ready() -> void:
	if not catalog.load_manifest() or not _load_map():
		return
	var font: FontFile = catalog.pixel_font()
	if font == null:
		push_error("Bundled Fusion Pixel font did not load")
		return
	var strings: Variant = JSON.parse_string(FileAccess.get_file_as_string(TEXT_PATH))
	if not strings is Dictionary:
		push_error("Localized UI table did not load")
		return
	title_label.add_theme_font_override("font", font)
	controls_label.add_theme_font_override("font", font)
	title_label.text = String(strings["game.title"]) + "  ·  " + String(strings[map_data["name"]])
	# G0 exposes movement only; the remaining source hint belongs to later migration stages.
	controls_label.text = String(strings["hint.controls"]).split("   ")[0]
	_build_ground()
	_build_entities()
	player = GridActor.new()
	player.name = "Player"
	var spawn: Dictionary = map_data["spawn"]
	player.setup(catalog, Vector2i(int(spawn["x"]), int(spawn["y"])))
	actors.add_child(player)
	player.step_finished.connect(_on_player_step_finished)
	_install_input_actions()
	_update_camera()
	loaded = true
	_publish_accessibility_state()

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

func accessibility_state() -> Dictionary:
	return {
		"ready": loaded,
		"grid_x": player.grid_position.x if player != null else -1,
		"grid_y": player.grid_position.y if player != null else -1,
		"facing": player.facing if player != null else "",
		"moving": player.is_moving if player != null else false,
	}

func _on_player_step_finished(_cell: Vector2i) -> void:
	_publish_accessibility_state()

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
	if cell.x < 0 or cell.y < 0 or cell.x >= int(map_data["width"]) or cell.y >= int(map_data["height"]):
		return false
	var tile: String = String(map_data["rows"][cell.y])[cell.x]
	if tile == "w" or tile == "t":
		return false
	for entity: Dictionary in map_data["entities"]:
		if not bool(entity.get("solid", false)):
			continue
		var footprint: Array = entity.get("footprint", [1, 1])
		var width: int = int(footprint[0])
		var height: int = int(footprint[1])
		var left: int = int(entity["x"]) - floori(float(width) / 2.0)
		var top: int = int(entity["y"]) - height + 1
		if Rect2i(left, top, width, height).has_point(cell):
			return false
	return true

func find_entity(entity_id: String) -> AnimatedSprite2D:
	return _entities.get(entity_id) as AnimatedSprite2D

func _load_map() -> bool:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(MAP_PATH))
	if not parsed is Dictionary:
		push_error("Map is not a JSON object")
		return false
	map_data = parsed
	var rows: Array = map_data.get("rows", [])
	if rows.size() != int(map_data.get("height", 0)) or rows.is_empty():
		return false
	for row: String in rows:
		if row.length() != int(map_data.get("width", 0)):
			return false
		for tile: String in row:
			if not tile in ["g", "s", "w", "b", "t"]:
				return false
	return map_data.has("spawn") and map_data.has("entities")

func _build_ground() -> void:
	var tiles: TileSet = TileSet.new()
	tiles.tile_size = Vector2i(16, 16)
	for source_id: int in range(TILE_ASSETS.size()):
		var asset_id: String = TILE_ASSETS[source_id]
		var atlas: TileSetAtlasSource = TileSetAtlasSource.new()
		atlas.texture = catalog.texture(asset_id)
		atlas.texture_region_size = Vector2i(16, 16)
		for frame_index: int in range(int(catalog.definitions[asset_id]["frames"])):
			atlas.create_tile(Vector2i(frame_index, 0))
		tiles.add_source(atlas, source_id)
	ground.tile_set = tiles
	edges.tile_set = tiles
	for y: int in range(int(map_data["height"])):
		for x: int in range(int(map_data["width"])):
			var cell: Vector2i = Vector2i(x, y)
			var tile: String = String(map_data["rows"][y])[x]
			var hash_value: int = ((x * 73856093) ^ (y * 19349663)) & 0xffffffff
			var source_id: int = 0
			var variant: int = 0 if hash_value % 10 < 7 else 1 + hash_value % 3
			if tile == "s":
				source_id = 1
				variant = hash_value % 4
			elif tile == "b":
				source_id = 2
				variant = 0
			elif tile == "w":
				source_id = 3
				variant = 0
			ground.set_cell(cell, source_id, Vector2i(variant, 0))
			if tile == "g":
				edges.set_cell(cell, 4, Vector2i(_edge_mask(cell), 0))
			if tile == "w":
				_add_decoration("tile.water", cell, y, -1)
			elif tile == "t":
				_add_decoration("prop.hedge", cell, x * 11 + y * 23)
			elif tile == "g" and (x * 11 + y * 23) % 41 == 0:
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
	camera.position = Vector2(clampi(roundi(focus.x), 240, int(map_data["width"]) * 16 - 240), clampi(roundi(focus.y), 135, int(map_data["height"]) * 16 - 135))
