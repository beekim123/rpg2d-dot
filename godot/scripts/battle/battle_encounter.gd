extends RefCounted
## Public pure encounter boundary: only player commands enter; enemies execute frozen plans.
const EngineRules = preload("res://scripts/battle/battle_engine.gd")
const Planner = preload("res://scripts/battle/battle_ai.gd")
const Grid = preload("res://scripts/battle/battle_grid.gd")
const Skills = preload("res://scripts/battle/battle_skills.gd")
const REASONS: Array[String] = ["actor_displaced", "actor_unavailable", "plan_blocked", "target_unavailable", "outside_skill_range", "blocked_line_of_sight", "empty_cell", "skill_condition_lost"]
var _engine: EngineRules
var _planner: Planner

func configure(balance: Variant, skills: Variant) -> String:
	if not balance is Dictionary or not skills is Dictionary:
		return "invalid_encounter_rules"
	var candidate: EngineRules = EngineRules.new()
	var error: String = candidate.configure(balance, skills)
	if not error.is_empty():
		return error
	var planner: Planner = Planner.new()
	planner.configure(candidate, balance, skills)
	_engine = candidate
	_planner = planner
	return ""

func create_encounter(definition: Variant) -> Dictionary:
	if _engine == null:
		return {"ok": false, "error": "unconfigured_encounter"}
	var made: Dictionary = _engine.create_battle(definition)
	if not made["ok"]:
		return made
	var state: Dictionary = made["state"]
	var intents: Dictionary = {}
	if state["phase"] == "active":
		for actor: Dictionary in state["actors"]:
			if actor["team"] == "enemy" and actor["hp"] > 0:
				var intent: Dictionary = _planner.plan_enemy_intent(state, actor["id"])
				if intent.is_empty():
					return {"ok": false, "error": "invalid_intent_plan"}
				intents[actor["id"]] = intent
	return {"ok": true, "encounter": {"battle": state, "intents": intents}}

func command_encounter(input: Variant, command: Variant) -> Dictionary:
	if not _valid_encounter(input):
		return _invalid(input, "invalid_encounter")
	if not command is Dictionary:
		return _invalid(input, "player_command_required")
	var actor: Dictionary = Planner.find_actor(input["battle"], command.get("actorId"))
	if actor.is_empty() or actor["team"] != "player" or command.get("type") == "cancelled_skill":
		return _invalid(input, "player_command_required")
	var result: Dictionary = _engine.apply_command(input["battle"], command)
	if not result["ok"]:
		return {"ok": false, "encounter": input.duplicate(true), "events": result["events"]}
	return {"ok": true, "encounter": _refresh(result["state"], input["intents"], result["events"]), "events": result["events"]}

func advance_enemy(input: Variant) -> Dictionary:
	if not _valid_encounter(input):
		return _invalid(input, "invalid_encounter")
	var state: Dictionary = input["battle"]
	var actor: Dictionary = Planner.find_actor(state, state["activeId"])
	if state["phase"] != "active" or actor.is_empty() or actor["team"] != "enemy":
		return _invalid(input, "enemy_turn_required")
	var intent: Dictionary = input["intents"].get(actor["id"], {})
	if intent.is_empty():
		return _invalid(input, "intent_unavailable")
	var reason: String = _planner.interruption(state, intent)
	var battle: Dictionary = state
	var events: Array = []
	if reason.is_empty():
		for command: Dictionary in intent["commands"].slice(0, -1):
			var moved: Dictionary = _engine.apply_command(battle, command)
			if not moved["ok"]:
				return _invalid(input, "invalid_intent_plan")
			battle = moved["state"]
			events.append_array(moved["events"])
	var command: Dictionary = intent["commands"].back().duplicate(true)
	if intent.has("skillId"):
		if not reason.is_empty():
			command = {"type": "cancelled_skill", "actorId": actor["id"], "skillId": intent["skillId"], "outcome": "interrupted", "reason": reason}
		elif intent["mode"] == "point":
			var found: Dictionary = Planner.occupant(battle, actor["team"], intent["cell"])
			command = {"type": "skill", "actorId": actor["id"], "skillId": intent["skillId"], "targetId": found["actor"]["id"], "target": found["target"]} if not found.is_empty() else {"type": "cancelled_skill", "actorId": actor["id"], "skillId": intent["skillId"], "outcome": "miss", "reason": "empty_cell"}
	var result: Dictionary = _engine.apply_command(battle, command)
	if not result["ok"]:
		return {"ok": false, "encounter": input.duplicate(true), "events": result["events"]}
	battle = result["state"]
	events.append_array(result["events"])
	var intents: Dictionary = input["intents"].duplicate(true)
	if battle["phase"] == "active" and Planner.find_actor(battle, actor["id"])["hp"] > 0:
		var next_intent: Dictionary = _planner.plan_enemy_intent(battle, actor["id"])
		if next_intent.is_empty():
			return _invalid(input, "invalid_intent_plan")
		intents[actor["id"]] = next_intent
	else:
		intents.erase(actor["id"])
	return {"ok": true, "encounter": _refresh(battle, intents, events), "events": events}

func plan_player_turn(input: Variant) -> Array:
	if not _valid_encounter(input) or input["battle"]["phase"] != "active":
		return []
	var state: Dictionary = input["battle"]
	var actor: Dictionary = Planner.find_actor(state, state["activeId"])
	if actor["team"] != "player":
		return []
	if state.has("goal") and actor["id"] == state["goal"]["actorId"] and state["goal"]["enemyId"] in state["hitEnemy"].get(actor["id"], []):
		return [{"type": "guard", "actorId": actor["id"]}]
	return _planner.plan_turn(state)

func _refresh(state: Dictionary, input: Dictionary, events: Array) -> Dictionary:
	var intents: Dictionary = {}
	for id: String in _record_keys(input):
		var intent: Dictionary = input[id].duplicate(true)
		var reason: String = _planner.interruption(state, intent)
		var status: String = "ready" if reason.is_empty() else "interrupted"
		var changed: bool = status != intent["status"] or reason != intent.get("reason", "")
		intent["status"] = status
		intent["expectedDamage"] = _planner.forecast(state, intent) if reason.is_empty() else 0
		intent.erase("reason")
		if not reason.is_empty():
			intent["reason"] = reason
		intents[id] = intent
		if changed:
			var event: Dictionary = {"type": "intent_status", "actorId": id, "status": status}
			if not reason.is_empty():
				event["reason"] = reason
			events.append(event)
	return {"battle": state, "intents": intents}

func _valid_encounter(input: Variant) -> bool:
	if _engine == null or not input is Dictionary or not _engine.is_valid_state(input.get("battle")) or not input.get("intents") is Dictionary:
		return false
	var state: Dictionary = input["battle"]
	for id: Variant in input["intents"]:
		if not id is String or Planner.find_actor(state, id).get("team") != "enemy" or not _valid_intent(state, id, input["intents"][id]):
			return false
	if state["phase"] == "active":
		for actor: Dictionary in state["actors"]:
			if actor["hp"] > 0 and actor["team"] == "enemy" and not input["intents"].has(actor["id"]):
				return false
	return true

func _valid_intent(state: Dictionary, id: String, intent: Variant) -> bool:
	if not intent is Dictionary or intent.get("actorId") != id or intent.get("mode") not in ["unit", "point"] or intent.get("status") not in ["ready", "interrupted"] or not Skills._integer(intent.get("expectedDamage")):
		return false
	if intent["status"] == "interrupted" and (not intent.get("reason") is String or intent["reason"] not in REASONS):
		return false
	if not intent.get("origin") is Dictionary or not Grid.in_bounds(state, intent["origin"].get("body")) or not intent["origin"].has("astral"):
		return false
	if intent["origin"]["astral"] != null and not Grid.in_bounds(state, intent["origin"]["astral"]):
		return false
	if not intent.get("commands") is Array or intent["commands"].is_empty() or intent["commands"].size() > 4:
		return false
	for index: int in intent["commands"].size():
		var command: Variant = intent["commands"][index]
		if not command is Dictionary or command.get("actorId") != id:
			return false
		if index < intent["commands"].size() - 1 and (command.get("type") not in ["manifest", "move_body", "move_astral"] or not Grid.in_bounds(state, command.get("to"))):
			return false
		if index < intent["commands"].size() - 1 and command["type"] in ["move_body", "move_astral"]:
			if not command.get("path") is Array or command["path"].is_empty() or command["path"].size() > 7:
				return false
			for point: Variant in command["path"]:
				if not Grid.in_bounds(state, point):
					return false
	var action: Dictionary = intent["commands"].back()
	if not intent.has("skillId"):
		return action.get("type") == "wait"
	var skill: Dictionary = _planner.skills.get_skill(intent["skillId"])
	var owner: Dictionary = Planner.find_actor(state, id)
	var target: Dictionary = Planner.find_actor(state, intent.get("targetId"))
	if skill.get("effect") != "damage" or intent["skillId"] not in owner.get("skillIds", ["basic_strike"]) or target.is_empty() or target["team"] == owner["team"]:
		return false
	return action.get("type") == "skill" and action.get("skillId") == intent["skillId"] and action.get("targetId") == intent.get("targetId") and action.get("target") == intent.get("target") and intent.get("target") in ["body", "astral"] and not Planner.find_actor(state, intent.get("targetId")).is_empty() and Grid.in_bounds(state, intent.get("cell"))

static func _record_keys(record: Dictionary) -> Array:
	# JS object iteration puts canonical array-index IDs first; preserve other insertion order.
	var keys: Array = record.keys()
	var positions: Dictionary = {}
	for index: int in keys.size():
		positions[keys[index]] = index
	keys.sort_custom(func(a: String, b: String) -> bool:
		var ai: bool = a.length() <= 10 and a.is_valid_int() and str(int(a)) == a and int(a) >= 0 and int(a) < 4294967295
		var bi: bool = b.length() <= 10 and b.is_valid_int() and str(int(b)) == b and int(b) >= 0 and int(b) < 4294967295
		return int(a) < int(b) if ai and bi else ai if ai != bi else positions[a] < positions[b])
	return keys

static func _invalid(input: Variant, reason: String) -> Dictionary:
	return {"ok": false, "encounter": input.duplicate(true) if input is Dictionary else input, "events": [{"type": "invalid", "reason": reason}]}
