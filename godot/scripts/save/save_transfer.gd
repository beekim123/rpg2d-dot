class_name SaveTransfer
extends Node
## User-initiated file transfer only; decoding and restoring gameplay belong to the controller.

signal import_ready(text: String)
signal failed(error_key: String)
signal exported
signal busy_changed(busy: bool)

const MAX_BYTES: int = 512000
const EXPORT_NAME: String = "astra-save.json"
const WEB_PICKER: String = """
window.ASTRA_SAVE_FILES = {
  current: null,
  cancel() { if (this.current) this.current(); },
  pick(callback) {
    this.cancel();
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json'; input.multiple = false;
    input.id = 'astra-save-import'; input.setAttribute('aria-label', 'ASTRA save import');
    input.style.display = 'none';
    let finished = false;
    const finish = (kind, payload = '') => {
      if (finished) return;
      finished = true;
      window.removeEventListener('focus', onFocus);
      input.remove(); this.current = null;
      callback(kind, payload);
    };
    const onFocus = () => setTimeout(() => {
      if (!finished && input.files.length === 0) finish('cancel');
    }, 250);
    this.current = () => finish('cancel');
    input.addEventListener('cancel', () => finish('cancel'), {once:true});
    input.addEventListener('change', () => {
      if (input.files.length !== 1) { finish('cancel'); return; }
      const file = input.files[0];
      if (file.size > 512000) { finish('error', 'save.too_large'); return; }
      const reader = new FileReader();
      reader.onerror = () => finish('error', 'save.read_failed');
      reader.onabort = () => finish('cancel');
      reader.onload = () => {
        try { finish('ok', new TextDecoder('utf-8', {fatal:true}).decode(reader.result)); }
        catch { finish('error', 'save.invalid_utf8'); }
      };
      reader.readAsArrayBuffer(file);
    }, {once:true});
    document.body.append(input);
    window.addEventListener('focus', onFocus);
    if (navigator.userActivation && !navigator.userActivation.isActive) { finish('error', 'save.transfer_unavailable'); return; }
    try { input.click(); } catch { finish('error', 'save.transfer_unavailable'); }
  }
};
"""

var is_busy: bool = false
var _words: Dictionary = {}
var _import_dialog: FileDialog
var _export_dialog: FileDialog
var _pending_export: String = ""
var _web_callback: Variant
var _web_files: Variant
var _leaving_tree: bool = false

func setup(parent: Node, words: Dictionary = {}) -> void:
	_words = words.duplicate(true)
	if get_parent() == null:
		parent.add_child(self)

func choose_import() -> void:
	if is_busy:
		return
	if OS.has_feature("web"):
		if not _prepare_web():
			failed.emit("save.transfer_unavailable")
			return
		_set_busy(true)
		_web_files.pick(_web_callback)
		return
	if not _prepare_native():
		failed.emit("save.transfer_unavailable")
		return
	_set_busy(true)
	_import_dialog.popup_centered_clamped(Vector2i(640,360),0.9)

func export_text(text: String) -> void:
	if is_busy:
		return
	var bytes: PackedByteArray = text.to_utf8_buffer()
	if bytes.size() > MAX_BYTES:
		failed.emit("save.too_large")
		return
	if OS.has_feature("web"):
		if not Engine.has_singleton("JavaScriptBridge"):
			failed.emit("save.transfer_unavailable")
			return
		var bridge: Object = Engine.get_singleton("JavaScriptBridge")
		if not bridge.has_method("download_buffer"):
			failed.emit("save.transfer_unavailable")
			return
		_set_busy(true)
		bridge.call("download_buffer",bytes,EXPORT_NAME,"application/json")
		_set_busy(false)
		exported.emit()
		return
	if not _prepare_native():
		failed.emit("save.transfer_unavailable")
		return
	_pending_export = text
	_set_busy(true)
	_export_dialog.current_file = EXPORT_NAME
	_export_dialog.popup_centered_clamped(Vector2i(640,360),0.9)

func _prepare_web() -> bool:
	if not Engine.has_singleton("JavaScriptBridge"):
		return false
	if _web_files != null:
		return true
	var bridge: Object = Engine.get_singleton("JavaScriptBridge")
	bridge.call("eval", WEB_PICKER, true)
	_web_files = bridge.call("get_interface", "ASTRA_SAVE_FILES")
	_web_callback = bridge.call("create_callback", _on_web_result)
	return _web_files != null and _web_callback != null

func _on_web_result(arguments: Array) -> void:
	if not is_busy or _leaving_tree:
		return
	if arguments.size() < 1 or not arguments[0] is String:
		_finish_error("save.read_failed")
		return
	var kind: String = arguments[0]
	if kind == "cancel":
		_set_busy(false)
		return
	if arguments.size() != 2 or not arguments[1] is String:
		_finish_error("save.read_failed")
		return
	if kind == "error":
		var error: String = arguments[1]
		_finish_error(error if error in ["save.read_failed","save.too_large","save.invalid_utf8","save.transfer_unavailable"] else "save.read_failed")
	elif kind == "ok":
		var text: String = arguments[1]
		if text.to_utf8_buffer().size() > MAX_BYTES:
			_finish_error("save.too_large")
			return
		_set_busy(false)
		import_ready.emit(text)
	else:
		_finish_error("save.read_failed")

func _prepare_native() -> bool:
	if not is_inside_tree() or DisplayServer.get_name() == "headless":
		return false
	if _import_dialog != null:
		return true
	_import_dialog = _native_dialog("ImportFile", FileDialog.FILE_MODE_OPEN_FILE, "save.action.import")
	_export_dialog = _native_dialog("ExportFile", FileDialog.FILE_MODE_SAVE_FILE, "save.action.export")
	_import_dialog.file_selected.connect(_on_import_file)
	_export_dialog.file_selected.connect(_on_export_file)
	_import_dialog.canceled.connect(_on_canceled)
	_export_dialog.canceled.connect(_on_canceled)
	return true

func _native_dialog(node_name: String, mode: FileDialog.FileMode, title_key: String) -> FileDialog:
	var dialog: FileDialog = FileDialog.new()
	dialog.name = node_name
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.file_mode = mode
	dialog.mode_overrides_title = false
	dialog.title = String(_words.get(title_key,title_key))
	dialog.filters = PackedStringArray(["*.json ; JSON"])
	dialog.use_native_dialog = true
	dialog.deleting_enabled = false
	dialog.overwrite_warning_enabled = true
	add_child(dialog)
	return dialog

func _on_import_file(path: String) -> void:
	if not is_busy:
		return
	var file: FileAccess = FileAccess.open(path,FileAccess.READ)
	if file == null:
		_finish_error("save.read_failed")
		return
	var length: int = file.get_length()
	if length > MAX_BYTES:
		file.close()
		_finish_error("save.too_large")
		return
	var bytes: PackedByteArray = file.get_buffer(length)
	var read_error: Error = file.get_error()
	file.close()
	if bytes.size() != length or read_error not in [OK,ERR_FILE_EOF]:
		_finish_error("save.read_failed")
		return
	if bytes.size() >= 3 and bytes[0] == 0xef and bytes[1] == 0xbb and bytes[2] == 0xbf:
		bytes = bytes.slice(3)
	var text: String = bytes.get_string_from_utf8()
	if text.to_utf8_buffer() != bytes:
		_finish_error("save.invalid_utf8")
		return
	_set_busy(false)
	import_ready.emit(text)

func _on_export_file(path: String) -> void:
	if not is_busy:
		return
	var bytes: PackedByteArray = _pending_export.to_utf8_buffer()
	var temporary: String = path + ".astra-export-%d.tmp" % Time.get_ticks_usec()
	if FileAccess.file_exists(temporary) or DirAccess.dir_exists_absolute(temporary):
		_finish_error("save.write_failed")
		return
	var file: FileAccess = FileAccess.open(temporary,FileAccess.WRITE)
	if file == null:
		_finish_error("save.write_failed")
		return
	file.store_buffer(bytes)
	file.flush()
	var write_error: Error = file.get_error()
	file.close()
	if write_error != OK or FileAccess.get_file_as_bytes(temporary) != bytes:
		DirAccess.remove_absolute(temporary)
		_finish_error("save.write_failed")
		return
	if DirAccess.rename_absolute(temporary,path) != OK:
		DirAccess.remove_absolute(temporary)
		_finish_error("save.write_failed")
		return
	_pending_export = ""
	_set_busy(false)
	exported.emit()

func _on_canceled() -> void:
	_pending_export = ""
	_set_busy(false)

func _finish_error(key: String) -> void:
	_pending_export = ""
	_set_busy(false)
	failed.emit(key)

func _set_busy(value: bool) -> void:
	if is_busy != value:
		is_busy = value
		busy_changed.emit(value)

func _exit_tree() -> void:
	_leaving_tree = true
	if _web_files != null:
		_web_files.cancel()
	_web_callback = null
	_web_files = null
