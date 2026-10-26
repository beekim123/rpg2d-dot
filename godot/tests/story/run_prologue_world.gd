extends SceneTree
var checks: int = 0
var failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error("FAIL: " + label)
func _key(code: Key) -> void:
	var key: InputEventKey = InputEventKey.new()
	key.physical_keycode = code
	key.keycode = code
	key.pressed = true
	root.push_input(key)
	key.pressed = false
	root.push_input(key)
func _run() -> void:
	var world: Node = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	world.persistence_enabled = false
	root.add_child(world)
	await process_frame
	await process_frame
	check(world.loaded, "prologue boots into the actual native world")
	check(world.has_method("story_state"), "world integrates the native prologue director")
	if world.has_method("story_state"):
		check(world.story_state()["mode"] == "title", "normal entry presents a real native title")
		var before: Dictionary = world.snapshot_state()
		check(not world.request_move(Vector2i.DOWN) and not world.interact() and not world.open_save_menu(), "title prevents exploration input from leaking behind it")
		check(world.snapshot_state() == before, "title input guard preserves the world snapshot")
		_key(KEY_Z)
		await process_frame
		await process_frame
		check(world.story_state().get("step") == "legend" and world.flags.get("p.main_started",false), "new journey begins the authored legend")
		check(world.player.visual_id == "char.finn_unarmed", "Finn has no pole before taking it")
		await _finish_segment(world)
		check(world.flags.get("p.s01_done",false) and world.story_state().get("step") == "wake", "acknowledged legend reaches wake-up without changing rooms")
		await _finish_segment(world)
		check(world.flags.get("p.woken",false) and world.story_state()["mode"] == "", "wake-up returns actual movement to the player")
		await _walk(world,Vector2i(7,10))
		_key(KEY_Z)
		await process_frame
		await process_frame
		if world.story_state()["mode"] == "dialogue":
			await _finish_segment(world)
		check(world.flags.get("p.rod_taken",false) and world.inventory.get("lamp_rod",0) == 1, "a real interaction beside the door takes the pole once")
		check(world.player.visual_id == "char.finn", "taking the physical pole changes Finn's real sprite")
		_key(KEY_Z)
		await process_frame
		check(world.inventory.get("lamp_rod",0) == 1, "repeated interaction does not duplicate the pole")
		var invalid: Dictionary = world.snapshot_state()
		invalid["flags"]["p.attack_started"] = true
		check(not world.import_save(JSON.stringify(invalid))["ok"], "live import is guarded by story consistency before restoration")
		check(not world.flags.get("p.attack_started",false), "bad imported story leaves actual world flags unchanged")
	var playbacks: Array[WeakRef] = []
	for node: Node in world.get_node("AudioService").get_children():
		if node is AudioStreamPlayer and node.has_stream_playback():
			playbacks.append(weakref(node.get_stream_playback()))
	world.queue_free()
	for frame: int in 120:
		await process_frame
		if playbacks.all(func(reference: WeakRef) -> bool: return reference.get_ref() == null):
			break
	check(playbacks.all(func(reference: WeakRef) -> bool: return reference.get_ref() == null), "world disposal releases every queued audio playback before process shutdown")
	print("PrologueWorld: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
func _finish_segment(world: Node) -> void:
	check(world.story_state()["mode"] == "dialogue", "a real native segment is open")
	_key(KEY_X)
	_key(KEY_Z)
	_key(KEY_Z)
	await process_frame
	await process_frame
func _walk(world: Node, destination: Vector2i) -> void:
	var origin: Vector2i = world.player.grid_position
	var queue: Array[Vector2i] = [origin]
	var previous: Dictionary = {origin:origin}
	var cursor: int = 0
	while cursor < queue.size() and not previous.has(destination):
		var cell: Vector2i = queue[cursor]
		cursor += 1
		for direction: Vector2i in [Vector2i.UP,Vector2i.DOWN,Vector2i.LEFT,Vector2i.RIGHT]:
			var next: Vector2i = cell + direction
			if not previous.has(next) and world.is_walkable(next):
				previous[next] = cell
				queue.append(next)
	check(previous.has(destination), "the real authored house has a walkable route to the pole")
	if not previous.has(destination):
		return
	var path: Array[Vector2i] = []
	var point: Vector2i = destination
	while point != origin:
		path.push_front(point - previous[point])
		point = previous[point]
	for direction: Vector2i in path:
		check(world.request_move(direction), "house route uses normal movement collision rules")
		for frame: int in 12:
			await physics_frame
