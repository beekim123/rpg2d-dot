extends SceneTree
const Encounters = preload("res://scripts/battle/battle_encounter.gd")
var checks: int = 0
var failures: Array[String] = []
var world: Node
var folder: String = "res://.local/prologue-route-%d-%d" % [OS.get_process_id(),Time.get_ticks_usec()]
const DIRECTIONS: Array[Vector2i] = [Vector2i.UP,Vector2i.DOWN,Vector2i.LEFT,Vector2i.RIGHT]
const FACING: Dictionary = {Vector2i.UP:"up",Vector2i.DOWN:"down",Vector2i.LEFT:"left",Vector2i.RIGHT:"right"}
func _initialize() -> void:
	_run.call_deferred()
func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error("FAIL: " + label)
func _key(code: Key) -> void:
	var event: InputEventKey = InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = true
	root.push_input(event)
	event.pressed = false
	root.push_input(event)
func _settle() -> void:
	for frame: int in 3:
		await process_frame
func _run() -> void:
	world = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	world.save_root = folder
	root.add_child(world)
	await _settle()
	check(world.loaded and world.story_state()["mode"] == "title", "full native route starts at the title")
	_key(KEY_Z)
	await _settle()
	var flow: Dictionary = world.catalog.table_data("prologue.flow")
	var battle_count: int = 0
	for step: Dictionary in flow["steps"]:
		if world.flags.get(step["done"],false):
			continue
		for lamp: String in step.get("require",{}).get("lamps",[]):
			if lamp in world.lamps:
				continue
			await _travel("lv.town")
			await _target({"kind":"interact","mapId":"lv.town","entityIds":[lamp]})
			_key(KEY_Z)
			await _settle()
			check(lamp in world.lamps, "actual world interaction lights " + lamp)
		if not world.flags.get(step["done"],false) and world.story_state()["mode"] == "":
			await _travel(step["trigger"].get("mapId",world.map_data["id"]))
			await _target(step["trigger"])
			if step["trigger"]["kind"] == "interact" and world.story_state()["mode"] == "":
				_key(KEY_Z)
			await _settle()
		var kind: String = step["presentation"]["kind"]
		if kind == "battle":
			check(world.battle_active(), "authored route opens the real " + step["presentation"]["battleId"])
			if not world.battle_active():
				break
			await _win_battle()
			battle_count += 1
		elif kind in ["dialogue","ending"]:
			check(world.story_state().get("step") == step["id"] and world.story_state()["mode"] == "dialogue", "native dialogue reaches " + step["id"])
			if world.story_state().get("step") != step["id"]:
				break
			_key(KEY_X)
			_key(KEY_Z)
			_key(KEY_Z)
		elif kind == "choice":
			check(world.story_state()["mode"] == "choice", "native choice is visible before commitment")
			_key(KEY_Z)
		await _settle()
		check(world.flags.get(step["done"],false), "actual scene commits " + step["id"])
		if not world.flags.get(step["done"],false):
			break
		var saved: Dictionary = world.persistence.store.read_slot(0)
		check(saved.get("ok",false) and saved["state"]["flags"].get(step["done"],false), "each native stage establishes a valid continue checkpoint")
	check(battle_count == 2, "both battles were actually fought through native controls")
	check(world.flags.get("p.departed",false) and world.story_state()["mode"] == "ending", "full native story ends at dawn departure")
	check(world.inventory.get("hob_travel_lamp",0) == 1 and world.inventory.get("item.star_pendant",0) == 1, "native route retains exactly one lamp and pendant")
	world.queue_free()
	for frame: int in 30:
		await process_frame
	for filename: String in DirAccess.get_files_at(folder):
		DirAccess.remove_absolute(folder.path_join(filename))
	DirAccess.remove_absolute(folder)
	print("Native prologue route: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
func _travel(destination: String) -> void:
	for transition: int in 8:
		if world.map_data["id"] == destination or world.story_state()["mode"] != "":
			return
		var start: String = world.map_data["id"]
		var queue: Array[String] = [start]
		var previous: Dictionary = {start:""}
		var exits: Dictionary = {}
		var at: int = 0
		while at < queue.size() and not previous.has(destination):
			var id: String = queue[at]
			at += 1
			for door: Dictionary in world.world_data.get_map(id,world.flags)["exits"]:
				if not previous.has(door["to"]):
					previous[door["to"]] = id
					exits[door["to"]] = door
					queue.append(door["to"])
		check(previous.has(destination), "paired doors connect the next narrative map")
		if not previous.has(destination):
			return
		var next: String = destination
		while previous[next] != start:
			next = previous[next]
		await _walk([Vector2i(int(exits[next]["x"]),int(exits[next]["y"]))],true)
func _target(trigger: Dictionary) -> void:
	if trigger["kind"] == "automatic" or world.story_state()["mode"] != "":
		return
	var targets: Array[Vector2i] = []
	var facings: Dictionary = {}
	if trigger.has("anchor"):
		var anchor: Dictionary = world.world_data.anchor_point(world.map_data["id"],trigger["anchor"])
		var radius: int = trigger.get("radius",0)
		for y: int in range(int(anchor["y"])-radius,int(anchor["y"])+radius+1):
			for x: int in range(int(anchor["x"])-radius,int(anchor["x"])+radius+1):
				if abs(x-int(anchor["x"]))+abs(y-int(anchor["y"])) <= radius and world.world_data.is_safe_entry(world.map_data,Vector2i(x,y)):
					targets.append(Vector2i(x,y))
	else:
		for entity: Dictionary in world.map_data["entities"]:
			if not entity["id"] in trigger["entityIds"]:
				continue
			for direction: Vector2i in DIRECTIONS:
				var standing: Vector2i = Vector2i(int(entity["x"]),int(entity["y"])) - direction
				if world.world_data.is_safe_entry(world.map_data,standing) and world.world_data.interaction_target(world.map_data,standing,direction).get("id") in trigger["entityIds"]:
					targets.append(standing)
					facings[standing] = direction
	await _walk(targets,false)
	if facings.has(world.player.grid_position) and world.story_state()["mode"] == "":
		world.player.face(facings[world.player.grid_position])
func _walk(targets: Array[Vector2i], allow_exit: bool) -> void:
	await _settle()
	if world.story_state()["mode"] != "":
		return
	var origin: Vector2i = world.player.grid_position
	var queue: Array[Vector2i] = [origin]
	var previous: Dictionary = {origin:origin}
	var cursor: int = 0
	var found: Vector2i = Vector2i(-1,-1)
	while cursor < queue.size():
		var point: Vector2i = queue[cursor]
		cursor += 1
		if point in targets:
			found = point
			break
		for direction: Vector2i in DIRECTIONS:
			var next: Vector2i = point + direction
			var door: bool = world.map_data["exits"].any(func(entry: Dictionary) -> bool: return Vector2i(int(entry["x"]),int(entry["y"])) == next)
			if not previous.has(next) and world.is_walkable(next) and (not door or (allow_exit and next in targets)):
				previous[next] = point
				queue.append(next)
	check(found != Vector2i(-1,-1), "native world has a real collision-safe path to the next interaction")
	if found == Vector2i(-1,-1):
		return
	var path: Array[Vector2i] = []
	while found != origin:
		path.push_front(found-previous[found])
		found = previous[found]
	for direction: Vector2i in path:
		if world.story_state()["mode"] != "":
			return
		check(world.request_move(direction), "route advances through normal world movement")
		for frame: int in 12:
			await physics_frame
		await _settle()
func _win_battle() -> void:
	var view: Node = world.get_node("BattleView")
	view.set_animation_speed(2)
	var planner: Encounters = Encounters.new()
	var skills: Dictionary = world.catalog.table_data("battle.skills")
	skills["support"] = world.catalog.table_data("battle.support")
	planner.configure(world.catalog.table_data("battle.balance"),skills)
	for turn: int in 240:
		await process_frame
		var ui: Dictionary = view.ui_state()
		if ui["busy"]:
			continue
		var state: Dictionary = ui["snapshot"]["battle"]
		if state["phase"] != "active":
			check(state["phase"] == "won", "native battle reaches actual victory")
			_key(KEY_Z)
			await _settle()
			return
		var actor: Dictionary = state["actors"].filter(func(a: Dictionary) -> bool: return a["id"] == state["activeId"])[0]
		if actor["team"] == "player":
			for command: Dictionary in planner.plan_player_turn(ui["snapshot"]):
				check(_through_ui(view,command), "story battle uses its actual action menu and target cursor")
	check(false, "story battle route terminates")
func _through_ui(view: Node, command: Dictionary) -> bool:
	var type: String = command["type"]
	if type in ["move_body","move_astral","manifest"]:
		return view.choose_option(type) and view.choose_cell(Vector2i(int(command["to"]["x"]),int(command["to"]["y"])))
	if type in ["skill","item","cheer"]:
		if type == "skill" and (not view.choose_option("skills") or not view.choose_option("skill:"+command["skillId"])):
			return false
		if type == "item" and (not view.choose_option("items") or not view.choose_option("item:"+command["itemId"])):
			return false
		if type == "cheer" and not view.choose_option("cheer"):
			return false
		var target: Dictionary = view.ui_state()["snapshot"]["battle"]["actors"].filter(func(a: Dictionary) -> bool: return a["id"] == command["targetId"])[0]
		var point: Dictionary = target[command.get("target","body")]
		return view.choose_cell(Vector2i(int(point["x"]),int(point["y"])))
	return view.choose_option(type)
