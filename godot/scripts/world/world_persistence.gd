class_name WorldPersistence
extends RefCounted
## Save policy and transactions. The world supplies state; presentation listens to results.

signal changed(result: Dictionary)

var codec: SaveCodec = SaveCodec.new()
var store: SaveStore = SaveStore.new()
var enabled: bool = true
var auto_paused: bool = false
var last_status: String = ""
var last_slot: int = 0
var _busy: bool = false
var _snapshot: Callable
var _restore: Callable
var _start_map_id: String = ""

func configure(maps: Dictionary, root_path: String, persistence_enabled: bool, snapshot: Callable, restore: Callable, start_map_id: String = "") -> Array[String]:
	var errors: Array[String] = codec.configure(maps)
	if not errors.is_empty():
		return errors
	enabled = persistence_enabled
	_snapshot = snapshot
	_restore = restore
	_start_map_id = start_map_id
	store.configure(codec, root_path)
	return []

func is_busy() -> bool:
	return _busy

func startup() -> Dictionary:
	if not enabled:
		return {"ok": true, "error": "", "missing": true}
	if _busy:
		return _failure("save.busy", "startup", 0)
	_busy = true
	var result: Dictionary = store.read_slot(0)
	if not bool(result.get("ok", false)):
		_busy = false
		if result.get("error") == "save.empty":
			return {"ok": true, "error": "", "missing": true}
		auto_paused = true
		return _record(result, "startup", 0, "save.auto_invalid")
	var restored: bool = bool(_restore.call(result["state"]))
	_busy = false
	if not restored:
		auto_paused = true
		return _record({"ok": false, "error": "save.bad_position"}, "startup", 0, "save.auto_invalid")
	return _record(result, "startup", 0, "save.loaded")

func autosave() -> Dictionary:
	if not enabled:
		return {"ok": false, "error": "save.disabled"}
	if auto_paused:
		return {"ok": false, "error": "save.auto_paused"}
	if _busy:
		return _failure("save.busy", "auto", 0)
	_busy = true
	var result: Dictionary = store.write_slot(0, _snapshot.call())
	_busy = false
	if not bool(result.get("ok", false)):
		auto_paused = true
	return _record(result, "auto", 0, "save.auto_saved" if result.get("ok", false) else String(result.get("error", "save.io")))

func save_slot(slot: int) -> Dictionary:
	if _busy:
		return _failure("save.busy", "save", slot)
	if slot < 1 or slot > 3:
		return _failure("save.invalid_slot", "save", slot)
	if not enabled:
		return _failure("save.disabled", "save", slot)
	var state: Dictionary = _snapshot.call()
	if not codec.can_manual_save(state):
		return _failure("save.not_near_lamp", "save", slot)
	_busy = true
	var result: Dictionary = store.write_slot(slot, state)
	_busy = false
	if bool(result.get("ok", false)):
		auto_paused = false
	return _record(result, "save", slot, "save.saved" if result.get("ok", false) else String(result.get("error", "save.io")))

func load_slot(slot: int) -> Dictionary:
	if _busy:
		return _failure("save.busy", "load", slot)
	if slot < 0 or slot > 3:
		return _failure("save.invalid_slot", "load", slot)
	if not enabled:
		return _failure("save.disabled", "load", slot)
	_busy = true
	var result: Dictionary = store.read_slot(slot)
	return _apply_loaded_result(result, "load", slot, "save.loaded")

func import_save(text: String) -> Dictionary:
	if _busy:
		return _failure("save.busy", "import", -1)
	_busy = true
	return _apply_loaded_result(codec.decode(text), "import", -1, "save.imported")

func start_new_game() -> Dictionary:
	if _busy:
		return _failure("save.busy", "new", -1)
	var state: Dictionary = codec.fresh(_start_map_id)
	if state.is_empty():
		return _failure("save.unsupported_map", "new", -1)
	_busy = true
	return _apply_loaded_result({"ok": true, "error": "", "state": state}, "new", -1, "save.new_started")

func export_save() -> Dictionary:
	if _busy:
		return _failure("save.busy", "export", -1)
	var result: Dictionary = codec.encode(_snapshot.call())
	return _record(result, "export", -1, "save.export_requested" if result.get("ok", false) else String(result.get("error", "save.invalid")))

func can_manual_save() -> bool:
	return enabled and not _busy and codec.can_manual_save(_snapshot.call())

func summaries() -> Array[Dictionary]:
	if enabled:
		return store.summaries()
	var slots: Array[Dictionary] = []
	for slot: int in range(4):
		slots.append({"slot": slot, "status": "empty", "map_id": "", "lamps": 0, "steps": 0, "modified": 0, "error": "save.disabled"})
	return slots

func report_failure(error: String, action: String = "operation") -> Dictionary:
	return _failure(error, action, last_slot)

func report_success(status: String, action: String = "operation") -> Dictionary:
	return _record({"ok": true, "error": ""}, action, last_slot, status)

func _apply_loaded_result(result: Dictionary, action: String, slot: int, success_status: String) -> Dictionary:
	if not bool(result.get("ok", false)):
		_busy = false
		return _record(result, action, slot, String(result.get("error", "save.invalid")))
	if not bool(_restore.call(result["state"])):
		_busy = false
		return _failure("save.bad_position", action, slot)
	# Explicit load/import establishes the next continue point without touching manual slots.
	var automatic: Dictionary = store.write_slot(0, _snapshot.call()) if enabled else {"ok": false, "error": "save.disabled"}
	auto_paused = not bool(automatic.get("ok", false))
	_busy = false
	result["persisted"] = not auto_paused
	if auto_paused:
		result["warning"] = automatic.get("error", "save.io")
	var volatile_status: String = "save.new_volatile" if action == "new" else "save.loaded_volatile"
	return _record(result, action, slot, volatile_status if auto_paused else success_status)

func _failure(error: String, action: String, slot: int) -> Dictionary:
	return _record({"ok": false, "error": error}, action, slot, error)

func _record(result: Dictionary, action: String, slot: int, status: String) -> Dictionary:
	var recorded: Dictionary = result.duplicate(true)
	last_status = status
	last_slot = slot
	recorded["action"] = action
	recorded["slot"] = slot
	recorded["status"] = status
	changed.emit(recorded.duplicate(true))
	return recorded
