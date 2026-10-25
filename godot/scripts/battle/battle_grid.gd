extends RefCounted
## Bounded deterministic grid searches. Callers validate the board and actor data.
const DIRECTIONS: Array[Vector2i] = [Vector2i.UP, Vector2i.LEFT, Vector2i.RIGHT, Vector2i.DOWN]

static func distance(a: Dictionary, b: Dictionary) -> int:
	return absi(int(a["x"]) - int(b["x"])) + absi(int(a["y"]) - int(b["y"]))

static func same(a: Dictionary, b: Dictionary) -> bool:
	return a["x"] == b["x"] and a["y"] == b["y"]

static func in_bounds(board: Dictionary, point: Variant) -> bool:
	if not point is Dictionary:
		return false
	for axis: String in ["x", "y"]:
		var value: Variant = point.get(axis)
		if not (value is int or value is float) or not is_finite(float(value)) or float(value) != floorf(float(value)) or value < 0:
			return false
	return point["x"] < board["width"] and point["y"] < board["height"]

static func solid(board: Dictionary, point: Dictionary, ignore_id: String, ignore_unit: String) -> bool:
	if not in_bounds(board, point):
		return true
	for wall: Dictionary in board["blocked"]:
		if same(wall, point):
			return true
	for actor: Dictionary in board["actors"]:
		if actor["hp"] <= 0:
			continue
		if not (actor["id"] == ignore_id and ignore_unit == "body") and same(actor["body"], point):
			return true
		if actor["astral"] != null and not (actor["id"] == ignore_id and ignore_unit == "astral") and same(actor["astral"], point):
			return true
	return false

static func fixed_path(board: Dictionary, actor: Dictionary, unit: String, to: Dictionary, budget: int, path: Variant) -> Array:
	var from: Variant = actor[unit]
	if from == null or not path is Array or path.is_empty() or path.size() > budget + 1:
		return []
	for point: Variant in path:
		if not in_bounds(board, point):
			return []
	if not same(path[0], from) or not same(path.back(), to):
		return []
	for index: int in path.size():
		var point: Dictionary = path[index]
		if solid(board, point, actor["id"], unit) or (index > 0 and distance(path[index - 1], point) != 1) or (unit == "astral" and distance(point, actor["body"]) > actor["reach"]):
			return []
	return path.duplicate(true)

static func path_to(board: Dictionary, actor: Dictionary, unit: String, to: Dictionary, budget: int) -> Array:
	var from: Variant = actor[unit]
	if from == null or solid(board, to, actor["id"], unit):
		return []
	var seen: Dictionary = {_key(from): true}
	var queue: Array = [[from.duplicate(true)]]
	var cursor: int = 0
	while cursor < queue.size():
		var path: Array = queue[cursor]
		cursor += 1
		var at: Dictionary = path.back()
		if same(at, to):
			return path
		if path.size() - 1 >= budget:
			continue
		for direction: Vector2i in DIRECTIONS:
			var next: Dictionary = {"x": int(at["x"]) + direction.x, "y": int(at["y"]) + direction.y}
			if seen.has(_key(next)) or solid(board, next, actor["id"], unit):
				continue
			if unit == "astral" and distance(next, actor["body"]) > actor["reach"]:
				continue
			seen[_key(next)] = true
			var extended: Array = path.duplicate(true)
			extended.append(next)
			queue.append(extended)
	return []

static func reachable(board: Dictionary, actor: Dictionary, unit: String, budget: int) -> Array:
	var from: Variant = actor[unit]
	if from == null:
		return []
	var found: Array = [{"to": from.duplicate(true), "steps": 0}]
	var seen: Dictionary = {_key(from): true}
	var cursor: int = 0
	while cursor < found.size():
		var item: Dictionary = found[cursor]
		cursor += 1
		if item["steps"] >= budget:
			continue
		for direction: Vector2i in DIRECTIONS:
			var next: Dictionary = {"x": int(item["to"]["x"]) + direction.x, "y": int(item["to"]["y"]) + direction.y}
			if seen.has(_key(next)) or solid(board, next, actor["id"], unit):
				continue
			if unit == "astral" and distance(next, actor["body"]) > actor["reach"]:
				continue
			seen[_key(next)] = true
			found.append({"to": next, "steps": item["steps"] + 1})
	return found

static func pull_within_tether(state: Dictionary, actor: Dictionary) -> Dictionary:
	if actor["astral"] == null or distance(actor["body"], actor["astral"]) <= actor["reach"]:
		return {}
	var from: Dictionary = actor["astral"].duplicate(true)
	var best: Variant = null
	var best_distance: int = 9223372036854775807
	# Scan y then x; keep the first cell on ties, matching the reference sort.
	for y: int in int(state["height"]):
		for x: int in int(state["width"]):
			var point: Dictionary = {"x": x, "y": y}
			if distance(point, actor["body"]) <= actor["reach"] and not solid(state, point, actor["id"], "astral"):
				var from_distance: int = distance(point, from)
				if from_distance < best_distance:
					best = point
					best_distance = from_distance
	actor["astral"] = best
	if best == null:
		actor["mode"] = "recalled"
	return {"type": "tether_pull", "actorId": actor["id"], "from": from, "to": best}

static func _key(point: Dictionary) -> Vector2i:
	return Vector2i(int(point["x"]), int(point["y"]))
