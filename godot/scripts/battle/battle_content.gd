extends RefCounted
## Compose native-only additions over preserved battle candidates; never mutate either source.
static func compose(base: Variant, extension: Variant = {}) -> Dictionary:
	if not base is Dictionary or not base.get("actors") is Array or not extension is Dictionary:
		return {"ok": false, "error": "invalid_battle_extension"}
	for key: Variant in extension:
		if key not in ["actors", "inventory"]:
			return {"ok": false, "error": "unknown_extension_field"}
	if not extension.get("actors", []) is Array or not extension.get("inventory", {}) is Dictionary:
		return {"ok": false, "error": "invalid_battle_extension"}
	var value: Dictionary = base.duplicate(true)
	var ids: Dictionary = {}
	for actor: Variant in value["actors"] + extension.get("actors", []):
		if not actor is Dictionary or not actor.get("id") is String or ids.has(actor["id"]):
			return {"ok": false, "error": "duplicate_or_invalid_actor"}
		ids[actor["id"]] = true
	value["actors"].append_array(extension.get("actors", []).duplicate(true))
	if extension.has("inventory"):
		value["inventory"] = extension["inventory"].duplicate(true)
	return {"ok": true, "value": value}
