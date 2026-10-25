extends RefCounted
## Pure deterministic battle rules; content data is injected, never loaded here.
## JSON keys match the reference. Invalid input returns an error without mutation.

const MAX_SAFE_INTEGER: int = 9007199254740991
const GRADES: Array[String] = ["E", "D", "C", "B", "A", "S"]
var _balance: Dictionary = {}

func configure(data: Variant) -> String:
	if not data is Dictionary or not data.get("chart") is Dictionary or not data.get("damage") is Dictionary or not data.get("timeline") is Dictionary:
		return "invalid_balance"
	var chart: Dictionary = data["chart"]
	if not _integer(chart.get("minimum")) or not _integer(chart.get("maximum"), 1) or chart["minimum"] >= chart["maximum"] or not chart.get("ratingMinimums") is Dictionary:
		return "invalid_chart_balance"
	var previous: float = float(chart["minimum"]) - 1.0
	for grade: String in GRADES:
		var value: Variant = chart["ratingMinimums"].get(grade)
		if not _integer(value, chart["minimum"], chart["maximum"]) or value <= previous:
			return "invalid_rating_threshold"
		previous = float(value)
	if chart["ratingMinimums"]["E"] != chart["minimum"]:
		return "invalid_rating_floor"
	var damage: Dictionary = data["damage"]
	for key: String in ["basePowerFactor", "powerDivisor", "tetherLoss", "enduranceDivisor", "bodyMultiplier", "recalledBodyMultiplier", "astralMultiplier", "defaultOpeningMultiplier"]:
		if not _number(damage.get(key)):
			return "invalid_damage_balance"
	if damage["powerDivisor"] <= 0 or damage["enduranceDivisor"] <= 0 or damage["enduranceDivisor"] < chart["maximum"] or damage["tetherLoss"] > 1:
		return "invalid_damage_divisor"
	var timeline: Dictionary = data["timeline"]
	if not _integer(timeline.get("baseInterval"), 1) or not timeline.get("speedFactors") is Dictionary or not timeline.get("actionWeights") is Dictionary:
		return "invalid_timeline_balance"
	for grade: String in GRADES:
		if not _number(timeline["speedFactors"].get(grade)) or timeline["speedFactors"][grade] <= 0:
			return "invalid_speed_factor"
	for weight: String in ["light", "normal", "heavy"]:
		if not _number(timeline["actionWeights"].get(weight)) or timeline["actionWeights"][weight] <= 0:
			return "invalid_action_weight"
	_balance = data.duplicate(true)
	return ""

func rating(value: Variant) -> Dictionary:
	if not _chart_value(value):
		return _error("invalid_chart_value")
	for index: int in range(GRADES.size() - 1, -1, -1):
		if value >= _balance["chart"]["ratingMinimums"][GRADES[index]]:
			return _ok(GRADES[index])
	return _error("unrated_chart_value")

func manhattan(a: Variant, b: Variant) -> Dictionary:
	if not _point(a) or not _point(b):
		return _error("invalid_position")
	var distance: int = absi(int(a["x"]) - int(b["x"])) + absi(int(a["y"]) - int(b["y"]))
	return _ok(distance) if _integer(distance) else _error("distance_overflow")

func tether_factor(distance: Variant, reach: Variant) -> Dictionary:
	if _balance.is_empty() or not _integer(distance) or not _integer(reach, 1) or distance > reach:
		return _error("invalid_tether")
	var half: float = ceilf(float(reach) / 2.0)
	if distance <= half:
		return _ok(1.0)
	return _ok(1.0 - float(_balance["damage"]["tetherLoss"]) * (float(distance) - half) / (float(reach) - half))

func calculate_damage(input: Variant) -> Dictionary:
	if not input is Dictionary or not _integer(input.get("power")) or not _chart_value(input.get("attackerPower")) or not _chart_value(input.get("defenderEndurance")):
		return _error("invalid_damage_input")
	if not _target(input.get("target")) or (input.has("recalled") and not input["recalled"] is bool):
		return _error("invalid_damage_target")
	if input["target"] == "astral" and input.get("recalled", false):
		return _error("recalled_astral_unavailable")
	var rules: Dictionary = _balance["damage"]
	var opening: Variant = input.get("openingMultiplier", rules["defaultOpeningMultiplier"])
	if not _number(opening):
		return _error("invalid_opening_multiplier")
	var tether: Dictionary = tether_factor(input.get("distance"), input.get("reach"))
	if not tether["ok"]:
		return tether
	var target: float = float(rules["astralMultiplier"])
	if input["target"] == "body":
		target = float(rules["recalledBodyMultiplier"] if input.get("recalled", false) else rules["bodyMultiplier"])
	# Preserve JS evaluation order; round exactly once, after all multipliers.
	var raw: float = float(input["power"]) * (float(rules["basePowerFactor"]) + float(input["attackerPower"]) / float(rules["powerDivisor"])) * float(tether["value"]) * target * float(opening) * (1.0 - float(input["defenderEndurance"]) / float(rules["enduranceDivisor"]))
	return _rounded(raw)

func validate_actor(actor: Variant) -> Dictionary:
	if _balance.is_empty() or not actor is Dictionary:
		return _error("invalid_actor")
	if not _ascii_id(actor.get("id")) or actor.get("team") not in ["player", "enemy"] or actor.get("kind") not in ["close", "remote", "auto", "swarm", "set", "field"]:
		return _error("invalid_actor_identity")
	if actor.get("mode") not in ["manifested", "recalled", "extinguished"]:
		return _error("invalid_astral_mode")
	for key: String in ["order", "readyAt", "reach", "maxWill", "shield"]:
		if not _integer(actor.get(key)):
			return _error("invalid_actor_" + key)
	if not _integer(actor.get("maxHp"), 1) or not _integer(actor.get("hp"), 0, actor["maxHp"]) or not _integer(actor.get("will"), 0, actor["maxWill"]):
		return _error("invalid_actor_resources")
	if not _point(actor.get("body")) or not actor.has("astral") or (actor["astral"] != null and not _point(actor["astral"])):
		return _error("invalid_actor_position")
	if (actor["mode"] == "manifested") != (actor["astral"] != null) or (actor["hp"] == 0 and actor["mode"] != "extinguished"):
		return _error("inconsistent_manifestation")
	if not actor.get("chart") is Dictionary:
		return _error("invalid_actor_chart")
	for key: String in ["pow", "spd", "rch", "end", "prc", "pot"]:
		if not _chart_value(actor["chart"].get(key)):
			return _error("invalid_actor_chart_" + key)
	if actor.has("lampMarks") and not _integer(actor["lampMarks"], 0, 3):
		return _error("invalid_lamp_marks")
	if actor.has("skillIds"):
		if not actor["skillIds"] is Array:
			return _error("invalid_skill_ids")
		var seen: Dictionary = {}
		for id: Variant in actor["skillIds"]:
			if not _skill_id(id) or seen.has(id):
				return _error("invalid_skill_ids")
			seen[id] = true
	return _ok(true)

func apply_shared_damage(actor: Variant, target: Variant, amount: Variant) -> Dictionary:
	var valid: Dictionary = validate_actor(actor)
	if not valid["ok"]:
		return valid
	if not _target(target) or not _integer(amount) or actor["kind"] not in ["close", "remote"]:
		return _error("invalid_shared_damage")
	if target == "astral" and (actor["mode"] != "manifested" or actor["astral"] == null):
		return _error("astral_unavailable")
	var next: Dictionary = actor.duplicate(true)
	var absorbed: int = 0
	var damage: int = 0
	if next["hp"] > 0:
		absorbed = mini(int(next["shield"]), int(amount))
		damage = mini(int(next["hp"]), int(amount) - absorbed)
		next["shield"] = int(next["shield"]) - absorbed
		next["hp"] = int(next["hp"]) - damage
		if next["hp"] == 0:
			next["mode"] = "extinguished"
			next["astral"] = null
	return _ok({"actor": next, "damage": damage, "absorbed": absorbed})

func action_interval(speed: Variant, weight: Variant) -> Dictionary:
	var grade: Dictionary = rating(speed)
	if not grade["ok"] or weight not in ["light", "normal", "heavy"]:
		return _error("invalid_action_interval")
	var timeline: Dictionary = _balance["timeline"]
	return _rounded(float(timeline["baseInterval"]) * float(timeline["speedFactors"][grade["value"]]) * float(timeline["actionWeights"][weight]), 1)

func order_timeline(actors: Variant) -> Dictionary:
	if not actors is Array:
		return _error("invalid_actors")
	var indexed: Array[Dictionary] = []
	for index: int in actors.size():
		var valid: Dictionary = validate_actor(actors[index])
		if not valid["ok"]:
			return valid
		indexed.append({"actor": actors[index].duplicate(true), "index": index})
	# Godot sort is not stable: carry the original index for exact ties.
	indexed.sort_custom(_timeline_before)
	var ordered: Array = []
	for item: Dictionary in indexed:
		ordered.append(item["actor"])
	return _ok(ordered)

func reschedule_actor(actor: Variant, weight: Variant) -> Dictionary:
	var valid: Dictionary = validate_actor(actor)
	if not valid["ok"]:
		return valid
	if actor["hp"] == 0:
		return _error("actor_defeated")
	var interval: Dictionary = action_interval(actor["chart"]["spd"], weight)
	if not interval["ok"]:
		return interval
	var ready_at: int = int(actor["readyAt"]) + int(interval["value"])
	if not _integer(ready_at):
		return _error("timeline_overflow")
	var next: Dictionary = actor.duplicate(true)
	next["readyAt"] = ready_at
	return _ok(next)

func _chart_value(value: Variant) -> bool:
	return not _balance.is_empty() and _integer(value, _balance["chart"]["minimum"], _balance["chart"]["maximum"])

static func _timeline_before(a: Dictionary, b: Dictionary) -> bool:
	var first: Dictionary = a["actor"]
	var second: Dictionary = b["actor"]
	for key: String in ["readyAt", "team", "order", "id"]:
		if first[key] != second[key]:
			return first[key] == "player" if key == "team" else first[key] < second[key]
	return a["index"] < b["index"]

static func _integer(value: Variant, minimum: float = 0, maximum: float = MAX_SAFE_INTEGER) -> bool:
	return _number(value) and float(value) == floorf(float(value)) and value >= minimum and value <= maximum

static func _number(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value >= 0 and value <= MAX_SAFE_INTEGER

static func _point(value: Variant) -> bool:
	return value is Dictionary and _integer(value.get("x")) and _integer(value.get("y"))

static func _target(value: Variant) -> bool:
	return value in ["body", "astral"]

static func _ascii_id(value: Variant) -> bool:
	if not value is String or value.is_empty():
		return false
	for index: int in value.length():
		if value.unicode_at(index) < 33 or value.unicode_at(index) > 126:
			return false
	return true

static func _skill_id(value: Variant) -> bool:
	if not value is String or value.is_empty():
		return false
	for index: int in value.length():
		var code: int = value.unicode_at(index)
		var word: bool = code == 95 or (code >= 48 and code <= 57) or (code >= 65 and code <= 90) or (code >= 97 and code <= 122)
		if not word and not (index > 0 and code in [45, 46]):
			return false
	return true

static func _rounded(value: float, minimum: int = 0) -> Dictionary:
	if not is_finite(value) or value < 0 or value > MAX_SAFE_INTEGER:
		return _error("numeric_overflow")
	# floor(x + .5) incorrectly rounds the representable value just below .5.
	var whole: float = floorf(value)
	var rounded: float = whole + (1.0 if value - whole >= 0.5 else 0.0)
	return _ok(int(rounded)) if _integer(rounded, minimum) else _error("numeric_overflow")

static func _ok(value: Variant) -> Dictionary:
	return {"ok": true, "value": value}

static func _error(reason: String) -> Dictionary:
	return {"ok": false, "error": reason}
