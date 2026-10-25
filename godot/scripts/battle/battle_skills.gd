extends RefCounted
## Injected immutable skill catalog and bounded supercover rays, independent of scenes.
const MathRules = preload("res://scripts/battle/battle_math.gd")
const Support = preload("res://scripts/battle/battle_support.gd")
const MAX_CELL: int = 63
var _definitions: Dictionary = {}
var _rules: Dictionary = {}
var _support: Support

func configure(data: Variant) -> String:
	if not data is Dictionary or not data.get("rules") is Dictionary or not data.get("skills") is Array or data["skills"].is_empty():
		return "invalid_skill_data"
	var rules: Dictionary = data["rules"]
	for key: String in ["guardShield", "collisionDamagePerCell", "precisionDivisor"]:
		if not _integer(rules.get(key), 1 if key == "precisionDivisor" else 0):
			return "invalid_skill_rule"
	var definitions: Dictionary = {}
	for entry: Variant in data["skills"]:
		if not entry is Dictionary or not MathRules._skill_id(entry.get("id")) or definitions.has(entry["id"]):
			return "invalid_skill_id"
		for key: String in ["cost", "power", "range"]:
			if not _integer(entry.get(key)):
				return "invalid_skill_" + key
		if entry.get("weight") not in ["light", "normal", "heavy"] or entry.get("effect") not in ["damage", "heal", "shield"]:
			return "invalid_skill_behavior"
		if entry.has("lampMarks") and not _integer(entry["lampMarks"], 0, 3):
			return "invalid_marks"
		if entry.has("consumeMarks") and not entry["consumeMarks"] is bool:
			return "invalid_detonation"
		if entry.has("knockback"):
			if not _integer(entry["knockback"]):
				return "invalid_knockback"
			# Compare before multiplying: valid safe integers can overflow int64 in a product.
			if rules["collisionDamagePerCell"] > 0 and float(entry["knockback"]) > floorf(float(MathRules.MAX_SAFE_INTEGER) / float(rules["collisionDamagePerCell"])):
				return "collision_overflow"
		definitions[entry["id"]] = entry.duplicate(true)
	var support: Support
	if data.has("support"):
		support = Support.new()
		var error: String = support.configure(data["support"])
		if not error.is_empty():
			return error
	_support = support
	_definitions = definitions
	_rules = rules.duplicate(true)
	return ""

func get_skill(id: Variant) -> Dictionary:
	return _definitions.get(id, {}).duplicate(true) if id is String else {}

func ids() -> Array:
	return _definitions.keys()

func rule(id: String) -> int:
	return int(_rules.get(id, 0))

func line_of_sight(from: Variant, to: Variant, blocked: Variant) -> Dictionary:
	if not _point(from) or not _point(to) or not blocked is Array:
		return {"ok": false, "error": "invalid_ray"}
	var walls: Dictionary = {}
	for point: Variant in blocked:
		if not _point(point):
			return {"ok": false, "error": "invalid_wall"}
		walls[Vector2i(int(point["x"]), int(point["y"]))] = true
	var x: int = int(from["x"])
	var y: int = int(from["y"])
	var nx: int = absi(int(to["x"]) - x)
	var ny: int = absi(int(to["y"]) - y)
	var sx: int = signi(int(to["x"]) - x)
	var sy: int = signi(int(to["y"]) - y)
	var ix: int = 0
	var iy: int = 0
	if walls.has(Vector2i(x, y)):
		return {"ok": true, "value": false}
	while ix < nx or iy < ny:
		var decision: int = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx
		if decision == 0:
			if walls.has(Vector2i(x + sx, y)) or walls.has(Vector2i(x, y + sy)):
				return {"ok": true, "value": false}
			x += sx
			y += sy
			ix += 1
			iy += 1
		elif decision < 0:
			x += sx
			ix += 1
		else:
			y += sy
			iy += 1
		if walls.has(Vector2i(x, y)):
			return {"ok": true, "value": false}
	return {"ok": true, "value": true}

static func _integer(value: Variant, minimum: int = 0, maximum: int = MathRules.MAX_SAFE_INTEGER) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) == floorf(float(value)) and value >= minimum and value <= maximum

static func _point(value: Variant) -> bool:
	return value is Dictionary and _integer(value.get("x"), 0, MAX_CELL) and _integer(value.get("y"), 0, MAX_CELL)

func support_action(state: Dictionary, actor: Dictionary, command: Dictionary) -> Dictionary:
	if _support == null:
		return {"ok": false, "error": "support_unavailable"}
	return _support.resolve(state, actor, command, line_of_sight)

func valid_inventory(inventory: Variant) -> bool:
	return _support.valid_inventory(inventory) if _support != null else inventory is Dictionary and inventory.is_empty()

func item_ids() -> Array:
	return _support.item_ids() if _support != null else []

func damage_multiplier(actor: Dictionary) -> float:
	return _support.multiplier() if _support != null and actor.get("cheered", false) else 1.0

func has_support() -> bool:
	return _support != null
