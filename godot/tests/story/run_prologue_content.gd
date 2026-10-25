extends SceneTree
class InvalidIndexCatalog extends AssetCatalog:
	var candidate: Dictionary = {}
	func _read_json_object(path: String) -> Dictionary:
		return candidate.duplicate(true) if path == PACK_PATH else super._read_json_object(path)
var checks: int = 0
var failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error("FAIL: " + label)
func _run() -> void:
	var catalog: AssetCatalog = AssetCatalog.new()
	check(catalog.load_pack(), "resource package loads")
	var words: Dictionary = catalog.locale("zh-Hans")
	check(words.has("prologue.01.legend.01") and words.has("name.finn"), "independent prologue text is merged with existing dialogue")
	var data: Dictionary = catalog.cinematic_data("prologue")
	check(data.get("scenes", []).size() == 11, "eleven scenes cross the managed content boundary")
	check(ResourceLoader.exists("res://scripts/story/prologue_content.gd"), "independent prologue content validator exists")
	if failures.is_empty():
		var book: RefCounted = load("res://scripts/story/prologue_content.gd").new()
		var portraits: Array[String] = []
		for id: String in catalog.definitions:
			if catalog.definitions[id].get("category") == "portrait":
				portraits.append(id)
		check(book.configure(data, words, portraits).is_empty(), "authored prologue validates")
		var box: DialogueBox = (load("res://scenes/ui/dialogue_box.tscn") as PackedScene).instantiate()
		root.add_child(box)
		box.configure(catalog.pixel_font(), catalog.frame_texture(catalog.binding("panel"), 0), words["hint.dialogue"])
		var segments: int = 0
		var lines: int = 0
		for scene_id: String in book.scene_ids():
			for segment_id: String in book.segment_ids(scene_id):
				var segment: Dictionary = book.segment(scene_id, segment_id)
				segments += 1
				lines += segment["lines"].size()
				check(words.has(segment["summary"]), "every skippable segment has a localized summary")
				for page: Dictionary in segment["lines"] + [{"speaker":"name.narrator", "portrait":"", "text":segment["summary"]}]:
					box.show_line(words[page["speaker"]], words[page["text"]], null if page["portrait"] == "" else catalog.frame_texture(page["portrait"], 0))
					box.reveal_all()
					await process_frame
					check(box.content_fits(), "prologue page fits native font and panel: " + page["text"])
		check(segments == 24 and lines == 77, "all24 segments and77 authored lines are available")
		var line: Dictionary = book.segment("prologue.01.legend", "main")
		line["lines"][0]["text"] = "corrupted"
		check(book.segment("prologue.01.legend", "main")["lines"][0]["text"] == "prologue.01.legend.01", "returned data cannot alter authored source")
		check(book.segment("missing", "main").is_empty() and book.segment_ids("missing").is_empty(), "unknown IDs cannot alias another scene")
		for bad: Variant in [null, [], "bad", 2, true, {}, {"format":"astra.prologue/1", "scenes":null}]:
			check(not book.configure(bad, words, portraits).is_empty(), "malformed root rejected")
		for corruption: String in ["duplicate_scene", "missing_scene", "duplicate_segment", "empty_lines", "bad_line", "missing_text", "missing_portrait", "missing_summary", "summary_lines", "summary_length"]:
			var candidate: Dictionary = data.duplicate(true)
			var candidate_words: Dictionary = words.duplicate(true)
			match corruption:
				"duplicate_scene": candidate["scenes"][1]["id"] = candidate["scenes"][0]["id"]
				"missing_scene": candidate["scenes"].pop_back()
				"duplicate_segment": candidate["scenes"][1]["segments"][1]["id"] = "wake"
				"empty_lines": candidate["scenes"][0]["segments"][0]["lines"] = []
				"bad_line": candidate["scenes"][0]["segments"][0]["lines"][0] = null
				"missing_text": candidate["scenes"][0]["segments"][0]["lines"][0]["text"] = "missing"
				"missing_portrait": candidate["scenes"][0]["segments"][0]["lines"][0]["portrait"] = "portrait.missing"
				"missing_summary": candidate["scenes"][0]["segments"][0]["summary"] = "missing"
				"summary_lines": candidate_words[candidate["scenes"][0]["segments"][0]["summary"]] = "一\n二\n三\n四"
				"summary_length": candidate_words[candidate["scenes"][0]["segments"][0]["summary"]] = "灯".repeat(181)
			check(not book.configure(candidate, candidate_words, portraits).is_empty(), corruption + " rejected")
			check(book.scene_ids().size() == 11, "failed replacement preserves last valid content")
			check(book.segment("prologue.01.legend", "main") == data["scenes"][0]["segments"][0], "failed replacement preserves exact prior segment")
		box.queue_free()
		await process_frame
		var original_pack: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(AssetCatalog.PACK_PATH))
		for field: String in ["cinematics", "locale_bundles"]:
			for bad: Variant in [null, [], "bad", 2, true]:
				var broken: InvalidIndexCatalog = InvalidIndexCatalog.new()
				broken.candidate = original_pack.duplicate(true)
				broken.candidate[field] = bad
				check(not broken.load_pack(), "bad resource index is rejected before access: " + field)
		for bad: Variant in [null, [], "bad", 2, true]:
			var broken: InvalidIndexCatalog = InvalidIndexCatalog.new()
			broken.candidate = original_pack.duplicate(true)
			broken.candidate["locale_bundles"]["zh-Hans"] = bad
			check(not broken.load_pack(), "bad locale group rejected before locale merge")
	print("PrologueContent: %d checks, %d failures" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)
