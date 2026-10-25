extends SceneTree
## Presentation tests use real resources, without opening platform file dialogs.

var _checks: int = 0
var _failures: Array[String] = []
var _actions: Array[Dictionary] = []
var _closed_count: int = 0
var _state_events: int = 0
var _transfer_events: Array[Dictionary] = []
var _transfer: SaveTransfer

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	_checks += 1
	if not condition:
		_failures.append(message)
		push_error("FAIL: " + message)

func _on_action(action: String, slot: int) -> void:
	_actions.append({"action":action,"slot":slot})

func _on_closed() -> void:
	_closed_count += 1

func _on_state_changed() -> void:
	_state_events += 1

func _run() -> void:
	var catalog: AssetCatalog = AssetCatalog.new()
	_check(catalog.load_pack(), "resources load for save panel")
	var packed: PackedScene = load("res://scenes/ui/save_menu.tscn") as PackedScene
	_check(packed != null, "save menu scene loads")
	if packed == null:
		_finish()
		return
	var menu: SaveMenu = packed.instantiate()
	root.add_child(menu)
	await process_frame
	var words: Dictionary = {
		"save.title":"旅灯与存档", "save.action.save":"保存", "save.action.load":"读取",
		"save.action.export":"导出", "save.action.import":"导入", "save.action.close":"返回", "save.action.new":"开始新旅途",
		"save.confirm.overwrite":"覆盖{slot}吗？原进度将被替换。", "save.confirm.accept":"确认覆盖",
		"save.confirm.cancel":"取消", "save.confirm.new":"开始新旅途？自动档将替换，手动档保留。", "save.confirm.new_accept":"开始新旅途", "save.hint.controls":"方向键选择 · Z确认 · X返回",
		"save.hint.near_lamp":"在已亮的灯柱旁保存", "save.hint.busy":"正在选择或读取文件…"}
	menu.configure(catalog.pixel_font(),catalog.frame_texture(catalog.binding("panel"),0),words)
	menu.action_requested.connect(_on_action)
	menu.closed.connect(_on_closed)
	menu.state_changed.connect(_on_state_changed)
	var slots: Array[Dictionary] = [
		{"name":"自动存档","subtitle":"灯谷镇 · 一盏灯","status":"valid"},
		{"name":"存档一","subtitle":"空存档","status":"empty"},
		{"name":"存档二","subtitle":"芬恩家 · 三盏灯","status":"valid"},
		{"name":"存档三","subtitle":"存档不可用","status":"invalid"}]
	_check(not menu.is_open and not menu.visible, "menu starts closed")
	menu.show_menu(slots,false)
	await process_frame
	_check(menu.position == Vector2.ZERO and menu.size == Vector2(456,218), "component size is fixed while parent owns placement")
	_check(menu.is_open and menu.visible and menu.selected_slot == 1, "first open selects manual slot one")
	_check(menu.get_node("Slots").get_child_count() == 4, "four independent slot buttons exist")
	_check(menu.get_node("Actions").get_child_count() == 6, "save/load/export/import/new/close actions exist")
	_check(menu.get_node("Actions/Save").disabled, "manual save is disabled away from a lit lamp")
	_check(menu.get_node("Actions/Load").disabled, "empty slot cannot be loaded")
	_check(not menu.get_node("Actions/Export").disabled and not menu.get_node("Actions/Import").disabled, "file operations remain independent of selected slot")
	_check(menu.content_fits(), "labels fit the pixel panel")
	menu.get_node("Slots/Slot0").grab_focus()
	_check(menu.selected_slot == 0, "directional focus selects the matching slot")
	_check(menu.get_node("Actions/Save").disabled and not menu.get_node("Actions/Load").disabled, "auto slot can load but cannot be manually overwritten")
	menu.get_node("Actions/Load").grab_focus()
	menu.confirm_focused()
	_check(_actions == [{"action":"load","slot":0}], "Z dispatches exactly the focused action and selected slot")
	menu.refresh_slots(slots,true)
	menu.get_node("Slots/Slot1").pressed.emit()
	_check(not menu.get_node("Actions/Save").disabled, "lit lamp enables a manual slot")
	menu.get_node("Actions/Save").pressed.emit()
	_check(_actions.back() == {"action":"save","slot":1} and not menu.snapshot()["confirming"], "empty manual slot saves without an overwrite prompt")
	menu.get_node("Slots/Slot2").pressed.emit()
	var count: int = _actions.size()
	menu.get_node("Actions/Save").pressed.emit()
	_check(menu.snapshot()["confirming"] and _actions.size() == count, "occupied manual slot requires confirmation")
	menu.get_node("ConfirmOverlay/Prompt/Accept").pressed.emit()
	_check(_actions.size() == count, "same-frame confirmation cannot bypass the prompt")
	await process_frame
	_check(get_root().gui_get_focus_owner() == menu.get_node("ConfirmOverlay/Prompt/Cancel"), "overwrite prompt defaults to cancel rather than destructive action")
	menu.confirm_focused()
	_check(not menu.snapshot()["confirming"] and _actions.size() == count, "repeated confirm key cancels instead of overwriting")
	menu.get_node("Actions/Save").pressed.emit()
	await process_frame
	menu.get_node("ConfirmOverlay/Prompt/Accept").grab_focus()
	menu.confirm_focused()
	_check(_actions.size() == count + 1 and _actions.back() == {"action":"save","slot":2}, "explicit confirmation dispatches a single overwrite")
	menu.get_node("Slots/Slot3").pressed.emit()
	menu.get_node("Actions/Save").pressed.emit()
	_check(menu.snapshot()["confirming"], "invalid occupied slot is also protected by overwrite confirmation")
	menu.cancel()
	_check(menu.is_open and not menu.snapshot()["confirming"], "cancel first dismisses only the overwrite prompt")
	menu.refresh_slots(slots,false)
	menu.get_node("Actions/New").pressed.emit()
	_check(menu.snapshot()["confirming"] and menu.snapshot()["action"] == "new", "new journey has its own confirmation even away from lamps")
	_check(menu.get_node("ConfirmOverlay/Prompt/Message").text == words["save.confirm.new"], "new journey does not reuse overwrite-slot wording")
	await process_frame
	menu.get_node("ConfirmOverlay/Prompt/Accept").grab_focus()
	menu.confirm_focused()
	_check(_actions.back() == {"action":"new","slot":3}, "explicit new-journey confirmation emits a distinct action")
	menu.set_busy(true)
	count = _actions.size()
	menu.get_node("Actions/Import").pressed.emit()
	menu.cancel()
	menu.confirm_focused()
	_check(menu.is_open and menu.snapshot()["busy"] and _actions.size() == count, "active platform transfer locks actions without closing the menu")
	menu.set_busy(false)
	menu.set_status("保存完成")
	_check(menu.get_node("Status").text == "保存完成", "caller-provided localized status reaches the panel")
	menu.cancel()
	_check(not menu.is_open and not menu.visible and _closed_count == 1, "normal cancel closes once")
	menu.cancel()
	menu.confirm_focused()
	_check(_closed_count == 1 and _state_events > 0, "closed inputs are harmless and UI changes publish events")
	menu.queue_free()
	await process_frame
	_check_transfer_callbacks()
	_check_native_transfer_files()
	await process_frame
	_finish()

func _check_transfer_callbacks() -> void:
	_transfer = SaveTransfer.new()
	root.add_child(_transfer)
	_transfer.import_ready.connect(func(text: String) -> void: _transfer_events.append({"kind":"import","text":text,"busy":_transfer.is_busy}))
	_transfer.failed.connect(func(key: String) -> void: _transfer_events.append({"kind":"error","key":key,"busy":_transfer.is_busy}))
	_transfer.call("_set_busy",true)
	_transfer.call("_on_web_result",["ok","{\"version\":3}"])
	_check(_transfer_events.back() == {"kind":"import","text":"{\"version\":3}","busy":false}, "transfer releases busy before delivering imported text")
	var count: int = _transfer_events.size()
	_transfer.call("_on_web_result",["ok","stale callback"])
	_check(_transfer_events.size() == count, "stale callback after completion does not import twice")
	_transfer.call("_set_busy",true)
	_transfer.call("_on_web_result",["cancel",""])
	_check(not _transfer.is_busy and _transfer_events.size() == count, "file chooser cancellation clears busy without reporting failure")
	_transfer.call("_set_busy",true)
	_transfer.call("_on_web_result",["ok","x".repeat(512001)])
	_check(_transfer_events.back() == {"kind":"error","key":"save.too_large","busy":false}, "oversized callback payload is rejected before gameplay receives it")
	_transfer.call("_set_busy",true)
	_transfer.call("_on_web_result",["error","untrusted.key"])
	_check(_transfer_events.back()["key"] == "save.read_failed", "browser errors cannot inject arbitrary localization keys")
	_transfer.queue_free()

func _check_native_transfer_files() -> void:
	var directory: String = "res://.local/transfer-%d-%d" % [OS.get_process_id(),Time.get_ticks_usec()]
	DirAccess.make_dir_recursive_absolute(directory)
	var transfer: SaveTransfer = SaveTransfer.new()
	root.add_child(transfer)
	var received: Array[String] = []
	transfer.import_ready.connect(func(text: String) -> void: received.append(text))
	var path: String = directory.path_join("journey.json")
	var payload: String = "{\"version\":3,\"note\":\"灯谷\"}"
	transfer.set("_pending_export",payload)
	transfer.call("_set_busy",true)
	transfer.call("_on_export_file",path)
	_check(FileAccess.get_file_as_string(path)==payload and not transfer.is_busy,"native export callback writes exact UTF8 bytes and releases its lock")
	var file: FileAccess = FileAccess.open(path,FileAccess.WRITE)
	file.store_buffer(PackedByteArray([0xef,0xbb,0xbf]))
	file.store_buffer(payload.to_utf8_buffer())
	file.close()
	transfer.call("_set_busy",true)
	transfer.call("_on_import_file",path)
	_check(received==[payload] and not transfer.is_busy,"native import accepts UTF8 BOM consistently with browser TextDecoder")
	_check(DirAccess.open(directory).get_files().size()==1,"native transfer leaves no temporary files")
	transfer.queue_free()
	DirAccess.remove_absolute(path)
	DirAccess.remove_absolute(directory)

func _finish() -> void:
	print("Save UI and transfer: %d checks, %d failures" % [_checks,_failures.size()])
	quit(0 if _failures.is_empty() else 1)
