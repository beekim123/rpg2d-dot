extends RefCounted
## Body items and one-use encouragement, independent of companion skills and scenes.
const MathRules = preload("res://scripts/battle/battle_math.gd")
const Grid = preload("res://scripts/battle/battle_grid.gd")
var _rules: Dictionary = {}
var _items: Dictionary = {}
func configure(data: Variant) -> String:
	if not data is Dictionary or not data.get("rules") is Dictionary or not data.get("items") is Array:
		return "invalid_support_data"
	var rules: Dictionary = data["rules"]
	var multiplier: Variant = rules.get("cheerMultiplier")
	if not (multiplier is int or multiplier is float) or not is_finite(float(multiplier)) or multiplier <= 1 or multiplier > 2:
		return "invalid_cheer_multiplier"
	if not MathRules._integer(rules.get("cheerRange"), 1, 63) or not MathRules._integer(rules.get("inventoryLimit"), 1, 9) or rules.get("cheerWeight") not in ["light", "normal", "heavy"]:
		return "invalid_support_rules"
	var items: Dictionary = {}
	for entry: Variant in data["items"]:
		if not entry is Dictionary or not MathRules._skill_id(entry.get("id")) or items.has(entry["id"]):
			return "invalid_item_id"
		if entry.get("effect") not in ["heal", "will"] or not MathRules._integer(entry.get("amount"), 1) or not MathRules._integer(entry.get("range"), 0, 63) or entry.get("weight") not in ["light", "normal", "heavy"]:
			return "invalid_item_effect"
		items[entry["id"]] = entry.duplicate(true)
	_rules = rules.duplicate(true)
	_items = items
	return ""
func item_ids() -> Array:
	return _items.keys()
func multiplier() -> float:
	return float(_rules.get("cheerMultiplier", 1))
func valid_inventory(inventory: Variant) -> bool:
	if not inventory is Dictionary:
		return false
	for id: Variant in inventory:
		if not id is String or not _items.has(id) or not MathRules._integer(inventory[id], 0, _rules["inventoryLimit"]):
			return false
	return true
func resolve(state: Dictionary, actor: Dictionary, command: Dictionary, ray_check: Callable) -> Dictionary:
	if _rules.is_empty() or actor["team"] != "player":
		return _error("support_unavailable")
	var target: Dictionary = {}
	for other: Dictionary in state["actors"]:
		if other["id"] == command.get("targetId"):
			target = other
			break
	if target.is_empty() or target["team"] != actor["team"] or target["hp"] == 0:
		return _error("invalid_support_target")
	var distance: int = Grid.distance(actor["body"], target["body"])
	if command["type"] == "cheer":
		if actor["id"] == target["id"] or target["kind"] == "starless":
			return _error("invalid_cheer_target")
		if distance > _rules["cheerRange"]:
			return _error("outside_support_range")
		if target.get("cheered", false):
			return _error("cheer_already_active")
		target["cheered"] = true
		return {"ok": true, "weight": _rules["cheerWeight"], "events": [{"type": "cheer", "actorId": target["id"], "sourceId": actor["id"], "multiplier": multiplier()}]}
	var id: Variant = command.get("itemId")
	if not id is String or not _items.has(id):
		return _error("unknown_item")
	var inventory: Dictionary = state.get("inventory", {})
	if inventory.get(id, 0) <= 0:
		return _error("item_unavailable")
	var item: Dictionary = _items[id]
	if distance > item["range"]:
		return _error("outside_support_range")
	var ray: Dictionary = ray_check.call(actor["body"], target["body"], state["blocked"])
	if not ray.get("value", false):
		return _error("blocked_line_of_sight")
	var field: String = "hp" if item["effect"] == "heal" else "will"
	var maximum: String = "maxHp" if field == "hp" else "maxWill"
	var amount: int = mini(int(item["amount"]), int(target[maximum]) - int(target[field]))
	if amount == 0:
		return _error("item_no_effect")
	target[field] = int(target[field]) + amount
	inventory[id] = int(inventory[id]) - 1
	state["inventory"] = inventory
	var restored: Dictionary = {"type": "heal" if field == "hp" else "will", "actorId": target["id"], "sourceId": actor["id"], "amount": amount}
	restored[field] = target[field]
	return {"ok": true, "weight": item["weight"], "events": [{"type": "item", "actorId": actor["id"], "targetId": target["id"], "itemId": id, "remaining": inventory[id]}, restored]}
static func _error(reason: String) -> Dictionary:
	return {"ok": false, "error": reason}
