extends SceneTree
## Validate authored dialogue references, branch completion and native text layout.
var _checks: int = 0
var _failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func _check(ok: bool, message: String) -> void:
	_checks += 1
	if not ok:
		_failures.append(message)
		push_error("FAIL: " + message)
func _run() -> void:
	var catalog: AssetCatalog = AssetCatalog.new()
	_check(catalog.load_pack(), "registered story pack loads")
	var scripts: Dictionary = catalog.story_scripts()
	var words: Dictionary = catalog.locale(catalog.binding("locale"))
	var portraits: Array[String] = []
	for id: String in catalog.definitions:
		if catalog.definitions[id]["category"] == "portrait":
			portraits.append(id)
	var rules: StoryRules = StoryRules.new()
	var errors: Array[String] = rules.configure(scripts, words, portraits)
	_check(errors.is_empty(), "authored scripts have valid words, portraits, commands and jumps: " + str(errors))
	if not errors.is_empty():
		_finish()
		return
	for map_id: String in catalog.map_ids():
		for entity: Dictionary in catalog.map_data(map_id)["entities"]:
			if entity.has("script"):
				_check(scripts.has(entity["script"]), "entity references an authored script: " + entity["id"])
	var maps: Dictionary = {}
	for map_id: String in catalog.map_ids():
		maps[map_id] = catalog.map_data(map_id)
	var data: WorldData = WorldData.new()
	_check(data.configure(maps).is_empty(), "real maps load for dialogue routing")
	var dawn: Dictionary = {"p.attack_started":true,"p.s09_done":true,"p.awakened":true,"seen.teya":true}
	var view: Dictionary = data.get_map("lv.town",dawn)
	var target: Dictionary = {}
	for entity: Dictionary in view["entities"]:
		if entity["id"] == "lv.town.teya.dawn":
			for direction: Vector2i in [Vector2i.DOWN,Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP]:
				var standing: Vector2i = Vector2i(int(entity["x"]),int(entity["y"])) + direction
				if data.is_safe_entry(view,standing):
					target = data.interaction_target(view,standing,-direction)
					break
	_check(not target.is_empty(), "dawn Teya can be selected through actual visible-entity interaction")
	if not target.is_empty():
		var greeting: Dictionary = rules.run(target["script"],dawn)
		_check(greeting.get("line",{}).get("text") == "lv.npc.teya.paper_corner.03", "awakened revisit reaches the visible dawn NPC script")
		for changed: Dictionary in [{"p.awakened":false},{"seen.teya":false},{"seen.teya_star":true}]:
			var context: Dictionary = dawn.duplicate(true)
			context.merge(changed,true)
			_check(rules.run(target["script"],context).get("line",{}).get("text") == "lv.npc.teya.after.01", "revisit respects awakening, prior visit, and one-time memory: " + str(changed))
	for context: Dictionary in [{},{"p.attack_started":true,"p.s09_done":true,"p.awakened":true}]:
		for map_id: String in catalog.map_ids():
			var current: Dictionary = data.get_map(map_id,context)
			var spawn: Vector2i = Vector2i(int(current["spawn"]["x"]),int(current["spawn"]["y"]))
			var accessible: Dictionary = data.reachable(current,spawn)
			var doors: Dictionary = {}
			for door: Dictionary in current["exits"]:
				doors[Vector2i(int(door["x"]),int(door["y"]))] = true
			var selectable_ids: Dictionary = {}
			for standing: Vector2i in accessible:
				if doors.has(standing) and standing != spawn:
					continue
				for direction: Vector2i in [Vector2i.UP,Vector2i.DOWN,Vector2i.LEFT,Vector2i.RIGHT]:
					var found: Dictionary = data.interaction_target(current,standing,direction)
					if not found.is_empty():
						selectable_ids[found["id"]] = true
			for entity: Dictionary in current["entities"]:
				if entity.has("script"):
					_check(selectable_ids.has(entity["id"]), "visible authored interaction is reachable and selectable: " + entity["id"])
	var packed: PackedScene = load("res://scenes/ui/dialogue_box.tscn") as PackedScene
	var box: DialogueBox = packed.instantiate()
	root.add_child(box)
	box.configure(catalog.pixel_font(), catalog.frame_texture(catalog.binding("panel"),0), words["hint.dialogue"])
	_check(catalog.pixel_font().has_char(String(words["hint.speaking"]).unicode_at(0)), "bundled font supports the speaking marker")
	for script_id: String in scripts:
		for command: Dictionary in scripts[script_id]:
			if command["op"] == "say":
				box.show_line(words[command["speaker"]],words[command["text"]],catalog.frame_texture(command["portrait"],0))
				box.reveal_all()
				await process_frame
				_check(box.content_fits(), "localized page fits native panel: " + command["text"])
		for initial_flags: Dictionary in [{}, {"seen.hob":true}, {"p.attack_started":true,"p.s09_done":true}, {"p.awakened":true}]:
			var flags: Dictionary = initial_flags.duplicate(true)
			var cursor: int = 0
			var done: bool = false
			for page: int in range(100):
				var result: Dictionary = rules.run(script_id, flags, cursor)
				if not result["ok"]:
					break
				flags = result["flags"]
				cursor = int(result["pc"])
				if result["done"]:
					done = true
					break
			_check(done, "authored conversation terminates: " + script_id + " " + str(initial_flags))
	box.queue_free()
	await process_frame
	_finish()
func _finish() -> void:
	print("Story content: %d checks, %d failures" % [_checks,_failures.size()])
	quit(0 if _failures.is_empty() else 1)
