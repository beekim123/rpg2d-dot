class_name StoryRules
extends RefCounted
## Pure, transactional execution of localized dialogue command dictionaries.

const INSTRUCTION_BUDGET: int = 100
var _scripts: Dictionary = {}

## The previous valid script set survives any failed configuration attempt.
func configure(scripts: Dictionary, words: Dictionary, portraits: Array[String]) -> Array[String]:
	var errors: Array[String] = []
	var known_portraits: Dictionary = {}
	for portrait: String in portraits:
		if portrait.is_empty():
			errors.append("Invalid portrait ID")
		known_portraits[portrait] = true
	for script_id: Variant in scripts:
		if not _stable_id(script_id):
			errors.append("Invalid script ID")
			continue
		if not scripts[script_id] is Array:
			errors.append("Script %s must contain an array of commands" % script_id)
			continue
		var script: Array = scripts[script_id]
		for index: int in range(script.size()):
			var error: String = _command_error(script[index], script.size(), words, known_portraits)
			if not error.is_empty():
				errors.append("Script %s at %d: %s" % [script_id, index, error])
	if errors.is_empty():
		_scripts = scripts.duplicate(true)
	return errors

## Writes are local until a say/end boundary. Any failure returns the original state.
func run(script_id: String, input_flags: Dictionary, cursor: int = 0) -> Dictionary:
	if not _scripts.has(script_id):
		return _failure(input_flags, cursor, "Unknown script: " + script_id)
	if not _valid_flags(input_flags):
		return _failure(input_flags, cursor, "Invalid story flags")
	var script: Array = _scripts[script_id]
	if cursor < 0 or cursor > script.size():
		return _failure(input_flags, cursor, "Invalid script cursor")
	var flags: Dictionary = input_flags.duplicate(true)
	var pc: int = cursor
	for _step: int in range(INSTRUCTION_BUDGET):
		if pc == script.size():
			return _success(flags, pc, true)
		var command: Dictionary = script[pc]
		pc += 1
		match command["op"]:
			"say":
				var result: Dictionary = _success(flags, pc, false)
				result["line"] = command.duplicate(true)
				return result
			"set":
				flags[command["flag"]] = command["value"]
			"if":
				if flags.get(command["flag"], false) == command["equals"]:
					pc = int(command["goto"])
			"end":
				return _success(flags, pc, true)
	if pc == script.size():
		return _success(flags, pc, true)
	return _failure(input_flags, cursor, "Script instruction budget exceeded")

func _command_error(value: Variant, length: int, words: Dictionary, portraits: Dictionary) -> String:
	if not value is Dictionary:
		return "Expected command dictionary"
	var command: Dictionary = value
	match command.get("op"):
		"say":
			if not _word_exists(command.get("speaker"), words) or not _word_exists(command.get("text"), words):
				return "Missing speaker or dialogue text"
			if not command.get("portrait") is String or not portraits.has(command["portrait"]):
				return "Unknown portrait"
		"set":
			if not _stable_id(command.get("flag")) or not command.get("value") is bool:
				return "Invalid flag assignment"
		"if":
			if not _stable_id(command.get("flag")) or not command.get("equals") is bool:
				return "Invalid flag condition"
			if not _jump_valid(command.get("goto"), length):
				return "Invalid jump target"
		"end":
			pass
		_:
			return "Unsupported command"
	return ""

func _success(flags: Dictionary, cursor: int, done: bool) -> Dictionary:
	return {"ok": true, "flags": flags, "pc": cursor, "done": done}

func _failure(flags: Dictionary, cursor: int, error: String) -> Dictionary:
	return {"ok": false, "flags": flags.duplicate(true), "pc": cursor, "done": false, "error": error}

func _word_exists(value: Variant, words: Dictionary) -> bool:
	return value is String and not String(value).is_empty() and words.has(value) and words[value] is String and not String(words[value]).is_empty()

func _jump_valid(value: Variant, length: int) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) >= 0.0 and floor(float(value)) == float(value) and float(value) < float(length)

func _valid_flags(flags: Dictionary) -> bool:
	for key: Variant in flags:
		if not _stable_id(key) or not flags[key] is bool:
			return false
	return true

## Same ASCII flag-ID grammar as WorldData, without a runtime service dependency.
func _stable_id(value: Variant) -> bool:
	if not value is String or String(value).is_empty() or value in ["__proto__", "constructor", "prototype"]:
		return false
	var identifier: String = value
	for index: int in range(identifier.length()):
		var code: int = identifier.unicode_at(index)
		var word: bool = (code >= 48 and code <= 57) or (code >= 65 and code <= 90) or (code >= 97 and code <= 122) or code == 95
		if not word and not (index > 0 and code == 46):
			return false
	return true
