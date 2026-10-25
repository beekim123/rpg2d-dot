class_name BrowserSlotStore
extends RefCounted
## Synchronous browser persistence. Each slot and its backup share one atomic key.

const Codec = preload("res://scripts/save/save_codec.gd")
const FORMAT: String = "astra.web-slot/1"
const MAX_RECORD_BYTES: int = 4 * Codec.MAX_BYTES + 1024
const READ_SCRIPT: String = """
(function(p) {
  try {
    if (!/^astra[.]godot[.]save[.][a-f0-9]{64}[.][0-3]$/.test(p.key)) return JSON.stringify({ok:false,error:'save.io'});
    const text = window.localStorage.getItem(p.key);
    if (text === null) return JSON.stringify({ok:true,missing:true});
    if (text.length > p.maxBytes || new TextEncoder().encode(text).length > p.maxBytes) return JSON.stringify({ok:false,error:'save.too_large'});
    return JSON.stringify({ok:true,missing:false,text:text});
  } catch (_) { return JSON.stringify({ok:false,error:'save.io'}); }
})(%s)
"""
const WRITE_SCRIPT: String = """
(function(p) {
  try {
    if (!/^astra[.]godot[.]save[.][a-f0-9]{64}[.][0-3]$/.test(p.key)) return JSON.stringify({ok:false,error:'save.io'});
    window.localStorage.setItem(p.key, p.text);
    return JSON.stringify({ok:true});
  } catch (_) { return JSON.stringify({ok:false,error:'save.io'}); }
})(%s)
"""
var _codec: Codec
var _root: String = ""

func configure(codec: Codec, root_path: String) -> void:
	_codec = codec
	_root = root_path

func read_raw(slot: int) -> Dictionary:
	if slot < 0 or slot > 3:
		return _failure("save.invalid_slot")
	var key: String = storage_key(_root,slot)
	if key.is_empty() or _codec == null:
		return _failure("save.io")
	return _request(READ_SCRIPT,{"key":key,"maxBytes":MAX_RECORD_BYTES},false)

func write_record(slot: int, text: String) -> Dictionary:
	if slot < 0 or slot > 3:
		return _failure("save.invalid_slot")
	var key: String = storage_key(_root,slot)
	if key.is_empty() or _codec == null:
		return _failure("save.io")
	var checked: Dictionary = decode_record(_codec,text)
	if not checked["ok"]:
		return _failure(checked["error"])
	return _request(WRITE_SCRIPT,{"key":key,"text":text},true)

func _request(script: String, parameters: Dictionary, writing: bool) -> Dictionary:
	if not Engine.has_singleton("JavaScriptBridge"):
		return _failure("save.io")
	var bridge: Object = Engine.get_singleton("JavaScriptBridge")
	if not bridge.has_method("eval"):
		return _failure("save.io")
	# Parameters are JSON literals, never interpolated as executable source or globals.
	return decode_reply(bridge.call("eval",script % JSON.stringify(parameters),true),writing)

static func storage_key(root_path: String, slot: int) -> String:
	if slot < 0 or slot > 3 or not root_path.begins_with("user://"):
		return ""
	return "astra.godot.save.%s.%d" % [root_path.sha256_text(),slot]

## A null old value means absent. An empty or damaged existing value never uses files.
static func prepare_record(codec: Codec, data: String, old_text: Variant, modified: int, legacy_data: String = "", legacy_previous: String = "") -> Dictionary:
	if codec == null:
		return _failure("save.io")
	var checked: Dictionary = codec.decode(data)
	if not checked["ok"]:
		return _failure(checked["error"])
	if not _timestamp_valid(modified) or (old_text != null and not old_text is String):
		return _failure("save.invalid")
	var previous: String = ""
	if old_text == null:
		previous = _valid_save_text(codec,legacy_data)
		if previous.is_empty():
			previous = _valid_save_text(codec,legacy_previous)
	else:
		if String(old_text).to_utf8_buffer().size() > MAX_RECORD_BYTES:
			return _failure("save.too_large")
		var old: Dictionary = _record_object(old_text)
		previous = _valid_save_text(codec,old.get("data"))
		if previous.is_empty():
			previous = _valid_save_text(codec,old.get("previous"))
	var text: String = JSON.stringify({"format":FORMAT,"data":data,"previous":previous,"modified":modified},"",true)
	if text.to_utf8_buffer().size() > MAX_RECORD_BYTES:
		return _failure("save.too_large")
	return {"ok":true,"error":"","text":text}

static func decode_record(codec: Codec, text: String) -> Dictionary:
	if codec == null:
		return _failure("save.io")
	if text.to_utf8_buffer().size() > MAX_RECORD_BYTES:
		return _failure("save.too_large")
	var record: Dictionary = _record_object(text)
	if record.size() != 4 or not record.get("data") is String or not record.get("previous") is String or not _timestamp_valid(record.get("modified")):
		return _failure("save.invalid")
	if String(record["data"]).to_utf8_buffer().size() > Codec.MAX_BYTES or String(record["previous"]).to_utf8_buffer().size() > Codec.MAX_BYTES:
		return _failure("save.too_large")
	var checked: Dictionary = codec.decode(record["data"])
	if checked["ok"]:
		checked["modified"] = int(record["modified"])
	return checked

## Unknown, malformed or unavailable bridge responses never become an empty slot.
static func decode_reply(value: Variant, writing: bool) -> Dictionary:
	if not value is String or String(value).to_utf8_buffer().size() > 2 * MAX_RECORD_BYTES + 1024:
		return _failure("save.io")
	var parser: JSON = JSON.new()
	if parser.parse(value) != OK or not parser.data is Dictionary:
		return _failure("save.io")
	var reply: Dictionary = parser.data
	if not reply.get("ok") is bool:
		return _failure("save.io")
	if not reply["ok"]:
		return _failure("save.too_large" if reply.get("error") == "save.too_large" and not writing else "save.io")
	if writing:
		return {"ok":true,"error":""} if reply.size() == 1 else _failure("save.io")
	if not reply.get("missing") is bool:
		return _failure("save.io")
	if reply["missing"]:
		return {"ok":true,"error":"","missing":true} if reply.size() == 2 else _failure("save.io")
	if reply.size() != 3 or not reply.get("text") is String:
		return _failure("save.io")
	if String(reply["text"]).to_utf8_buffer().size() > MAX_RECORD_BYTES:
		return _failure("save.too_large")
	return {"ok":true,"error":"","missing":false,"text":reply["text"]}

static func _record_object(text: String) -> Dictionary:
	var parser: JSON = JSON.new()
	if parser.parse(text) != OK or not parser.data is Dictionary or parser.data.get("format") != FORMAT:
		return {}
	return parser.data
static func _valid_save_text(codec: Codec, value: Variant) -> String:
	if value is String and not String(value).is_empty() and codec.decode(value)["ok"]:
		return value
	return ""
static func _timestamp_valid(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) >= 0.0 and float(value) <= float(Codec.MAX_INTEGER) and floor(float(value)) == float(value)
static func _failure(error: String) -> Dictionary:
	return {"ok":false,"error":error}
