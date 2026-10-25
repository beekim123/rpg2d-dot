extends SceneTree
const EngineRules = preload("res://scripts/battle/battle_engine.gd")
const Skills = preload("res://scripts/battle/battle_skills.gd")
const Compare = preload("res://tests/battle/json_compare.gd")
var checks: int = 0
var failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures.append(label)
		push_error("FAIL: " + label)
func _run() -> void:
	var fixture: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ProjectSettings.globalize_path("res://../tests/fixtures/battle/skills.json")))
	var engine: EngineRules = EngineRules.new()
	check(engine.configure(fixture["balance"], fixture["skillData"]).is_empty(), "configure full skill data")
	for replay: Dictionary in fixture["replays"]:
		var original: Dictionary = replay["initial"].duplicate(true)
		var created: Dictionary = engine.create_battle(original)
		check(created["ok"], replay["id"] + " creates")
		if not created["ok"]:
			continue
		check(Compare.equal(created["state"], replay["expectedInitial"]), replay["id"] + " initial state")
		var state: Dictionary = created["state"]
		for index: int in replay["steps"].size():
			var step: Dictionary = replay["steps"][index]
			var before: Dictionary = state.duplicate(true)
			var result: Dictionary = engine.apply_command(state, step["command"])
			var label: String = "%s step %d" % [replay["id"], index]
			check(Compare.equal(result, step["expected"]), label + " complete state and events" + (" got " + JSON.stringify(result) if not Compare.equal(result, step["expected"]) else ""))
			check(state == before, label + " input untouched")
			check(Compare.equal(result, engine.apply_command(state, step["command"])), label + " deterministic")
			state = result["state"]
		check(original == replay["initial"], "definition remains unchanged")
	var skills: Skills = Skills.new()
	check(skills.configure(fixture["skillData"]).is_empty(), "skill catalog configures")
	for ray: Dictionary in fixture["rays"]:
		check(Compare.equal(skills.line_of_sight(ray["from"], ray["to"], ray["blocked"]), {"ok": true, "value": ray["visible"]}), "supercover ray " + JSON.stringify(ray))
	_boundaries(engine, skills, fixture)
	print("BattleSkills: %d checks, %d failures; %d replays, %d rays" % [checks, failures.size(), fixture["replays"].size(), fixture["rays"].size()])
	quit(0 if failures.is_empty() else 1)
func _boundaries(engine: EngineRules, skills: Skills, fixture: Dictionary) -> void:
	for bad: Variant in [null, {}, [], {"rules": {}, "skills": []}]:
		check(not skills.configure(bad).is_empty(), "reject malformed catalog")
	for patch: Dictionary in [{"cost": -1}, {"power": NAN}, {"range": INF}, {"weight": "bad"}, {"effect": "bad"}, {"lampMarks": 4}, {"consumeMarks": 1}, {"knockback": 9007199254740991}]:
		var data: Dictionary = fixture["skillData"].duplicate(true)
		data["skills"][0].merge(patch, true)
		check(not skills.configure(data).is_empty(), "reject invalid skill fields")
		check(skills.get_skill("basic_strike").get("power") == 16, "bad configuration keeps last valid catalog")
	var copied: Dictionary = skills.get_skill("basic_strike")
	copied["power"] = 0
	check(skills.get_skill("basic_strike").get("power") == 16, "catalog getter deep-copies")
	for bad: Variant in [null, {"x": NAN, "y": 0}, {"x": 0.5, "y": 0}, {"x": true, "y": 0}, {"x": 64, "y": 0}]:
		check(not skills.line_of_sight(bad, {"x": 0, "y": 0}, [])["ok"], "invalid/unbounded ray rejected")
	var created: Dictionary = engine.create_battle(fixture["replays"][0]["initial"])
	if not created["ok"]:
		return
	var state: Dictionary = created["state"]
	for command: Dictionary in [{"type": "skill"}, {"type": "skill", "skillId": null}, {"type": "skill", "skillId": "basic_strike", "targetId": "shade", "target": []}]:
		command["actorId"] = "finn"
		var before: Dictionary = state.duplicate(true)
		var result: Dictionary = engine.apply_command(state, command)
		check(not result["ok"] and Compare.equal(result["state"], before) and state == before, "malformed skill transaction is atomic")
	var duplicate: Dictionary = fixture["skillData"].duplicate(true)
	duplicate["skills"].append(duplicate["skills"][0].duplicate(true))
	check(not engine.configure(fixture["balance"], duplicate).is_empty(), "duplicate catalog is rejected atomically")
	check(engine.apply_command(state, {"type": "guard", "actorId": "finn"})["ok"], "failed reconfigure preserves valid battle rules")
	var multi: Dictionary = fixture["skillData"].duplicate(true)
	for skill: Dictionary in multi["skills"]:
		if skill["id"] == "rush":
			skill["knockback"] = 3
	check(engine.configure(fixture["balance"], multi).is_empty(), "inject three-cell knockback")
	var board: Dictionary = fixture["replays"].filter(func(r: Dictionary) -> bool: return r["id"] == "wall_collision")[0]["initial"].duplicate(true)
	board["blocked"] = [{"x": 5, "y": 2}]
	var start: Dictionary = engine.create_battle(board)["state"]
	var collision: Dictionary = engine.apply_command(start, {"type": "skill", "actorId": "finn", "skillId": "rush", "targetId": "shade", "target": "body"})
	check(collision["ok"] and collision["state"]["actors"][1]["hp"] == 51, "remaining two knockback cells cause 20 collision damage after 29 strike")
	check(Compare.equal(collision["state"]["actors"][1]["body"], {"x": 4, "y": 2}), "collision stops at last free cell")
	for id: String in ["flare", "laurel_heal", "laurel_shield"]:
		var huge: Dictionary = fixture["skillData"].duplicate(true)
		for skill: Dictionary in huge["skills"]:
			if skill["id"] == id:
				skill["power"] = 9007199254740991
		check(engine.configure(fixture["balance"], huge).is_empty(), "safe skill power allowed before use")
		var marked: Dictionary = fixture["replays"][0]["initial"].duplicate(true)
		marked["actors"][1]["lampMarks"] = 3
		var initial: Dictionary = engine.create_battle(marked)["state"]
		var before: Dictionary = initial.duplicate(true)
		var result: Dictionary = engine.apply_command(initial, {"type": "skill", "actorId": "finn", "skillId": id, "targetId": "shade" if id == "flare" else "finn", "target": "body"})
		check(not result["ok"] and Compare.equal(result["state"], before) and initial == before, "overflow rolls back will/HP/marks/turn for " + id)
