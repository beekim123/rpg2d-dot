extends RefCounted
## Pure, atomic story checkpoints. Presentation and storage cannot manufacture battle results.
const Session = preload("res://scripts/battle/battle_session.gd")
const DIRECTIONS: Dictionary = {"up":Vector2i.UP,"down":Vector2i.DOWN,"left":Vector2i.LEFT,"right":Vector2i.RIGHT}
var _flow: Dictionary = {}
var _steps: Dictionary = {}
var _world: WorldData
var _codec: SaveCodec
var _battle_items: Array[String] = []
var _battle_limit: int = 9
var _battle_templates: Dictionary = {}
var _ticket: Dictionary = {}

func configure(data: Variant, world: WorldData, codec: SaveCodec, book: RefCounted, words: Dictionary, support: Dictionary, battle_templates: Dictionary = {}) -> Array[String]:
	var errors: Array[String] = []
	if not _keys(data,["format","steps","uniqueItems","objectives","start"]) or data.get("format") != "astra.prologue-flow/1" or not data.get("steps") is Array or data["steps"].is_empty() or data["steps"].size() > 128 or not data.get("uniqueItems") is Array or not data.get("objectives") is Array:
		return ["Invalid prologue flow root"]
	if not _keys(data.get("start"),["mapId","anchor"]) or not _anchor_spec(data.get("start"), world):
		return ["Missing story start anchor"]
	var unique: Dictionary = {}
	for id: Variant in data["uniqueItems"]:
		if not _id(id) or unique.has(id):
			return ["Invalid unique item ID"]
		unique[id] = true
	var steps: Dictionary = {}
	var done: Dictionary = {}
	for raw: Variant in data["steps"]:
		if not _keys(raw,["id","trigger","require","done","set","inventory","relocate","presentation"]) or not _id(raw.get("id")) or steps.has(raw.get("id")) or not _id(raw.get("done")) or done.has(raw.get("done")) or raw.get("done") == "p.main_started":
			return ["Invalid or duplicate prologue step"]
		var step: Dictionary = raw
		if not _condition_valid(step.get("require", {})) or not _flags_valid(step.get("set", {})) or (step.get("set", {}) as Dictionary).has("p.main_started") or not _deltas_valid(step.get("inventory", {})):
			return ["Invalid step effects or requirements: " + step["id"]]
		if step.get("require", {}).get("flags", {}).get("p.main_started") != true:
			return ["Story steps must require an explicit new journey"]
		for lamp: String in step.get("require", {}).get("lamps", []):
			if not codec.has_lamp_id(lamp):
				return ["Unknown story lamp"]
		if not _trigger_valid(step.get("trigger"), world):
			return ["Invalid trigger: " + step["id"]]
		if step.has("relocate") and (not _keys(step["relocate"],["mapId","anchor"]) or not _anchor_spec(step["relocate"], world)):
			return ["Invalid checkpoint relocation"]
		var presentation: Variant = step.get("presentation")
		if not _keys(presentation,["kind","scene","segment","battleId","prompt","choices"]) or not presentation.get("kind") in ["dialogue","choice","battle","ending","notice"]:
			return ["Invalid stage presentation"]
		var presentation_fields: Dictionary = {"dialogue":["kind","scene","segment"],"choice":["kind","prompt","choices"],"battle":["kind","battleId"],"ending":["kind","scene","segment","prompt"],"notice":["kind","prompt"]}
		if not _keys(presentation,presentation_fields[presentation["kind"]]):
			return ["Fields do not belong to this presentation kind"]
		if presentation["kind"] in ["dialogue","ending"] and (not presentation.get("scene") is String or not presentation.get("segment") is String or book.segment(presentation["scene"], presentation["segment"]).is_empty()):
			return ["Unknown main-story segment"]
		if presentation["kind"] in ["choice","notice","ending"] and not _word(presentation.get("prompt"), words):
			return ["Missing localized prompt"]
		if presentation["kind"] == "battle" and not presentation.get("battleId") in ["prologue_ella","prologue_shade"]:
			return ["Unknown prologue battle"]
		if presentation["kind"] == "choice":
			if not presentation.get("choices") is Array or presentation["choices"].is_empty():
				return ["Empty story choice"]
			var choices: Dictionary = {}
			for choice: Variant in presentation["choices"]:
				if not _keys(choice,["id","label","set"]) or not _id(choice.get("id")) or choices.has(choice.get("id")) or not _word(choice.get("label"), words) or not _flags_valid(choice.get("set", {})) or (choice.get("set", {}) as Dictionary).has("p.main_started"):
					return ["Invalid story choice"]
				choices[choice["id"]] = true
			for a: int in presentation["choices"].size():
				for b: int in a:
					var first: Dictionary = presentation["choices"][a].get("set",{})
					var second: Dictionary = presentation["choices"][b].get("set",{})
					if not first.keys().any(func(key: String) -> bool: return second.has(key) and first[key] != second[key]):
						return ["Story choices must have distinguishable saved results"]
		steps[step["id"]] = step.duplicate(true)
		done[step["done"]] = true
	for step: Dictionary in steps.values():
		var effects: Array = [step.get("set", {})]
		for choice: Dictionary in step["presentation"].get("choices", []):
			effects.append(choice.get("set", {}))
		for flags: Dictionary in effects:
			for key: String in flags:
				if done.has(key):
					return ["A step cannot write another completion checkpoint"]
	for objective: Variant in data["objectives"]:
		if not _keys(objective,["require","text"]) or not _condition_valid(objective.get("require", {})) or not _word(objective.get("text"), words):
			return ["Invalid story objective"]
	if not support.get("items") is Array or not support.get("rules") is Dictionary or not _whole(support["rules"].get("inventoryLimit")) or support["rules"]["inventoryLimit"] < 1 or support["rules"]["inventoryLimit"] > 9:
		return ["Invalid battle inventory rules"]
	var item_ids: Array[String] = []
	for item: Variant in support["items"]:
		if not item is Dictionary or not _id(item.get("id")) or item["id"] in item_ids or unique.has(item["id"]):
			return ["Invalid battle item ID"]
		item_ids.append(item["id"])
	var producers: Dictionary = {"p.main_started":-1}
	for index: int in data["steps"].size():
		var step: Dictionary = data["steps"][index]
		producers[step["done"]] = index
		var writes: Array = [step.get("set",{})]
		for choice: Dictionary in step["presentation"].get("choices",[]):
			writes.append(choice.get("set",{}))
		for flags: Dictionary in writes:
			for key: String in flags:
				if not producers.has(key):
					producers[key] = index
	for index: int in data["steps"].size():
		var step: Dictionary = data["steps"][index]
		for key: String in step.get("require",{}).get("flags",{}):
			if not producers.has(key) or (step["require"]["flags"][key] and producers[key] >= index):
				return ["Unknown or cyclic story prerequisite"]
		for inventory: Dictionary in [step.get("inventory",{}),step.get("require",{}).get("items",{})]:
			for item: String in inventory:
				if not unique.has(item) and not item in item_ids:
					return ["Unknown story inventory item"]
	for objective: Dictionary in data["objectives"]:
		for key: String in objective.get("require",{}).get("flags",{}):
			if not producers.has(key):
				return ["Unknown objective prerequisite"]
	var templates: Dictionary = {}
	for step: Dictionary in steps.values():
		if step["presentation"]["kind"] != "battle":
			continue
		var id: String = step["presentation"]["battleId"]
		var template: Variant = battle_templates.get(id)
		if not template is Dictionary or not template.get("definition") is Dictionary or template["definition"].get("id") != id or not template.get("balance") is Dictionary or not template.get("skills") is Dictionary:
			return ["Missing canonical story battle template"]
		if template["skills"].get("support") != support:
			return ["Story and battle support rules must agree"]
		var probe: Session = Session.new()
		if not probe.configure(template["balance"],template["skills"]).is_empty():
			return ["Invalid canonical story battle rules"]
		var started: Dictionary = probe.start(template["definition"])
		if not started["ok"] or probe.snapshot().get("battle",{}).get("phase") != "active":
			return ["Story battles must start active"]
		templates[id] = {"definition":template["definition"].duplicate(true),"balance":template["balance"].duplicate(true),"skills":template["skills"].duplicate(true)}
	_flow = data.duplicate(true)
	_steps = steps
	_world = world
	_codec = codec
	_battle_items = item_ids
	_battle_limit = int(support["rules"]["inventoryLimit"])
	_battle_templates = templates
	_ticket = {}
	return errors

func begin(input: Dictionary) -> Dictionary:
	if _codec == null or not _codec.validate(input).get("ok", false) or not input["flags"].is_empty() or not input["lamps"].is_empty():
		return _failure(input, "new_game_requires_fresh_state")
	var next: Dictionary = input.duplicate(true)
	next["flags"]["p.main_started"] = true
	if not _relocate(next, _flow["start"]):
		return _failure(input, "unsafe_story_start")
	var result: Dictionary = _finish(input, next)
	if result["ok"]:
		_ticket = {}
	return result

func authorize_battle(input: Dictionary, id: String, event: String, session: Session) -> bool:
	var step: Dictionary = offer(input,event)
	if session == null or step.get("id") != id or step["presentation"]["kind"] != "battle" or session.snapshot().get("battle",{}).get("phase") != "active":
		return false
	var template: Dictionary = _battle_templates[step["presentation"]["battleId"]]
	var expected: Dictionary = template["definition"].duplicate(true)
	expected["inventory"] = battle_inventory(input)
	var proof: Dictionary = session.provenance()
	if proof["definition"] != expected or proof["configuration"] != {"balance":template["balance"],"skills":template["skills"]}:
		return false
	_ticket = {"session":session,"step":id,"snapshot":_snapshot_key(input),"proof":proof}
	return true

func cancel_battle() -> void:
	_ticket = {}

func offer(input: Dictionary, event: String) -> Dictionary:
	if not _valid_input(input) or not input["flags"].get("p.main_started", false):
		return {}
	for step: Dictionary in _steps.values():
		if not input["flags"].get(step["done"], false) and _condition(input, step.get("require", {})) and _target(input, step["trigger"], event):
			return step.duplicate(true)
	return {}

func commit(input: Dictionary, id: String, event: String, choice_id: String = "", session: Session = null) -> Dictionary:
	var step: Dictionary = offer(input, event)
	if step.get("id") != id:
		return _failure(input, "story_step_unavailable")
	var presentation: Dictionary = step["presentation"]
	var choice_flags: Dictionary = {}
	if presentation["kind"] == "choice":
		var options: Array = presentation["choices"].filter(func(option: Dictionary) -> bool: return option["id"] == choice_id)
		if options.size() != 1:
			return _failure(input, "choice_not_confirmed")
		choice_flags = options[0].get("set", {})
	elif not choice_id.is_empty():
		return _failure(input, "unexpected_choice")
	var next: Dictionary = input.duplicate(true)
	if presentation["kind"] == "battle":
		if session == null:
			return _failure(input, "battle_result_required")
		if _ticket.get("session") != session or _ticket.get("step") != id or _ticket.get("snapshot") != _snapshot_key(input) or _ticket.get("proof") != session.provenance():
			return _failure(input, "battle_not_authorized")
		var battle: Dictionary = session.snapshot().get("battle", {})
		if battle.get("phase") != "won" or battle.get("id") != presentation["battleId"]:
			return _failure(input, "battle_not_won")
		var supplied: Dictionary = battle_inventory(input)
		if session.starting_inventory() != supplied:
			return _failure(input, "battle_supply_mismatch")
		for item: String in _battle_items:
			var remaining: int = int(battle.get("inventory", {}).get(item, 0))
			if remaining > int(supplied.get(item, 0)):
				return _failure(input, "unexpected_battle_supply")
			_set_item(next, item, int(input["inventory"].get(item,0)) - int(supplied.get(item,0)) + remaining)
	elif session != null:
		return _failure(input, "unexpected_battle_result")
	next["flags"][step["done"]] = true
	next["flags"].merge(step.get("set", {}), true)
	next["flags"].merge(choice_flags, true)
	for item: String in step.get("inventory", {}):
		var count: int = int(next["inventory"].get(item, 0)) + int(step["inventory"][item])
		if count < 0 or (item in _flow["uniqueItems"] and count > 1):
			return _failure(input, "invalid_story_inventory")
		# Ordinary supplies cannot block the main story when the backpack is full.
		_set_item(next, item, mini(count, 999))
	if step.has("relocate") and not _relocate(next, step["relocate"]):
		return _failure(input, "unsafe_story_checkpoint")
	var result: Dictionary = _finish(input, next)
	if result["ok"] and presentation["kind"] == "battle":
		_ticket = {}
	return result

func validate_save(state: Dictionary) -> String:
	if not state.get("flags") is Dictionary or not state.get("inventory") is Dictionary:
		return "invalid_story_state"
	if not state["flags"].get("p.main_started", false):
		return ""
	if _flow.is_empty():
		return "unconfigured_story"
	var flags: Dictionary = state["flags"]
	var expected_items: Dictionary = {}
	var expected_effects: Dictionary = {}
	for item: String in _flow["uniqueItems"]:
		expected_items[item] = 0
	for step: Dictionary in _steps.values():
		var completed: bool = flags.get(step["done"], false)
		for key: String in step.get("set", {}):
			if not expected_effects.has(key):
				expected_effects[key] = false
			if completed:
				expected_effects[key] = step["set"][key]
		for choice: Dictionary in step["presentation"].get("choices", []):
			for key: String in choice.get("set", {}):
				if not expected_effects.has(key):
					expected_effects[key] = false
		if not completed:
			continue
		for key: String in step.get("require", {}).get("flags", {}):
			if step["require"]["flags"][key] and not flags.get(key, false):
				return "incomplete_story_prerequisite"
		for lamp: String in step.get("require", {}).get("lamps", []):
			if not lamp in state.get("lamps", []):
				return "missing_story_lamp"
		for item: String in step.get("inventory", {}):
			if expected_items.has(item):
				expected_items[item] += int(step["inventory"][item])
		if step["presentation"]["kind"] == "choice":
			var matches: int = 0
			for choice: Dictionary in step["presentation"]["choices"]:
				if _condition(state, {"flags":choice.get("set", {})}):
					matches += 1
					expected_effects.merge(choice.get("set", {}), true)
			if matches != 1:
				return "invalid_story_choice"
	for item: String in expected_items:
		if expected_items[item] < 0 or expected_items[item] > 1 or state["inventory"].get(item,0) != expected_items[item]:
			return "inconsistent_unique_item"
	for key: String in expected_effects:
		if flags.get(key, false) != expected_effects[key]:
			return "inconsistent_story_effect"
	return ""

func battle_inventory(state: Dictionary) -> Dictionary:
	var inventory: Dictionary = {}
	if not state.get("inventory") is Dictionary:
		return {}
	for item: String in _battle_items:
		if not _whole(state["inventory"].get(item,0)) or state["inventory"].get(item,0) > 999:
			return {}
		var count: int = mini(int(state.get("inventory", {}).get(item,0)), _battle_limit)
		if count > 0:
			inventory[item] = count
	return inventory
func can_light_lamp(state: Dictionary) -> bool:
	return _valid_input(state) and (not state["flags"].get("p.main_started", false) or state["flags"].get("p.awakened", false) or (state["inventory"].get("hob_travel_lamp",0) > 0 and state["inventory"].get("lamp_rod",0) > 0))
func objective(state: Dictionary) -> String:
	for entry: Dictionary in _flow.get("objectives", []):
		if _condition(state, entry["require"]):
			return entry["text"]
	return ""
func _target(state: Dictionary, trigger: Dictionary, event: String) -> bool:
	if trigger["kind"] != event or (trigger.has("mapId") and trigger["mapId"] != state["mapId"]):
		return false
	var cell: Vector2i = Vector2i(int(state["player"]["x"]),int(state["player"]["y"]))
	if trigger.has("anchor"):
		var point: Dictionary = _world.anchor_point(state["mapId"], trigger["anchor"])
		return not point.is_empty() and abs(cell.x-int(point["x"]))+abs(cell.y-int(point["y"])) <= int(trigger.get("radius",0))
	if trigger.has("entityIds"):
		var map: Dictionary = _world.get_map(state["mapId"], state["flags"])
		return _world.interaction_target(map,cell,DIRECTIONS[state["player"]["facing"]]).get("id") in trigger["entityIds"]
	return true
func _valid_input(state: Dictionary) -> bool:
	return _codec != null and _codec.validate(state).get("ok",false) and validate_save(state).is_empty()
func _snapshot_key(state: Dictionary) -> String:
	return JSON.stringify(_codec.validate(state)["state"],"",true).sha256_text()
func _finish(before: Dictionary, next: Dictionary) -> Dictionary:
	var checked: Dictionary = _codec.validate(next)
	if not checked["ok"]:
		return _failure(before, "invalid_checkpoint_geometry")
	var error: String = validate_save(checked["state"])
	return {"ok":true,"error":"","state":checked["state"]} if error.is_empty() else _failure(before,error)
func _relocate(state: Dictionary, location: Dictionary) -> bool:
	var result: Dictionary = _world.safe_anchor(location["mapId"],location["anchor"],state["flags"])
	if not result["ok"]:
		return false
	state["mapId"] = result["map_id"]
	state["player"]["x"] = result["position"].x
	state["player"]["y"] = result["position"].y
	return true
static func _set_item(state: Dictionary, id: String, count: int) -> void:
	if count == 0:
		state["inventory"].erase(id)
	else:
		state["inventory"][id] = count
static func _failure(state: Dictionary, error: String) -> Dictionary:
	return {"ok":false,"error":error,"state":state.duplicate(true)}
static func _condition(state: Dictionary, requirement: Dictionary) -> bool:
	for key: String in requirement.get("flags", {}):
		if state.get("flags", {}).get(key,false) != requirement["flags"][key]:
			return false
	for lamp: String in requirement.get("lamps", []):
		if not lamp in state.get("lamps", []):
			return false
	for item: String in requirement.get("items", {}):
		if state.get("inventory", {}).get(item,0) < requirement["items"][item]:
			return false
	return true
static func _condition_valid(raw: Variant) -> bool:
	if not _keys(raw,["flags","lamps","items"]) or not _flags_valid(raw.get("flags", {})) or not raw.get("lamps", []) is Array or not raw.get("items", {}) is Dictionary:
		return false
	for lamp: Variant in raw.get("lamps", []):
		if not _id(lamp):
			return false
	for item: Variant in raw.get("items", {}):
		if not _id(item) or not _whole(raw["items"][item]) or raw["items"][item] > 999:
			return false
	return true
static func _flags_valid(raw: Variant) -> bool:
	if not raw is Dictionary:
		return false
	for key: Variant in raw:
		if not _id(key) or not raw[key] is bool:
			return false
	return true
static func _deltas_valid(raw: Variant) -> bool:
	if not raw is Dictionary:
		return false
	for key: Variant in raw:
		if not _id(key) or not (raw[key] is int or raw[key] is float) or not is_finite(float(raw[key])) or float(raw[key]) != floorf(float(raw[key])) or absf(float(raw[key])) > 999:
			return false
	return true
static func _anchor_spec(raw: Variant, world: WorldData) -> bool:
	return raw is Dictionary and raw.get("mapId") is String and raw.get("anchor") is String and not world.anchor_point(raw["mapId"],raw["anchor"]).is_empty()
static func _trigger_valid(raw: Variant, world: WorldData) -> bool:
	if not _keys(raw,["kind","mapId","anchor","radius","entityIds"]) or not raw.get("kind") in ["automatic","near","interact"]:
		return false
	if raw.has("mapId") and (not raw["mapId"] is String or world.get_map(raw["mapId"]).is_empty()):
		return false
	if raw.has("anchor"):
		return raw["kind"] != "automatic" and _anchor_spec(raw,world) and _whole(raw.get("radius",0)) and raw.get("radius",0) <= 4 and not raw.has("entityIds")
	if raw.has("entityIds"):
		if raw["kind"] != "interact" or not raw.get("mapId") is String or not raw["entityIds"] is Array or raw["entityIds"].is_empty():
			return false
		for id: Variant in raw["entityIds"]:
			if not _id(id) or not world.has_authored_entity(raw["mapId"],id):
				return false
		return true
	return raw["kind"] == "automatic" and not raw.has("radius")
static func _word(id: Variant, words: Dictionary) -> bool:
	return id is String and words.get(id) is String and not String(words[id]).is_empty()
static func _whole(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value >= 0 and value <= SaveCodec.MAX_INTEGER and float(value) == floorf(float(value))
static func _id(value: Variant) -> bool:
	if not value is String or String(value).is_empty() or String(value).length() > 100 or value in ["__proto__","constructor","prototype"] or String(value)[0] == ".":
		return false
	for letter: String in String(value):
		if not letter in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.":
			return false
	return true
static func _keys(raw: Variant, allowed: Array) -> bool:
	return raw is Dictionary and raw.keys().all(func(key: Variant) -> bool: return key is String and key in allowed)
