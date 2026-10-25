extends RefCounted
## Deterministic battle transactions; fixed intent orchestration lives above this layer.
## No scene, resource, filesystem, clock or random dependencies.
const BattleMath = preload("res://scripts/battle/battle_math.gd")
const Skills = preload("res://scripts/battle/battle_skills.gd")
const Effects = preload("res://scripts/battle/battle_effects.gd")
const Grid = preload("res://scripts/battle/battle_grid.gd")
const ASTRAL_MOVEMENT: Dictionary = {"E": 1, "D": 2, "C": 3, "B": 4, "A": 5, "S": 6}
var _math: BattleMath
var _skills: Dictionary = {}
var _skill_book: Skills
var _effects: Effects

func configure(balance: Variant, skill_data: Variant) -> String:
	var candidate: BattleMath = BattleMath.new()
	var error: String = candidate.configure(balance)
	if not error.is_empty():
		return error
	var book: Skills
	var skill_ids: Variant = skill_data
	if skill_data is Dictionary:
		book = Skills.new()
		error = book.configure(skill_data)
		if not error.is_empty():
			return error
		skill_ids = book.ids()
	# Legacy G2b ID lists remain useful for movement-only replay fixtures.
	if not skill_ids is Array:
		return "invalid_skill_ids"
	var available: Dictionary = {}
	for id: Variant in skill_ids:
		if not id is String or id.is_empty() or available.has(id):
			return "invalid_skill_ids"
		available[id] = true
	_math = candidate
	_skills = available
	_skill_book = book
	_effects = Effects.new() if book != null else null
	if _effects != null:
		_effects.math = _math
		_effects.skills = book
	return ""

func create_battle(definition: Variant) -> Dictionary:
	var error: String = _definition_error(definition)
	if not error.is_empty():
		return {"ok": false, "error": error}
	var state: Dictionary = definition.duplicate(true)
	var living: Array = state["actors"].filter(func(actor: Dictionary) -> bool: return actor["hp"] > 0)
	var ordered: Array = _math.order_timeline(living)["value"]
	var first_id: String = state["actors"][0]["id"] if ordered.is_empty() else ordered[0]["id"]
	var active: Dictionary = _find(state, first_id)
	state.merge({"phase": "active", "activeId": first_id, "turnNumber": 1, "time": active["readyAt"], "bodySpent": 0, "astralSpent": 0, "manifestUsed": false, "enemyActions": {}, "hitEnemy": {}}, true)
	state["phase"] = _outcome(state)
	if state["phase"] == "active":
		_restore_will(active)
	state["turnStart"] = active.duplicate(true)
	return {"ok": true, "state": state}

func apply_command(input: Variant, command: Variant) -> Dictionary:
	if not is_valid_state(input):
		return _invalid(input, "invalid_state")
	if input["phase"] != "active":
		return _invalid(input, "battle_finished")
	if not command is Dictionary:
		return _invalid(input, "invalid_command")
	if command.get("actorId") != input["activeId"]:
		return _invalid(input, "wrong_turn")
	var state: Dictionary = input.duplicate(true)
	var actor: Dictionary = _find(state, command["actorId"])
	if actor.is_empty() or actor["hp"] == 0:
		return _invalid(input, "actor_unavailable")
	var type: Variant = command.get("type")
	if type == "manifest":
		if actor["mode"] != "recalled" or state["manifestUsed"] or state["bodySpent"] != 0 or state["astralSpent"] != 0:
			return _invalid(input, "manifest_unavailable")
		var to: Variant = command.get("to")
		if not Grid.in_bounds(state, to) or Grid.distance(actor["body"], to) != 1 or actor["reach"] < 1 or Grid.solid(state, to, actor["id"], "astral"):
			return _invalid(input, "invalid_manifest_position")
		actor["astral"] = to.duplicate(true)
		actor["mode"] = "manifested"
		state["manifestUsed"] = true
		state["turnStart"]["body"] = actor["body"].duplicate(true)
		state["turnStart"]["astral"] = actor["astral"].duplicate(true)
		state["turnStart"]["mode"] = actor["mode"]
		return _accepted(state, [{"type": "manifest", "actorId": actor["id"], "at": actor["astral"].duplicate(true)}])
	if type in ["move_body", "move_astral"]:
		var to: Variant = command.get("to")
		if not Grid.in_bounds(state, to):
			return _invalid(input, "invalid_destination")
		var unit: String = "body" if type == "move_body" else "astral"
		if unit == "astral" and (actor["mode"] != "manifested" or actor["astral"] == null):
			return _invalid(input, "astral_unavailable")
		if unit == "astral" and Grid.distance(to, actor["body"]) > actor["reach"]:
			return _invalid(input, "outside_tether")
		var spent_key: String = "bodySpent" if unit == "body" else "astralSpent"
		var path: Array = Grid.fixed_path(state, actor, unit, to, _allowance(actor, unit) - int(state[spent_key]), command["path"]) if command.has("path") else Grid.path_to(state, actor, unit, to, _allowance(actor, unit) - int(state[spent_key]))
		if path.is_empty():
			return _invalid(input, "unreachable")
		var from: Dictionary = actor[unit].duplicate(true)
		actor[unit] = to.duplicate(true)
		state[spent_key] = int(state[spent_key]) + path.size() - 1
		var events: Array = [{"type": "move", "actorId": actor["id"], "unit": unit, "from": from, "to": to.duplicate(true), "path": path}]
		if unit == "body":
			var pull: Dictionary = Grid.pull_within_tether(state, actor)
			if not pull.is_empty():
				events.append(pull)
		return _accepted(state, events)
	if type == "undo":
		actor["body"] = state["turnStart"]["body"].duplicate(true)
		actor["astral"] = null if state["turnStart"]["astral"] == null else state["turnStart"]["astral"].duplicate(true)
		actor["mode"] = state["turnStart"]["mode"]
		state["bodySpent"] = 0
		state["astralSpent"] = 0
		return _accepted(state, [{"type": "undo", "actorId": actor["id"]}])
	if type == "wait":
		return _finish_action(input, state, actor, "light", [])
	if type == "recall":
		if actor["mode"] != "manifested" or actor["astral"] == null:
			return _invalid(input, "astral_unavailable")
		actor["mode"] = "recalled"
		actor["astral"] = null
		return _finish_action(input, state, actor, "light", [{"type": "recall", "actorId": actor["id"]}])
	if type in ["item", "cheer"]:
		if _skill_book == null:
			return _invalid(input, "support_unavailable")
		var supported: Dictionary = _skill_book.support_action(state, actor, command)
		if not supported["ok"]:
			return _invalid(input, supported["error"])
		return _finish_action(input, state, actor, supported["weight"], supported["events"])
	if type in ["guard", "skill", "cancelled_skill"] and _skill_book == null:
		return _invalid(input, "skill_data_unavailable")
	if type == "guard":
		var before: int = int(actor["shield"])
		actor["shield"] = maxi(before, _skill_book.rule("guardShield"))
		return _finish_action(input, state, actor, "normal", [{"type": "shield", "actorId": actor["id"], "sourceId": actor["id"], "amount": actor["shield"] - before, "shield": actor["shield"]}])
	if type == "skill":
		var resolved: Dictionary = _effects.resolve_skill(state, actor, command)
		if not resolved["ok"]:
			return _invalid(input, resolved["error"])
		return _finish_action(input, state, actor, resolved["weight"], resolved["events"])
	if type == "cancelled_skill":
		var skill: Dictionary = _skill_book.get_skill(command.get("skillId"))
		if actor["team"] != "enemy" or skill.is_empty() or skill["effect"] != "damage" or skill["id"] not in actor.get("skillIds", ["basic_strike"]):
			return _invalid(input, "skill_unavailable")
		if actor["will"] < skill["cost"]:
			return _invalid(input, "not_enough_will")
		if command.get("outcome") not in ["miss", "interrupted"] or command.get("reason") not in ["actor_displaced", "actor_unavailable", "plan_blocked", "target_unavailable", "outside_skill_range", "blocked_line_of_sight", "empty_cell", "skill_condition_lost"]:
			return _invalid(input, "invalid_cancellation")
		actor["will"] = int(actor["will"]) - int(skill["cost"])
		return _finish_action(input, state, actor, skill["weight"], [{"type": "cancelled_skill", "actorId": actor["id"], "skillId": skill["id"], "cost": skill["cost"], "outcome": command["outcome"], "reason": command["reason"]}])
	return _invalid(input, "unknown_command")

func reachable_moves(state: Variant, unit: Variant) -> Array:
	if unit not in ["body", "astral"] or not is_valid_state(state) or state["phase"] != "active":
		return []
	var actor: Dictionary = _find(state, state["activeId"])
	if actor.is_empty() or actor["hp"] == 0:
		return []
	var spent: int = int(state["bodySpent"] if unit == "body" else state["astralSpent"])
	return Grid.reachable(state, actor, unit, _allowance(actor, unit) - spent)

func _finish_action(input: Dictionary, state: Dictionary, actor: Dictionary, weight: String, events: Array) -> Dictionary:
	if actor["hp"] > 0:
		var schedule: Dictionary = _math.reschedule_actor(actor, weight)
		if not schedule["ok"]:
			return _invalid(input, "numeric_overflow")
		actor.merge(schedule["value"], true)
	if actor["team"] == "enemy":
		var count: int = int(state["enemyActions"].get(actor["id"], 0))
		if count >= BattleMath.MAX_SAFE_INTEGER:
			return _invalid(input, "numeric_overflow")
		state["enemyActions"][actor["id"]] = count + 1
	state["phase"] = _outcome(state)
	if state["phase"] != "active":
		events.append({"type": "outcome", "phase": state["phase"]})
		return _accepted(state, events)
	if int(state["turnNumber"]) >= BattleMath.MAX_SAFE_INTEGER:
		return _invalid(input, "numeric_overflow")
	var living: Array = state["actors"].filter(func(item: Dictionary) -> bool: return item["hp"] > 0)
	var next_id: String = _math.order_timeline(living)["value"][0]["id"]
	var next: Dictionary = _find(state, next_id)
	_restore_will(next)
	state.merge({"activeId": next_id, "time": next["readyAt"], "turnNumber": int(state["turnNumber"]) + 1, "turnStart": next.duplicate(true), "bodySpent": 0, "astralSpent": 0, "manifestUsed": false}, true)
	events.append({"type": "turn", "actorId": next_id, "time": next["readyAt"]})
	return _accepted(state, events)

func _definition_error(board: Variant) -> String:
	if _math == null or not board is Dictionary or not board.get("id") is String or board["id"].is_empty() or not _integer(board.get("width"), 1, 64) or not _integer(board.get("height"), 1, 64):
		return "invalid_board"
	if not board.get("actors") is Array or board["actors"].is_empty() or not board.get("blocked") is Array:
		return "invalid_board_arrays"
	for wall: Variant in board["blocked"]:
		if not Grid.in_bounds(board, wall):
			return "invalid_blocked_cell"
	var ids: Dictionary = {}
	var occupied: Dictionary = {}
	for actor: Variant in board["actors"]:
		if not _math.validate_actor(actor)["ok"]:
			return "invalid_actor"
		if ids.has(actor["id"]) or actor["kind"] not in ["close", "remote", "starless"]:
			return "invalid_g2_actor"
		ids[actor["id"]] = true
		for skill: String in actor.get("skillIds", []):
			if not _skills.has(skill):
				return "unknown_actor_skill"
		if not Grid.in_bounds(board, actor["body"]) or _wall_at(board, actor["body"]):
			return "invalid_body_position"
		if actor["hp"] == 0:
			continue
		if actor["mode"] not in (["absent"] if actor["kind"] == "starless" else ["manifested", "recalled"]):
			return "invalid_manifestation"
		if actor["astral"] != null and (actor["reach"] == 0 or Grid.distance(actor["body"], actor["astral"]) > actor["reach"]):
			return "invalid_tether"
		for point: Variant in [actor["body"], actor["astral"]]:
			if point == null:
				continue
			if not Grid.in_bounds(board, point) or _wall_at(board, point):
				return "invalid_actor_position"
			var key: Vector2i = Vector2i(int(point["x"]), int(point["y"]))
			if occupied.has(key):
				return "colliding_actors"
			occupied[key] = true
	if board.has("inventory") and (_skill_book == null or not _skill_book.valid_inventory(board["inventory"])):
		return "invalid_inventory"
	for actor: Dictionary in board["actors"]:
		if actor.get("cheered", false) and (_skill_book == null or not _skill_book.has_support()):
			return "support_unavailable"
	return _goal_error(board)

func _goal_error(board: Dictionary) -> String:
	if board.has("goal"):
		var goal: Variant = board["goal"]
		if not goal is Dictionary or goal.get("kind") != "survive_and_hit" or not _integer(goal.get("enemyActions"), 1):
			return "invalid_goal"
		if _find(board, goal.get("actorId")).get("team") != "player" or _find(board, goal.get("enemyId")).get("team") != "enemy":
			return "invalid_goal_actor"
	if board.has("hpFloors"):
		if not board.has("goal") or not board["hpFloors"] is Dictionary:
			return "invalid_hp_floors"
		for id: Variant in board["hpFloors"]:
			var actor: Dictionary = _find(board, id)
			var floor_value: Variant = board["hpFloors"][id]
			if id != board["goal"]["enemyId"] or actor.is_empty() or not _integer(floor_value, 1, int(actor["maxHp"]) - 1) or actor["hp"] < floor_value:
				return "invalid_hp_floor"
	if board.has("intentModes"):
		if not board["intentModes"] is Dictionary:
			return "invalid_intent_modes"
		for id: Variant in board["intentModes"]:
			if _find(board, id).get("team") != "enemy" or board["intentModes"][id] not in ["point", "unit"]:
				return "invalid_intent_mode"
	return ""

func is_valid_state(state: Variant) -> bool:
	if not _definition_error(state).is_empty() or state.get("phase") not in ["active", "won", "lost"] or _find(state, state.get("activeId")).is_empty():
		return false
	if not _integer(state.get("turnNumber"), 1) or not _integer(state.get("time")) or not _integer(state.get("bodySpent"), 0, 3) or not _integer(state.get("astralSpent"), 0, 6) or not state.get("manifestUsed") is bool:
		return false
	if not _math.validate_actor(state.get("turnStart"))["ok"] or state["turnStart"]["id"] != state["activeId"]:
		return false
	if state["phase"] == "active":
		# Undo is a transaction too: its snapshot must be legal against the other units.
		var origin_board: Dictionary = state.duplicate(true)
		for index: int in origin_board["actors"].size():
			if origin_board["actors"][index]["id"] == state["activeId"]:
				var restored: Dictionary = origin_board["actors"][index]
				for key: String in ["body", "astral", "mode"]:
					var value: Variant = state["turnStart"][key]
					restored[key] = value.duplicate(true) if value is Dictionary else value
		if not _definition_error(origin_board).is_empty():
			return false
	var active: Dictionary = _find(state, state["activeId"])
	if state["astralSpent"] > _allowance(active, "astral") or (state["phase"] == "active" and active["hp"] == 0):
		return false
	if not state.get("enemyActions") is Dictionary or not state.get("hitEnemy") is Dictionary:
		return false
	for id: Variant in state["enemyActions"]:
		if _find(state, id).get("team") != "enemy" or not _integer(state["enemyActions"][id]):
			return false
	for id: Variant in state["hitEnemy"]:
		if _find(state, id).get("team") != "player" or not state["hitEnemy"][id] is Array:
			return false
		for enemy_id: Variant in state["hitEnemy"][id]:
			if _find(state, enemy_id).get("team") != "enemy":
				return false
	return true

func _allowance(actor: Dictionary, unit: String) -> int:
	return 3 if unit == "body" else int(ASTRAL_MOVEMENT[_math.rating(actor["chart"]["spd"])["value"]])

static func _outcome(state: Dictionary) -> String:
	if not state["actors"].any(func(actor: Dictionary) -> bool: return actor["team"] == "player" and actor["hp"] > 0):
		return "lost"
	if state.has("goal"):
		var goal: Dictionary = state["goal"]
		var actor: Dictionary = _find(state, goal["actorId"])
		var enemy: Dictionary = _find(state, goal["enemyId"])
		if actor["hp"] == 0:
			return "lost"
		if state["enemyActions"].get(enemy["id"], 0) >= goal["enemyActions"] and enemy["id"] in state["hitEnemy"].get(actor["id"], []):
			return "won"
		return "lost" if enemy["hp"] == 0 else "active"
	return "active" if state["actors"].any(func(actor: Dictionary) -> bool: return actor["team"] == "enemy" and actor["hp"] > 0) else "won"

static func _find(state: Dictionary, id: Variant) -> Dictionary:
	for actor: Dictionary in state["actors"]:
		if actor["id"] == id:
			return actor
	return {}

static func _wall_at(board: Dictionary, point: Dictionary) -> bool:
	return board["blocked"].any(func(wall: Dictionary) -> bool: return Grid.same(wall, point))

static func _restore_will(actor: Dictionary) -> void:
	if actor["kind"] == "starless":
		return
	actor["will"] = mini(int(actor["maxWill"]), int(actor["will"]) + (4 if actor["mode"] == "recalled" else 2))

static func _integer(value: Variant, minimum: int = 0, maximum: int = BattleMath.MAX_SAFE_INTEGER) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) == floorf(float(value)) and value >= minimum and value <= maximum

static func _accepted(state: Dictionary, events: Array) -> Dictionary:
	return {"ok": true, "state": state, "events": events}

static func _invalid(state: Variant, reason: String) -> Dictionary:
	return {"ok": false, "state": state.duplicate(true) if state is Dictionary else state, "events": [{"type": "invalid", "reason": reason}]}
