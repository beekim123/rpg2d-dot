class_name SaveStore
extends RefCounted
## Fixed slots: atomic file replacement, or synchronous browser user-storage records.

const Codec = preload("res://scripts/save/save_codec.gd")
const BrowserStore = preload("res://scripts/save/browser_slot_store.gd")
var _codec: Codec
var _root: String = ""
var _browser: BrowserStore

func configure(codec: Codec, root_path: String) -> void:
	_codec = codec
	_root = root_path.trim_suffix("/") if not root_path.ends_with("://") else root_path
	_browser = null
	if _configured() and OS.has_feature("web") and _root.begins_with("user://"):
		_browser = BrowserStore.new()
		_browser.configure(_codec,_root)

func write_slot(slot: int, state: Dictionary) -> Dictionary:
	if not _valid_slot(slot):
		return _failure("save.invalid_slot")
	if not _configured():
		return _failure("save.io")
	var encoded: Dictionary = _codec.encode(state)
	if not encoded["ok"]:
		return _failure(encoded["error"])
	if _browser != null:
		return _write_browser(slot,encoded["text"])
	if not _ensure_directory():
		return _failure("save.io")
	var path: String = _slot_path(slot)
	if DirAccess.dir_exists_absolute(path):
		return _failure("save.io")
	var temporary: String = _prepare(path,encoded["text"])
	if temporary.is_empty():
		return _failure("save.io")
	# A corrupt current file must not replace an existing last-good backup.
	if FileAccess.file_exists(path):
		var old: Dictionary = _read_text(path)
		if not old["ok"] and old["error"] == "save.io":
			_remove_temporary(temporary)
			return _failure("save.io")
		if old["ok"] and _codec.decode(old["text"])["ok"]:
			var backup: String = path+".bak"
			if DirAccess.dir_exists_absolute(backup):
				_remove_temporary(temporary)
				return _failure("save.io")
			var backup_temporary: String = _prepare(backup,old["text"])
			if backup_temporary.is_empty():
				_remove_temporary(temporary)
				return _failure("save.io")
			if DirAccess.rename_absolute(backup_temporary,backup) != OK:
				_remove_temporary(backup_temporary)
				_remove_temporary(temporary)
				return _failure("save.io")
	if DirAccess.rename_absolute(temporary,path) != OK:
		_remove_temporary(temporary)
		return _failure("save.io")
	return {"ok":true,"error":""}

func read_slot(slot: int) -> Dictionary:
	if not _valid_slot(slot):
		return _failure("save.invalid_slot")
	if not _configured():
		return _failure("save.io")
	if _browser != null:
		var browser_value: Dictionary = _browser.read_raw(slot)
		if not browser_value["ok"]:
			return browser_value
		if not browser_value["missing"]:
			return BrowserStore.decode_record(_codec,browser_value["text"])
	# Compatibility is read-only and only applies when the browser key is absent.
	if FileAccess.file_exists(_root) or DirAccess.dir_exists_absolute(_slot_path(slot)):
		return _failure("save.io")
	var path: String = _slot_path(slot)
	if not FileAccess.file_exists(path):
		return _failure("save.empty")
	var raw: Dictionary = _read_text(path)
	if not raw["ok"]:
		return raw
	var loaded: Dictionary = _codec.decode(raw["text"])
	if loaded["ok"]:
		loaded["modified"] = FileAccess.get_modified_time(path)
	return loaded

func summaries() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for slot: int in range(4):
		var loaded: Dictionary = read_slot(slot)
		var row: Dictionary = {"slot":slot,"status":"empty" if loaded.get("error")=="save.empty" else "invalid", "map_id":"","lamps":0,"steps":0,"modified":0,"error":loaded.get("error","")}
		if loaded["ok"]:
			var state: Dictionary = loaded["state"]
			row.merge({"status":"valid","map_id":state["mapId"],"lamps":state["lamps"].size(),"steps":state["steps"],"modified":loaded.get("modified",0),"error":""},true)
		result.append(row)
	return result

func _write_browser(slot: int, data: String) -> Dictionary:
	var old: Dictionary = _browser.read_raw(slot)
	if not old["ok"]:
		return old
	var legacy_data: String = ""
	var legacy_previous: String = ""
	if old["missing"]:
		var current: Dictionary = _read_legacy_text(_slot_path(slot))
		var previous: Dictionary = _read_legacy_text(_slot_path(slot)+".bak")
		if current.get("error") == "save.io" or previous.get("error") == "save.io":
			return _failure("save.io")
		legacy_data = current.get("text","")
		legacy_previous = previous.get("text","")
	var prepared: Dictionary = BrowserStore.prepare_record(_codec,data,null if old["missing"] else old["text"],int(Time.get_unix_time_from_system()),legacy_data,legacy_previous)
	if not prepared["ok"]:
		return _failure(prepared["error"])
	return _browser.write_record(slot,prepared["text"])

func _read_legacy_text(path: String) -> Dictionary:
	if FileAccess.file_exists(_root) or DirAccess.dir_exists_absolute(path):
		return _failure("save.io")
	return _read_text(path) if FileAccess.file_exists(path) else {"ok":true,"error":"","text":""}

func _ensure_directory() -> bool:
	var cursor: String = _root
	while not cursor.is_empty():
		if FileAccess.file_exists(cursor):
			return false
		if DirAccess.dir_exists_absolute(cursor):
			break
		var parent: String = cursor.get_base_dir()
		if parent == cursor or cursor in ["res://","user://","/"]:
			break
		cursor = parent
	return DirAccess.make_dir_recursive_absolute(_root) == OK

func _read_text(path: String) -> Dictionary:
	var file: FileAccess = FileAccess.open(path,FileAccess.READ)
	if file == null:
		return _failure("save.io")
	var length: int = file.get_length()
	if length > Codec.MAX_BYTES:
		file.close()
		return _failure("save.too_large")
	var bytes: PackedByteArray = file.get_buffer(length)
	var error: Error = file.get_error()
	file.close()
	if bytes.size()!=length or (error!=OK and error!=ERR_FILE_EOF):
		return _failure("save.io")
	var text: String = bytes.get_string_from_utf8()
	if text.to_utf8_buffer()!=bytes:
		return _failure("save.invalid")
	return {"ok":true,"error":"","text":text}

## Preparation never touches the destination, and tracks only the temp it created.
func _prepare(destination: String, text: String) -> String:
	var path: String = destination+".tmp-%d-%d" % [OS.get_process_id(),Time.get_ticks_usec()]
	if FileAccess.file_exists(path) or DirAccess.dir_exists_absolute(path):
		return ""
	var file: FileAccess = FileAccess.open(path,FileAccess.WRITE)
	if file == null:
		return ""
	file.store_string(text)
	file.flush()
	var error: Error = file.get_error()
	file.close()
	if error!=OK:
		_remove_temporary(path)
		return ""
	var actual: Dictionary = _read_text(path)
	if not actual["ok"] or actual["text"]!=text or not _codec.decode(actual["text"])["ok"]:
		_remove_temporary(path)
		return ""
	return path

func _remove_temporary(path: String) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)
func _valid_slot(slot: int) -> bool:
	return slot>=0 and slot<=3
func _configured() -> bool:
	return _codec!=null and not _root.is_empty() and (_root.begins_with("user://") or _root.begins_with("res://") or _root.is_absolute_path())
func _slot_path(slot: int) -> String:
	return _root.path_join("slot_%d.json" % slot)
func _failure(error: String) -> Dictionary:
	return {"ok":false,"error":error}
