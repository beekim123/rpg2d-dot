extends SceneTree
const Content = preload("res://scripts/battle/battle_content.gd")
const EngineRules = preload("res://scripts/battle/battle_engine.gd")
const MathRules = preload("res://scripts/battle/battle_math.gd")
const Encounters = preload("res://scripts/battle/battle_encounter.gd")
const Session = preload("res://scripts/battle/battle_session.gd")
const Compare = preload("res://tests/battle/json_compare.gd")
var checks: int = 0
var failures: Array[String] = []
var balance: Dictionary
var skills: Dictionary
var definition: Dictionary
func _initialize() -> void:
	_run.call_deferred()
func check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures.append(label)
		push_error("FAIL: " + label)
func read(path: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(ProjectSettings.globalize_path("res://../content/data/" + path)))
func find(state: Dictionary, id: String) -> Dictionary:
	for actor: Dictionary in state["actors"]:
		if actor["id"] == id:
			return actor
	return {}
func base() -> Dictionary:
	var data: Dictionary = definition.duplicate(true)
	find(data, "ella")["readyAt"] = 100
	find(data, "faux_sword")["readyAt"] = 200
	return data
func item(id: String, target: String = "ella") -> Dictionary:
	return {"type": "item", "actorId": "finn", "itemId": id, "targetId": target}
func _run() -> void:
	balance = read("battle-balance.json")
	skills = read("battle-skills.json")
	skills["support"] = read("battle-support.json")
	var original: Dictionary = read("battles/prologue_ella.json")
	var extension: Dictionary = read("battle-native-extensions.json")["prologue_ella"]
	var composed: Dictionary = Content.compose(original, extension)
	check(composed["ok"], "compose native teaching battle with starless Finn")
	if not composed["ok"]:
		_finish()
		return
	definition = composed["value"]
	check(definition["actors"].size() == 3 and not original.has("inventory"), "native extension preserves frozen base candidate")
	composed["value"]["inventory"]["bread"] = 2
	check(extension["inventory"]["bread"] == 3, "composition owns deep copies")
	definition = Content.compose(original, extension)["value"]
	var engine: EngineRules = EngineRules.new()
	check(engine.configure(balance, skills).is_empty(), "configure support rules")
	var created: Dictionary = engine.create_battle(base())
	check(created["ok"], "starless actor is a legal single body")
	if not created["ok"]:
		_finish()
		return
	var state: Dictionary = created["state"]
	check(state["activeId"] == "finn" and find(state, "finn")["will"] == 0, "starless turn never regenerates companion will")
	for command: Dictionary in [{"type": "manifest", "to": {"x": 1, "y": 4}}, {"type": "recall"}, {"type": "move_astral", "to": {"x": 1, "y": 4}}, {"type": "skill", "skillId": "laurel_bolt", "targetId": "faux_sword", "target": "body"}]:
		command["actorId"] = "finn"
		var before: Dictionary = state.duplicate(true)
		check(not engine.apply_command(state, command)["ok"] and state == before, "starless cannot use companion actions")
	var injured: Dictionary = base()
	find(injured, "ella")["hp"] = 80
	state = engine.create_battle(injured)["state"]
	var healed: Dictionary = engine.apply_command(state, item("bread"))
	check(healed["ok"], "bread is a legal body action")
	if healed["ok"]:
		check(find(healed["state"], "ella")["hp"] == 110 and healed["state"]["inventory"]["bread"] == 2, "bread restores30 and consumes exactly one")
		check(find(healed["state"], "finn")["readyAt"] == 110 and state["inventory"]["bread"] == 3, "item consumes one normal turn without mutating input")
	for command: Dictionary in [item("missing"), item("bread", "faux_sword"), item("star_candy", "finn")]:
		var result: Dictionary = engine.apply_command(state, command)
		check(not result["ok"] and Compare.equal(result["state"], state), "bad item/target has no side effects")
	check(not engine.apply_command(engine.create_battle(base())["state"], item("bread"))["ok"], "full HP does not waste a bread")
	var no_stock: Dictionary = injured.duplicate(true)
	no_stock["inventory"]["bread"] = 0
	check(not engine.apply_command(engine.create_battle(no_stock)["state"], item("bread"))["ok"], "empty inventory cannot heal")
	var depleted: Dictionary = base()
	find(depleted, "ella")["will"] = 10
	var restored: Dictionary = engine.apply_command(engine.create_battle(depleted)["state"], item("star_candy"))
	check(restored["ok"] and find(restored["state"], "ella")["will"] == 12, "candy caps will at maximum")
	var near: Dictionary = base()
	find(near, "faux_sword")["body"] = {"x": 4, "y": 3}
	find(near, "faux_sword")["astral"] = {"x": 3, "y": 3}
	state = engine.create_battle(near)["state"]
	var cheer: Dictionary = {"type": "cheer", "actorId": "finn", "targetId": "ella"}
	var buffed: Dictionary = engine.apply_command(state, cheer)
	check(buffed["ok"], "Finn can cheer a living ally")
	if buffed["ok"]:
		check(find(buffed["state"], "ella").get("cheered", false), "cheer marks next damaging action")
		var waited: Dictionary = engine.apply_command(buffed["state"], {"type": "wait", "actorId": "ella"})
		check(not engine.apply_command(waited["state"], cheer)["ok"], "cheer cannot stack while ally waits")
		var strike: Dictionary = engine.apply_command(buffed["state"], {"type": "skill", "actorId": "ella", "skillId": "laurel_bolt", "targetId": "faux_sword", "target": "astral"})
		check(strike["ok"] and find(strike["state"], "faux_sword")["hp"] == 50, "cheered bolt rounds11.88x1.25 to15")
		check(not find(strike["state"], "ella").get("cheered", false), "damaging action consumes cheer exactly once")
	var attacked: Dictionary = base()
	find(attacked, "finn")["body"] = {"x": 2, "y": 3}
	find(attacked, "finn")["readyAt"] = 100
	find(attacked, "ella")["body"] = {"x": 0, "y": 0}
	find(attacked, "ella")["astral"] = {"x": 1, "y": 0}
	find(attacked, "faux_sword").merge({"readyAt": 0, "body": {"x": 4, "y": 3}, "astral": {"x": 3, "y": 3}}, true)
	var hit: Dictionary = engine.apply_command(engine.create_battle(attacked)["state"], {"type": "skill", "actorId": "faux_sword", "skillId": "basic_strike", "targetId": "finn", "target": "body"})
	check(hit["ok"] and find(hit["state"], "finn")["hp"] == 51, "starless takes24 body damage, never recalled protection")
	for patch: Dictionary in [{"mode": "recalled"}, {"reach": 1}, {"skillIds": ["basic_strike"]}]:
		var invalid: Dictionary = base()
		find(invalid, "finn").merge(patch, true)
		check(not engine.create_battle(invalid)["ok"], "reject fake companion capabilities on starless actor")
	for inventory: Variant in [null, {"bread": -1}, {"bread": 10}, {"unknown": 1}, {"bread": true}]:
		var invalid: Dictionary = base()
		invalid["inventory"] = inventory
		check(not engine.create_battle(invalid)["ok"], "invalid inventory rejected")
	for invalid_skills: Variant in [null, true, 1, {}, "basic_strike"]:
		var invalid: Dictionary = base()
		find(invalid, "finn")["skillIds"] = invalid_skills
		check(not engine.create_battle(invalid)["ok"], "malformed starless skill list rejects safely")
	var blocked: Dictionary = base()
	find(blocked, "finn")["body"] = {"x": 1, "y": 3}
	find(blocked, "ella").merge({"body": {"x": 3, "y": 3}, "astral": {"x": 3, "y": 2}, "hp": 80}, true)
	blocked["blocked"] = [{"x": 2, "y": 3}]
	var blocked_state: Dictionary = engine.create_battle(blocked)["state"]
	check(not engine.apply_command(blocked_state, item("bread"))["ok"], "item cannot pass through a wall")
	check(engine.apply_command(blocked_state, cheer)["ok"], "audible cheer can reach ally across wall")
	var distant: Dictionary = base()
	find(distant, "ella").merge({"body": {"x": 4, "y": 1}, "astral": {"x": 5, "y": 1}, "hp": 80}, true)
	var distant_state: Dictionary = engine.create_battle(distant)["state"]
	check(not engine.apply_command(distant_state, item("bread"))["ok"], "item range enforced")
	check(not engine.apply_command(distant_state, cheer)["ok"], "cheer range enforced")
	var fallen: Dictionary = base()
	find(fallen, "ella").merge({"hp": 0, "mode": "extinguished", "astral": null}, true)
	var fallen_state: Dictionary = engine.create_battle(fallen)["state"]
	check(not engine.apply_command(fallen_state, item("bread"))["ok"], "bread cannot revive a fallen ally")
	check(not engine.apply_command(fallen_state, cheer)["ok"], "cannot cheer a fallen ally")
	var huge: Dictionary = skills.duplicate(true)
	huge["support"]["rules"]["cheerMultiplier"] = NAN
	check(not engine.configure(balance, huge).is_empty(), "bad support configuration rejected atomically")
	check(engine.apply_command(state, cheer)["ok"], "failed support config preserves previous working rules")
	var alternative: Dictionary = balance.duplicate(true)
	alternative["damage"]["defaultOpeningMultiplier"] = 2.0
	check(engine.configure(alternative, skills).is_empty(), "alternate opening multiplier configures")
	var duel: Dictionary = read("battles/prologue_ella.json")
	find(duel, "faux_sword").merge({"body": {"x": 4, "y": 3}, "astral": {"x": 3, "y": 3}}, true)
	var attack: Dictionary = {"type": "skill", "actorId": "ella", "skillId": "laurel_bolt", "targetId": "faux_sword", "target": "astral"}
	var ordinary: Dictionary = engine.apply_command(engine.create_battle(duel)["state"], attack)
	check(ordinary["ok"] and find(ordinary["state"], "faux_sword")["hp"] == 41, "unbuffed skill honors injected default opening:24 damage")
	find(duel, "ella")["cheered"] = true
	var boosted: Dictionary = engine.apply_command(engine.create_battle(duel)["state"], attack)
	check(boosted["ok"] and find(boosted["state"], "faux_sword")["hp"] == 35, "cheer composes with default opening:30 damage")
	if boosted["ok"]:
		var next: Dictionary = boosted["state"]
		for step: int in 8:
			if next["activeId"] == "ella":
				break
			next = engine.apply_command(next, {"type": "wait", "actorId": next["activeId"]})["state"]
		var consumed: Dictionary = engine.apply_command(next, attack)
		check(consumed["ok"] and find(consumed["state"], "faux_sword")["hp"] == 11, "after cheer consumption normal default opening still applies")
	check(engine.configure(balance, skills).is_empty(), "restore production balance")
	_autoplay()
	_finish()
func _autoplay() -> void:
	var api: Encounters = Encounters.new()
	api.configure(balance, skills)
	for passive: bool in [false, true]:
		var session: Session = Session.new()
		session.configure(balance, skills)
		var made: Dictionary = session.start(definition)
		check(made["ok"], "native three-body teaching encounter starts")
		if not made["ok"]:
			continue
		var initial: Dictionary = session.snapshot()
		var used_support: bool = false
		var spent_item: bool = false
		for turn: int in 120:
			var current: Dictionary = session.snapshot()
			if current["battle"]["phase"] != "active":
				break
			var active: Dictionary = find(current["battle"], current["battle"]["activeId"])
			if active["team"] == "enemy":
				check(session.advance_enemy()["ok"], "support route enemy step legal")
			else:
				var commands: Array = [{"type": "wait", "actorId": active["id"]}] if passive else api.plan_player_turn(current)
				if passive and not spent_item and active["kind"] == "starless" and active["hp"] < active["maxHp"]:
					commands = [{"type": "item", "actorId": active["id"], "itemId": "bread", "targetId": active["id"]}]
				check(not commands.is_empty(), "support route has a legal main action")
				for command: Dictionary in commands:
					used_support = used_support or command["type"] in ["item", "cheer"]
					check(session.command(command)["ok"], "support route player command legal")
					spent_item = spent_item or command["type"] == "item"
		check(session.snapshot()["battle"]["phase"] == ("lost" if passive else "won"), "native support teaching battle reaches real outcome")
		if passive:
			check(spent_item and session.snapshot()["battle"]["inventory"]["bread"] < initial["battle"]["inventory"]["bread"], "losing route really consumes an item before retry")
			check(session.retry()["ok"] and Compare.equal(session.snapshot(), initial), "retry restores Finn, support inventory and intentions")
		else:
			check(used_support, "winning native route actually uses Finn assistance")
func _finish() -> void:
	print("BattleSupport: %d checks, %d failures" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)
