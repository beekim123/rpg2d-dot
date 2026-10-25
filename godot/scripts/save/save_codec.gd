class_name SaveCodec
extends RefCounted
## Portable exploration snapshots; no scenes, resource paths, or file operations.

const Worlds = preload("res://scripts/world/world_data.gd")
const VERSION: int = 3
const MAX_BYTES: int = 512000
const MAX_INTEGER: int = 9007199254740991
const GEOMETRY_CACHE_LIMIT: int = 64
const FIELDS: Array[String] = ["version","mapId","player","followers","actors","actorMemory","flags","lamps","steps","inventory"]
const DIRECTIONS: Dictionary = {"up":Vector2i.UP,"down":Vector2i.DOWN,"left":Vector2i.LEFT,"right":Vector2i.RIGHT}
var _world: Worlds
var _maps: Dictionary = {}
var _lamp_ids: Dictionary = {}
var _geometry_cache: Dictionary = {}

## Invalid replacement definitions leave the previous codec usable.
func configure(maps: Dictionary) -> Array[String]:
	var candidate: Worlds = Worlds.new()
	var errors: Array[String] = candidate.configure(maps)
	if not errors.is_empty():
		return errors
	var ids: Dictionary = {}
	for map_id: String in maps:
		for entity: Dictionary in maps[map_id]["entities"]:
			if entity["kind"] == "lamp":
				if ids.has(entity["id"]):
					errors.append("Duplicate global lamp ID: " + entity["id"])
				ids[entity["id"]] = true
	if errors.is_empty():
		_world = candidate
		_maps = maps.duplicate(true)
		_lamp_ids = ids
		_geometry_cache.clear()
	return errors

func fresh(map_id: String) -> Dictionary:
	if not _maps.has(map_id):
		return {}
	var spawn: Dictionary = _maps[map_id]["spawn"]
	return {"version":VERSION,"mapId":map_id,"player":{"x":int(spawn["x"]),"y":int(spawn["y"]),"facing":"down"},
		"followers":[],"actors":{},"actorMemory":{},"flags":{},"lamps":[],"steps":0,"inventory":{"bread":3}}

func decode(text: String) -> Dictionary:
	if text.to_utf8_buffer().size() > MAX_BYTES:
		return _failure("save.too_large")
	var parser: JSON = JSON.new()
	if parser.parse(text) != OK or not parser.data is Dictionary:
		return _failure("save.invalid")
	return validate(parser.data)

func validate(state: Dictionary) -> Dictionary:
	if _world == null:
		return _failure("save.invalid")
	if not _integer(state.get("version")) or not int(state["version"]) in [0,1,2,VERSION]:
		return _failure("save.unsupported_version")
	var source_version: int = int(state["version"])
	var candidate: Dictionary = state.duplicate(true)
	if source_version == 0:
		if not _only_keys(candidate,["version","mapId","x","y","flags"]) or not _required(candidate,["version","mapId","x","y"]):
			return _failure("save.invalid")
		if not candidate["mapId"] is String or not _maps.has(candidate["mapId"]):
			return _failure("save.unsupported_map")
		candidate = fresh(candidate["mapId"])
		candidate["player"] = {"x":state["x"],"y":state["y"],"facing":"down"}
		candidate["flags"] = state.get("flags",{}).duplicate(true) if state.get("flags",{}) is Dictionary else state.get("flags")
	elif source_version == 1:
		var old_fields: Array[String] = FIELDS.duplicate()
		old_fields.erase("actorMemory")
		if not _exact_keys(candidate,old_fields):
			return _failure("save.invalid")
		candidate["actorMemory"] = {}
		candidate["version"] = VERSION
	else:
		if not _exact_keys(candidate,FIELDS):
			return _failure("save.invalid")
		candidate["version"] = VERSION
	if not candidate.get("mapId") is String:
		return _failure("save.invalid")
	var map_id: String = candidate["mapId"]
	if not _maps.has(map_id):
		return _failure("save.unsupported_map")
	if not candidate.get("player") is Dictionary or not _exact_keys(candidate["player"],["x","y","facing"]):
		return _failure("save.invalid")
	var player: Dictionary = candidate["player"]
	if not _integer(player["x"]) or not _integer(player["y"]) or not player["facing"] is String or not DIRECTIONS.has(player["facing"]):
		return _failure("save.bad_position")
	if int(player["x"]) >= int(_maps[map_id]["width"]) or int(player["y"]) >= int(_maps[map_id]["height"]):
		return _failure("save.bad_position")
	if not candidate.get("followers") is Array or not candidate.get("actors") is Dictionary or not candidate.get("actorMemory") is Dictionary:
		return _failure("save.invalid")
	if not candidate["followers"].is_empty() or not candidate["actors"].is_empty():
		return _failure("save.unsupported_layout")
	var memory: Dictionary = candidate["actorMemory"]
	for remembered_map: Variant in memory:
		if not remembered_map is String or not _maps.has(remembered_map):
			return _failure("save.unsupported_map")
		if not memory[remembered_map] is Dictionary:
			return _failure("save.invalid")
		if not memory[remembered_map].is_empty():
			return _failure("save.unsupported_layout")
	if not candidate.get("flags") is Dictionary or not candidate.get("inventory") is Dictionary or not candidate.get("lamps") is Array or not _integer(candidate.get("steps")):
		return _failure("save.invalid")
	var flags: Dictionary = candidate["flags"]
	for flag: Variant in flags:
		if not _stable_id(flag) or not flags[flag] is bool:
			return _failure("save.invalid")
	var inventory: Dictionary = candidate["inventory"]
	for item: Variant in inventory:
		if not _stable_id(item) or not _integer(inventory[item]) or int(inventory[item]) > 999:
			return _failure("save.invalid")
		inventory[item] = int(inventory[item])
	var seen_lamps: Dictionary = {}
	for lamp_id: Variant in candidate["lamps"]:
		if not lamp_id is String or not _lamp_ids.has(lamp_id) or seen_lamps.has(lamp_id):
			return _failure("save.bad_lamp")
		seen_lamps[lamp_id] = true
	player["x"] = int(player["x"])
	player["y"] = int(player["y"])
	candidate["steps"] = int(candidate["steps"])
	if JSON.stringify(candidate).to_utf8_buffer().size() > MAX_BYTES:
		return _failure("save.too_large")
	if not _position_is_safe(map_id,Vector2i(player["x"],player["y"]),flags):
		return _failure("save.bad_position")
	return {"ok":true,"error":"","state":candidate,"migrated":source_version != VERSION}

## Cache only the expensive world traversal; all snapshot checks run before this.
## Immutable keys and boolean values never retain caller-owned dictionaries.
func _position_is_safe(map_id: String, position: Vector2i, flags: Dictionary) -> bool:
	var key: String = JSON.stringify([map_id,position.x,position.y,flags],"",true).sha256_text()
	if _geometry_cache.has(key):
		return bool(_geometry_cache[key])
	var safe: bool = _world.validate_position(map_id,position,flags).is_empty()
	if _geometry_cache.size() >= GEOMETRY_CACHE_LIMIT:
		_geometry_cache.erase(_geometry_cache.keys()[0])
	_geometry_cache[key] = safe
	return safe

func encode(state: Dictionary) -> Dictionary:
	var checked: Dictionary = validate(state)
	if not checked["ok"]:
		return checked
	var text: String = JSON.stringify(checked["state"],"",true)
	if text.to_utf8_buffer().size() > MAX_BYTES:
		return _failure("save.too_large")
	return {"ok":true,"error":"","text":text}

func light_lamp(state: Dictionary, lamp_id: String) -> Dictionary:
	var checked: Dictionary = validate(state)
	if not checked["ok"]:
		return _lamp_failure(state,checked["error"])
	var next: Dictionary = checked["state"]
	var map: Dictionary = _world.get_map(next["mapId"],next["flags"])
	var player: Dictionary = next["player"]
	var front: Vector2i = Vector2i(player["x"],player["y"]) + Vector2i(DIRECTIONS[player["facing"]])
	for entity: Dictionary in map["entities"]:
		if entity["id"] != lamp_id or entity["kind"] != "lamp" or not _rect(entity).has_point(front):
			continue
		var newly_lit: bool = not lamp_id in next["lamps"]
		if newly_lit:
			next["lamps"].append(lamp_id)
		return {"ok":true,"error":"","state":next,"newly_lit":newly_lit}
	return _lamp_failure(state,"save.bad_lamp")

func can_manual_save(state: Dictionary) -> bool:
	var checked: Dictionary = validate(state)
	if not checked["ok"]:
		return false
	var current: Dictionary = checked["state"]
	var player: Vector2i = Vector2i(current["player"]["x"],current["player"]["y"])
	for entity: Dictionary in _world.get_map(current["mapId"],current["flags"])["entities"]:
		if entity["kind"] != "lamp" or not entity["id"] in current["lamps"]:
			continue
		var footprint: Rect2i = _rect(entity)
		for direction: Vector2i in [Vector2i.UP,Vector2i.DOWN,Vector2i.LEFT,Vector2i.RIGHT]:
			if footprint.has_point(player+direction):
				return true
	return false

func _rect(entity: Dictionary) -> Rect2i:
	var size: Array = entity.get("footprint",[1,1])
	return Rect2i(int(entity["x"])-floori(float(size[0])/2.0),int(entity["y"])-int(size[1])+1,int(size[0]),int(size[1]))
func _failure(error: String) -> Dictionary:
	return {"ok":false,"error":error}
func _lamp_failure(state: Dictionary,error: String) -> Dictionary:
	return {"ok":false,"error":error,"state":state.duplicate(true),"newly_lit":false}
func _required(record: Dictionary,fields: Array[String]) -> bool:
	for key: String in fields:
		if not record.has(key):
			return false
	return true
func _only_keys(record: Dictionary,fields: Array[String]) -> bool:
	for key: Variant in record:
		if not key is String or not key in fields:
			return false
	return true
func _exact_keys(record: Dictionary,fields: Array[String]) -> bool:
	return record.size()==fields.size() and _required(record,fields) and _only_keys(record,fields)
func _integer(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value)>=0.0 and float(value)<=float(MAX_INTEGER) and floor(float(value))==float(value)
func _stable_id(value: Variant) -> bool:
	if not value is String or String(value).is_empty() or value in ["__proto__","constructor","prototype"]:
		return false
	var id: String = value
	for index: int in range(id.length()):
		var code: int = id.unicode_at(index)
		var word: bool = (code>=48 and code<=57) or (code>=65 and code<=90) or (code>=97 and code<=122) or code==95
		if not word and not (index>0 and code==46):
			return false
	return true
