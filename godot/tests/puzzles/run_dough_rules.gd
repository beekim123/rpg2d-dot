extends SceneTree
## Authored two-box puzzle rules; no solver, rendering, clock or random input.
## Definition schema: stable id/mapId strings; positive integer width/height;
## blocked Array[{x,y}], player {x,y}, and exactly two boxes/goals points.
## Optional display Dictionary is opaque view metadata. No other top-level keys.
## Snapshot includes the definition with current player/boxes and detached display.
## move/undo -> {ok, state, error}; reset -> initial snapshot; solved -> bool.
## Local positions never include or write story flags, inventory or v3 actorMemory.

const RULES_PATH: String = "res://scripts/puzzles/dough_rules.gd"
const SOLUTION: Array[Vector2i] = [Vector2i.LEFT, Vector2i.LEFT, Vector2i.UP, Vector2i.DOWN, Vector2i.RIGHT, Vector2i.RIGHT, Vector2i.RIGHT, Vector2i.UP]
var _checks: int = 0
var _failures: Array[String] = []
var _definition: Dictionary = {}
var _rules_script: Script

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	_checks += 1
	if not condition:
		_failures.append(message)
		push_error("FAIL: " + message)

func _read_source(relative: String) -> Dictionary:
	var root_path: String = ProjectSettings.globalize_path("res://").path_join("..")
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(root_path.path_join(relative)))
	_check(parsed is Dictionary, "authored JSON object loads: " + relative)
	return parsed if parsed is Dictionary else {}

func _run() -> void:
	_definition = _read_source("content/data/puzzles/dough.json")
	if not _definition.is_empty():
		_test_authored_layout()
	# The initial red phase intentionally has no production script. Report a
	# missing capability without provoking a GDScript import/parser error.
	var available: bool = FileAccess.file_exists(RULES_PATH)
	_check(available, "DoughRules implementation is available for the authored puzzle")
	if available:
		_rules_script = load(RULES_PATH) as Script
		_check(_rules_script != null, "DoughRules module loads")
		if _rules_script != null and _test_api():
			_test_unconfigured()
			_test_solution()
			_test_collisions_and_invalid_moves()
			_test_undo()
			_test_corner_reset()
			_test_exit_route()
			_test_snapshot_isolation()
			_test_rejected_definitions()
			_test_goal_order_and_display()
	print("DoughRules: %d checks, %d failures" % [_checks, _failures.size()])
	quit(0 if _failures.is_empty() else 1)

func _point_key(point: Dictionary) -> Vector2i:
	return Vector2i(int(point["x"]), int(point["y"]))

func _test_authored_layout() -> void:
	var map: Dictionary = _read_source("content/maps/prologue/lv-bakery.json")
	if map.is_empty():
		return
	_check(_definition["mapId"] == map["id"] and _definition["width"] == map["width"] and _definition["height"] == map["height"], "puzzle uses the actual bakery grid")
	_check(_definition["player"] == map["anchors"]["dough_entry"], "puzzle begins at the actual safe dough_entry anchor")
	var entities: Dictionary = {}
	for entity: Dictionary in map["entities"]:
		entities[entity["id"]] = entity
	var display: Dictionary = _definition["display"]
	for kind: String in ["boxes", "goals"]:
		var ids: Array = display["boxEntityIds" if kind == "boxes" else "goalEntityIds"]
		_check(ids.size() == 2, "two original entities identify " + kind)
		for index: int in range(2):
			var entity: Dictionary = entities[ids[index]]
			_check(_definition[kind][index] == {"x": entity["x"], "y": entity["y"]}, "authored " + kind + " position matches " + ids[index])
	var expected_blocked: Dictionary = {}
	for y: int in range(int(map["height"])):
		for x: int in range(int(map["width"])):
			if not String(map["rows"][y])[x] in ["g", "s", "b"]:
				expected_blocked[Vector2i(x, y)] = true
	# The mode displays Brio at her authored cell as well as the fixed furniture.
	# Boxes are excluded here: their collision comes from the mutable box list.
	for entity_id: String in display["blockedEntityIds"]:
		var entity: Dictionary = entities[entity_id]
		var size: Array = entity.get("footprint", [1, 1])
		var left: int = int(entity["x"]) - floori(float(size[0]) / 2.0)
		var top: int = int(entity["y"]) - int(size[1]) + 1
		for y: int in range(top, top + int(size[1])):
			for x: int in range(left, left + int(size[0])):
				expected_blocked[Vector2i(x, y)] = true
	var actual_blocked: Dictionary = {}
	for point: Dictionary in _definition["blocked"]:
		var key: Vector2i = _point_key(point)
		_check(not actual_blocked.has(key), "authored blocked cells contain no duplicate: " + str(key))
		actual_blocked[key] = true
	_check(actual_blocked == expected_blocked, "blocked cells exactly match visible walls, furniture and mode host; no invisible walls")
	_check(not actual_blocked.has(Vector2i(9, 14)), "original bakery exit stays open")
	_check(display["exitPair"] == map["exits"][0]["pair"], "mode keeps the real bakery exit pair")

func _test_api() -> bool:
	var rules: Variant = _rules_script.new()
	_check(rules is RefCounted and not rules is Node, "puzzle rules are independent RefCounted data, not a scene node")
	if not rules is RefCounted:
		return false
	var available: bool = true
	for method: String in ["configure", "snapshot", "move", "reset", "undo", "solved"]:
		var present: bool = rules.has_method(method)
		_check(present, "puzzle rules expose " + method)
		available = available and present
	return available

func _configured(definition: Dictionary) -> RefCounted:
	var rules: RefCounted = _rules_script.new()
	var errors: Variant = rules.call("configure", definition)
	_check(errors is Array and errors.is_empty(), "hand-authored valid puzzle configures")
	return rules

func _move_ok(rules: RefCounted, direction: Vector2i, label: String) -> Dictionary:
	var result: Dictionary = rules.call("move", direction)
	_check(result.get("ok", false) and result.get("error", "missing") == "", label)
	_check(result.get("state", {}) == rules.call("snapshot"), "move returns the current detached state: " + label)
	return result

func _fails_unchanged(rules: RefCounted, direction: Vector2i, label: String) -> void:
	var before: Dictionary = rules.call("snapshot")
	var result: Dictionary = rules.call("move", direction)
	_check(not result.get("ok", true) and not String(result.get("error", "")).is_empty(), label)
	_check(result.get("state", {}) == before and rules.call("snapshot") == before, "invalid move is atomic: " + label)

func _test_unconfigured() -> void:
	var rules: RefCounted = _rules_script.new()
	_check(rules.call("snapshot") == {}, "unconfigured rules expose no state")
	_check(not rules.call("solved"), "unconfigured rules are not solved")
	_fails_unchanged(rules, Vector2i.UP, "unconfigured movement fails closed")
	_check(rules.call("reset") == {}, "unconfigured reset returns empty state")
	var undone: Dictionary = rules.call("undo")
	_check(not undone.get("ok", true) and undone.get("state", {}) == {}, "unconfigured undo fails closed")

func _play_solution(rules: RefCounted) -> void:
	var positions: Array[Dictionary] = [
		{"x": 8, "y": 9}, {"x": 7, "y": 9}, {"x": 7, "y": 8}, {"x": 7, "y": 9},
		{"x": 8, "y": 9}, {"x": 9, "y": 9}, {"x": 10, "y": 9}, {"x": 10, "y": 8},
	]
	for index: int in range(SOLUTION.size()):
		var result: Dictionary = _move_ok(rules, SOLUTION[index], "manual solution step %d" % (index + 1))
		_check(result["state"]["player"] == positions[index], "manual solution uses the expected adjacent player cell at step %d" % (index + 1))
		if index == 2:
			_check(result["state"]["boxes"] == [{"x": 7, "y": 7}, {"x": 10, "y": 8}], "first push moves exactly the first cart onto its cooling mat")
			_check(not rules.call("solved"), "one occupied cooling mat does not finish the puzzle")
	_check(rules.call("snapshot")["boxes"] == [{"x": 7, "y": 7}, {"x": 10, "y": 7}], "both original carts finish on the two authored mats")
	_check(rules.call("solved"), "manual eight-step, two-push solution is complete")

func _test_solution() -> void:
	var rules: RefCounted = _configured(_definition)
	_check(not rules.call("solved"), "original layout begins unsolved")
	_play_solution(rules)
	var undo_result: Dictionary = rules.call("undo")
	_check(undo_result.get("ok", false) and not rules.call("solved"), "undoing the final push restores an unsolved state")
	_move_ok(rules, Vector2i.UP, "repeating the final valid push solves again")
	_check(rules.call("solved"), "solved is derived from current positions, not a sticky reward flag")

func _test_collisions_and_invalid_moves() -> void:
	var rules: RefCounted = _configured(_definition)
	for direction: Vector2i in [Vector2i.ZERO, Vector2i(1, 1), Vector2i(2, 0), Vector2i(0, -2)]:
		_fails_unchanged(rules, direction, "reject non-cardinal unit movement " + str(direction))
	var wall: Dictionary = _definition.duplicate(true)
	wall["player"] = {"x": 5, "y": 5}
	rules = _configured(wall)
	_fails_unchanged(rules, Vector2i.UP, "fixed bakery counter blocks walking")
	var boxes: Dictionary = _definition.duplicate(true)
	boxes["player"] = {"x": 7, "y": 9}
	boxes["boxes"] = [{"x": 7, "y": 8}, {"x": 7, "y": 7}]
	rules = _configured(boxes)
	_fails_unchanged(rules, Vector2i.UP, "one cart cannot push through a second cart")
	var box_wall: Dictionary = _definition.duplicate(true)
	box_wall["player"] = {"x": 7, "y": 2}
	box_wall["boxes"][0] = {"x": 7, "y": 1}
	rules = _configured(box_wall)
	_fails_unchanged(rules, Vector2i.UP, "cart cannot be pushed into an authored wall")
	var edge: Dictionary = {"id": "test.edge", "mapId": "test.room", "width": 3, "height": 3, "blocked": [], "player": {"x": 0, "y": 0}, "boxes": [{"x": 1, "y": 1}, {"x": 2, "y": 1}], "goals": [{"x": 1, "y": 2}, {"x": 2, "y": 2}]}
	rules = _configured(edge)
	_fails_unchanged(rules, Vector2i.UP, "grid edge blocks movement without a painted border cell")
	_fails_unchanged(rules, Vector2i.LEFT, "negative grid column is unreachable")
	var no_pull: Dictionary = _definition.duplicate(true)
	no_pull["player"] = {"x": 8, "y": 8}
	rules = _configured(no_pull)
	_move_ok(rules, Vector2i.RIGHT, "walking away from a cart remains legal")
	_check(rules.call("snapshot")["boxes"] == [{"x": 7, "y": 8}, {"x": 10, "y": 8}], "walking away never pulls the previous cart")

func _test_undo() -> void:
	var rules: RefCounted = _configured(_definition)
	var initial: Dictionary = rules.call("snapshot")
	var empty: Dictionary = rules.call("undo")
	_check(not empty.get("ok", true) and empty.get("state", {}) == initial, "empty undo history keeps the initial layout")
	_move_ok(rules, Vector2i.LEFT, "undo fixture first walk")
	_move_ok(rules, Vector2i.LEFT, "undo fixture second walk")
	var before_push: Dictionary = rules.call("snapshot")
	_move_ok(rules, Vector2i.UP, "undo fixture push")
	_fails_unchanged(rules, Vector2i(1, 1), "failed move must not add undo history")
	var pushed: Dictionary = rules.call("undo")
	_check(pushed.get("ok", false) and pushed.get("state", {}) == before_push, "one undo restores both player and cart from the last push")
	var walked: Dictionary = rules.call("undo")
	_check(walked.get("ok", false) and walked["state"]["player"] == {"x": 8, "y": 9}, "undo also restores ordinary walking")
	var first: Dictionary = rules.call("undo")
	_check(first.get("ok", false) and first["state"] == initial, "undo reaches the exact configured starting layout")
	_check(not rules.call("undo").get("ok", true), "undo cannot go before the configured start")

func _test_corner_reset() -> void:
	var rules: RefCounted = _configured(_definition)
	var initial: Dictionary = rules.call("snapshot")
	# Manually checked route: stand below A, push it up to row 1, walk around
	# to its right, then push it left to the real top-left room corner.
	var corner_route: Array[Vector2i] = [Vector2i.LEFT, Vector2i.LEFT,
		Vector2i.UP, Vector2i.UP, Vector2i.UP, Vector2i.UP, Vector2i.UP, Vector2i.UP, Vector2i.UP,
		Vector2i.RIGHT, Vector2i.UP,
		Vector2i.LEFT, Vector2i.LEFT, Vector2i.LEFT, Vector2i.LEFT, Vector2i.LEFT, Vector2i.LEFT]
	for index: int in range(corner_route.size()):
		_move_ok(rules, corner_route[index], "manual corner route step %d" % (index + 1))
	_check(rules.call("snapshot")["boxes"][0] == {"x": 1, "y": 1}, "cart can reach the actual corner used by the reset test")
	_check(not rules.call("solved"), "cornered cart is not mistaken for a completed puzzle")
	_fails_unchanged(rules, Vector2i.LEFT, "cornered cart cannot pass through the room boundary")
	_check(rules.call("reset") == initial and rules.call("snapshot") == initial, "reset restores the entire initial local layout after a dead corner")
	_check(not rules.call("undo").get("ok", true), "reset clears the previous attempt's undo history")
	_play_solution(rules)
	_check(rules.call("reset") == initial and not rules.call("solved"), "reset after success affects only local puzzle state")

func _test_exit_route() -> void:
	var source_before: Dictionary = _definition.duplicate(true)
	var rules: RefCounted = _configured(_definition)
	for index: int in range(5):
		_move_ok(rules, Vector2i.DOWN, "unlocked exit route step %d" % (index + 1))
	var state: Dictionary = rules.call("snapshot")
	_check(state["player"] == {"x": 9, "y": 14}, "player reaches the original exit without moving either cart")
	# JSON source numbers are floats; configure normalizes runtime coordinates
	# to integers. Assert authored positions directly, not mixed numeric containers.
	_check(state["boxes"] == [{"x": 7, "y": 8}, {"x": 10, "y": 8}], "exit route leaves both carts at their exact authored positions")
	_check(not rules.call("solved"), "leaving is independent of puzzle success")
	_check(_definition == source_before, "exit route does not mutate the shared source definition")
	_fails_unchanged(rules, Vector2i.DOWN, "rules do not invent a destination outside the room")

func _test_snapshot_isolation() -> void:
	var source: Dictionary = _definition.duplicate(true)
	var rules: RefCounted = _configured(source)
	var initial: Dictionary = rules.call("snapshot")
	source["player"]["x"] = 1
	source["boxes"][0]["x"] = 2
	source["blocked"][0]["x"] = 3
	source["display"]["sprites"]["box"] = "changed.source"
	_check(rules.call("snapshot") == initial, "caller cannot mutate the configured initial state")
	var copy: Dictionary = rules.call("snapshot")
	copy["player"]["x"] = 1
	copy["boxes"][0]["y"] = 1
	copy["goals"][0]["x"] = 1
	copy["blocked"][0]["x"] = 1
	copy["display"]["sprites"]["box"] = "changed.snapshot"
	_check(rules.call("snapshot") == initial, "snapshot detaches all nested rule and display data")
	var moved: Dictionary = _move_ok(rules, Vector2i.LEFT, "isolated result fixture moves")
	var expected: Dictionary = rules.call("snapshot")
	moved["state"]["boxes"][0]["x"] = 1
	moved["state"]["display"]["sprites"]["box"] = "changed.result"
	_check(rules.call("snapshot") == expected, "move result cannot mutate stored local state")
	var reset_state: Dictionary = rules.call("reset")
	reset_state["player"]["x"] = 1
	_check(rules.call("snapshot") == initial, "reset result cannot mutate the initial state")

func _test_rejected_definitions() -> void:
	var problems: Array[String] = ["missing_id", "bad_id", "reserved_id", "bad_map", "width_zero", "width_fraction", "height_negative", "height_infinite", "dimension_bool", "blocked_type", "blocked_duplicate", "blocked_outside", "blocked_fraction", "point_array", "point_missing", "point_bool", "player_outside", "player_fraction", "player_blocked", "player_box", "boxes_type", "boxes_one", "boxes_three", "boxes_duplicate", "box_blocked", "box_fraction", "goals_type", "goals_one", "goals_duplicate", "goal_outside", "goal_blocked", "goal_fraction", "display_type", "extra_gameplay_field"]
	for problem: String in problems:
		var bad: Dictionary = _definition.duplicate(true)
		match problem:
			"missing_id": bad.erase("id")
			"bad_id": bad["id"] = ""
			"reserved_id": bad["id"] = "__proto__"
			"bad_map": bad["mapId"] = 7
			"width_zero": bad["width"] = 0
			"width_fraction": bad["width"] = 20.5
			"height_negative": bad["height"] = -1
			"height_infinite": bad["height"] = INF
			"dimension_bool": bad["width"] = true
			"blocked_type": bad["blocked"] = {}
			"blocked_duplicate": bad["blocked"].append({"x": 0, "y": 0})
			"blocked_outside": bad["blocked"][0] = {"x": 20, "y": 0}
			"blocked_fraction": bad["blocked"][0] = {"x": 0.5, "y": 0}
			"point_array": bad["player"] = [9, 9]
			"point_missing": bad["player"] = {"x": 9}
			"point_bool": bad["player"] = {"x": true, "y": 9}
			"player_outside": bad["player"] = {"x": 20, "y": 9}
			"player_fraction": bad["player"] = {"x": 9, "y": 9.5}
			"player_blocked": bad["player"] = {"x": 5, "y": 4}
			"player_box": bad["player"] = {"x": 7, "y": 8}
			"boxes_type": bad["boxes"] = {}
			"boxes_one": bad["boxes"] = [{"x": 7, "y": 8}]
			"boxes_three": bad["boxes"].append({"x": 8, "y": 8})
			"boxes_duplicate": bad["boxes"][1] = {"x": 7, "y": 8}
			"box_blocked": bad["boxes"][0] = {"x": 3, "y": 9}
			"box_fraction": bad["boxes"][0] = {"x": 7.5, "y": 8}
			"goals_type": bad["goals"] = {}
			"goals_one": bad["goals"] = [{"x": 7, "y": 7}]
			"goals_duplicate": bad["goals"][1] = {"x": 7, "y": 7}
			"goal_outside": bad["goals"][0] = {"x": 20, "y": 7}
			"goal_blocked": bad["goals"][0] = {"x": 14, "y": 7}
			"goal_fraction": bad["goals"][0] = {"x": 7, "y": 7.5}
			"display_type": bad["display"] = []
			"extra_gameplay_field": bad["inventory"] = {"bread": 99}
		var rules: RefCounted = _configured(_definition)
		var initial: Dictionary = rules.call("snapshot")
		_move_ok(rules, Vector2i.LEFT, "advance before rejected replacement: " + problem)
		var before: Dictionary = rules.call("snapshot")
		var errors: Variant = rules.call("configure", bad)
		_check(errors is Array and not errors.is_empty(), "reject malformed definition: " + problem)
		_check(rules.call("snapshot") == before, "failed configure retains current puzzle: " + problem)
		var undone: Dictionary = rules.call("undo")
		_check(undone.get("ok", false) and undone.get("state", {}) == initial, "failed configure retains undo history: " + problem)
		_check(rules.call("reset") == initial, "failed configure retains original reset layout: " + problem)
	for bad: Variant in [null, [], "not a definition", 7]:
		var rules: RefCounted = _configured(_definition)
		var before: Dictionary = rules.call("snapshot")
		var errors: Variant = rules.call("configure", bad)
		_check(errors is Array and not errors.is_empty(), "reject non-dictionary definition")
		_check(rules.call("snapshot") == before, "non-dictionary replacement preserves old state")

func _test_goal_order_and_display() -> void:
	var swapped: Dictionary = _definition.duplicate(true)
	swapped["goals"] = [{"x": 10, "y": 7}, {"x": 7, "y": 7}]
	swapped["display"]["sprites"]["box"] = "display.only"
	var rules: RefCounted = _configured(swapped)
	_play_solution(rules)
	_check(rules.call("solved"), "goal occupancy is independent of goal list order or display metadata")
	var already_solved: Dictionary = _definition.duplicate(true)
	already_solved["boxes"] = [{"x": 7, "y": 7}, {"x": 10, "y": 7}]
	rules = _configured(already_solved)
	_check(rules.call("solved"), "a valid box on a goal is allowed by the definition schema")
	var standing_goal: Dictionary = _definition.duplicate(true)
	standing_goal["player"] = {"x": 7, "y": 7}
	rules = _configured(standing_goal)
	_check(not rules.call("solved"), "player standing on an empty goal does not count as a placed cart")
