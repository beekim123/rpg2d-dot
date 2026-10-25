extends SceneTree
const EngineRules = preload("res://scripts/battle/battle_engine.gd")
const Compare = preload("res://tests/battle/json_compare.gd")
var _checks: int = 0
var _failures: Array[String] = []

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	_checks += 1
	if not condition:
		_failures.append(message)
		push_error("FAIL: " + message)

func _run() -> void:
	var fixture: Variant = JSON.parse_string(FileAccess.get_file_as_string(ProjectSettings.globalize_path("res://../tests/fixtures/battle/movement.json")))
	_check(fixture is Dictionary and fixture.get("format") == "astra.battle-movement/1", "movement fixture loads")
	if not fixture is Dictionary:
		quit(1)
		return
	var engine: EngineRules = EngineRules.new()
	_check(engine.configure(fixture["balance"], fixture["skillIds"]).is_empty(), "configure movement engine")
	for replay: Dictionary in fixture["replays"]:
		var original: Dictionary = replay["initial"].duplicate(true)
		var initial: Dictionary = engine.create_battle(replay["initial"])
		_check(initial["ok"], replay["id"] + " creates")
		_check(replay["initial"] == original, "create preserves definition")
		if not initial["ok"]:
			continue
		var state: Dictionary = initial["state"]
		_check(Compare.equal(state, replay["expectedInitial"]), replay["id"] + " complete initial state")
		_previews(engine, state, replay["initialMoves"], replay["id"])
		for index: int in replay["steps"].size():
			var step: Dictionary = replay["steps"][index]
			var before: Dictionary = state.duplicate(true)
			var command: Dictionary = step["command"].duplicate(true)
			var result: Dictionary = engine.apply_command(state, command)
			var label: String = "%s step %d" % [replay["id"], index]
			_check(Compare.equal(result, step["expected"]), label + " full state/events: " + JSON.stringify(result) if not Compare.equal(result, step["expected"]) else label)
			_check(state == before and command == step["command"], label + " leaves inputs unchanged")
			_check(Compare.equal(result, engine.apply_command(state, command)), label + " deterministic replay")
			state = result["state"]
			_previews(engine, state, step["moves"], label)
	for rejected: Dictionary in fixture["rejected"]:
		_check(not engine.create_battle(rejected["initial"])["ok"], rejected["id"])
	_boundaries(engine, fixture)
	print("BattleMovement: %d checks, %d failures; %d shared replays" % [_checks, _failures.size(), fixture["replays"].size()])
	quit(0 if _failures.is_empty() else 1)

func _previews(engine: EngineRules, state: Dictionary, expected: Dictionary, label: String) -> void:
	var before: Dictionary = state.duplicate(true)
	for unit: String in ["body", "astral"]:
		_check(Compare.equal(engine.reachable_moves(state, unit), expected[unit]), label + " reachable " + unit)
	_check(state == before, label + " preview leaves state unchanged")

func _boundaries(engine: EngineRules, fixture: Dictionary) -> void:
	for bad: Variant in [null, [], {}, {"width": true}, {"actors": null}]:
		_check(not engine.create_battle(bad)["ok"], "malformed definition fails safely")
	var result: Dictionary = engine.create_battle(fixture["replays"][0]["initial"])
	if not result["ok"]:
		return
	var state: Dictionary = result["state"]
	for bad: Variant in [null, [], {}, {"actorId": "finn", "type": "move_body", "to": {"x": NAN, "y": 2}}, {"actorId": "finn", "type": "manifest", "to": false}]:
		var before: Dictionary = state.duplicate(true)
		var failure: Dictionary = engine.apply_command(state, bad)
		_check(not failure["ok"] and Compare.equal(failure["state"], before), "malformed command is an atomic rejection")
		_check(state == before, "bad command preserves caller state")
	_check(engine.reachable_moves(state, "other").is_empty(), "invalid preview unit fails safely")
	var moved: Dictionary = engine.apply_command(state, {"actorId": "finn", "type": "move_body", "to": {"x": 1, "y": 4}})
	if moved["ok"]:
		moved["state"]["actors"][0]["chart"]["pow"] = 1
	_check(state["actors"][0]["chart"]["pow"] == 65, "result does not alias original nested actor")
	var overflow: Dictionary = fixture["replays"][0]["initial"].duplicate(true)
	for actor: Dictionary in overflow["actors"]:
		actor["readyAt"] = 9007199254740991
	var late: Dictionary = engine.create_battle(overflow)
	_check(late["ok"], "safe maximum starting tick accepted")
	if late["ok"]:
		var failed: Dictionary = engine.apply_command(late["state"], {"actorId": "finn", "type": "wait"})
		_check(not failed["ok"] and Compare.equal(failed["state"], late["state"]), "schedule overflow rejected atomically")
	var bad_origin: Dictionary = state.duplicate(true)
	bad_origin["turnStart"]["body"] = {"x": -1, "y": 2}
	var bad_undo: Dictionary = engine.apply_command(bad_origin, {"actorId": "finn", "type": "undo"})
	_check(not bad_undo["ok"] and Compare.equal(bad_undo["state"], bad_origin), "reject an out-of-board undo snapshot atomically")
	bad_origin = state.duplicate(true)
	bad_origin["turnStart"]["body"] = state["actors"][1]["body"].duplicate(true)
	bad_origin["turnStart"]["astral"] = {"x": 6, "y": 3}
	_check(not engine.apply_command(bad_origin, {"actorId": "finn", "type": "undo"})["ok"], "reject undo snapshot overlapping another owner")
	for bad: Variant in [null, [], {}, state.merged({"bodySpent": -1}, true), state.merged({"turnNumber": NAN}, true)]:
		_check(not engine.apply_command(bad, {"actorId": "finn", "type": "wait"})["ok"], "malformed runtime state rejected safely")
		_check(engine.reachable_moves(bad, "body").is_empty(), "malformed runtime state cannot produce previews")
	for bad: Variant in [null, {}, ["basic_strike", "basic_strike"], [true]]:
		_check(not engine.configure(fixture["balance"], bad).is_empty(), "invalid skill registry rejected")
		_check(engine.create_battle(fixture["replays"][0]["initial"])["ok"], "failed registry update keeps previous config")
	for replay: Dictionary in fixture["replays"]:
		if replay["expectedInitial"]["phase"] != "active":
			continue
		var initial: Dictionary = engine.create_battle(replay["initial"])["state"]
		for unit: String in ["body", "astral"]:
			for endpoint: Dictionary in replay["initialMoves"][unit]:
				var moved_to: Dictionary = engine.apply_command(initial, {"actorId": initial["activeId"], "type": "move_" + unit, "to": endpoint["to"]})
				_check(moved_to["ok"], replay["id"] + " accepts every oracle-previewed " + unit + " destination")
	var enlarged_snapshot: Dictionary = state.duplicate(true)
	enlarged_snapshot["turnStart"]["reach"] = 3
	enlarged_snapshot["turnStart"]["astral"] = {"x": 4, "y": 2}
	var too_far: Dictionary = engine.apply_command(enlarged_snapshot, {"actorId": "finn", "type": "undo"})
	_check(not too_far["ok"] and Compare.equal(too_far["state"], enlarged_snapshot), "undo uses current reach rather than a forged snapshot reach")
	var dead_snapshot: Dictionary = state.duplicate(true)
	dead_snapshot["turnStart"].merge({"hp": 0, "mode": "extinguished", "astral": null}, true)
	var extinguished: Dictionary = engine.apply_command(dead_snapshot, {"actorId": "finn", "type": "undo"})
	_check(not extinguished["ok"] and Compare.equal(extinguished["state"], dead_snapshot), "undo cannot extinguish a living actor through a forged dead snapshot")
