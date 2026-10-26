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
	var event: InputEventKey = InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = true
	root.push_input(event)
	event.pressed = false
	root.push_input(event)
func _run() -> void:
	var world: Node = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	world.enable_prologue = false
	world.persistence_enabled = false
	root.add_child(world)
	await process_frame
	check(world.has_method("start_dough"), "native world exposes the optional dough room mode")
	if world.has_method("start_dough"):
		check(world.enter_map("lv.bakery",Vector2i(9,9)), "bakery entrance is safe")
		var bread: int = world.inventory.get("bread",0)
		for attempt: int in 2:
			check(world.start_dough(), "native puzzle starts without replacing the exploration save")
			check(not world.open_save_menu() and not world.request_move(Vector2i.DOWN), "local puzzle state cannot leak into exploration or its saves")
			for code: Key in [KEY_LEFT,KEY_LEFT,KEY_UP,KEY_DOWN,KEY_RIGHT,KEY_RIGHT,KEY_RIGHT,KEY_UP]:
				_key(code)
				for frame: int in 12:
					await physics_frame
			check(world.puzzle_state()["solved"], "real keyboard input pushes both carts onto the real cooling mats")
			_key(KEY_R)
			check(not world.puzzle_state()["solved"] and world.puzzle_state()["completed"], "reset restores the board without forgetting that this visit already solved it")
			_key(KEY_X)
			await process_frame
			check(not world.puzzle_active() and world.flags.get("q.dough_done",false), "exit returns to the authored room and records completion")
			check(world.inventory.get("bread",0) == bread+2, "puzzle reward is granted exactly once across repeated solves")
		check(world.persistence.codec.validate(world.snapshot_state())["ok"], "local puzzle never adds unsupported actor memory to v3")
	world.queue_free()
	await process_frame
	print("DoughView: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
