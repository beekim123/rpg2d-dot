extends SceneTree
## Dialogue transactions and player safety are tested without scene or asset services.

const Stories = preload("res://scripts/story/story_rules.gd")
const Worlds = preload("res://scripts/world/world_data.gd")
const PORTRAITS: Array[String] = ["portrait.hob", "portrait.finn"]
var _checks: int = 0
var _failures: Array[String] = []

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	_checks += 1
	if not condition:
		_failures.append(message)
		push_error("FAIL: " + message)

func _words() -> Dictionary:
	return {"name.hob": "霍伯", "name.finn": "芬恩", "hello": "先点灯。", "again": "灯还亮着。"}

func _scripts() -> Dictionary:
	return {"hob": [
		{"op": "if", "flag": "met_hob", "equals": true, "goto": 5},
		{"op": "set", "flag": "met_hob", "value": true},
		{"op": "set", "flag": "lamp.lesson", "value": true},
		{"op": "say", "speaker": "name.hob", "portrait": "portrait.hob", "text": "hello"},
		{"op": "end"},
		{"op": "say", "speaker": "name.hob", "portrait": "portrait.hob", "text": "again"},
		{"op": "end"},
	]}

func _world_fixture() -> Dictionary:
	return {
		"room.a": {
			"id": "room.a", "name": "room", "width": 9, "height": 5,
			"rows": ["ttttttttt", "tgggtgggt", "tgggggggt", "tgggtgggt", "ttttttttt"],
			"spawn": {"x": 1, "y": 2},
			"entities": [
				{"id": "guard", "kind": "npc", "sprite": "npc", "solid": true, "x": 4, "y": 2, "script": "hob", "visibleWhen": {"all": ["closed"]}},
				{"id": "lamp", "kind": "lamp", "sprite": "lamp", "solid": true, "x": 2, "y": 3, "script": "lamp"},
			],
			"required": ["lamp"],
			"exits": [{"pair": "door", "x": 1, "y": 1, "to": "room.b", "at": {"x": 2, "y": 2}}],
		},
		"room.b": {
			"id": "room.b", "name": "room", "width": 7, "height": 5,
			"rows": ["ttttttt", "tgggggt", "tgggggt", "tgggggt", "ttttttt"],
			"spawn": {"x": 2, "y": 2}, "entities": [], "required": [],
			"exits": [{"pair": "door", "x": 1, "y": 2, "to": "room.a", "at": {"x": 1, "y": 2}}],
		},
	}

func _run() -> void:
	_test_script_transactions()
	_test_script_rejections()
	_test_instruction_budget()
	_test_interaction_targets()
	_test_player_safety()
	print("StoryRules: %d checks, %d failures" % [_checks, _failures.size()])
	quit(0 if _failures.is_empty() else 1)

func _test_script_transactions() -> void:
	var scripts: Dictionary = _scripts()
	var original: Dictionary = scripts.duplicate(true)
	var rules: Stories = Stories.new()
	_check(rules.configure(scripts, _words(), PORTRAITS).is_empty(), "valid localized scripts configure")
	var input: Dictionary = {"earlier": true}
	var result: Dictionary = rules.run("hob", input)
	_check(result["ok"], "configured script runs")
	_check(input == {"earlier": true}, "execution does not mutate caller flags")
	_check(result["flags"] == {"earlier": true, "met_hob": true, "lamp.lesson": true}, "two set commands commit together before dialogue yield")
	_check(result["pc"] == 4 and not result["done"], "dialogue yield resumes after the say command")
	_check(result.get("line") == original["hob"][3], "dialogue yields original stable text, speaker and portrait IDs")
	if not result["ok"]:
		return
	var finished: Dictionary = rules.run("hob", result["flags"], result["pc"])
	_check(finished["ok"] and finished["done"] and finished["pc"] == 5 and not finished.has("line"), "end completes without yielding another line")
	var repeat: Dictionary = rules.run("hob", result["flags"])
	_check(repeat.get("line", {}).get("text") == "again" and repeat["pc"] == 6, "if uses committed flags on repeat interaction")
	result["flags"]["met_hob"] = false
	result["line"]["text"] = "changed"
	scripts["hob"][3]["text"] = "changed"
	_check(rules.run("hob", {})["line"]["text"] == "hello", "source and returned dictionaries cannot mutate configured scripts")
	_check(rules.configure({"empty": [], "single": [{"op": "set", "flag": "one", "value": false}]}, {}, []).is_empty(), "empty and implicit-end scripts configure")
	_check(rules.run("empty", {}) == {"ok": true, "flags": {}, "pc": 0, "done": true}, "empty script ends at cursor zero")
	_check(rules.run("single", {}) == {"ok": true, "flags": {"one": false}, "pc": 1, "done": true}, "falling off the command list commits an implicit end")

func _test_script_rejections() -> void:
	for problem: String in ["script_id", "script_type", "command", "unknown_op", "text", "speaker", "portrait", "set_type", "flag", "if_type", "goto_negative", "goto_fraction", "goto_end"]:
		var broken: Dictionary = _scripts()
		match problem:
			"script_id": broken["bad id"] = [{"op": "end"}]
			"script_type": broken["hob"] = {}
			"command": broken["hob"][3] = "say"
			"unknown_op": broken["hob"][3] = {"op": "move", "entity": "hob", "x": 1, "y": 1}
			"text": broken["hob"][3]["text"] = "missing"
			"speaker": broken["hob"][3]["speaker"] = "missing"
			"portrait": broken["hob"][3]["portrait"] = "missing"
			"set_type": broken["hob"][1]["value"] = 1
			"flag": broken["hob"][1]["flag"] = "__proto__"
			"if_type": broken["hob"][0]["equals"] = "true"
			"goto_negative": broken["hob"][0]["goto"] = -1
			"goto_fraction": broken["hob"][0]["goto"] = 1.5
			"goto_end": broken["hob"][0]["goto"] = 7
		var rules: Stories = Stories.new()
		rules.configure(_scripts(), _words(), PORTRAITS)
		var before: Dictionary = broken.duplicate(true)
		_check(not rules.configure(broken, _words(), PORTRAITS).is_empty(), "reject broken script configuration: " + problem)
		_check(broken == before, "configuration never mutates rejected source: " + problem)
		_check(rules.run("hob", {}).get("line", {}).get("text") == "hello", "failed configuration preserves last valid scripts: " + problem)
	var rules: Stories = Stories.new()
	rules.configure(_scripts(), _words(), PORTRAITS)
	for cursor: int in [-1, 8]:
		var flags: Dictionary = {"keep": true}
		var failed: Dictionary = rules.run("hob", flags, cursor)
		_check(not failed["ok"] and failed["pc"] == cursor and failed["flags"] == flags and failed.has("error"), "invalid cursor preserves input and reports error")
	_check(rules.run("hob", {}, 7) == {"ok": true, "flags": {}, "pc": 7, "done": true}, "cursor at the implicit end is valid")
	_check(not rules.run("missing", {})["ok"], "unknown script is rejected")
	_check(not rules.run("hob", {"constructor": true})["ok"], "reserved input flag is rejected")
	_check(not rules.run("hob", {"met_hob": 1})["ok"], "non-boolean input flag is rejected")

func _test_instruction_budget() -> void:
	var rules: Stories = Stories.new()
	var looping: Dictionary = {"loop": [{"op": "set", "flag": "leaked", "value": true}, {"op": "if", "flag": "forever", "equals": false, "goto": 0}]}
	_check(rules.configure(looping, {}, []).is_empty(), "structurally valid loop configures for bounded execution")
	var flags: Dictionary = {"keep": true}
	var failed: Dictionary = rules.run("loop", flags)
	_check(not failed["ok"] and failed["pc"] == 0 and failed["flags"] == flags, "instruction budget rolls back all transient flag writes")
	_check(String(failed.get("error", "")).contains("budget"), "infinite branch reports an instruction budget error")
	_check(flags == {"keep": true}, "loop failure leaves caller flags unchanged")

func _test_interaction_targets() -> void:
	var world: Worlds = Worlds.new()
	_check(world.configure(_world_fixture()).is_empty(), "interaction fixture configures")
	var hidden: Dictionary = world.get_map("room.a")
	_check(world.interaction_target(hidden, Vector2i(3, 2), Vector2i.RIGHT).is_empty(), "hidden NPC is not interactable")
	var shown: Dictionary = world.get_map("room.a", {"closed": true})
	_check(world.interaction_target(shown, Vector2i(3, 2), Vector2i.RIGHT).get("id") == "guard", "front-cell NPC returns its interaction definition")
	_check(world.interaction_target(shown, Vector2i(2, 2), Vector2i.DOWN).get("script") == "lamp", "scripted non-NPC supports investigation")
	_check(world.interaction_target(shown, Vector2i(2, 2), Vector2i(1, 1)).is_empty(), "diagonal interaction direction is rejected")
	shown["entities"] = [
		{"id": "sign", "kind": "decoration", "sprite": "sign", "solid": false, "x": 3, "y": 3, "footprint": [3, 2], "script": "sign"},
		{"id": "first", "kind": "npc", "sprite": "npc", "solid": true, "x": 3, "y": 3, "footprint": [3, 2], "script": "first"},
		{"id": "second", "kind": "npc", "sprite": "npc", "solid": false, "x": 3, "y": 3, "footprint": [3, 2], "script": "second"},
	]
	var before: Dictionary = shown.duplicate(true)
	var target: Dictionary = world.interaction_target(shown, Vector2i(1, 2), Vector2i.RIGHT)
	_check(target.get("id") == "first", "footprint lookup prefers NPCs and preserves source order within that kind")
	target["script"] = "changed"
	_check(shown == before, "interaction result cannot mutate input entities")
	shown["entities"][1]["script"] = ""
	shown["entities"][2].erase("script")
	_check(world.interaction_target(shown, Vector2i(1, 2), Vector2i.RIGHT).get("id") == "sign", "entities without a nonempty script do not take interaction priority")

func _test_player_safety() -> void:
	var world: Worlds = Worlds.new()
	_check(world.configure(_world_fixture()).is_empty(), "position fixture configures")
	_check(world.validate_state({"closed": true}).is_empty(), "closed passage still leaves spawn, objectives and doors valid")
	_check(world.validate_position("room.a", Vector2i(7, 2), {}).is_empty(), "player can reach objectives and door before the passage closes")
	_check(not world.validate_position("room.a", Vector2i(7, 2), {"closed": true}).is_empty(), "flag update cannot strand a player away from required interactions and exits")
	_check(not world.validate_position("room.a", Vector2i(4, 2), {"closed": true}).is_empty(), "flag update cannot reveal an NPC on the player")
	_check(world.validate_position("room.a", Vector2i(3, 2), {"closed": true}).is_empty(), "safe player side remains valid after the same flag update")
	_check(not world.validate_position("missing", Vector2i(3, 2), {}).is_empty(), "unknown current map is rejected")
	_check(not world.validate_position("room.a", Vector2i(-1, 2), {}).is_empty(), "out-of-bounds player is rejected")
