extends SceneTree
const Book = preload("res://scripts/story/prologue_content.gd")
const Progress = preload("res://scripts/story/prologue_progress.gd")
const BattleBook = preload("res://scripts/resources/battle_catalog.gd")
var rules: Progress = Progress.new()
var checks: int = 0
var failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error("FAIL: " + label)
func _validate_story(candidate: Dictionary) -> String:
	return rules.validate_save(candidate)
func _mutate_copy(candidate: Dictionary) -> String:
	candidate["flags"]["test.mutated"] = true
	return ""
func _run() -> void:
	var catalog: AssetCatalog = AssetCatalog.new()
	check(catalog.load_pack(), "save test resource pack loads")
	var maps: Dictionary = {}
	for id: String in catalog.map_ids():
		maps[id] = catalog.map_data(id)
	var world: WorldData = WorldData.new()
	var codec: SaveCodec = SaveCodec.new()
	world.configure(maps)
	codec.configure(maps)
	var words: Dictionary = catalog.locale("zh-Hans")
	var book: Book = Book.new()
	var portraits: Array[String] = []
	for id: String in catalog.definitions:
		if catalog.definitions[id].get("category") == "portrait":
			portraits.append(id)
	book.configure(catalog.cinematic_data("prologue"),words,portraits)
	var battle_book: BattleBook = BattleBook.new()
	battle_book.configure(catalog,world,words)
	var templates: Dictionary = {}
	for id: String in ["prologue_ella","prologue_shade"]:
		templates[id] = battle_book.prepare(id)
	check(rules.configure(catalog.table_data("prologue.flow"),world,codec,book,words,catalog.table_data("battle.support"),templates).is_empty(), "story rules configure without touching save schema")
	check(codec.has_method("set_story_validator"), "save codec accepts an optional semantic guard")
	if codec.has_method("set_story_validator"):
		codec.call("set_story_validator",_validate_story)
	var legacy: Dictionary = codec.fresh("lv.finn_house")
	legacy["flags"]["seen.hob"] = true
	check(codec.encode(legacy)["ok"], "old v3 exploration with existing flags is still accepted")
	var begun: Dictionary = rules.begin(codec.fresh("lv.finn_house"))["state"]
	var state: Dictionary = rules.commit(begun,"legend","automatic")["state"]
	var valid: Dictionary = codec.encode(state)
	check(valid["ok"] and state["version"] == 3, "new story uses the same portable v3 fields")
	var invalid: Dictionary = state.duplicate(true)
	invalid["flags"]["p.attack_started"] = true
	check(not codec.encode(invalid)["ok"] and not codec.decode(JSON.stringify(invalid))["ok"], "inconsistent story cannot be written or imported")
	var folder: String = "res://.local/prologue-save-%d-%d" % [OS.get_process_id(),Time.get_ticks_usec()]
	var store: SaveStore = SaveStore.new()
	store.configure(codec,folder)
	check(store.write_slot(1,state)["ok"], "valid story can be written atomically")
	var path: String = folder.path_join("slot_1.json")
	var original: String = FileAccess.get_file_as_string(path)
	check(not store.write_slot(1,invalid)["ok"], "bad story transaction cannot replace an existing slot")
	check(FileAccess.get_file_as_string(path) == original, "rejected semantic save leaves the exact old bytes intact")
	# Isolate backup preservation from the preceding assertion even in a red run.
	var reset_file: FileAccess = FileAccess.open(path,FileAccess.WRITE)
	reset_file.store_string(original)
	reset_file.close()
	state["steps"] = 1
	store.write_slot(1,state)
	var backup: String = FileAccess.get_file_as_string(path + ".bak")
	check(backup == original, "backup fixture starts from the exact known-good record")
	var file: FileAccess = FileAccess.open(path,FileAccess.WRITE)
	file.store_string(JSON.stringify(invalid))
	file.close()
	state["steps"] = 2
	check(store.write_slot(1,state)["ok"], "a new valid snapshot can replace a damaged current record")
	check(FileAccess.get_file_as_string(path + ".bak") == backup, "semantically bad current data cannot displace the last valid native backup")
	var damaged: String = JSON.stringify({"format":BrowserSlotStore.FORMAT,"data":JSON.stringify(invalid),"previous":valid["text"],"modified":1})
	var browser: Dictionary = BrowserSlotStore.prepare_record(codec,valid["text"],damaged,2)
	check(browser["ok"] and JSON.parse_string(browser["text"])["previous"] == valid["text"], "browser atomic record retains a valid backup when current story flags are damaged")
	check(not BrowserSlotStore.prepare_record(codec,JSON.stringify(invalid),browser.get("text"),3)["ok"], "bad imported story never reaches localStorage write preparation")
	if codec.has_method("set_story_validator"):
		codec.call("set_story_validator",_mutate_copy)
		var isolated: Dictionary = codec.encode(legacy)
		check(isolated["ok"] and codec.decode(isolated["text"])["state"] == legacy, "semantic validators cannot mutate caller state or serialized output")
		codec.call("set_story_validator",Callable())
		check(codec.encode(invalid)["ok"], "clearing the optional guard preserves the generic v3 codec contract")
	for filename: String in DirAccess.get_files_at(folder):
		DirAccess.remove_absolute(folder.path_join(filename))
	DirAccess.remove_absolute(folder)
	print("Prologue saves: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
