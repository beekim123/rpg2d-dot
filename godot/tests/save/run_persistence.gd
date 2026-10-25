extends SceneTree
## Use private filesystem slots and the production world API to prove persistence behavior.
var _checks: int = 0
var _failures: Array[String] = []
var _folder: String = "res://.local/world-save-%d-%d" % [OS.get_process_id(),Time.get_ticks_usec()]
func _initialize() -> void:
	_run.call_deferred()
func _check(ok: bool, message: String) -> void:
	_checks += 1
	if not ok:
		_failures.append(message)
		push_error("FAIL: " + message)
func _scene() -> Node:
	var packed: PackedScene = load("res://scenes/main.tscn") as PackedScene
	var world: Node = packed.instantiate()
	world.set("save_root",_folder)
	return world
func _run() -> void:
	var world: Node = _scene()
	root.add_child(world)
	await process_frame
	_check(world.get("loaded"),"fresh persistent world starts")
	if not world.has_method("snapshot_state"):
		_check(false,"persistence API exists")
		world.queue_free()
		_finish()
		return
	var fresh: Dictionary = world.call("snapshot_state")
	_check(fresh["version"]==3 and fresh["lamps"].is_empty(),"fresh state has current version and no lit lamps")
	_check(not world.call("save_slot",1)["ok"],"manual save is unavailable away from lit lamps")
	_check(not world.call("save_slot",0)["ok"],"auto slot is not a manual save target")
	_check(world.call("enter_map","lv.town",Vector2i(12,19)),"arrive safely beside square lamp")
	world.get("player").call("face",Vector2i.UP)
	_check(world.call("light_facing_lamp"),"front lamp is lit through production interaction")
	var lit: Dictionary = world.call("snapshot_state")
	_check(lit["lamps"]==["lv.lamp.square"],"lamp ID added exactly once")
	_check(world.call("find_entity","lv.lamp.square").animation==&"lit","lamp switches to the authored lit animation")
	world.call("light_facing_lamp")
	_check(world.call("snapshot_state")["lamps"].size()==1,"repeated lighting is idempotent")
	if world.call("menu_active"):
		world.call("close_save_menu")
	_check(world.call("save_slot",1)["ok"],"manual slot can be written beside lit lamp")
	var slot_one: String = FileAccess.get_file_as_string(_folder.path_join("slot_1.json"))
	_check(not slot_one.is_empty(),"manual data exists in private test directory")
	_check(world.call("open_save_menu"),"save menu opens")
	_check(not world.call("request_move",Vector2i.LEFT),"menu locks world movement")
	_check(not world.call("interact"),"menu locks other world interaction")
	world.call("close_save_menu")
	_check(world.call("enter_map","lv.lamp_shop"),"real cross-map API reaches lamp shop")
	var steps_before: int = world.call("snapshot_state")["steps"]
	_check(world.call("request_move",Vector2i.LEFT),"a real grid step begins")
	for tick: int in range(24):
		await physics_frame
		if not world.get("player").get("is_moving"):
			break
	_check(world.call("snapshot_state")["steps"]==steps_before+1,"completed movement increments exactly one step")
	_check(world.call("load_slot",1)["ok"],"manual slot restores validated state")
	_check(world.call("snapshot_state")==lit,"load restores position, flags, lamp memory and steps")
	_check(FileAccess.get_file_as_string(_folder.path_join("slot_1.json"))==slot_one,"reading a manual slot does not rewrite it")
	var exported: Dictionary = world.call("export_save")
	_check(exported["ok"],"current snapshot exports as JSON")
	var before_bad: Dictionary = world.call("snapshot_state")
	_check(not world.call("import_save","{broken")["ok"],"malformed import is rejected")
	var invalid: Dictionary = before_bad.duplicate(true)
	invalid["player"]["x"]=0
	invalid["player"]["y"]=0
	_check(not world.call("import_save",JSON.stringify(invalid))["ok"],"blocked imported position is rejected")
	_check(world.call("snapshot_state")==before_bad,"failed imports preserve all live state")
	_check(FileAccess.get_file_as_string(_folder.path_join("slot_1.json"))==slot_one,"failed imports preserve existing manual bytes")
	_check(world.call("start_new_game")["ok"],"new journey is a deliberate supported action")
	_check(world.call("snapshot_state")["mapId"]=="lv.finn_house","new journey returns to prologue")
	_check(FileAccess.get_file_as_string(_folder.path_join("slot_1.json"))==slot_one,"new journey retains manual slot")
	_check(world.call("import_save",exported["text"])["ok"],"valid import restores the exported journey")
	var expected: Dictionary = world.call("snapshot_state")
	world.queue_free()
	await process_frame
	world=_scene()
	root.add_child(world)
	await process_frame
	_check(world.call("snapshot_state")==expected,"new world instance resumes the newly imported auto record")
	_check(world.call("find_entity","lv.lamp.square").animation==&"lit","reopened world renders persisted lamp state")
	var ceiling: Dictionary = world.call("snapshot_state")
	ceiling["steps"] = SaveCodec.MAX_INTEGER
	_check(world.call("restore_state",ceiling),"largest supported step counter can be restored")
	_check(world.call("request_move",Vector2i.LEFT),"movement remains available at counter ceiling")
	for tick: int in range(24):
		await physics_frame
		if not world.get("player").get("is_moving"):
			break
	_check(world.call("snapshot_state")["steps"]==SaveCodec.MAX_INTEGER,"step counter saturates rather than making a valid imported state unsavable")
	_check(world.call("export_save")["ok"],"ceiling state remains exportable after movement")

	world.queue_free()
	await process_frame
	var auto_path: String = _folder.path_join("slot_0.json")
	var file: FileAccess = FileAccess.open(auto_path,FileAccess.WRITE)
	file.store_string("{corrupt auto");file.close()
	world=_scene();root.add_child(world);await process_frame
	_check(world.call("snapshot_state")["mapId"]=="lv.finn_house","bad auto does not prevent a safe fallback scene")
	_check(FileAccess.get_file_as_string(auto_path)=="{corrupt auto","startup preserves corrupt original bytes")
	world.call("enter_map","lv.town",Vector2i(8,10))
	_check(FileAccess.get_file_as_string(auto_path)=="{corrupt auto","automatic save remains paused after failed auto load")
	world.call("enter_map","lv.town",Vector2i(12,19))
	world.get("player").call("face",Vector2i.UP)
	_check(world.call("light_facing_lamp"),"lighting still works while autosave is paused")
	var words: Dictionary = world.get("catalog").locale("zh-Hans")
	_check(world.get_node("HUD/Controls").text == words["save.auto_paused"],"autosave failure stays visible instead of being overwritten by a success hint")
	_check(FileAccess.get_file_as_string(auto_path)=="{corrupt auto","lighting does not overwrite a protected bad auto")
	world.queue_free();await process_frame
	var directory: DirAccess = DirAccess.open(_folder)
	for name: String in directory.get_files():
		DirAccess.remove_absolute(_folder.path_join(name))
	DirAccess.remove_absolute(_folder)
	_finish()
func _finish() -> void:
	print("World persistence: %d checks, %d failures" % [_checks,_failures.size()])
	quit(0 if _failures.is_empty() else 1)
