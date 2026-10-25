extends RefCounted
## Resource-facing battle preparation. Core battle rules never know pack paths or art IDs.
const Content = preload("res://scripts/battle/battle_content.gd")
const Rules = preload("res://scripts/battle/battle_engine.gd")
const MathRules = preload("res://scripts/battle/battle_math.gd")
var _catalog: AssetCatalog
var _worlds: WorldData
var _strings: Dictionary = {}
func configure(catalog: AssetCatalog, worlds: WorldData, strings: Dictionary) -> void:
	_catalog = catalog
	_worlds = worlds
	_strings = strings.duplicate(true)
func prepare(id: String, flags: Dictionary = {}) -> Dictionary:
	if _catalog == null or _worlds == null:
		return _error("unconfigured_battle_catalog")
	for table: String in ["battle.balance", "battle.skills", "battle.support", "battle.extensions", "battle.presentation", "battle." + id]:
		if not _catalog.has_table(table):
			return _error("missing_battle_table")
	var display: Dictionary = _catalog.table_data("battle.presentation")
	if not display.get("battles") is Dictionary or not display.get("actors") is Dictionary or not display.get("effects") is Dictionary:
		return _error("invalid_battle_presentation")
	var presentation: Variant = display["battles"].get(id)
	if not presentation is Dictionary or not presentation.get("map") is String or not presentation.get("arena") is String or not _strings.has(presentation.get("title")):
		return _error("invalid_battle_binding")
	if not _worlds.validate_state(flags).is_empty():
		return _error("invalid_world_flags")
	var map: Dictionary = _worlds.get_map(presentation["map"], flags)
	if map.is_empty():
		return _error("missing_battle_map")
	if not map.get("arenas") is Dictionary:
		return _error("invalid_battle_arena")
	var arena: Variant = map["arenas"].get(presentation["arena"])
	if not arena is Dictionary:
		return _error("missing_battle_arena")
	for key: String in ["x", "y", "width", "height"]:
		if not MathRules._integer(arena.get(key), 1 if key in ["width", "height"] else 0, 64):
			return _error("invalid_arena_bounds")
	if arena["x"] + arena["width"] > map["width"] or arena["y"] + arena["height"] > map["height"]:
		return _error("invalid_arena_bounds")
	var base: Dictionary = _catalog.table_data("battle." + id)
	var extensions: Dictionary = _catalog.table_data("battle.extensions")
	var composed: Dictionary = Content.compose(base, extensions.get(id, {}))
	if not composed["ok"]:
		return composed
	var definition: Dictionary = composed["value"]
	var balance: Dictionary = _catalog.table_data("battle.balance")
	var skills: Dictionary = _catalog.table_data("battle.skills")
	skills["support"] = _catalog.table_data("battle.support")
	var rules: Rules = Rules.new()
	var error: String = rules.configure(balance, skills)
	if not error.is_empty():
		return _error(error)
	var checked: Dictionary = rules.create_battle(definition)
	if not checked["ok"]:
		return checked
	if definition["id"] != id or definition["width"] != arena["width"] or definition["height"] != arena["height"]:
		return _error("arena_size_mismatch")
	for y: int in int(definition["height"]):
		for x: int in int(definition["width"]):
			var blocked: bool = definition["blocked"].any(func(p: Dictionary) -> bool: return p["x"] == x and p["y"] == y)
			if blocked == _worlds.is_walkable(map, Vector2i(int(arena["x"]) + x, int(arena["y"]) + y)):
				return _error("arena_collision_mismatch")
	for actor: Dictionary in definition["actors"]:
		var art: Variant = display["actors"].get(actor["id"])
		if not art is Dictionary or not _strings.has(art.get("name")):
			return _error("missing_actor_binding")
		for key: String in ["body", "astral", "portrait"]:
			if key == "astral" and actor["kind"] == "starless":
				continue
			if key == "portrait" and not art.has(key):
				continue
			if not art.get(key) is String or not _catalog.definitions.has(art[key]):
				return _error("missing_actor_art")
		for skill_id: String in actor.get("skillIds", ["basic_strike"]):
			if not _strings.has("battle.skill." + skill_id):
				return _error("missing_skill_name")
	for effect: Variant in display["effects"].values():
		if not effect is String or not _catalog.definitions.has(effect):
			return _error("missing_effect_art")
	return {"ok": true, "definition": definition, "balance": balance, "skills": skills, "presentation": presentation, "art": display["actors"], "effects": display["effects"], "arena": arena, "map": map}
static func _error(reason: String) -> Dictionary:
	return {"ok": false, "error": reason}
