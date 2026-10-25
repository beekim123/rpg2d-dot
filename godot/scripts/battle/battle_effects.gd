extends RefCounted
## Internal resolver: mutates only the engine's private transaction copy.
## A failed result makes the engine discard the entire copy and its events.
const MathRules = preload("res://scripts/battle/battle_math.gd")
const Skills = preload("res://scripts/battle/battle_skills.gd")
const Grid = preload("res://scripts/battle/battle_grid.gd")
var math: MathRules
var skills: Skills

func resolve_skill(state: Dictionary, actor: Dictionary, command: Dictionary) -> Dictionary:
	var skill: Dictionary = skills.get_skill(command.get("skillId"))
	var target: Dictionary = _find(state, command.get("targetId"))
	if skill.is_empty() or command.get("skillId") not in actor.get("skillIds", ["basic_strike"]):
		return _error("skill_unavailable")
	if actor["mode"] != "manifested" or actor["astral"] == null or actor["reach"] == 0 or Grid.distance(actor["body"], actor["astral"]) > actor["reach"]:
		return _error("astral_unavailable")
	var unit: Variant = command.get("target")
	if target.is_empty() or target["hp"] == 0 or unit not in ["body", "astral"]:
		return _error("target_unavailable")
	var position: Variant = target["body"] if unit == "body" else target["astral"]
	if position == null:
		return _error("target_unavailable")
	if (skill["effect"] == "damage") == (target["team"] == actor["team"]):
		return _error("wrong_target_team")
	if Grid.distance(actor["astral"], position) > skill["range"]:
		return _error("outside_skill_range")
	if not skills.line_of_sight(actor["astral"], position, state["blocked"]).get("value", false):
		return _error("blocked_line_of_sight")
	if actor["will"] < skill["cost"]:
		return _error("not_enough_will")
	var marks: int = int(target.get("lampMarks", 0))
	if skill.get("consumeMarks", false) and marks == 0:
		return _error("no_lamp_marks")
	var events: Array = [{"type": "skill", "actorId": actor["id"], "skillId": skill["id"], "targetId": target["id"], "target": unit, "cost": skill["cost"]}]
	actor["will"] = int(actor["will"]) - int(skill["cost"])
	if skill["effect"] == "damage":
		var power: int = int(skill["power"]) * (marks if skill.get("consumeMarks", false) else 1)
		var calculated: Dictionary = math.calculate_damage({"power": power, "attackerPower": actor["chart"]["pow"], "defenderEndurance": target["chart"]["end"], "distance": Grid.distance(actor["body"], actor["astral"]), "reach": actor["reach"], "target": unit, "recalled": target["mode"] == "recalled"})
		if not calculated["ok"]:
			return _error("numeric_overflow")
		var origin: Dictionary = actor["astral"].duplicate(true)
		settle_damage(state, actor["id"], target, unit, calculated["value"], events)
		if skill.get("consumeMarks", false):
			target["lampMarks"] = 0
			events.append({"type": "marks", "actorId": target["id"], "marks": 0})
		if skill.get("lampMarks", 0) > 0:
			target["lampMarks"] = mini(3, int(target.get("lampMarks", 0)) + int(skill["lampMarks"]))
			events.append({"type": "marks", "actorId": target["id"], "marks": target["lampMarks"]})
		if skill.get("knockback", 0) > 0:
			knockback(state, actor["id"], target, unit, origin, int(skill["knockback"]), events)
	else:
		var strength: int = int(skill["power"]) + int(floorf(float(actor["chart"]["prc"]) / float(skills.rule("precisionDivisor"))))
		if strength > MathRules.MAX_SAFE_INTEGER:
			return _error("numeric_overflow")
		if skill["effect"] == "heal":
			var amount: int = mini(int(target["maxHp"]) - int(target["hp"]), strength)
			target["hp"] = int(target["hp"]) + amount
			events.append({"type": "heal", "actorId": target["id"], "sourceId": actor["id"], "amount": amount, "hp": target["hp"]})
		else:
			var before: int = int(target["shield"])
			target["shield"] = maxi(before, strength)
			events.append({"type": "shield", "actorId": target["id"], "sourceId": actor["id"], "amount": target["shield"] - before, "shield": target["shield"]})
	return {"ok": true, "events": events, "weight": skill["weight"]}

func settle_damage(state: Dictionary, source_id: String, target: Dictionary, unit: String, amount: int, events: Array) -> void:
	var floor_value: int = int(state.get("hpFloors", {}).get(target["id"], 0))
	var impact: int = maxi(0, amount - int(target["shield"]))
	var allowed: int = mini(amount, int(target["shield"]) + maxi(0, int(target["hp"]) - floor_value))
	var result: Dictionary = math.apply_shared_damage(target, unit, allowed)["value"]
	var alive: bool = target["hp"] > 0
	target.merge(result["actor"], true)
	events.append({"type": "damage", "actorId": target["id"], "sourceId": source_id, "target": unit, "damage": result["damage"], "absorbed": result["absorbed"], "hp": target["hp"]})
	if amount > allowed and floor_value > 0:
		events.append({"type": "hp_floor", "actorId": target["id"], "prevented": amount - allowed})
	if impact > 0 and target["team"] == "enemy" and _find(state, source_id).get("team") == "player":
		var hits: Array = state["hitEnemy"].get(source_id, [])
		if target["id"] not in hits:
			hits.append(target["id"])
			state["hitEnemy"][source_id] = hits
	if alive and target["hp"] == 0:
		events.append({"type": "ko", "actorId": target["id"]})

func knockback(state: Dictionary, source_id: String, target: Dictionary, unit: String, origin: Dictionary, distance: int, events: Array) -> void:
	if target[unit] == null or target["hp"] == 0 or distance == 0:
		return
	var at: Dictionary = target[unit]
	var dx: int = int(at["x"]) - int(origin["x"])
	var dy: int = int(at["y"]) - int(origin["y"])
	var direction: Vector2i = Vector2i(signi(dx), 0) if absi(dx) >= absi(dy) else Vector2i(0, signi(dy))
	if direction == Vector2i.ZERO:
		return
	# A validated board is at most 64x64: an edge stops even enormous input distances.
	for step: int in range(mini(distance, 65)):
		var next: Dictionary = {"x": int(at["x"]) + direction.x, "y": int(at["y"]) + direction.y}
		if Grid.solid(state, next, target["id"], unit):
			var blocker: Dictionary = {}
			for other: Dictionary in state["actors"]:
				if other["hp"] > 0 and ((not (other["id"] == target["id"] and unit == "body") and Grid.same(other["body"], next)) or (other["astral"] != null and not (other["id"] == target["id"] and unit == "astral") and Grid.same(other["astral"], next))):
					blocker = other
					break
			var amount: int = skills.rule("collisionDamagePerCell") * (distance - step)
			var collision: Dictionary = {"type": "collision", "actorId": target["id"], "damage": amount, "at": next}
			if not blocker.is_empty():
				collision["otherId"] = blocker["id"]
			events.append(collision)
			settle_damage(state, source_id, target, unit, amount, events)
			if not blocker.is_empty() and blocker["id"] != target["id"]:
				settle_damage(state, source_id, blocker, "body" if Grid.same(blocker["body"], next) else "astral", amount, events)
			break
		var from: Dictionary = at.duplicate(true)
		target[unit] = next
		at = next
		events.append({"type": "knockback", "actorId": target["id"], "unit": unit, "from": from, "to": next.duplicate(true)})
	if target["hp"] > 0:
		var pull: Dictionary = Grid.pull_within_tether(state, target)
		if not pull.is_empty():
			events.append(pull)

static func _find(state: Dictionary, id: Variant) -> Dictionary:
	for actor: Dictionary in state["actors"]:
		if actor["id"] == id:
			return actor
	return {}
static func _error(reason: String) -> Dictionary:
	return {"ok": false, "error": reason}
