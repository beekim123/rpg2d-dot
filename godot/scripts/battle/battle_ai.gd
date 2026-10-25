extends RefCounted
## Deterministic planner and forecasts. Only the fixed advertised commands are replayed.
const EngineRules = preload("res://scripts/battle/battle_engine.gd")
const MathRules = preload("res://scripts/battle/battle_math.gd")
const SkillRules = preload("res://scripts/battle/battle_skills.gd")
const Grid = preload("res://scripts/battle/battle_grid.gd")
var engine: EngineRules
var math: MathRules
var skills: SkillRules

func configure(rules: EngineRules, balance: Dictionary, data: Dictionary) -> void:
	engine = rules
	math = MathRules.new()
	math.configure(balance)
	skills = SkillRules.new()
	skills.configure(data)

func actor_turn_view(state: Dictionary, id: String) -> Dictionary:
	var view: Dictionary = state.duplicate(true)
	view.merge({"activeId": id, "turnStart": find_actor(state, id).duplicate(true), "bodySpent": 0, "astralSpent": 0, "manifestUsed": false}, true)
	return view

func plan_turn(input: Dictionary) -> Array:
	var actor: Dictionary = find_actor(input, input["activeId"])
	var targets: Array = input["actors"].filter(func(a: Dictionary) -> bool: return a["hp"] > 0 and a["team"] != actor["team"])
	var state: Dictionary = input
	var prefix: Array = []
	if actor["mode"] == "recalled":
		var adjacent: Array = []
		for direction: Vector2i in Grid.DIRECTIONS:
			var point: Dictionary = {"x": int(actor["body"]["x"]) + direction.x, "y": int(actor["body"]["y"]) + direction.y}
			if point["x"] >= 0 and point["y"] >= 0:
				adjacent.append(point)
		adjacent.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			var da: float = _distance_to(a, targets)
			var db: float = _distance_to(b, targets)
			return da < db if da != db else a["y"] < b["y"] if a["y"] != b["y"] else a["x"] < b["x"])
		for to: Dictionary in adjacent:
			var command: Dictionary = {"type": "manifest", "actorId": actor["id"], "to": to}
			var result: Dictionary = engine.apply_command(state, command)
			if result["ok"]:
				state = result["state"]
				prefix = [command]
				break
	var best: Dictionary = {"commands": prefix + [{"type": "wait", "actorId": actor["id"]}], "score": [0, 0, 0, -INF, 0, 0]}
	if targets.is_empty():
		return best["commands"]
	var body_moves: Array = engine.reachable_moves(state, "body")
	body_moves.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var first: Array = [int(a["steps"] > 0), _distance_to(a["to"], targets), a["steps"], a["to"]["y"], a["to"]["x"]]
		var second: Array = [int(b["steps"] > 0), _distance_to(b["to"], targets), b["steps"], b["to"]["y"], b["to"]["x"]]
		return _greater(second, first))
	for body_move: Dictionary in body_moves.slice(0, 12):
		var body_command: Dictionary = {"type": "move_body", "actorId": actor["id"], "to": body_move["to"]}
		var moved: Dictionary = engine.apply_command(state, body_command) if body_move["steps"] > 0 else {"ok": true, "state": state}
		if not moved["ok"]:
			continue
		var body_state: Dictionary = moved["state"]
		var current: Dictionary = find_actor(body_state, actor["id"])
		var body_commands: Array = prefix + [body_command] if body_move["steps"] > 0 else prefix
		var astral_moves: Array = engine.reachable_moves(body_state, "astral")
		if astral_moves.is_empty():
			var candidate: Dictionary = {"commands": body_commands + [{"type": "wait", "actorId": actor["id"]}], "score": [0, 0, 0, -_distance_to(current["body"], targets), -body_move["steps"], 0]}
			if _greater(candidate["score"], best["score"]):
				best = candidate
			continue
		for astral_move: Dictionary in astral_moves:
			var commands: Array = body_commands + [{"type": "move_astral", "actorId": actor["id"], "to": astral_move["to"]}] if astral_move["steps"] > 0 else body_commands
			var steps: int = int(body_move["steps"]) + int(astral_move["steps"])
			var distance: float = _distance_to(astral_move["to"], targets)
			var approach: Dictionary = {"commands": commands + [{"type": "wait", "actorId": actor["id"]}], "score": [0, 0, 0, -distance, -steps, 0]}
			if _greater(approach["score"], best["score"]):
				best = approach
			for target: Dictionary in targets:
				for unit: String in ["body", "astral"]:
					var at: Variant = target[unit]
					if at == null:
						continue
					for skill_id: String in current.get("skillIds", ["basic_strike"]):
						var skill: Dictionary = skills.get_skill(skill_id)
						if skill.is_empty() or skill["effect"] != "damage" or current["will"] < skill["cost"] or (skill.get("consumeMarks", false) and target.get("lampMarks", 0) == 0):
							continue
						if Grid.distance(astral_move["to"], at) > skill["range"] or not skills.line_of_sight(astral_move["to"], at, body_state["blocked"]).get("value", false):
							continue
						var calculated: Dictionary = math.calculate_damage({"power": int(skill["power"]) * (int(target.get("lampMarks", 0)) if skill.get("consumeMarks", false) else 1), "attackerPower": current["chart"]["pow"], "defenderEndurance": target["chart"]["end"], "distance": Grid.distance(current["body"], astral_move["to"]), "reach": current["reach"], "target": unit, "recalled": target["mode"] == "recalled", "damageMultiplier": skills.damage_multiplier(current)})
						if not calculated["ok"]:
							continue
						var damage: int = mini(int(target["hp"]), maxi(0, int(calculated["value"]) - int(target["shield"])))
						var candidate: Dictionary = {"commands": commands + [{"type": "skill", "actorId": actor["id"], "skillId": skill_id, "targetId": target["id"], "target": unit}], "score": [int(damage >= target["hp"]), damage, int(unit == "body"), -steps, -distance, -int(skill["cost"])]}
						if _greater(candidate["score"], best["score"]):
							best = candidate
	return best["commands"].duplicate(true)

func plan_enemy_intent(state: Dictionary, id: String) -> Dictionary:
	var actor: Dictionary = find_actor(state, id)
	var commands: Array = plan_turn(actor_turn_view(state, id))
	var projected: Dictionary = actor_turn_view(state, id)
	for index: int in commands.size() - 1:
		var command: Dictionary = commands[index]
		var result: Dictionary = engine.apply_command(projected, command)
		if not result["ok"]:
			return {}
		if command["type"] in ["move_body", "move_astral"]:
			for event: Dictionary in result["events"]:
				if event["type"] == "move":
					command["path"] = event["path"].duplicate(true)
		projected = result["state"]
	var action: Dictionary = commands.back()
	var intent: Dictionary = {"actorId": id, "mode": state.get("intentModes", {}).get(id, "unit"), "expectedDamage": 0, "status": "ready", "commands": commands, "origin": {"body": actor["body"].duplicate(true), "astral": null if actor["astral"] == null else actor["astral"].duplicate(true)}}
	if action["type"] == "skill":
		var target: Dictionary = find_actor(state, action["targetId"])
		intent.merge({"skillId": action["skillId"], "targetId": action["targetId"], "target": action["target"], "cell": target[action["target"]].duplicate(true)})
	intent["expectedDamage"] = forecast(state, intent)
	return intent

func interruption(state: Dictionary, intent: Dictionary) -> String:
	var actor: Dictionary = find_actor(state, intent["actorId"])
	if actor.is_empty() or actor["hp"] == 0:
		return "actor_unavailable"
	if not Grid.same(actor["body"], intent["origin"]["body"]) or (actor["astral"] == null) != (intent["origin"]["astral"] == null) or (actor["astral"] != null and not Grid.same(actor["astral"], intent["origin"]["astral"])):
		return "actor_displaced"
	var projected: Dictionary = actor_turn_view(state, actor["id"])
	for command: Dictionary in intent["commands"].slice(0, -1):
		var result: Dictionary = engine.apply_command(projected, command)
		if not result["ok"]:
			return "plan_blocked"
		projected = result["state"]
	if not intent.has("skillId"):
		return ""
	var target: Dictionary = find_actor(state, intent["targetId"])
	if target.is_empty() or target["hp"] == 0 or (intent["target"] == "astral" and target["astral"] == null):
		return "target_unavailable"
	var origin: Variant = find_actor(projected, actor["id"])["astral"]
	if origin == null:
		return "actor_unavailable"
	var cell: Variant = intent["cell"] if intent["mode"] == "point" else target[intent["target"]]
	if cell == null:
		return "target_unavailable"
	var skill: Dictionary = skills.get_skill(intent["skillId"])
	var conditional: Dictionary = target if intent["mode"] == "unit" else occupant(state, actor["team"], cell).get("actor", {})
	if skill.get("consumeMarks", false) and not conditional.is_empty() and conditional.get("lampMarks", 0) == 0:
		return "skill_condition_lost"
	if Grid.distance(origin, cell) > skill["range"]:
		return "outside_skill_range"
	if not skills.line_of_sight(origin, cell, state["blocked"]).get("value", false):
		return "blocked_line_of_sight"
	return ""

func forecast(state: Dictionary, intent: Dictionary) -> int:
	var action: Dictionary = intent["commands"].back()
	if state["phase"] != "active" or action["type"] != "skill" or not interruption(state, intent).is_empty():
		return 0
	var projected: Dictionary = actor_turn_view(state, intent["actorId"])
	for command: Dictionary in intent["commands"].slice(0, -1):
		var result: Dictionary = engine.apply_command(projected, command)
		if not result["ok"]:
			return 0
		projected = result["state"]
	var command: Dictionary = action.duplicate(true)
	if intent["mode"] == "point":
		var found: Dictionary = occupant(projected, find_actor(projected, intent["actorId"])["team"], intent["cell"])
		if found.is_empty():
			return 0
		command["targetId"] = found["actor"]["id"]
		command["target"] = found["target"]
	var target: Dictionary = find_actor(projected, command["targetId"])
	if target.is_empty():
		return 0
	var result: Dictionary = engine.apply_command(projected, command)
	return maxi(0, int(target["hp"]) - int(find_actor(result["state"], target["id"])["hp"])) if result["ok"] else 0

static func occupant(state: Dictionary, team: String, cell: Dictionary) -> Dictionary:
	for actor: Dictionary in state["actors"]:
		if actor["team"] == team or actor["hp"] == 0:
			continue
		for unit: String in ["body", "astral"]:
			if actor[unit] != null and Grid.same(actor[unit], cell):
				return {"actor": actor, "target": unit}
	return {}

static func find_actor(state: Dictionary, id: Variant) -> Dictionary:
	for actor: Dictionary in state["actors"]:
		if actor["id"] == id:
			return actor
	return {}

static func _distance_to(at: Dictionary, targets: Array) -> float:
	var best: float = INF
	for target: Dictionary in targets:
		best = minf(best, Grid.distance(at, target["body"]))
		if target["astral"] != null:
			best = minf(best, Grid.distance(at, target["astral"]))
	return best

static func _greater(a: Array, b: Array) -> bool:
	for index: int in a.size():
		if a[index] != b[index]:
			return a[index] > b[index]
	return false
