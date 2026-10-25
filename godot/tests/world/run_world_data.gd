extends SceneTree
## Small authored fixtures exercise rules without loading the resource pack.

const WorldRules = preload("res://scripts/world/world_data.gd")
var _checks: int = 0
var _failures: Array[String] = []

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	_checks += 1
	if not condition:
		_failures.append(message)
		push_error("FAIL: " + message)

func _fixture() -> Dictionary:
	return {
		"room.a": {
			"id": "room.a", "name": "room", "width": 7, "height": 5,
			"rows": ["ttttttt", "tgggggt", "tgggggt", "tgggggt", "ttttttt"],
			"spawn": {"x": 1, "y": 2},
			"terrain": {"grass": "tile.grass", "path": "tile.wood_floor", "border": "tile.wood_wall"},
			"entities": [
				{"id": "guard.day", "kind": "npc", "sprite": "npc", "solid": true, "x": 3, "y": 1, "visibleWhen": {"none": ["p.s09_done"]}},
				{"id": "guard.dawn", "kind": "npc", "sprite": "npc", "solid": true, "x": 3, "y": 1, "visibleWhen": {"all": ["p.s09_done"]}},
				{"id": "a.lamp", "kind": "lamp", "sprite": "lamp", "solid": true, "x": 3, "y": 3},
			],
			"required": ["guard.day", "guard.dawn", "a.lamp"],
			"exits": [{"pair": "rooms", "x": 5, "y": 2, "to": "room.b", "at": {"x": 2, "y": 2}}],
		},
		"room.b": {
			"id": "room.b", "name": "room", "width": 7, "height": 5,
			"rows": ["ttttttt", "tgggggt", "tgggggt", "tgggggt", "ttttttt"],
			"spawn": {"x": 2, "y": 2},
			"entities": [{"id": "arrival.blocker", "kind": "npc", "sprite": "npc", "solid": false, "x": 2, "y": 2, "visibleWhen": {"all": ["block.entry"]}}],
			"required": [],
			"exits": [{"pair": "rooms", "x": 1, "y": 2, "to": "room.a", "at": {"x": 4, "y": 2}}],
		},
	}

func _run() -> void:
	_test_visibility_and_copies()
	_test_walkability_and_footprints()
	_test_transitions()
	_test_rejected_content()
	_test_automatic_exit_reachability()
	print("WorldData: %d checks, %d failures" % [_checks, _failures.size()])
	quit(0 if _failures.is_empty() else 1)

func _test_visibility_and_copies() -> void:
	var source: Dictionary = _fixture()
	var before: Dictionary = source.duplicate(true)
	var rules: WorldRules = WorldRules.new()
	_check(rules.configure(source).is_empty(), "valid paired maps configure")
	var day: Dictionary = rules.get_map("room.a")
	_check(not day.is_empty(), "known map resolves")
	_check(rules.get_map("missing").is_empty(), "unknown map does not resolve")
	if day.is_empty():
		return
	_check(day["entities"].size() == 2 and day["entities"][0]["id"] == "guard.day", "day flags display the daytime NPC only")
	_check(day["required"] == ["guard.day", "a.lamp"], "hidden NPC loses its required interaction")
	var dawn: Dictionary = rules.get_map("room.a", {"p.s09_done": true})
	_check(dawn["entities"].size() == 2 and dawn["entities"][0]["id"] == "guard.dawn", "dawn flags display the dawn NPC only")
	_check(dawn["required"] == ["guard.dawn", "a.lamp"], "dawn required interaction replaces daytime one")
	_check(rules.validate_state({}).is_empty() and rules.validate_state({"p.s09_done": true}).is_empty(), "day and dawn remain reachable")
	_check(day["terrain"]["path"] == "tile.wood_floor", "terrain sprite ID overrides survive filtering")
	_check(source == before, "configuration and visibility leave all source data unchanged")
	day["rows"][1] = "changed"
	day["entities"][0]["x"] = 99
	day["terrain"]["path"] = "changed"
	source["room.a"]["spawn"]["x"] = 99
	_check(rules.get_map("room.a")["rows"][1] == "tgggggt", "consumer cannot mutate stored rows")
	_check(rules.get_map("room.a")["entities"][0]["x"] == 3, "consumer cannot mutate stored nested entities")
	_check(rules.get_map("room.a")["terrain"]["path"] == "tile.wood_floor", "consumer cannot mutate stored terrain")
	_check(rules.get_map("room.a")["spawn"]["x"] == 1, "caller cannot mutate configured source")
	_check(rules.get_map("room.a", {"p.s09_done": "yes"}).is_empty(), "non-boolean runtime flag is rejected")
	_check(not rules.validate_state({"constructor": true}).is_empty(), "reserved runtime flag is rejected")

func _test_walkability_and_footprints() -> void:
	var rules: WorldRules = WorldRules.new()
	_check(rules.configure(_fixture()).is_empty(), "walkability fixture configures")
	var map: Dictionary = rules.get_map("room.a")
	_check(rules.is_walkable(map, Vector2i(2, 2)), "open terrain is walkable")
	_check(not rules.is_walkable(map, Vector2i(-1, 2)), "negative coordinate is blocked")
	_check(not rules.is_walkable(map, Vector2i(7, 2)), "far boundary is blocked")
	_check(not rules.is_walkable(map, Vector2i(0, 2)), "tree-border terrain is blocked")
	_check(not rules.is_walkable(map, Vector2i(3, 1)), "visible NPC blocks movement")
	_check(rules.is_safe_entry(rules.get_map("room.b"), Vector2i(2, 2)), "hidden NPC does not block arrival")
	var occupied: Dictionary = rules.get_map("room.b", {"block.entry": true})
	_check(rules.is_walkable(occupied, Vector2i(2, 2)), "non-solid NPC retains non-solid movement semantics")
	_check(not rules.is_safe_entry(occupied, Vector2i(2, 2)), "arrival cannot overlap a visible non-solid NPC")
	_check(rules.reachable(map, Vector2i(1, 2)).has(Vector2i(5, 2)), "flood fill reaches the door")
	_check(rules.reachable(map, Vector2i.ZERO).is_empty(), "flood fill rejects a blocked origin")
	if map.is_empty():
		return
	map["entities"] = [{"id": "house", "kind": "decoration", "sprite": "house", "solid": true, "x": 3, "y": 3, "footprint": [3, 2]}]
	_check(not rules.is_walkable(map, Vector2i(2, 2)), "footprint blocks upper-left tile from bottom-center anchor")
	_check(not rules.is_walkable(map, Vector2i(4, 3)), "footprint blocks bottom-right tile")
	_check(rules.is_walkable(map, Vector2i(1, 3)), "tile immediately outside footprint stays open")
	map["rows"][1] = "tgwbbgt"
	_check(not rules.is_walkable(map, Vector2i(2, 1)), "water is blocked")
	_check(rules.is_walkable(map, Vector2i(3, 1)), "bridge is walkable")
	_check(not rules.is_walkable({}, Vector2i.ZERO), "malformed public map input fails closed")

func _test_transitions() -> void:
	var rules: WorldRules = WorldRules.new()
	var source: Dictionary = _fixture()
	var before: Dictionary = source.duplicate(true)
	_check(rules.configure(source).is_empty(), "travel fixture configures")
	_check(rules.transition("room.a", Vector2i(5, 2)) == {"ok": true, "map_id": "room.b", "position": Vector2i(2, 2)}, "forward doorway arrives at adjacent target floor")
	_check(rules.transition("room.b", Vector2i(1, 2)) == {"ok": true, "map_id": "room.a", "position": Vector2i(4, 2)}, "reverse doorway returns through the same pair")
	var off_door: Dictionary = rules.transition("room.a", Vector2i(4, 2))
	_check(not off_door["ok"] and off_door["map_id"] == "room.a" and off_door["position"] == Vector2i(4, 2), "off-door request retains caller position")
	var blocked: Dictionary = rules.transition("room.a", Vector2i(5, 2), {"block.entry": true})
	_check(not blocked["ok"] and blocked["map_id"] == "room.a" and blocked["position"] == Vector2i(5, 2), "newly visible arrival blocker rejects travel without moving")
	_check(not rules.transition("missing", Vector2i(5, 2))["ok"], "unknown source map cannot travel")
	_check(not rules.validate_state({"block.entry": true}).is_empty(), "dynamic validation detects blocked spawn and entrance")
	_check(source == before, "configuration and transitions never mutate source maps")

func _test_rejected_content() -> void:
	for problem: String in ["map_type", "id", "width", "rows", "tile", "spawn", "entity", "footprint", "required", "condition", "terrain", "source", "destination", "landing", "pair", "unreachable"]:
		var maps: Dictionary = _fixture()
		match problem:
			"map_type": maps["room.a"] = []
			"id": maps["room.a"]["id"] = "wrong"
			"width": maps["room.a"]["width"] = 7.5
			"rows": maps["room.a"]["rows"][1] = "gg"
			"tile": maps["room.a"]["rows"][1] = "tgg?ggt"
			"spawn": maps["room.a"]["spawn"] = {"x": 0, "y": 0}
			"entity": maps["room.a"]["entities"][0]["x"] = -1
			"footprint": maps["room.a"]["entities"][0]["footprint"] = [0, 2]
			"required": maps["room.a"]["required"].append("missing")
			"condition": maps["room.a"]["entities"][0]["visibleWhen"] = {"all": ["__proto__"]}
			"terrain": maps["room.a"]["terrain"]["path"] = 7
			"source": maps["room.a"]["exits"][0]["x"] = 0
			"destination": maps["room.a"]["exits"][0]["to"] = "missing"
			"landing": maps["room.a"]["exits"][0]["at"] = {"x": 5, "y": 1}
			"pair": maps["room.b"]["exits"][0]["pair"] = "different"
			"unreachable":
				maps["room.a"]["rows"][1] = "tgggtgt"
				maps["room.a"]["rows"][2] = "tgggtgt"
				maps["room.a"]["rows"][3] = "tgggtgt"
		var rules: WorldRules = WorldRules.new()
		rules.configure(_fixture())
		var baseline: Dictionary = rules.get_map("room.a")
		_check(not rules.configure(maps).is_empty(), "reject invalid content: " + problem)
		_check(rules.get_map("room.a") == baseline, "failed configure retains previous world: " + problem)

func _door_corridor(lamp_x: int) -> Dictionary:
	var maps: Dictionary = _fixture()
	maps["room.a"]["rows"] = ["ttttttt", "ttttttt", "tgggggt", "ttttttt", "ttttttt"]
	maps["room.a"]["entities"] = [{"id": "a.lamp", "kind": "lamp", "sprite": "lamp", "solid": true, "x": lamp_x, "y": 2}]
	maps["room.a"]["required"] = ["a.lamp"]
	maps["room.a"]["exits"][0]["x"] = 3
	maps["room.b"]["exits"][0]["at"] = {"x": 2, "y": 2}
	return maps

func _test_automatic_exit_reachability() -> void:
	var rules: WorldRules = WorldRules.new()
	for lamp_x: int in [4, 5]:
		var maps: Dictionary = _door_corridor(lamp_x)
		_check(not rules.configure(maps).is_empty(), "reject required lamp hidden beyond an automatic door: x=%d" % lamp_x)
	var corridor: Dictionary = _door_corridor(5)["room.a"]
	var cells: Dictionary = rules.reachable(corridor, Vector2i(1, 2))
	_check(cells.has(Vector2i(3, 2)), "automatic exit remains a reachable movement target")
	_check(not cells.has(Vector2i(4, 2)), "flood fill does not walk through an automatic exit")
	_check(rules.reachable(corridor, Vector2i(3, 2)).has(Vector2i(4, 2)), "arrival directly on a door can walk away before another transition")
	var return_trap: Dictionary = _door_corridor(5)
	return_trap["room.a"]["spawn"] = {"x": 3, "y": 2}
	_check(not rules.configure(return_trap).is_empty(), "each incoming landing must reach objectives even when spawn is on a door")
