class_name DoughRules
extends RefCounted
## Deterministic local two-cart puzzle. No scene, save, inventory or story access.
## The optional display dictionary is copied but never interpreted by the rules.

const REQUIRED_FIELDS: Array[String] = ["id", "mapId", "width", "height", "blocked", "player", "boxes", "goals"]
const DIRECTIONS: Array[Vector2i] = [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]
const MAX_COORDINATE: int = 2147483647

var _initial: Dictionary = {}
var _state: Dictionary = {}
var _blocked: Dictionary = {}
var _goals: Dictionary = {}
var _history: Array[Dictionary] = []

## Failed replacement leaves the current attempt, reset point and undo intact.
func configure(definition: Variant) -> Array[String]:
	var error: String = _definition_error(definition)
	if not error.is_empty():
		return [error]
	var candidate: Dictionary = definition.duplicate(true)
	candidate["width"] = int(candidate["width"])
	candidate["height"] = int(candidate["height"])
	candidate["player"] = _point_dictionary(_point(candidate["player"]))
	for field: String in ["blocked", "boxes", "goals"]:
		var points: Array[Dictionary] = []
		for point: Dictionary in candidate[field]:
			points.append(_point_dictionary(_point(point)))
		candidate[field] = points
	var blocked: Dictionary = _point_set(candidate["blocked"])
	var goals: Dictionary = _point_set(candidate["goals"])
	_initial = candidate.duplicate(true)
	_state = candidate
	_blocked = blocked
	_goals = goals
	_history.clear()
	return []

func snapshot() -> Dictionary:
	return _state.duplicate(true)

## A legal move walks one cell, or walks into a cart's previous cell while
## pushing that one cart one cell farther. No pulling or chain pushing.
func move(direction: Vector2i) -> Dictionary:
	if _state.is_empty():
		return _failure("not_configured")
	if not direction in DIRECTIONS:
		return _failure("invalid_direction")
	var destination: Vector2i = _point(_state["player"]) + direction
	if not _inside(destination):
		return _failure("outside_grid")
	if _blocked.has(destination):
		return _failure("blocked")
	var box_index: int = _box_at(destination)
	var box_destination: Vector2i = destination + direction
	if box_index >= 0:
		if not _inside(box_destination):
			return _failure("box_outside_grid")
		if _blocked.has(box_destination):
			return _failure("box_blocked")
		if _box_at(box_destination) >= 0:
			return _failure("box_occupied")
	var candidate: Dictionary = _state.duplicate(true)
	candidate["player"] = _point_dictionary(destination)
	if box_index >= 0:
		candidate["boxes"][box_index] = _point_dictionary(box_destination)
	# Immutable room geometry and display metadata need not be copied per undo.
	_history.append({"player": _state["player"].duplicate(true), "boxes": _state["boxes"].duplicate(true)})
	_state = candidate
	return _success()

## Leaving or retrying the room may call this without touching permanent flags.
func reset() -> Dictionary:
	if _initial.is_empty():
		return {}
	_state = _initial.duplicate(true)
	_history.clear()
	return snapshot()

func undo() -> Dictionary:
	if _state.is_empty():
		return _failure("not_configured")
	if _history.is_empty():
		return _failure("no_history")
	var previous: Dictionary = _history.pop_back()
	_state["player"] = previous["player"].duplicate(true)
	_state["boxes"] = previous["boxes"].duplicate(true)
	return _success()

## Completion follows current cart occupancy, never a persistent reward marker.
func solved() -> bool:
	if _state.is_empty():
		return false
	for point: Dictionary in _state["boxes"]:
		if not _goals.has(_point(point)):
			return false
	return true

func _definition_error(value: Variant) -> String:
	if not value is Dictionary:
		return "Definition must be a dictionary"
	var definition: Dictionary = value
	for field: String in REQUIRED_FIELDS:
		if not definition.has(field):
			return "Missing definition field: " + field
	for field: Variant in definition:
		if not field is String or (not field in REQUIRED_FIELDS and field != "display"):
			return "Unknown definition field"
	if not _stable_id(definition["id"]) or not _stable_id(definition["mapId"]):
		return "Invalid puzzle or map ID"
	if not _whole(definition["width"]) or not _whole(definition["height"]) or int(definition["width"]) < 1 or int(definition["height"]) < 1:
		return "Invalid puzzle dimensions"
	if definition.has("display") and not definition["display"] is Dictionary:
		return "Display metadata must be a dictionary"
	if not _point_valid(definition["player"], definition):
		return "Invalid player point"
	var sets: Dictionary = {}
	for field: String in ["blocked", "boxes", "goals"]:
		if not definition[field] is Array:
			return "Point list must be an array: " + field
		if field != "blocked" and definition[field].size() != 2:
			return "Puzzle needs exactly two " + field
		var seen: Dictionary = {}
		for point: Variant in definition[field]:
			if not _point_valid(point, definition):
				return "Invalid point in " + field
			var key: Vector2i = _point(point)
			if seen.has(key):
				return "Duplicate point in " + field
			seen[key] = true
		sets[field] = seen
	var player: Vector2i = _point(definition["player"])
	if sets["blocked"].has(player) or sets["boxes"].has(player):
		return "Player starts on an occupied cell"
	for field: String in ["boxes", "goals"]:
		for point: Vector2i in sets[field]:
			if sets["blocked"].has(point):
				return "Blocked point in " + field
	return ""

func _point_valid(value: Variant, definition: Dictionary) -> bool:
	if not value is Dictionary or value.size() != 2 or not value.has("x") or not value.has("y"):
		return false
	return _whole(value["x"]) and _whole(value["y"]) and int(value["x"]) < int(definition["width"]) and int(value["y"]) < int(definition["height"])

func _point_set(points: Array) -> Dictionary:
	var result: Dictionary = {}
	for point: Dictionary in points:
		result[_point(point)] = true
	return result

func _inside(point: Vector2i) -> bool:
	return point.x >= 0 and point.y >= 0 and point.x < int(_state["width"]) and point.y < int(_state["height"])

func _box_at(point: Vector2i) -> int:
	for index: int in range(_state["boxes"].size()):
		if _point(_state["boxes"][index]) == point:
			return index
	return -1

func _point(value: Dictionary) -> Vector2i:
	return Vector2i(int(value["x"]), int(value["y"]))

func _point_dictionary(value: Vector2i) -> Dictionary:
	return {"x": value.x, "y": value.y}

func _whole(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) >= 0.0 and float(value) <= MAX_COORDINATE and floor(float(value)) == float(value)

func _stable_id(value: Variant) -> bool:
	if not value is String or String(value).is_empty() or value in ["__proto__", "constructor", "prototype"]:
		return false
	var id: String = value
	for index: int in range(id.length()):
		var code: int = id.unicode_at(index)
		var word: bool = (code >= 48 and code <= 57) or (code >= 65 and code <= 90) or (code >= 97 and code <= 122) or code == 95
		if not word and not (index > 0 and code == 46):
			return false
	return true

func _success() -> Dictionary:
	return {"ok": true, "state": snapshot(), "error": ""}

func _failure(error: String) -> Dictionary:
	return {"ok": false, "state": snapshot(), "error": error}
