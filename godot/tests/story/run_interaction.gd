extends SceneTree
## Real map input, native dialogue presentation, safe flags and return to exploration.
var _checks: int = 0
var _failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func _check(ok: bool, message: String) -> void:
	_checks += 1
	if not ok:
		_failures.append(message)
		push_error("FAIL: " + message)
func _run() -> void:
	var packed: PackedScene = load("res://scenes/main.tscn") as PackedScene
	var world: Node = packed.instantiate()
	world.set("enable_prologue", false)
	world.set("persistence_enabled", false)
	root.add_child(world)
	await process_frame
	_check(bool(world.get("loaded")), "playable world loads story resources")
	if not world.has_method("interact") or not world.has_method("dialogue_state"):
		_check(false, "world exposes interaction controller API")
		world.queue_free()
		_finish()
		return
	_check(not world.call("dialogue_active"), "exploration starts outside dialogue")
	var panel: Control = world.get_node("HUD/DialogueBox")
	_check(panel.position == Vector2(6,174) and panel.size == Vector2(468,90), "parent scene places the dialogue at its intended bottom rectangle: " + str(panel.position))
	_check(world.call("enter_map", "lv.finn_house", Vector2i(4,7)), "test arrives safely beside the authored bed")
	world.get("player").call("face", Vector2i.UP)
	_check(world.call("interact"), "facing furniture footprint opens investigation")
	_check(world.call("dialogue_state")["script"] == "lv.inspect.finn_bed", "bed runs its authored script")
	_check(world.call("dialogue_state")["speaker"] == "芬恩", "localized speaker reaches native panel")
	var before: Vector2i = world.get("player").get("grid_position")
	_check(not world.call("request_move",Vector2i.RIGHT), "dialogue locks movement")
	_check(not world.call("enter_map","lv.town"), "dialogue locks external map transfer")
	_check(world.get("player").get("grid_position") == before, "blocked input preserves player position")
	world.call("confirm_dialogue")
	_check(world.call("dialogue_state")["revealed"], "first confirm reveals current line")
	_check(world.call("dialogue_active"), "revealing does not close or skip a line")
	await _finish_conversation(world)
	_check(not world.call("dialogue_active"), "investigation returns to exploration")
	_check(world.call("enter_map","lv.town",Vector2i(18,11)), "safe approach to Hob")
	world.get("player").call("face",Vector2i.UP)
	var hob: AnimatedSprite2D = world.call("find_entity","lv.town.hob")
	var hob_position: Vector2 = hob.position
	var initial_animation: StringName = hob.animation
	_check(world.call("interact"), "front NPC opens dialogue")
	var first_text: String = world.call("dialogue_state")["full_text"]
	_check(not bool(world.get("flags").get("seen.hob",false)), "first line does not prematurely commit completion flag")
	world.call("reveal_dialogue")
	_check(world.call("dialogue_state")["text"] == first_text, "fast reveal displays exactly the current authored text")
	await _finish_conversation(world)
	_check(bool(world.get("flags").get("seen.hob",false)), "completion commits safe authored memory flag")
	_check(hob.position == hob_position and hob.animation == initial_animation, "conversation restores NPC pose without moving its feet")
	_check(world.call("interact"), "repeat interaction remains available")
	_check(world.call("dialogue_state")["full_text"] != first_text, "repeat interaction follows the remembered branch")
	await _finish_conversation(world)
	_check(world.call("request_move",Vector2i.LEFT), "closing dialogue restores actual movement")
	for tick: int in range(24):
		await physics_frame
		if not world.get("player").get("is_moving"):
			break
	_check(world.get("player").get("grid_position") == Vector2i(17,11), "restored movement reaches its legal destination")
	_check(world.call("enter_map","lv.town",Vector2i(18,11)), "return to Hob for failed-transaction fixture")
	world.get("player").call("face",Vector2i.UP)
	var bad_script: Dictionary = {"lv.npc.hob.day": [
		{"op":"say","speaker":"name.hob","portrait":"portrait.hob","text":"hob.hello"},
		{"op":"set","flag":"p.s09_done","value":true},
		{"op":"say","speaker":"name.hob","portrait":"portrait.hob","text":"hob.again"},
		{"op":"end"}]}
	var fixture_portraits: Array[String] = ["portrait.hob"]
	var catalog: AssetCatalog = world.get("catalog")
	_check(world.get("story_rules").configure(bad_script,catalog.locale(catalog.binding("locale")),fixture_portraits).is_empty(), "bad-layout fixture uses valid script syntax")
	var before_failure: Dictionary = world.get("flags").duplicate(true)
	_check(world.call("interact"), "fixture opens on a safe line")
	world.call("reveal_dialogue")
	world.call("confirm_dialogue")
	_check(not world.call("dialogue_active"), "rejected script flag transaction closes the dialogue")
	_check(world.get("flags") == before_failure, "rejected script transaction commits no unsafe flags")
	_check(world.call("request_move",Vector2i.LEFT), "failed story transaction releases movement")
	for tick: int in range(24):
		await physics_frame
		if not world.get("player").get("is_moving"):
			break
	var flags_before: Dictionary = world.get("flags").duplicate(true)
	var map_before: String = world.get("map_data")["id"]
	var position_before: Vector2i = world.get("player").get("grid_position")
	_check(not world.call("apply_story_flags",{"p.s09_done":true}), "overlapping partial dawn flags are rejected")
	_check(world.get("flags") == flags_before and world.get("map_data")["id"] == map_before and world.get("player").get("grid_position") == position_before, "bad flag transaction leaves state and scene intact")
	_check(world.call("apply_story_flags",{"p.attack_started":true}), "valid night phase is accepted atomically")
	_check(world.call("enter_map","lv.town",Vector2i(22,11)), "empty night NPC cell can be entered")
	_check(not world.call("apply_story_flags",{"p.attack_started":true,"p.s09_done":true}), "NPC cannot materialize on the current player even if spawn is safe")
	_check(world.get("flags") == {"p.attack_started":true}, "blocked materialization keeps the old flags")
	_check(not world.call("dialogue_active"), "failed standalone transaction does not capture input")
	world.queue_free()
	await process_frame
	_finish()
func _finish_conversation(world: Node) -> void:
	for page: int in range(20):
		if not world.call("dialogue_active"):
			return
		world.call("reveal_dialogue")
		world.call("confirm_dialogue")
		await process_frame
	_check(false, "authored conversation completes within twenty pages")
func _finish() -> void:
	print("World interaction: %d checks, %d failures" % [_checks,_failures.size()])
	quit(0 if _failures.is_empty() else 1)
