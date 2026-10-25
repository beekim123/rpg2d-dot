class_name WorldDialogue
extends RefCounted
## A story cursor with an injected flag transaction; no scene or UI dependencies.

signal line_ready(line: Dictionary)
signal closed(error: String)

var script_id: String = ""
var _active: bool = false
var _cursor: int = 0
var _line: Dictionary = {}
var _rules: StoryRules
var _read_flags: Callable
var _commit_flags: Callable

func configure(rules: StoryRules, read_flags: Callable, commit_flags: Callable) -> void:
	_rules = rules
	_read_flags = read_flags
	_commit_flags = commit_flags

func begin(id: String) -> bool:
	if _active or _rules == null or not _read_flags.is_valid() or not _commit_flags.is_valid():
		return false
	script_id = id
	_cursor = 0
	_line = {}
	_active = true
	return advance()

func advance() -> bool:
	if not _active:
		return false
	var flags: Dictionary = _read_flags.call()
	var result: Dictionary = _rules.run(script_id, flags, _cursor)
	if not bool(result.get("ok", false)):
		cancel(String(result.get("error", "Story execution failed")))
		return false
	if not bool(_commit_flags.call(result["flags"])):
		cancel("Story flag transaction was rejected")
		return false
	if not _active:
		return false
	_cursor = int(result["pc"])
	if bool(result.get("done", false)):
		cancel()
		return true
	_line = (result["line"] as Dictionary).duplicate(true)
	line_ready.emit(_line.duplicate(true))
	return true

func cancel(error: String = "") -> void:
	if not _active:
		return
	_active = false
	script_id = ""
	_cursor = 0
	_line = {}
	closed.emit(error)

func is_active() -> bool:
	return _active

func current_line() -> Dictionary:
	return _line.duplicate(true)
