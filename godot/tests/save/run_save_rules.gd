extends SceneTree
## Persistence is tested in a private repository-local directory, never user slots.
const Codec = preload("res://scripts/save/save_codec.gd")
const Store = preload("res://scripts/save/save_store.gd")
const BrowserStore = preload("res://scripts/save/browser_slot_store.gd")
var _checks: int = 0
var _failures: Array[String] = []
var _test_root: String
func _initialize() -> void:
	_run.call_deferred()
func _check(ok: bool, message: String) -> void:
	_checks += 1
	if not ok:
		_failures.append(message)
		push_error("FAIL: " + message)
func _fixture() -> Dictionary:
	return {
		"room.a": {"id":"room.a","name":"room","width":7,"height":5,
			"rows":["ttttttt","tgggggt","tgggggt","tgggggt","ttttttt"],"spawn":{"x":2,"y":2},
			"entities":[
				{"id":"a.lamp","kind":"lamp","sprite":"lamp","solid":true,"x":3,"y":2},
				{"id":"secret.lamp","kind":"lamp","sprite":"lamp","solid":true,"x":5,"y":1,"visibleWhen":{"all":["secret"]}},
			],"required":["a.lamp"],"exits":[{"pair":"door","x":5,"y":3,"to":"room.b","at":{"x":2,"y":2}}]},
		"room.b": {"id":"room.b","name":"room","width":7,"height":5,
			"rows":["ttttttt","tgggggt","tgggggt","tgggggt","ttttttt"],"spawn":{"x":2,"y":2},
			"entities":[{"id":"b.lamp","kind":"lamp","sprite":"lamp","solid":true,"x":4,"y":3},
				{"id":"blocker","kind":"npc","sprite":"npc","solid":false,"x":2,"y":2,"visibleWhen":{"all":["blocked"]}}],
			"required":["b.lamp"],"exits":[{"pair":"door","x":1,"y":2,"to":"room.a","at":{"x":4,"y":3}}]},
	}
func _state() -> Dictionary:
	return {"version":3,"mapId":"room.a","player":{"x":2,"y":2,"facing":"right"},"followers":[],"actors":{},"actorMemory":{},"flags":{},"lamps":[],"steps":0,"inventory":{"bread":3}}
func _codec() -> Codec:
	var codec: Codec = Codec.new()
	_check(codec.configure(_fixture()).is_empty(),"valid source maps configure save codec")
	return codec
func _run() -> void:
	_test_roundtrip_and_migration()
	_test_invalid_inputs()
	_test_position_safety()
	_test_cached_geometry_safety()
	_test_lamps()
	_test_browser_records()
	_test_files()
	print("Save rules/store: %d checks, %d failures" % [_checks,_failures.size()])
	quit(0 if _failures.is_empty() else 1)
func _test_roundtrip_and_migration() -> void:
	var codec: Codec = _codec()
	var fresh: Dictionary = codec.fresh("room.a")
	_check(fresh.get("version")==3 and fresh.get("player",{}).get("x")==2 and fresh.get("inventory")=={"bread":3},"fresh game has v3 canonical fields and source spawn")
	_check(codec.fresh("missing").is_empty(),"unknown fresh map is rejected")
	var state: Dictionary = _state()
	state["flags"]={"met.hob":true}
	state["lamps"]=["b.lamp","a.lamp"]
	state["steps"]=12
	state["inventory"]={"bread":0,"token.blue":999}
	state["actorMemory"]={"room.b":{}}
	var original: Dictionary = state.duplicate(true)
	var encoded: Dictionary = codec.encode(state)
	_check(encoded.get("ok",false),"valid state encodes")
	if encoded.get("ok",false):
		var decoded: Dictionary = codec.decode(encoded["text"])
		_check(decoded.get("ok",false) and decoded.get("state")==state and not decoded.get("migrated",true),"all snapshot fields roundtrip without loss")
		decoded["state"]["flags"]["met.hob"]=false
		_check(state==original,"returned save data cannot mutate input")
		_check(codec.encode(original).get("text")==encoded["text"],"encoding is deterministic")
	for version: int in [1,2]:
		var legacy: Dictionary = original.duplicate(true)
		legacy["version"]=version
		if version==1:
			legacy.erase("actorMemory")
		var loaded: Dictionary = codec.decode(JSON.stringify(legacy))
		_check(loaded.get("ok",false) and loaded.get("migrated",false) and loaded.get("state",{}).get("version")==3,"v%d migrates to native v3" % version)
		if loaded.get("ok",false):
			_check(loaded["state"]["flags"]==original["flags"] and loaded["state"]["lamps"]==original["lamps"] and loaded["state"]["inventory"]==original["inventory"],"legacy fields survive migration")
	var v0: Dictionary = {"version":0,"mapId":"room.a","x":2,"y":2,"flags":{"old":true}}
	var old: Dictionary = codec.decode(JSON.stringify(v0))
	_check(old.get("ok",false) and old.get("state",{}).get("player")=={"x":2,"y":2,"facing":"down"},"v0 point migrates with down facing")
	_check(old.get("state",{}).get("flags")=={"old":true} and old.get("state",{}).get("inventory")=={"bread":3},"v0 preserves flags and adds historical defaults")
	var bad_maps: Dictionary = _fixture()
	bad_maps["room.b"]["entities"][0]["id"]="a.lamp"
	bad_maps["room.b"]["required"]=["a.lamp"]
	_check(not codec.configure(bad_maps).is_empty(),"global lamp IDs cannot collide across maps")
	_check(codec.validate(original).get("ok",false),"failed configure keeps previous valid map/lamp definitions")
func _test_invalid_inputs() -> void:
	var codec: Codec = _codec()
	_check(codec.validate(_state()).get("ok",false),"warm geometry still requires every later snapshot field to validate")
	for text: String in ["{bad","[]","null","true","123"]:
		_check(not codec.decode(text).get("ok",false),"invalid JSON or non-object cannot load")
	_check(codec.decode("灯".repeat(170667)).get("error")=="save.too_large","size cap measures UTF8 bytes before parsing")
	var cases: Dictionary = {
		"version":"save.unsupported_version","map":"save.unsupported_map","unknown":"save.invalid","missing":"save.invalid",
		"fraction":"save.bad_position","negative":"save.bad_position","wall":"save.bad_position","facing":"save.bad_position","player_extra":"save.invalid",
		"flag_type":"save.invalid","flag_id":"save.invalid","lamp_duplicate":"save.bad_lamp","lamp_unknown":"save.bad_lamp","lamp_type":"save.invalid",
		"steps":"save.invalid","inventory":"save.invalid","inventory_id":"save.invalid","followers":"save.unsupported_layout","actors":"save.unsupported_layout",
		"memory":"save.unsupported_layout","memory_map":"save.unsupported_map","memory_type":"save.invalid",
	}
	for name: String in cases:
		var state: Dictionary = _state()
		match name:
			"version": state["version"]=99
			"map": state["mapId"]="missing"
			"unknown": state["future_field"]={"keep":true}
			"missing": state.erase("flags")
			"fraction": state["player"]["x"]=2.5
			"negative": state["player"]["x"]=-1
			"wall": state["player"]["x"]=0
			"facing": state["player"]["facing"]="diagonal"
			"player_extra": state["player"]["hp"]=20
			"flag_type": state["flags"]={"old":1}
			"flag_id": state["flags"]={"__proto__":true}
			"lamp_duplicate": state["lamps"]=["a.lamp","a.lamp"]
			"lamp_unknown": state["lamps"]=["elsewhere"]
			"lamp_type": state["lamps"]="a.lamp"
			"steps": state["steps"]=-1
			"inventory": state["inventory"]={"bread":1000}
			"inventory_id": state["inventory"]={"constructor":1}
			"followers": state["followers"]=[{"x":1,"y":1}]
			"actors": state["actors"]={"npc":{"x":1,"y":1}}
			"memory": state["actorMemory"]={"room.b":{"npc":{"x":1,"y":1}}}
			"memory_map": state["actorMemory"]={"missing":{}}
			"memory_type": state["actorMemory"]={"room.b":[]}
		var before: Dictionary = state.duplicate(true)
		var loaded: Dictionary = codec.validate(state)
		_check(not loaded.get("ok",false) and loaded.get("error")==cases[name],"reject malformed save with explicit reason: "+name)
		_check(state==before,"rejection never edits caller fields: "+name)
func _test_position_safety() -> void:
	var codec: Codec = _codec()
	var blocked: Dictionary = _state()
	blocked["flags"]={"blocked":true}
	_check(codec.validate(blocked).get("error")=="save.bad_position","flags cannot block another map entrance")
	var corridor: Dictionary = _fixture()
	corridor["room.a"]["rows"]=["ttttttt","tggtggt","tgggggt","tggtggt","ttttttt"]
	corridor["room.a"]["entities"][0].merge({"x":2,"y":3},true)
	corridor["room.a"]["entities"].append({"id":"gate","kind":"npc","sprite":"npc","solid":true,"x":3,"y":2,"visibleWhen":{"all":["closed"]}})
	corridor["room.a"]["exits"][0].merge({"x":1,"y":1},true)
	corridor["room.b"]["exits"][0]["at"]={"x":1,"y":2}
	_check(codec.configure(corridor).is_empty(),"corridor fixture starts traversable")
	var isolated: Dictionary = _state()
	isolated["player"]={"x":5,"y":2,"facing":"down"}
	isolated["flags"]={"closed":true}
	_check(codec.validate(isolated).get("error")=="save.bad_position","save validates routes from actual player rather than only spawn")
func _test_cached_geometry_safety() -> void:
	var codec: Codec = _codec()
	var state: Dictionary = _state()
	_check(codec.validate(state).get("ok",false),"original position is safe before repeated validation")
	state["flags"]["blocked"]=true
	_check(codec.validate(state).get("error")=="save.bad_position","changing a caller-owned flag rechecks the global arrival geometry")
	state["flags"]["blocked"]=false
	_check(codec.validate(state).get("ok",false),"changing the same flag value back does not reuse an unsafe conclusion")
	state["flags"].clear()
	state["player"]["x"]=3
	_check(codec.validate(state).get("error")=="save.bad_position","changing position cannot reuse a formerly safe cell result")
	state["mapId"]="room.b"
	_check(codec.validate(state).get("ok",false),"the same coordinates on a different map have their own geometry result")
	state["mapId"]="room.a"
	state["player"]["x"]=2
	_check(codec.validate(state).get("ok",false),"returning to the original position remains safe")
	var rejected: Dictionary = _fixture()
	rejected["room.a"]["required"]=["missing"]
	_check(not codec.configure(rejected).is_empty(),"invalid replacement maps are rejected after warming geometry")
	_check(codec.validate(state).get("ok",false),"failed replacement preserves the previously configured safety rules")
	var replacement: Dictionary = _fixture()
	replacement["room.a"]["spawn"]={"x":1,"y":1}
	replacement["room.a"]["rows"][2]="tgtgggt"
	_check(codec.configure(replacement).is_empty(),"replacement maps remain traversable with a wall at the former player cell")
	_check(codec.validate(state).get("error")=="save.bad_position","successful reconfiguration invalidates the former safe position result")
	state["player"]={"x":1,"y":1,"facing":"down"}
	_check(codec.validate(state).get("ok",false),"new safe entry is accepted after reconfiguration")
	replacement["room.a"]["rows"][1]="ttttttt"
	state["flags"]["unrelated"]=true
	_check(codec.validate(state).get("ok",false),"later mutation of source maps cannot change configured geometry")
	var oversized: Dictionary = state.duplicate(true)
	oversized["inventory"]={"x".repeat(Codec.MAX_BYTES):0}
	_check(codec.validate(oversized).get("error")=="save.too_large","warm geometry never bypasses complete snapshot size validation")
func _test_lamps() -> void:
	var codec: Codec = _codec()
	var state: Dictionary = _state()
	_check(not codec.can_manual_save(state),"unlit lamp does not permit manual saving")
	var result: Dictionary = codec.light_lamp(state,"a.lamp")
	_check(result.get("ok",false) and result.get("newly_lit",false),"facing a visible lamp lights it")
	_check(state["lamps"].is_empty(),"lighting returns a new state without changing caller")
	if result.get("ok",false):
		var lit: Dictionary = result["state"]
		_check(lit["lamps"]==["a.lamp"] and codec.can_manual_save(lit),"lit neighbor enables manual saving")
		var repeat: Dictionary = codec.light_lamp(lit,"a.lamp")
		_check(repeat.get("ok",false) and not repeat.get("newly_lit",true) and repeat.get("state")==lit,"repeated lighting is idempotent")
	var away: Dictionary = _state();away["player"]["facing"]="down"
	_check(not codec.light_lamp(away,"a.lamp").get("ok",false),"nearby but unfaced lamp is not activated")
	_check(not codec.light_lamp(state,"b.lamp").get("ok",false),"lamp on another map cannot be lit remotely")
	var hidden: Dictionary = _state();hidden["player"]={"x":5,"y":2,"facing":"up"};hidden["lamps"]=["secret.lamp"]
	_check(not codec.light_lamp(hidden,"secret.lamp").get("ok",false) and not codec.can_manual_save(hidden),"hidden lamp neither interacts nor enables saving")
	var wide: Dictionary = _fixture();wide["room.a"]["entities"][0].merge({"x":4,"footprint":[2,1]},true)
	_check(codec.configure(wide).is_empty(),"wide lamp fixture configures")
	var wide_result: Dictionary = codec.light_lamp(_state(),"a.lamp")
	_check(wide_result.get("ok",false) and codec.can_manual_save(wide_result.get("state",{})),"lamp interaction and adjacency use its whole footprint")
func _test_browser_records() -> void:
	var codec: Codec = _codec()
	var first: String = codec.encode(_state())["text"]
	var next: Dictionary = _state();next["steps"]=8
	var next_text: String = codec.encode(next)["text"]
	var initial: Dictionary = BrowserStore.prepare_record(codec,first,null,123)
	_check(initial.get("ok",false),"first browser save prepares one complete record")
	if not initial.get("ok",false):
		return
	var record: Dictionary = JSON.parse_string(initial["text"])
	_check(record.size()==4 and record.get("format")=="astra.web-slot/1" and record.get("data")==first and record.get("previous")=="" and record.get("modified")==123,"browser record includes current bytes, backup and timestamp together")
	var loaded: Dictionary = BrowserStore.decode_record(codec,initial["text"])
	_check(loaded.get("state")==_state() and loaded.get("modified")==123,"browser record fully validates current state and retains its timestamp")
	var second: Dictionary = BrowserStore.prepare_record(codec,next_text,initial["text"],124)
	_check(second.get("ok",false) and JSON.parse_string(second.get("text","{}"))["previous"]==first,"next atomic record retains exact previous valid save bytes")
	record["data"]="{broken";record["previous"]=first
	var corrupt: String = JSON.stringify(record)
	_check(not BrowserStore.decode_record(codec,corrupt).get("ok",false),"bad current browser data never silently loads its valid backup")
	var repaired: Dictionary = BrowserStore.prepare_record(codec,next_text,corrupt,125)
	_check(repaired.get("ok",false) and JSON.parse_string(repaired.get("text","{}"))["previous"]==first,"replacing bad current data preserves an existing valid previous save")
	record["previous"]="{also broken"
	var no_backup: Dictionary = BrowserStore.prepare_record(codec,next_text,JSON.stringify(record),125)
	_check(no_backup.get("ok",false) and JSON.parse_string(no_backup.get("text","{}"))["previous"]=="","invalid current and previous data cannot become a purported good backup")
	record["previous"]=first
	record["data"]=17;record["modified"]=-1
	var malformed: Dictionary = BrowserStore.prepare_record(codec,next_text,JSON.stringify(record),126)
	_check(malformed.get("ok",false) and JSON.parse_string(malformed.get("text","{}"))["previous"]==first,"repair salvages a validated backup even when current record metadata is damaged")
	var legacy: String = JSON.stringify({"version":0,"mapId":"room.a","x":2,"y":2,"flags":{}})
	var migrated: Dictionary = BrowserStore.prepare_record(codec,next_text,null,127,legacy,first)
	_check(migrated.get("ok",false) and JSON.parse_string(migrated.get("text","{}"))["previous"]==legacy,"missing browser key preserves exact valid legacy file as its first backup")
	var legacy_backup: Dictionary = BrowserStore.prepare_record(codec,next_text,null,127,"{broken",first)
	_check(legacy_backup.get("ok",false) and JSON.parse_string(legacy_backup.get("text","{}"))["previous"]==first,"legacy migration keeps valid file backup when the main file is damaged")
	var existing_bad: Dictionary = BrowserStore.prepare_record(codec,next_text,"",128,legacy,first)
	_check(existing_bad.get("ok",false) and JSON.parse_string(existing_bad.get("text","{}"))["previous"]=="","an existing corrupt browser key never falls back to old file state")
	_check(BrowserStore.prepare_record(codec,"{broken",initial["text"],129).get("error")=="save.invalid","invalid new save cannot prepare a replacement record")
	_check(BrowserStore.prepare_record(codec,next_text,null,-1).get("error")=="save.invalid","negative modification time cannot enter a browser record")
	for name: String in ["format","data","previous","modified","unknown"]:
		var bad: Dictionary = JSON.parse_string(initial["text"])
		match name:
			"format": bad["format"]="other/1"
			"data": bad["data"]=null
			"previous": bad["previous"]=[]
			"modified": bad["modified"]=1.5
			"unknown": bad["extra"]=true
		_check(BrowserStore.decode_record(codec,JSON.stringify(bad)).get("error")=="save.invalid","malformed browser envelope is rejected: "+name)
	_check(BrowserStore.decode_record(codec,"x".repeat(BrowserStore.MAX_RECORD_BYTES+1)).get("error")=="save.too_large","browser envelope size is bounded before parsing")
	_check(BrowserStore.decode_reply('{"ok":false,"error":"save.io"}',false).get("error")=="save.io","browser quota or security failures remain explicit IO errors")
	_check(BrowserStore.decode_reply('{"ok":false,"error":"save.too_large"}',false).get("error")=="save.too_large","bounded browser reads retain the explicit oversize error")
	_check(BrowserStore.decode_reply('{"ok":true,"missing":true}',false).get("missing",false),"absent browser key is distinct from present corrupt data")
	_check(BrowserStore.decode_reply('{"ok":true,"missing":false,"text":""}',false).get("text","unexpected")=="","present empty browser value remains present for corruption checks")
	for reply: Variant in [null,"{bad","[]",'{"ok":1}','{"ok":true,"missing":"yes"}','{"ok":false,"error":"unexpected"}']:
		_check(BrowserStore.decode_reply(reply,false).get("error")=="save.io","malformed bridge replies cannot masquerade as a missing save")
	_check(BrowserStore.decode_reply('{"ok":true}',true).get("ok",false),"only a completed synchronous write acknowledges success")
	var key: String = BrowserStore.storage_key("user://saves",1)
	_check(key!=BrowserStore.storage_key("user://saves",2) and key!=BrowserStore.storage_key("user://other",1),"browser keys isolate roots and fixed slots")
	_check(BrowserStore.storage_key("user://saves",4).is_empty() and BrowserStore.storage_key("res://saves",1).is_empty(),"browser backend cannot address arbitrary slots or non-user roots")
func _test_files() -> void:
	_test_root="res://.local/save-tests-%d-%d" % [OS.get_process_id(),Time.get_ticks_usec()]
	DirAccess.make_dir_recursive_absolute(_test_root)
	var codec: Codec = _codec()
	var store: Store = Store.new();store.configure(codec,_test_root)
	_check(store.read_slot(1).get("error")=="save.empty","missing slot is reported separately from corrupt data")
	_check(store.summaries().size()==4,"store reports exactly one auto and three manual slots")
	var first: Dictionary = _state();first["flags"]={"before":true}
	_check(store.write_slot(1,first).get("ok",false),"valid snapshot writes real slot file")
	var file_path: String = _test_root+"/slot_1.json"
	if not FileAccess.file_exists(file_path):
		_cleanup()
		return
	var first_text: String = FileAccess.get_file_as_string(file_path)
	_check(store.read_slot(1).get("state")==first,"real disk slot loads its original snapshot")
	var next: Dictionary = first.duplicate(true);next["steps"]=7
	_check(store.write_slot(1,next).get("ok",false),"second valid write replaces current slot")
	_check(FileAccess.get_file_as_string(file_path+".bak")==first_text,"backup retains exact previous valid bytes")
	var before: String = FileAccess.get_file_as_string(file_path)
	var invalid: Dictionary = next.duplicate(true);invalid["player"]["x"]=0
	_check(not store.write_slot(1,invalid).get("ok",false) and FileAccess.get_file_as_string(file_path)==before,"invalid write leaves existing slot untouched")
	for slot: int in [-1,4]:
		_check(store.read_slot(slot).get("error")=="save.invalid_slot" and store.write_slot(slot,first).get("error")=="save.invalid_slot","invalid slot index never reaches file IO")
	_put(file_path,"{broken")
	_check(not store.read_slot(1).get("ok",false) and FileAccess.get_file_as_string(file_path)=="{broken","corrupt read leaves file intact")
	var summary: Array[Dictionary] = store.summaries()
	_check(summary[1]["status"]=="invalid" and summary[0]["status"]=="empty","summaries distinguish corrupt and empty slots")
	_check(store.write_slot(1,next).get("ok",false),"explicit valid write can replace corrupt current data")
	_check(FileAccess.get_file_as_string(file_path+".bak")==first_text,"corrupt current data never replaces the last valid backup")
	_put(_test_root+"/foreign.txt","keep")
	_check(store.write_slot(0,first).get("ok",false),"automatic slot uses the same codec")
	_check(FileAccess.get_file_as_string(_test_root+"/foreign.txt")=="keep","writing known slots does not touch unrelated files")
	_put(_test_root+"/not-a-directory","keep")
	var blocked_store: Store = Store.new();blocked_store.configure(codec,_test_root+"/not-a-directory/sub")
	_check(blocked_store.write_slot(1,first).get("error")=="save.io","actual filesystem failure reports IO without corrupting valid slots")
	_check(store.read_slot(0).get("state")==first,"unrelated IO failure leaves an existing good slot intact")
	_check(store.write_slot(2,first).get("ok",false),"separate slot is created for backup failure test")
	var second_path: String = _test_root+"/slot_2.json"
	var second_bytes: String = FileAccess.get_file_as_string(second_path)
	DirAccess.make_dir_absolute(second_path+".bak")
	_check(store.write_slot(2,next).get("error")=="save.io" and FileAccess.get_file_as_string(second_path)==second_bytes,"backup destination failure preserves the existing current slot")
	_check(DirAccess.dir_exists_absolute(second_path+".bak"),"unknown directory at backup path is never removed")
	DirAccess.remove_absolute(second_path+".bak")
	_put(_test_root+"/slot_3.json","x".repeat(Codec.MAX_BYTES+1))
	_check(store.read_slot(3).get("error")=="save.too_large","oversized file is rejected before parsing or replacement")
	var leftovers: PackedStringArray = DirAccess.get_files_at(_test_root)
	_check(not Array(leftovers).any(func(name: String) -> bool: return name.contains(".tmp-")),"handled failures clean only their own temporary files")
	_cleanup()
func _put(path: String,text: String) -> void:
	var file: FileAccess = FileAccess.open(path,FileAccess.WRITE)
	file.store_string(text);file.close()
func _cleanup() -> void:
	for name: String in ["slot_0.json","slot_0.json.bak","slot_1.json","slot_1.json.bak","slot_2.json","slot_2.json.bak","slot_3.json","slot_3.json.bak","foreign.txt","not-a-directory"]:
		if FileAccess.file_exists(_test_root+"/"+name):
			DirAccess.remove_absolute(_test_root+"/"+name)
	DirAccess.remove_absolute(_test_root)
