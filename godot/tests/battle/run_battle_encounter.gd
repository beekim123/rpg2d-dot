extends SceneTree
const Encounters = preload("res://scripts/battle/battle_encounter.gd")
const Compare = preload("res://tests/battle/json_compare.gd")
const FILES: Array[String] = ["intents.json", "route-prologue_ella-attack.json", "route-prologue_ella-wait.json", "route-prologue_shade-attack.json", "route-prologue_shade-wait.json"]
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
	var count: int = 0
	for file: String in FILES:
		var fixture: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ProjectSettings.globalize_path("res://../tests/fixtures/battle/" + file)))
		var api: Encounters = Encounters.new()
		check(api.configure(fixture["balance"], fixture["skillData"]).is_empty(), "encounter configures")
		for replay: Dictionary in fixture["replays"]:
			count += 1
			var initial: Dictionary = replay["initial"].duplicate(true)
			var made: Dictionary = api.create_encounter(initial)
			check(made["ok"], replay["id"] + " creates")
			if not made["ok"]:
				continue
			check(initial == replay["initial"], "creation preserves source definition")
			check(Compare.equal(made["encounter"], replay["expectedInitial"]), replay["id"] + " initial intent plan: " + JSON.stringify(made["encounter"]["intents"]))
			var encounter: Dictionary = made["encounter"]
			check(Compare.equal(api.plan_player_turn(encounter), replay["initialPlan"]), replay["id"] + " initial player plan")
			for index: int in replay["steps"].size():
				var step: Dictionary = replay["steps"][index]
				var before: Dictionary = encounter.duplicate(true)
				var result: Dictionary = api.advance_enemy(encounter) if step["step"]["kind"] == "enemy" else api.command_encounter(encounter, step["step"]["command"])
				var label: String = "%s step %d" % [replay["id"], index]
				check(Compare.equal(result, step["expected"]), label + " full encounter/events" + (": " + JSON.stringify(result) if not Compare.equal(result, step["expected"]) else ""))
				check(encounter == before, label + " leaves caller state and frozen plans unchanged")
				encounter = result["encounter"]
				check(Compare.equal(api.plan_player_turn(encounter), step["playerPlan"]), label + " player planning parity")
			# Reconstruct after both genuine victories and losses; no HP/clock edits.
			check(Compare.equal(api.create_encounter(initial)["encounter"], made["encounter"]), replay["id"] + " fresh retry exactly matches initial")
			if file.begins_with("route-"):
				var fresh: Dictionary = api.create_encounter(initial)["encounter"]
				var strategy: String = "wait" if file.ends_with("-wait.json") else "attack"
				for action: int in 80:
					if fresh["battle"]["phase"] != "active":
						break
					var active: Dictionary = fresh["battle"]["actors"].filter(func(a: Dictionary) -> bool: return a["id"] == fresh["battle"]["activeId"])[0]
					if active["team"] == "enemy":
						var result: Dictionary = api.advance_enemy(fresh)
						check(result["ok"], "native autoplay accepts fixed enemy turn")
						fresh = result["encounter"]
					else:
						var commands: Array = [{"type": "wait", "actorId": active["id"]}] if strategy == "wait" else api.plan_player_turn(fresh)
						check(not commands.is_empty(), "native autoplay plans a player action")
						for command: Dictionary in commands:
							var result: Dictionary = api.command_encounter(fresh, command)
							check(result["ok"], "native player command is legal")
							fresh = result["encounter"]
				check(Compare.equal(fresh, encounter), replay["id"] + " native win/loss autoplay matches full oracle final state")
		if file == "intents.json":
			_boundaries(api, fixture)
	print("BattleEncounter: %d checks, %d failures; %d shared intent/win/loss replays" % [checks, failures.size(), count])
	quit(0 if failures.is_empty() else 1)
func _boundaries(api: Encounters, fixture: Dictionary) -> void:
	for bad: Variant in [null, [], {}, {"battle": {}}]:
		check(not api.advance_enemy(bad)["ok"], "malformed encounter rejects enemy advance")
		check(api.plan_player_turn(bad).is_empty(), "malformed encounter rejects planning")
	var made: Dictionary = api.create_encounter(fixture["replays"].filter(func(r: Dictionary) -> bool: return r["id"] == "guard_forecast")[0]["initial"])
	if not made["ok"]:
		return
	var input: Dictionary = made["encounter"]
	var broken: Dictionary = input.duplicate(true)
	broken["intents"]["foe"]["commands"] = []
	check(not api.command_encounter(broken, {"actorId": "hero", "type": "wait"})["ok"], "malformed fixed plan rejected before player changes state")
	var before: Dictionary = input.duplicate(true)
	check(not api.command_encounter(input, null)["ok"] and input == before, "malformed player command is atomic")

	for patch: Dictionary in [{"origin": null}, {"commands": [{}]}, {"expectedDamage": NAN}, {"cell": false}, {"status": "interrupted"}]:
		var invalid_plan: Dictionary = input.duplicate(true)
		invalid_plan["intents"]["foe"].merge(patch, true)
		var before_plan: Dictionary = invalid_plan.duplicate(true)
		var rejected: Dictionary = api.command_encounter(invalid_plan, {"actorId": "hero", "type": "wait"})
		check(not rejected["ok"], "reject malformed intent fields")
		# Compare nonfinite values explicitly; JSON would erase them to null.
		var after_plan: Dictionary = invalid_plan.duplicate(true)
		if patch.has("expectedDamage"):
			check(is_nan(after_plan["intents"]["foe"]["expectedDamage"]), "NaN remains untouched")
			after_plan["intents"]["foe"].erase("expectedDamage")
			before_plan["intents"]["foe"].erase("expectedDamage")
		check(Compare.equal(after_plan, before_plan), "malformed intent input untouched")
	for id: String in ["laurel_heal", "rush"]:
		var fake: Dictionary = input.duplicate(true)
		fake["intents"]["foe"]["skillId"] = id
		fake["intents"]["foe"]["commands"].back()["skillId"] = id
		check(not api.command_encounter(fake, {"actorId": "hero", "type": "wait"})["ok"], "reject non-damage or unlearned advertised skill " + id)
