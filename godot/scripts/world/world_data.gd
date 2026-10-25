class_name WorldData
extends RefCounted
## Pure world rules over already loaded map dictionaries.

const DIRECTIONS: Array[Vector2i] = [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]
const TERRAIN_KEYS: Array[String] = ["grass", "path", "water", "bridge", "border"]
var _maps: Dictionary = {}

## Invalid replacement data leaves the last valid world configured.
func configure(maps: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if maps.is_empty():
		errors.append("World has no maps")
	for key: Variant in maps:
		if not key is String or String(key).is_empty():
			errors.append("Invalid map dictionary key")
			continue
		var error: String = _structure_error(key, maps[key])
		if not error.is_empty():
			errors.append(error)
	if not errors.is_empty():
		return errors
	errors.append_array(_connection_errors(maps))
	if errors.is_empty():
		errors.append_array(_state_errors(maps, {}))
	if errors.is_empty():
		_maps = maps.duplicate(true)
	return errors

## Every consumer receives a detached view; the authored source stays intact.
func get_map(map_id: String, flags: Dictionary = {}) -> Dictionary:
	if not _maps.has(map_id) or not _flags_valid(flags):
		return {}
	return _visible_copy(_maps[map_id], flags)

func is_walkable(map: Dictionary, cell: Vector2i) -> bool:
	if not _terrain_walkable(map, cell) or not map.get("entities") is Array:
		return false
	for value: Variant in map["entities"]:
		if not value is Dictionary:
			return false
		var entity: Dictionary = value
		if not _entity_geometry_valid(entity, map) or not entity.get("solid") is bool:
			return false
		if entity["solid"] and _entity_rect(entity).has_point(cell):
			return false
	return true

## Even a non-solid NPC must not share a player's arrival cell.
func is_safe_entry(map: Dictionary, cell: Vector2i) -> bool:
	if not is_walkable(map, cell):
		return false
	for entity: Dictionary in map["entities"]:
		if entity.get("kind") == "npc" and _entity_rect(entity).has_point(cell):
			return false
	return true

## Door cells can be reached but end the route because stepping on them changes maps.
func reachable(map: Dictionary, origin: Vector2i) -> Dictionary:
	var cells: Dictionary = {}
	if not is_walkable(map, origin) or not map.get("exits") is Array:
		return cells
	var exits: Dictionary = {}
	for value: Variant in map["exits"]:
		if not value is Dictionary or not _point_in_bounds(value, map):
			return cells
		exits[_point(value)] = true
	var queue: Array[Vector2i] = [origin]
	cells[origin] = true
	var index: int = 0
	while index < queue.size():
		var current: Vector2i = queue[index]
		index += 1
		# An explicit same-cell landing does not trigger another transition until moving.
		if current != origin and exits.has(current):
			continue
		for direction: Vector2i in DIRECTIONS:
			var neighbor: Vector2i = current + direction
			if not cells.has(neighbor) and is_walkable(map, neighbor):
				cells[neighbor] = true
				queue.append(neighbor)
	return cells

func transition(map_id: String, cell: Vector2i, flags: Dictionary = {}) -> Dictionary:
	var failure: Dictionary = {"ok": false, "map_id": map_id, "position": cell, "reason": "no_exit"}
	if not _maps.has(map_id) or not _flags_valid(flags):
		failure["reason"] = "invalid_map_or_flags"
		return failure
	var source: Dictionary = _maps[map_id]
	for exit: Dictionary in source["exits"]:
		if _point(exit) != cell:
			continue
		var errors: Array[String] = validate_state(flags)
		if not errors.is_empty():
			failure["reason"] = errors[0]
			return failure
		return {"ok": true, "map_id": exit["to"], "position": _point(exit["at"])}
	return failure

## Recheck all current NPC layouts, required interactions, and door arrivals.
func validate_state(flags: Dictionary = {}) -> Array[String]:
	if not _flags_valid(flags):
		return ["Invalid story flags"]
	if _maps.is_empty():
		return ["World is not configured"]
	return _state_errors(_maps, flags)

func _structure_error(map_id: String, raw: Variant) -> String:
	var prefix: String = "Invalid map " + map_id + ": "
	if not raw is Dictionary:
		return prefix + "expected dictionary"
	var map: Dictionary = raw
	if map.get("id") != map_id or not _text(map.get("name")):
		return prefix + "id or name"
	if not _whole(map.get("width")) or not _whole(map.get("height")) or int(map["width"]) < 1 or int(map["height"]) < 1:
		return prefix + "dimensions"
	if not map.get("rows") is Array or map["rows"].size() != int(map["height"]):
		return prefix + "rows"
	for row: Variant in map["rows"]:
		if not row is String or String(row).length() != int(map["width"]):
			return prefix + "row width"
		for tile: String in String(row):
			if not tile in ["g", "s", "t", "w", "b"]:
				return prefix + "tile"
	if not _point_in_bounds(map.get("spawn"), map):
		return prefix + "spawn"
	if not map.get("entities") is Array or not map.get("required") is Array or not map.get("exits") is Array:
		return prefix + "entity, objective or exit lists"
	var terrain: Variant = map.get("terrain", {})
	if not terrain is Dictionary:
		return prefix + "terrain"
	for key: Variant in terrain:
		if not key is String or not key in TERRAIN_KEYS or not _text(terrain[key]):
			return prefix + "terrain binding"
	var ids: Dictionary = {}
	for value: Variant in map["entities"]:
		if not value is Dictionary:
			return prefix + "entity"
		var entity: Dictionary = value
		if not _text(entity.get("id")) or ids.has(entity["id"]) or not entity.get("kind") in ["npc", "lamp", "decoration"] or not _text(entity.get("sprite")) or not entity.get("solid") is bool:
			return prefix + "entity identity"
		if not _entity_geometry_valid(entity, map):
			return prefix + "entity bounds or footprint"
		if not _visibility_valid(entity.get("visibleWhen", {})):
			return prefix + "entity visibility"
		ids[entity["id"]] = true
	for required: Variant in map["required"]:
		if not required is String or not ids.has(required):
			return prefix + "unknown required entity"
	var exit_cells: Dictionary = {}
	for value: Variant in map["exits"]:
		if not value is Dictionary:
			return prefix + "exit"
		var exit: Dictionary = value
		if not _text(exit.get("pair")) or not _text(exit.get("to")) or not _point_in_bounds(exit, map) or not _point_valid(exit.get("at")):
			return prefix + "exit identity or coordinates"
		var cell: Vector2i = _point(exit)
		if exit_cells.has(cell):
			return prefix + "duplicate exit cell"
		exit_cells[cell] = true
	return ""

func _connection_errors(maps: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var pairs: Dictionary = {}
	for map_id: String in maps:
		for exit: Dictionary in maps[map_id]["exits"]:
			var pair_id: String = exit["pair"]
			if not pairs.has(pair_id):
				pairs[pair_id] = []
			pairs[pair_id].append({"map_id": map_id, "exit": exit})
	for pair_id: String in pairs:
		var ends: Array = pairs[pair_id]
		if ends.size() != 2:
			errors.append("Exit pair %s needs exactly two endpoints" % pair_id)
			continue
		for index: int in range(2):
			var endpoint: Dictionary = ends[index]
			var other: Dictionary = ends[1 - index]
			var exit: Dictionary = endpoint["exit"]
			if exit["to"] != other["map_id"] or not maps.has(exit["to"]):
				errors.append("Exit pair %s does not point to its counterpart" % pair_id)
				continue
			var landing: Vector2i = _point(exit["at"])
			var door: Vector2i = _point(other["exit"])
			if not _point_in_bounds(exit["at"], maps[exit["to"]]) or absi(landing.x - door.x) + absi(landing.y - door.y) > 1:
				errors.append("Exit pair %s has an invalid landing" % pair_id)
	return errors

func _state_errors(maps: Dictionary, flags: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var views: Dictionary = {}
	var regions: Dictionary = {}
	for map_id: String in maps:
		var view: Dictionary = _visible_copy(maps[map_id], flags)
		views[map_id] = view
		var spawn: Vector2i = _point(view["spawn"])
		var cells: Dictionary = reachable(view, spawn)
		regions[map_id] = cells
		if not is_safe_entry(view, spawn):
			errors.append("Blocked spawn in " + map_id)
		for entity: Dictionary in view["entities"]:
			if entity["kind"] == "npc" and not _npc_layout_valid(view, entity):
				errors.append("Blocked NPC %s in %s" % [entity["id"], map_id])
		errors.append_array(_access_errors(view, spawn, cells))
	for map_id: String in views:
		for exit: Dictionary in views[map_id]["exits"]:
			var target: String = exit["to"]
			var landing: Vector2i = _point(exit["at"])
			if not is_safe_entry(views[target], landing) or not regions[target].has(landing):
				errors.append("Blocked landing %s -> %s" % [map_id, target])
				continue
			# An origin on a door can reach both sides; a later return to one side may not.
			var destination: Dictionary = views[target]
			if _exit_cells(destination).has(_point(destination["spawn"])):
				errors.append_array(_access_errors(destination, landing, reachable(destination, landing)))
	return errors

func _access_errors(map: Dictionary, origin: Vector2i, cells: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var exits: Dictionary = _exit_cells(map)
	for entity: Dictionary in map["entities"]:
		if entity["id"] in map["required"] and not _interaction_reached(entity, cells, exits, origin):
			errors.append("Unreachable objective %s in %s" % [entity["id"], map["id"]])
	for exit: Dictionary in map["exits"]:
		if not cells.has(_point(exit)) or not is_safe_entry(map, _point(exit)):
			errors.append("Unreachable exit %s in %s" % [exit["pair"], map["id"]])
	return errors

func _exit_cells(map: Dictionary) -> Dictionary:
	var cells: Dictionary = {}
	for exit: Dictionary in map["exits"]:
		cells[_point(exit)] = true
	return cells

func _visible_copy(map: Dictionary, flags: Dictionary) -> Dictionary:
	var view: Dictionary = map.duplicate(true)
	var visible: Array[Dictionary] = []
	var hidden_ids: Dictionary = {}
	for entity: Dictionary in view["entities"]:
		if _entity_visible(entity, flags):
			visible.append(entity)
		else:
			hidden_ids[entity["id"]] = true
	var required: Array[String] = []
	for entity_id: String in view["required"]:
		if not hidden_ids.has(entity_id):
			required.append(entity_id)
	view["entities"] = visible
	view["required"] = required
	return view

func _entity_visible(entity: Dictionary, flags: Dictionary) -> bool:
	var condition: Dictionary = entity.get("visibleWhen", {})
	for flag: String in condition.get("all", []):
		if flags.get(flag, false) != true:
			return false
	for flag: String in condition.get("none", []):
		if flags.get(flag, false) == true:
			return false
	return true

func _npc_layout_valid(map: Dictionary, entity: Dictionary) -> bool:
	var rect: Rect2i = _entity_rect(entity)
	for y: int in range(rect.position.y, rect.end.y):
		for x: int in range(rect.position.x, rect.end.x):
			if not _terrain_walkable(map, Vector2i(x, y)):
				return false
	for other: Dictionary in map["entities"]:
		if other["id"] != entity["id"] and (other["solid"] or other["kind"] == "npc") and rect.intersects(_entity_rect(other)):
			return false
	return true

func _interaction_reached(entity: Dictionary, cells: Dictionary, exits: Dictionary, origin: Vector2i) -> bool:
	var rect: Rect2i = _entity_rect(entity)
	for y: int in range(rect.position.y, rect.end.y):
		for x: int in range(rect.position.x, rect.end.x):
			for direction: Vector2i in DIRECTIONS:
				var standing: Vector2i = Vector2i(x, y) + direction
				if cells.has(standing) and (standing == origin or not exits.has(standing)):
					return true
	return false

func _terrain_walkable(map: Dictionary, cell: Vector2i) -> bool:
	if not _whole(map.get("width")) or not _whole(map.get("height")) or not map.get("rows") is Array:
		return false
	if cell.x < 0 or cell.y < 0 or cell.x >= int(map["width"]) or cell.y >= int(map["height"]) or cell.y >= map["rows"].size():
		return false
	var row: Variant = map["rows"][cell.y]
	if not row is String or cell.x >= String(row).length():
		return false
	return String(row)[cell.x] in ["g", "s", "b"]

func _entity_geometry_valid(entity: Dictionary, map: Dictionary) -> bool:
	if not _point_in_bounds(entity, map):
		return false
	var footprint: Variant = entity.get("footprint", [1, 1])
	if not footprint is Array or footprint.size() != 2 or not _whole(footprint[0]) or not _whole(footprint[1]) or int(footprint[0]) < 1 or int(footprint[1]) < 1:
		return false
	var rect: Rect2i = _entity_rect(entity)
	return rect.position.x >= 0 and rect.position.y >= 0 and rect.end.x <= int(map["width"]) and rect.end.y <= int(map["height"])

func _entity_rect(entity: Dictionary) -> Rect2i:
	var footprint: Array = entity.get("footprint", [1, 1])
	var width: int = int(footprint[0])
	var height: int = int(footprint[1])
	return Rect2i(int(entity["x"]) - floori(float(width) / 2.0), int(entity["y"]) - height + 1, width, height)

func _visibility_valid(value: Variant) -> bool:
	if not value is Dictionary:
		return false
	for key: Variant in value:
		if not key in ["all", "none"] or not value[key] is Array:
			return false
		for flag: Variant in value[key]:
			if not _flag_id_valid(flag):
				return false
	return true

func _flags_valid(flags: Dictionary) -> bool:
	for key: Variant in flags:
		if not _flag_id_valid(key) or not flags[key] is bool:
			return false
	return true

func _flag_id_valid(value: Variant) -> bool:
	if not _text(value) or value in ["__proto__", "constructor", "prototype"]:
		return false
	var flag: String = value
	for index: int in range(flag.length()):
		var code: int = flag.unicode_at(index)
		var word: bool = (code >= 48 and code <= 57) or (code >= 65 and code <= 90) or (code >= 97 and code <= 122) or code == 95
		if not word and not (index > 0 and code == 46):
			return false
	return true

func _point_in_bounds(value: Variant, map: Dictionary) -> bool:
	return _point_valid(value) and int(value["x"]) < int(map["width"]) and int(value["y"]) < int(map["height"])

func _point_valid(value: Variant) -> bool:
	return value is Dictionary and _whole(value.get("x")) and _whole(value.get("y"))

func _point(value: Dictionary) -> Vector2i:
	return Vector2i(int(value["x"]), int(value["y"]))

func _whole(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) >= 0.0 and float(value) <= 2147483647.0 and floor(float(value)) == float(value)

func _text(value: Variant) -> bool:
	return value is String and not String(value).is_empty()
