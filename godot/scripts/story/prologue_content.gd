extends RefCounted
## Validated authored dialogue only. Stage transitions and scene-tree presentation are separate.
const SCENES: Array[String] = ["prologue.01.legend", "prologue.02.lamps", "prologue.03.daily", "prologue.04.ella_returns", "prologue.05.festival", "prologue.06.ella_battle", "prologue.07.starpluck", "prologue.08.awakening", "prologue.09.shade_battle", "prologue.10.aftermath", "prologue.11.departure"]
var _scenes: Dictionary = {}
func configure(data: Variant, words: Dictionary, portraits: Array[String]) -> Array[String]:
	var errors: Array[String] = []
	if not data is Dictionary or data.get("format") != "astra.prologue/1" or not data.get("scenes") is Array or data["scenes"].size() != SCENES.size():
		return ["Expected the eleven authored prologue scenes"]
	var candidate: Dictionary = {}
	for index: int in SCENES.size():
		var scene: Variant = data["scenes"][index]
		if not scene is Dictionary or scene.get("id") != SCENES[index] or not scene.get("segments") is Array or scene["segments"].is_empty():
			errors.append("Invalid or out-of-order prologue scene " + SCENES[index])
			continue
		var segments: Dictionary = {}
		var scene_lines: int = 0
		for raw: Variant in scene["segments"]:
			if not raw is Dictionary or not _id(raw.get("id")) or segments.has(raw.get("id")) or not raw.get("lines") is Array or raw["lines"].is_empty():
				errors.append("Invalid or duplicate segment in " + SCENES[index])
				continue
			var entry: Dictionary = raw
			if not _word(entry.get("summary"), words) or not _page(words[entry["summary"]]):
				errors.append("Missing or oversized skip summary in " + SCENES[index])
			for raw_line: Variant in entry["lines"]:
				scene_lines += 1
				if not raw_line is Dictionary:
					errors.append("Invalid dialogue line in " + SCENES[index])
					continue
				var line: Dictionary = raw_line
				if line.size() != 3 or not _word(line.get("speaker"), words) or not _word(line.get("text"), words) or not line.get("portrait") is String:
					errors.append("Incomplete localized dialogue line in " + SCENES[index])
					continue
				if line["portrait"] != "" and not line["portrait"] in portraits:
					errors.append("Missing portrait " + line["portrait"])
				var text: String = words[line["text"]]
				if not _page(text):
					errors.append("Dialogue exceeds native page bounds: " + line["text"])
			segments[entry["id"]] = entry.duplicate(true)
		if scene_lines > 12:
			errors.append("Prologue scene exceeds twelve lines: " + SCENES[index])
		candidate[scene["id"]] = segments
	if errors.is_empty():
		_scenes = candidate
	return errors
func scene_ids() -> Array[String]:
	return SCENES.duplicate() if not _scenes.is_empty() else []
func segment_ids(scene: String) -> Array[String]:
	var result: Array[String] = []
	for id: String in _scenes.get(scene, {}):
		result.append(id)
	return result
func segment(scene: String, id: String) -> Dictionary:
	return (_scenes.get(scene, {}).get(id, {}) as Dictionary).duplicate(true)
static func _word(value: Variant, words: Dictionary) -> bool:
	return value is String and words.get(value) is String and not String(words[value]).strip_edges().is_empty()
static func _page(text: String) -> bool:
	return text.length() <= 180 and text.split("\n").size() <= 3
static func _id(value: Variant) -> bool:
	if not value is String or String(value).is_empty():
		return false
	for character: String in String(value):
		if not character in "abcdefghijklmnopqrstuvwxyz0123456789_":
			return false
	return true
