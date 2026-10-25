extends SceneTree
## Exercise the actual scene and movement controller across every authored door.

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
	var packed: PackedScene = load("res://scenes/main.tscn") as PackedScene
	var world: Node = packed.instantiate()
	root.add_child(world)
	await process_frame
	_check(bool(world.get("loaded")), "default game loads the prologue house")
	if not bool(world.get("loaded")):
		world.queue_free()
		_finish()
		return
	_check(world.get("map_data")["id"] == "lv.finn_house", "bootstrap enters authored Finn house")
	_check(world.get_node("Camera").position == Vector2(128, 104), "small room is centered within viewport")
	_check(world.get_node("HUD/Title").text.contains("芬恩家"), "house name is localized")
	var catalog: RefCounted = world.get("catalog")
	var maps: Dictionary = {}
	for map_id: String in catalog.call("map_ids"):
		maps[map_id] = catalog.call("map_data", map_id)
	var data: RefCounted = load("res://scripts/world/world_data.gd").new()
	_check(data.call("configure", maps).is_empty(), "all six registered maps satisfy structural and exit contracts")
	for flags: Dictionary in [{}, {"p.s02_done": true, "p.s03_done": true}, {"p.attack_started": true}, {"p.attack_started": true, "p.s09_done": true}, {"p.s02_done": true, "p.s03_done": true, "p.attack_started": true, "p.s09_done": true}]:
		var state_errors: Array = data.call("validate_state", flags)
		_check(state_errors.is_empty(), "authored map layouts remain safe under story visibility: " + str(flags) + " " + str(state_errors))
	_check(not data.call("validate_state", {"p.s09_done": true}).is_empty(), "impossible partial dawn flags reject overlapping NPCs")
	var actor: Node2D = world.get("player")
	var original_position: Vector2 = actor.position
	var wood_shadow: Texture2D = actor.get_node("Shadow").texture
	_check((wood_shadow as AtlasTexture).atlas == catalog.call("texture", "prop.shadow_wood"), "wood floors use the authored brown shadow")
	_check(not world.call("enter_map", "missing"), "unknown map entry is rejected")
	_check(not world.call("enter_map", "lv.finn_house", Vector2i(0, 0)), "blocked explicit landing is rejected")
	_check(world.get("player") == actor and actor.position == original_position, "rejected entry keeps the current scene and player")
	for target: String in ["lv.town", "lv.lamp_shop", "lv.town", "lv.bakery", "lv.town", "lv.wheat_road", "lv.town", "lv.finn_house"]:
		var map: Dictionary = world.get("map_data")
		var selected: Dictionary = {}
		for door: Dictionary in map.get("exits", []):
			if door["to"] == target:
				selected = door
		_check(not selected.is_empty(), "authored exit exists to " + target)
		if selected.is_empty():
			break
		var exit_cell: Vector2i = Vector2i(int(selected["x"]), int(selected["y"]))
		var start: Vector2i = world.get("player").get("grid_position")
		var route: Array[Vector2i] = _route(world, start, exit_cell)
		_check(not route.is_empty(), "door can be reached using legal movement: " + target)
		if route.is_empty():
			break
		for cell: Vector2i in route:
			var current: Node = world.get("player")
			var delta: Vector2i = cell - Vector2i(current.get("grid_position"))
			_check(bool(world.call("request_move", delta)), "production input accepts route step")
			# Advance the real fixed-tick animation deterministically; no position injection.
			current.set_physics_process(false)
			for tick: int in range(10):
				current.call("_physics_process", 1.0 / 60.0)
			await process_frame
		_check(world.get("map_data")["id"] == target, "stepping onto the door switches maps: " + target)
		var expected_shadow: String = "prop.shadow_path" if target in ["lv.town", "lv.wheat_road"] else "prop.shadow_wood"
		var current_shadow: AtlasTexture = world.get("player").get_node("Shadow").texture
		_check(current_shadow.atlas == catalog.call("texture", expected_shadow), "arrival shadow matches the floor without a grass-colored patch")
		var landing: Dictionary = selected["at"]
		_check(world.get("player").get("grid_position") == Vector2i(int(landing["x"]), int(landing["y"])), "paired door lands at the authored safe cell")
		_check(world.get_node("Actors").find_children("Player", "", false, false).size() == 1, "old player nodes are removed when changing maps")
		_check(world.call("accessibility_state")["map_id"] == target, "read-only browser snapshot follows the active map")
	_check(world.get("map_data")["id"] == "lv.finn_house", "full five-map route returns home")
	world.queue_free()
	await process_frame
	_finish()

func _route(world: Node, start: Vector2i, goal: Vector2i) -> Array[Vector2i]:
	var queue: Array[Vector2i] = [start]
	var previous: Dictionary = {start: start}
	var cursor: int = 0
	while cursor < queue.size():
		var cell: Vector2i = queue[cursor]
		cursor += 1
		if cell == goal:
			var result: Array[Vector2i] = []
			while cell != start:
				result.push_front(cell)
				cell = previous[cell]
			return result
		for direction: Vector2i in [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]:
			var next: Vector2i = cell + direction
			var other_door: bool = false
			for door: Dictionary in world.get("map_data").get("exits", []):
				if next == Vector2i(int(door["x"]), int(door["y"])) and next != goal:
					other_door = true
			if not previous.has(next) and not other_door and bool(world.call("is_walkable", next)):
				previous[next] = cell
				queue.append(next)
	return []

func _finish() -> void:
	print("G1 world travel: %d checks, %d failures" % [_checks, _failures.size()])
	quit(0 if _failures.is_empty() else 1)
