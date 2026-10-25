extends SceneTree
## Shared oracle plus native-only non-JSON boundaries. No scenes or asset service.
const BattleMath = preload("res://scripts/battle/battle_math.gd")
var _checks: int = 0
var _failures: Array[String] = []

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	_checks += 1
	if not condition:
		_failures.append(message)
		push_error("FAIL: " + message)

func _matches(actual: Dictionary, expected: Dictionary) -> bool:
	if actual.get("ok") != expected.get("ok"):
		return false
	if not expected["ok"]:
		return not actual.get("error", "").is_empty()
	return _json_equal(actual.get("value"), expected.get("value"))

func _json_equal(actual: Variant, expected: Variant) -> bool:
	if (actual is int or actual is float) and (expected is int or expected is float):
		return actual == expected
	if typeof(actual) != typeof(expected):
		return false
	if actual is Dictionary:
		if actual.size() != expected.size():
			return false
		for key: Variant in expected:
			if not actual.has(key) or not _json_equal(actual[key], expected[key]):
				return false
		return true
	if actual is Array:
		if actual.size() != expected.size():
			return false
		for index: int in expected.size():
			if not _json_equal(actual[index], expected[index]):
				return false
		return true
	return actual == expected

func _run() -> void:
	_check(_json_equal({"hp": [70]}, {"hp": [70.0]}), "JSON numeric int/float compare by exact value")
	_check(not _json_equal({"hp": [70]}, {"hp": [70.1]}), "comparison detects fractional mismatch")
	_check(not _json_equal({"hp": 0}, {"hp": false}), "comparison keeps booleans distinct")
	_check(not _json_equal({"hp": 0, "extra": 1}, {"hp": 0}), "comparison detects extra keys")
	_check(not _json_equal([1, 2], [2, 1]), "comparison preserves event order")
	var path: String = ProjectSettings.globalize_path("res://../tests/fixtures/battle/math.json")
	var fixture: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	_check(fixture is Dictionary and fixture.get("format") == "astra.battle-math/1", "shared fixture loads")
	if not fixture is Dictionary:
		quit(1)
		return
	var math: BattleMath = BattleMath.new()
	_check(math.configure(fixture["balance"]).is_empty(), "balance configures")
	for entry: Dictionary in fixture["cases"]:
		var args: Array = entry["args"].duplicate(true)
		var before: Array = args.duplicate(true)
		var result: Dictionary = math.callv(entry["op"], args)
		var matches: bool = _matches(result, entry["expected"])
		if entry["op"] == "tether_factor" and result.get("ok") and entry["expected"]["ok"]:
			matches = absf(float(result["value"]) - float(entry["expected"]["value"])) < 0.000000000001
		_check(matches, entry["id"] + ": " + JSON.stringify(result) + " expected " + JSON.stringify(entry["expected"]))
		_check(args == before, entry["id"] + " leaves input unchanged")
	for replay: Dictionary in fixture["replays"]:
		var actor: Dictionary = replay["initial"].duplicate(true)
		for index: int in replay["steps"].size():
			var step: Dictionary = replay["steps"][index]
			var before: Dictionary = actor.duplicate(true)
			var result: Dictionary = math.apply_shared_damage(actor, step["command"]["target"], step["command"]["amount"])
			_check(_matches(result, step["expected"]), "%s step %d" % [replay["id"], index])
			_check(actor == before, "shared HP replay preserves previous snapshot")
			if result["ok"]:
				actor = result["value"]["actor"]
	_native_boundaries(math, fixture)
	print("BattleMath: %d checks, %d failures; %d shared cases, %d replays" % [_checks, _failures.size(), fixture["cases"].size(), fixture["replays"].size()])
	quit(0 if _failures.is_empty() else 1)

func _native_boundaries(math: BattleMath, fixture: Dictionary) -> void:
	for bad: Variant in [NAN, INF, -INF, 9007199254740992, true, false, "1", [], {}]:
		_check(not math.rating(bad)["ok"], "reject nonnumeric/unsafe rating")
		_check(not math.tether_factor(bad, 2)["ok"], "reject nonnumeric/unsafe distance")
		_check(not math.manhattan({"x": bad, "y": 0}, {"x": 0, "y": 0})["ok"], "reject invalid point")
	var actor: Dictionary = fixture["replays"][0]["initial"].duplicate(true)
	var before: Dictionary = actor.duplicate(true)
	var copy: Dictionary = math.apply_shared_damage(actor, "body", 0)
	if copy["ok"]:
		copy["value"]["actor"]["body"]["x"] = 99
		copy["value"]["actor"]["chart"]["pow"] = 0
		copy["value"]["actor"]["skillIds"].append("other")
	_check(actor == before, "shared HP result does not alias nested caller state")
	var sorted: Dictionary = math.order_timeline([actor])
	if sorted["ok"]:
		sorted["value"][0]["chart"]["pow"] = 0
	_check(actor == before, "timeline returns independent snapshots")
	var unconfigured: BattleMath = BattleMath.new()
	_check(not unconfigured.rating(40)["ok"], "unconfigured rules fail explicitly")
	for bad: Variant in [null, {}, [], {"chart": {}}, fixture["balance"].merged({"damage": {}}, true)]:
		_check(not math.configure(bad).is_empty(), "invalid config rejected")
		_check(math.rating(40) == {"ok": true, "value": "C"}, "failed config keeps previous valid data")
	var injected: Dictionary = fixture["balance"].duplicate(true)
	_check(math.configure(injected).is_empty(), "valid config restored")
	injected["chart"]["ratingMinimums"]["C"] = 100
	_check(math.rating(40) == {"ok": true, "value": "C"}, "configured rules do not alias caller data")

	# The injected balance must actually drive arithmetic, not just pass validation.
	var damage_input: Dictionary = {"power": 100, "attackerPower": 40, "defenderEndurance": 50, "distance": 1, "reach": 5, "target": "body"}
	var alternative: Dictionary = fixture["balance"].duplicate(true)
	alternative["damage"]["bodyMultiplier"] = 2.0
	alternative["timeline"]["baseInterval"] = 200
	_check(math.configure(alternative).is_empty(), "alternative valid balance accepted")
	_check(math.calculate_damage(damage_input)["value"] == 160, "injected body multiplier controls damage")
	_check(math.action_interval(60, "normal")["value"] == 200, "injected base interval controls schedule")
	var invalid_balances: Array = []
	for bad: Variant in [NAN, INF, -INF, true, "2"]:
		var changed: Dictionary = alternative.duplicate(true)
		changed["damage"]["bodyMultiplier"] = bad
		invalid_balances.append(changed)
	var unordered: Dictionary = alternative.duplicate(true)
	unordered["chart"]["ratingMinimums"]["C"] = 10
	invalid_balances.append(unordered)
	var zero_divisor: Dictionary = alternative.duplicate(true)
	zero_divisor["damage"]["powerDivisor"] = 0
	invalid_balances.append(zero_divisor)
	for bad: Dictionary in invalid_balances:
		_check(not math.configure(bad).is_empty(), "malformed numeric balance rejected")
		_check(math.calculate_damage(damage_input)["value"] == 160, "failed numeric config preserves active damage rules")
	_check(math.configure(fixture["balance"]).is_empty(), "restore production balance")
