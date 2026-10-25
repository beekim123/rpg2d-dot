extends SceneTree
const WorldScene = preload("res://scenes/main.tscn")
const Encounters = preload("res://scripts/battle/battle_encounter.gd")
const Compare = preload("res://tests/battle/json_compare.gd")
var checks: int = 0
var failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error("FAIL: " + label)
func _run() -> void:
	var world: Node = WorldScene.instantiate()
	world.persistence_enabled = false
	root.add_child(world)
	await process_frame
	check(world.loaded, "world loads before native battle")
	check(world.has_method("audio_state"), "world owns the native audio service")
	var initial: Dictionary = world.snapshot_state()
	var supported: bool = world.has_method("start_battle")
	check(supported, "world exposes validated native battle entry")
	if supported:
		check(not world.start_battle("missing"), "unknown battle keeps exploration")
		check(Compare.equal(world.snapshot_state(), initial), "failed entry preserves save state")
		check(world.start_battle("prologue_ella"), "native Ella battle opens in authored town square")
		_check_menu_rects(world.get_node("BattleView").ui_state(), "initial command menu")
		await process_frame
		var view: Node = world.get_node("BattleView")
		view.set_animation_speed(2)
		check(world.battle_active(), "battle locks exploration")
		check(not world.request_move(Vector2i.DOWN) and not world.open_save_menu(), "battle input cannot move exploration or open saves")
		check(not world.save_slot(1).get("ok", true), "battle does not write an exploration save")
		var ui: Dictionary = view.ui_state()
		check(ui["snapshot"]["battle"]["actors"].size() == 3, "rendered native teaching battle includes starless Finn")
		for option: Dictionary in ui["options"]:
			var rect: Array = option["rect"]
			check(rect[0] >= 0 and rect[1] >= 0 and rect[0] + rect[2] <= 480 and rect[1] + rect[3] <= 270, "native command button fits logical viewport")
		check(view.choose_option("move_body"), "real HUD action enters move mode")
		check(view.choose_cell(Vector2i(1, 4)), "cursor confirmation moves native body")
		await process_frame
		check(view.ui_state()["snapshot"]["battle"]["bodySpent"] == 1, "movement commits one grid step")
		check(view.choose_option("undo"), "native HUD can undo draft movement")
		await process_frame
		check(view.ui_state()["snapshot"]["battle"]["actors"][0]["body"]["y"] == 3, "undo restores original body cell")
		check(view.choose_option("skills"), "skill menu opens for pointer ordering regression")
		_check_menu_rects(view.ui_state(), "new skill menu")
		var grid: Dictionary = view.ui_state()["grid"]
		var motion: InputEventMouseMotion = InputEventMouseMotion.new()
		motion.position = Vector2(grid["x"] + 5.5 * 16, grid["y"] + 2.5 * 16)
		view._input(motion)
		check(view.choose_option("skill:laurel_bolt"), "skill selection follows an already received pointer move")
		check(Compare.equal(view.ui_state()["cursor"], {"x": 5, "y": 2}), "opening aim reconciles latest pointer rather than stale default target")
		world.close_battle()
		await process_frame
		check(not world.battle_active() and Compare.equal(world.snapshot_state(), initial), "leaving preview restores exact exploration progress")
		var at_lamp: Dictionary = initial.duplicate(true)
		at_lamp["mapId"] = "lv.town"
		at_lamp["player"] = {"x": 12, "y": 17, "facing": "down"}
		check(world.restore_state(at_lamp), "return-key fixture faces an unlit lamp")
		initial = world.snapshot_state()
		var planner: Encounters = Encounters.new()
		var skills: Dictionary = world.catalog.table_data("battle.skills")
		skills["support"] = world.catalog.table_data("battle.support")
		planner.configure(world.catalog.table_data("battle.balance"), skills)
		for id: String in ["prologue_ella", "prologue_shade"]:
			for passive: bool in [false, true]:
				check(world.start_battle(id), "UI route opens " + id)
				await process_frame
				var battle_view: Node = world.get_node("BattleView")
				battle_view.set_animation_speed(2)
				var battle_initial: Dictionary = battle_view.ui_state()["snapshot"]
				for step: int in 180:
					await process_frame
					var current: Dictionary = battle_view.ui_state()
					if current["busy"]:
						continue
					var state: Dictionary = current["snapshot"]["battle"]
					if state["phase"] != "active":
						break
					var actor: Dictionary = state["actors"].filter(func(entry: Dictionary) -> bool: return entry["id"] == state["activeId"])[0]
					if actor["team"] == "enemy":
						continue
					var commands: Array = [{"type": "wait", "actorId": actor["id"]}] if passive else planner.plan_player_turn(current["snapshot"])
					for command: Dictionary in commands:
						check(_through_ui(battle_view, command), "normal command passes native menu and cursor")
				var ended: Dictionary = battle_view.ui_state()
				check(ended["snapshot"]["battle"]["phase"] == ("lost" if passive else "won"), "native scene reaches real " + ("defeat" if passive else "victory"))
				if passive:
					check(battle_view.choose_option("retry"), "native defeat menu retries")
					await process_frame
					check(Compare.equal(battle_view.ui_state()["snapshot"], battle_initial), "native retry restores full initial encounter")
				if not passive:
					var key: InputEventKey = InputEventKey.new()
					key.physical_keycode = KEY_X if id == "prologue_ella" else KEY_Z
					key.keycode = key.physical_keycode
					key.pressed = true
					root.push_input(key)
					check(root.is_input_handled(), "terminal return key is consumed before view detaches")
					await process_frame
					key.pressed = false
					root.push_input(key)
					check(not world.battle_active(), "terminal keyboard return closes battle")
				else:
					world.close_battle()
				await process_frame
				check(Compare.equal(world.snapshot_state(), initial), "each native fight preserves exploration progress without lighting the faced lamp")
	world.queue_free()
	await process_frame
	# AudioServer releases stopped playback objects on its next mix, after node disposal.
	await create_timer(maxf(0.05, AudioServer.get_time_to_next_mix() + AudioServer.get_output_latency())).timeout
	print("BattleView: %d checks, %d failures" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)

func _check_menu_rects(ui: Dictionary, label: String) -> void:
	var rectangles: Array[Rect2] = []
	for option: Dictionary in ui["options"]:
		var bounds: Array = option["rect"]
		var rect: Rect2 = Rect2(bounds[0], bounds[1], bounds[2], bounds[3])
		check(rect.has_area(), label + " immediately has clickable geometry")
		for prior: Rect2 in rectangles:
			check(not rect.intersects(prior), label + " never publishes overlapping targets before a layout frame: " + str(rect) + " / " + str(prior))
		rectangles.append(rect)

func _through_ui(view: Node, command: Dictionary) -> bool:
	var type: String = command["type"]
	if type in ["move_body", "move_astral", "manifest"]:
		return view.choose_option(type) and view.choose_cell(Vector2i(int(command["to"]["x"]), int(command["to"]["y"])))
	if type in ["skill", "item", "cheer"]:
		if type == "skill":
			if not view.choose_option("skills") or not view.choose_option("skill:" + command["skillId"]):
				return false
		elif type == "item":
			if not view.choose_option("items") or not view.choose_option("item:" + command["itemId"]):
				return false
		elif not view.choose_option("cheer"):
			return false
		var state: Dictionary = view.ui_state()["snapshot"]["battle"]
		var actor: Dictionary = state["actors"].filter(func(entry: Dictionary) -> bool: return entry["id"] == command["targetId"])[0]
		var point: Dictionary = actor[command.get("target", "body")]
		return view.choose_cell(Vector2i(int(point["x"]), int(point["y"])))
	return view.choose_option(type)
