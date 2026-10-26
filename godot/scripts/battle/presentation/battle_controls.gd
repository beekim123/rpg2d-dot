extends RefCounted
## UI selection state. Every confirmed action still enters the normal pure battle API.
const Session = preload("res://scripts/battle/battle_session.gd")
const Rules = preload("res://scripts/battle/battle_engine.gd")
var mode: String = "command"
var cursor: Vector2i = Vector2i.ZERO
var last_error: String = ""
var _session: Session = Session.new()
var _rules: Rules = Rules.new()
var _prepared: Dictionary = {}
var _pending: Dictionary = {}
var _skills: Dictionary = {}
var _fatal: bool = false
func setup(prepared: Dictionary) -> bool:
	if not prepared.get("ok", false):
		return false
	_prepared = prepared.duplicate(true)
	if not _session.configure(prepared["balance"], prepared["skills"]).is_empty() or not _rules.configure(prepared["balance"], prepared["skills"]).is_empty():
		return false
	for skill: Dictionary in prepared["skills"]["skills"]:
		_skills[skill["id"]] = skill.duplicate(true)
	if not _session.start(prepared["definition"])["ok"]:
		return false
	_reset_ui()
	return true
func snapshot() -> Dictionary:
	return _session.snapshot()
func session_handle() -> Session:
	return _session
func active_actor() -> Dictionary:
	var state: Dictionary = snapshot()["battle"]
	if state["phase"] != "active":
		for actor: Dictionary in state["actors"]:
			if actor["team"] == "player":
				return actor
	return _find(state, state["activeId"])
func options() -> Array:
	var state: Dictionary = snapshot()["battle"]
	if state["phase"] != "active" or _fatal:
		if _prepared.get("story_mode",false) and state["phase"] == "won":
			return [{"id":"return","label":"prologue.ui.choice.continue","enabled":true}]
		var terminal: Array = [{"id": "retry", "label": "battle.outcome.retry", "enabled": true}, {"id": "return", "label": "battle.outcome.return", "enabled": true}]
		if _prepared.get("story_mode",false):
			terminal[1]["label"] = "prologue.ui.choice.return_checkpoint"
		if state["phase"] == "won":
			terminal.reverse()
		return terminal
	var actor: Dictionary = active_actor()
	if actor["team"] != "player":
		return []
	var result: Array = []
	if mode == "skills":
		for id: String in actor.get("skillIds", ["basic_strike"]):
			result.append({"id": "skill:" + id, "label": "battle.skill." + id, "enabled": actor["will"] >= _skills[id]["cost"]})
		result.append({"id": "back", "label": "battle.back", "enabled": true})
		return result
	if mode == "items":
		for entry: Dictionary in _prepared["skills"].get("support", {}).get("items", []):
			var count: int = int(state.get("inventory", {}).get(entry["id"], 0))
			result.append({"id": "item:" + entry["id"], "label": "battle.item." + entry["id"], "count": count, "enabled": count > 0})
		result.append({"id": "back", "label": "battle.back", "enabled": true})
		return result
	if mode in ["move_body", "move_astral", "manifest", "target"]:
		return [{"id": "confirm", "label": "battle.confirm", "enabled": true}, {"id": "back", "label": "battle.back", "enabled": true}]
	var ids: Array[String] = ["move_body", "move_astral", "skills", "guard", "recall" if actor["mode"] == "manifested" else "manifest", "items", "cheer", "undo", "wait"]
	if actor["kind"] == "starless":
		ids = ["move_body", "items", "cheer", "guard", "undo", "wait"]
	for id: String in ids:
		var enabled: bool = true
		if id == "move_body":
			enabled = _rules.reachable_moves(state, "body").size() > 1
		elif id == "move_astral":
			enabled = actor["mode"] == "manifested" and _rules.reachable_moves(state, "astral").size() > 1
		elif id == "skills":
			enabled = actor["mode"] == "manifested" and not actor.get("skillIds", ["basic_strike"]).is_empty()
		elif id == "manifest":
			enabled = actor["mode"] == "recalled" and not state["manifestUsed"] and state["bodySpent"] == 0 and state["astralSpent"] == 0
		elif id == "undo":
			enabled = state["bodySpent"] > 0 or state["astralSpent"] > 0
		elif id == "cheer":
			enabled = state["actors"].any(func(other: Dictionary) -> bool: return other["team"] == actor["team"] and other["id"] != actor["id"] and other["kind"] != "starless" and other["hp"] > 0 and not other.get("cheered", false))
		elif id == "items":
			enabled = state.get("inventory", {}).values().any(func(count: Variant) -> bool: return count > 0)
		result.append({"id": id, "label": "battle.command." + id, "enabled": enabled})
	return result
func choose(id: String) -> Dictionary:
	var selected: Array = options().filter(func(o: Dictionary) -> bool: return o["id"] == id and o["enabled"])
	if selected.is_empty():
		return _reject("unknown_command")
	last_error = ""
	if id == "return":
		return {"ok": true, "leave": true}
	if id == "retry":
		var result: Dictionary = _session.retry() if snapshot()["battle"]["phase"] == "lost" else _session.start(_prepared["definition"])
		if result["ok"]:
			_fatal = false
			_reset_ui()
			result["reset"] = true
		return result
	if id == "back":
		return cancel()
	if id == "confirm":
		return confirm()
	if id in ["skills", "items"]:
		mode = id
		return {"ok": true}
	if id.begins_with("skill:") or id.begins_with("item:") or id == "cheer":
		mode = "target"
		_pending = {"type": "cheer"} if id == "cheer" else {"type": "skill", "skillId": id.trim_prefix("skill:")} if id.begins_with("skill:") else {"type": "item", "itemId": id.trim_prefix("item:")}
		_select_default_target()
		return {"ok": true}
	if id in ["move_body", "move_astral", "manifest"]:
		mode = id
		var point: Dictionary = active_actor()["astral"] if id == "move_astral" else active_actor()["body"]
		cursor = Vector2i(int(point["x"]), int(point["y"]))
		return {"ok": true}
	return submit({"type": id, "actorId": snapshot()["battle"]["activeId"]})
func set_cursor(cell: Vector2i) -> void:
	var state: Dictionary = snapshot()["battle"]
	cursor = Vector2i(clampi(cell.x, 0, int(state["width"]) - 1), clampi(cell.y, 0, int(state["height"]) - 1))
	last_error = ""
func confirm() -> Dictionary:
	if mode not in ["move_body", "move_astral", "manifest", "target"]:
		return _reject("unknown_command")
	return submit(_command_at(cursor))
func cancel() -> Dictionary:
	last_error = ""
	if mode == "target":
		mode = "skills" if _pending.get("type") == "skill" else "items" if _pending.get("type") == "item" else "command"
	elif mode == "command":
		var state: Dictionary = snapshot()["battle"]
		if state["phase"] == "active" and (state["bodySpent"] > 0 or state["astralSpent"] > 0):
			return submit({"type": "undo", "actorId": state["activeId"]})
	else:
		mode = "command"
	return {"ok": true}
func submit(command: Dictionary) -> Dictionary:
	var result: Dictionary = _session.command(command)
	if result["ok"]:
		_reset_ui()
		result["acted"] = true
	else:
		last_error = _reason(result)
	return result
func advance_enemy() -> Dictionary:
	var result: Dictionary = _session.advance_enemy()
	if result["ok"]:
		_reset_ui()
		result["acted"] = true
	else:
		last_error = _reason(result)
		_fatal = true
	return result
func preview() -> Dictionary:
	if mode not in ["move_body", "move_astral", "manifest", "target"]:
		return {}
	var state: Dictionary = snapshot()["battle"]
	var command: Dictionary = _command_at(cursor)
	var result: Dictionary = _rules.apply_command(state, command)
	if not result["ok"]:
		return {"ok": false, "error": _reason(result)}
	var summary: Dictionary = {"ok": true, "type": command["type"], "to": {"x": cursor.x, "y": cursor.y}}
	if command["type"] == "skill":
		summary["effect"] = _skills[command["skillId"]]["effect"]
	elif command["type"] == "item":
		for item: Dictionary in _prepared["skills"]["support"]["items"]:
			if item["id"] == command["itemId"]:
				summary["effect"] = item["effect"]
	if command.has("targetId"):
		var before: Dictionary = _find(state, command["targetId"])
		var after: Dictionary = _find(result["state"], command["targetId"])
		summary.merge({"targetId": command["targetId"], "target": command.get("target", "body"), "damage": maxi(0, int(before["hp"]) - int(after["hp"])), "heal": maxi(0, int(after["hp"]) - int(before["hp"])), "shield": maxi(0, int(after["shield"]) - int(before["shield"])), "will": 0})
		for event: Dictionary in result["events"]:
			if event["type"] == "will" and event["actorId"] == command["targetId"]:
				summary["will"] += int(event["amount"])
	return summary
func legal_cells() -> Array:
	var state: Dictionary = snapshot()["battle"]
	if mode in ["move_body", "move_astral"]:
		return _rules.reachable_moves(state, "body" if mode == "move_body" else "astral").map(func(m: Dictionary) -> Dictionary: return m["to"])
	var cells: Array = []
	var candidates: Array[Vector2i] = []
	if mode == "manifest":
		var body: Dictionary = active_actor()["body"]
		for direction: Vector2i in [Vector2i.UP, Vector2i.LEFT, Vector2i.RIGHT, Vector2i.DOWN]:
			candidates.append(Vector2i(int(body["x"]), int(body["y"])) + direction)
	elif mode == "target":
		for actor: Dictionary in state["actors"]:
			if actor["hp"] == 0:
				continue
			for unit: String in (["body", "astral"] if _pending["type"] == "skill" else ["body"]):
				var point: Variant = actor[unit]
				if point != null:
					candidates.append(Vector2i(int(point["x"]), int(point["y"])))
	for point: Vector2i in candidates:
		if _rules.apply_command(state, _command_at(point))["ok"]:
			cells.append({"x": point.x, "y": point.y})
	return cells
func hint_key() -> String:
	if not last_error.is_empty():
		return "battle.error." + last_error
	if snapshot()["battle"]["phase"] != "active":
		return "battle.result." + snapshot()["battle"]["phase"]
	if active_actor()["team"] == "enemy":
		return "battle.prompt.enemy"
	if mode == "target":
		return "battle.prompt.item" if _pending.get("type") == "item" else "battle.prompt.cheer" if _pending.get("type") == "cheer" else "battle.prompt.target"
	return "battle.prompt." + mode
func selection() -> Dictionary:
	return _pending.duplicate(true)
func selected_skill() -> String:
	return String(_pending.get("skillId", ""))
func _command_at(cell: Vector2i) -> Dictionary:
	var state: Dictionary = snapshot()["battle"]
	if mode != "target":
		return {"type": mode, "actorId": state["activeId"], "to": {"x": cell.x, "y": cell.y}}
	var command: Dictionary = _pending.duplicate(true)
	command["actorId"] = state["activeId"]
	command["targetId"] = ""
	if command["type"] == "skill":
		command["target"] = "body"
	for actor: Dictionary in state["actors"]:
		if actor["hp"] == 0:
			continue
		for unit: String in (["body", "astral"] if command["type"] == "skill" else ["body"]):
			var point: Variant = actor[unit]
			if point != null and point["x"] == cell.x and point["y"] == cell.y:
				command["targetId"] = actor["id"]
				if command["type"] == "skill":
					command["target"] = unit
				return command
	return command
func _select_default_target() -> void:
	var actor: Dictionary = active_actor()
	var friendly: bool = _pending["type"] != "skill" or _skills[_pending["skillId"]]["effect"] != "damage"
	for target: Dictionary in snapshot()["battle"]["actors"]:
		if target["hp"] > 0 and (target["team"] == actor["team"]) == friendly and (_pending["type"] != "cheer" or target["id"] != actor["id"]):
			cursor = Vector2i(int(target["body"]["x"]), int(target["body"]["y"]))
			return
func _reset_ui() -> void:
	mode = "command"
	_pending = {}
	last_error = ""
	var actor: Dictionary = active_actor()
	cursor = Vector2i(int(actor["body"]["x"]), int(actor["body"]["y"]))
func _reject(reason: String) -> Dictionary:
	last_error = reason
	return {"ok": false, "error": reason}
static func _find(state: Dictionary, id: String) -> Dictionary:
	for actor: Dictionary in state["actors"]:
		if actor["id"] == id:
			return actor
	return {}
static func _reason(result: Dictionary) -> String:
	return String(result.get("error", result.get("events", [{}])[0].get("reason", "unknown_command")))
