class_name WorldSaveController
extends RefCounted
## Connect save presentation to transactions without owning game state or filesystem rules.

signal changed

var _persistence: WorldPersistence
var _menu: SaveMenu
var _transfer: SaveTransfer
var _words: Dictionary = {}
var _map_title: Callable
var _can_operate: Callable

func configure(persistence: WorldPersistence, menu: SaveMenu, transfer: SaveTransfer, words: Dictionary, map_title: Callable, can_operate: Callable) -> void:
	_persistence = persistence
	_menu = menu
	_transfer = transfer
	_words = words.duplicate(true)
	_map_title = map_title
	_can_operate = can_operate
	_menu.action_requested.connect(_on_action)
	_menu.closed.connect(_on_closed)
	_menu.state_changed.connect(_on_menu_state_changed)
	_transfer.import_ready.connect(_on_import_ready)
	_transfer.failed.connect(_on_transfer_failed)
	_transfer.exported.connect(_on_exported)
	_transfer.busy_changed.connect(_on_transfer_busy)
	_persistence.changed.connect(_on_result)

func is_active() -> bool:
	return _menu != null and (_menu.is_open or _transfer.is_busy)

func is_busy() -> bool:
	return _transfer != null and (_transfer.is_busy or _persistence.is_busy())

func open() -> bool:
	if is_active() or is_busy() or not bool(_can_operate.call()):
		return false
	_menu.show_menu(_slot_labels(), _persistence.can_manual_save())
	_menu.set_status(_text(_persistence.last_status))
	changed.emit()
	return true

func close() -> void:
	if _menu != null and not is_busy():
		_menu.close()

func cancel() -> void:
	if _menu != null and not is_busy():
		_menu.cancel()
		changed.emit()

func confirm() -> void:
	if _menu != null and _menu.is_open and not is_busy():
		_menu.confirm_focused()
		changed.emit()

func snapshot() -> Dictionary:
	if _menu == null:
		return {"open": false, "slot": 1, "confirming": false, "busy": false}
	var state: Dictionary = _menu.snapshot()
	state["open"] = _menu.is_open
	state["busy"] = is_busy()
	return state

func _on_action(action: String, slot: int) -> void:
	if is_busy() or not bool(_can_operate.call()):
		_persistence.report_failure("save.busy", action)
		return
	match action:
		"save":
			_persistence.save_slot(slot)
		"load":
			_persistence.load_slot(slot)
		"new":
			_persistence.start_new_game()
		"import":
			_transfer.choose_import()
		"export":
			var result: Dictionary = _persistence.export_save()
			if bool(result.get("ok", false)):
				_transfer.export_text(String(result["text"]))
		"close":
			close()
	changed.emit()

func _on_import_ready(text: String) -> void:
	if not bool(_can_operate.call()):
		_persistence.report_failure("save.busy", "import")
		return
	_persistence.import_save(text)

func _on_transfer_failed(error: String) -> void:
	_persistence.report_failure(error, "transfer")

func _on_exported() -> void:
	_persistence.report_success("save.export_requested" if OS.has_feature("web") else "save.exported", "export")

func _on_transfer_busy(busy: bool) -> void:
	_menu.set_busy(busy)
	changed.emit()

func _on_result(result: Dictionary) -> void:
	if _menu.is_open:
		_menu.refresh_slots(_slot_labels(), _persistence.can_manual_save())
		_menu.set_status(_text(String(result.get("status", "save.failed"))))
	if bool(result.get("ok", false)) and result.get("action") in ["load", "import", "new"]:
		_menu.close()
	changed.emit()

func _on_closed() -> void:
	changed.emit()

func _on_menu_state_changed() -> void:
	changed.emit()

func _slot_labels() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for summary: Dictionary in _persistence.summaries():
		var slot: int = int(summary["slot"])
		var name: String = _text("save.slot.auto") if slot == 0 else _text("save.slot.manual").format({"slot": slot})
		var status: String = String(summary["status"])
		var subtitle: String = _text("save.slot.empty")
		if status == "valid":
			var place: String = _map_title.call(String(summary["map_id"]))
			# The location suffix keeps legacy region-plus-place names inside one slot row.
			place = place.split(" · ")[-1]
			if not place.is_empty():
				name += " · " + place
			var local_stamp: int = int(summary["modified"]) + int(Time.get_time_zone_from_system().get("bias", 0)) * 60
			var date: Dictionary = Time.get_datetime_dict_from_unix_time(local_stamp)
			var time: String = "%02d/%02d %02d:%02d" % [date["month"], date["day"], date["hour"], date["minute"]]
			subtitle = _text("save.slot.detail").format({"time": time, "lamps": summary["lamps"]})
		elif status == "invalid":
			subtitle = _text("save.slot.invalid")
		result.append({"slot": slot, "name": name, "subtitle": subtitle, "status": status})
	return result

func _text(key: String) -> String:
	if key.is_empty():
		return ""
	return String(_words.get(key, _words.get("save.failed", "")))
