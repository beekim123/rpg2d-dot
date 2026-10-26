extends SceneTree
var checks: int = 0
var failures: Array[String] = []
var choices: Array[String] = []
var completions: int = 0
var cancellations: int = 0
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
	check(root.is_input_handled(), "story key is consumed before synchronous presentation changes")
	event.pressed = false
	root.push_input(event)
func _run() -> void:
	check(ResourceLoader.exists("res://scenes/story/prologue_overlay.tscn"), "native prologue presentation exists")
	if not failures.is_empty():
		_finish()
		return
	var catalog: AssetCatalog = AssetCatalog.new()
	catalog.load_pack()
	var words: Dictionary = catalog.locale("zh-Hans")
	var overlay: Node = load("res://scenes/story/prologue_overlay.tscn").instantiate()
	root.add_child(overlay)
	overlay.setup(catalog,words)
	var segment: Dictionary = catalog.cinematic_data("prologue")["scenes"][0]["segments"][0]
	overlay.option_chosen.connect(func(id: String) -> void:
		choices.append(id)
		if id == "new":
			overlay.present_segment(segment, ["scene.legend.sky","scene.legend.shatter","scene.legend.fall","scene.legend.fall","scene.legend.lamp","scene.legend.lamp"])
	)
	overlay.segment_finished.connect(func() -> void:
		completions += 1
		overlay.close()
	)
	overlay.cancelled.connect(func() -> void: cancellations += 1)
	overlay.present_choices("title","prologue.ui.chapter",[{"id":"new","label":"title.new","enabled":true},{"id":"continue","label":"title.continue","enabled":false},{"id":"manage","label":"menu.title","enabled":true}],"game.motto","scene.legend.sky")
	var state: Dictionary = overlay.snapshot()
	check(state["mode"] == "title", "title opens in native layer")
	for option: Dictionary in state["options"]:
		var r: Array = option["rect"]
		check(r[2] > 0 and r[3] > 0 and r[0] >= 0 and r[1] >= 0 and r[0]+r[2] <= 480 and r[1]+r[3] <= 270, "title button has immediate in-bounds geometry")
	_key(KEY_DOWN)
	check(overlay.snapshot()["selected"] == "manage", "keyboard skips disabled continue option")
	_key(KEY_UP)
	_key(KEY_Z)
	check(choices == ["new"] and overlay.snapshot()["mode"] == "dialogue", "new journey callback can immediately replace title with dialogue")
	check(not overlay.snapshot()["revealed"], "opening confirmation does not leak into the first dialogue page")
	_key(KEY_Z)
	check(overlay.snapshot()["revealed"], "first dialogue confirmation reveals the whole current line")
	_key(KEY_Z)
	check(overlay.snapshot()["line"] == 1 and overlay.snapshot()["image"] == "scene.legend.shatter", "second confirmation advances the authored page and still together")
	_key(KEY_X)
	check(overlay.snapshot()["summary"] and completions == 0, "skip displays summary without silently committing the segment")
	_key(KEY_Z)
	_key(KEY_Z)
	check(completions == 1 and overlay.snapshot()["mode"] == "", "summary must be acknowledged before completion")
	overlay.present_choices("choice","prologue.ui.choice.festival.prompt",[{"id":"start","label":"prologue.ui.choice.festival.start"}])
	_key(KEY_X)
	check(cancellations == 1 and choices == ["new"], "cancelling a festival choice never emits its confirm option")
	overlay.close()
	overlay.present_segment(segment)
	check(overlay.snapshot()["image"] == "", "map dialogue clears any stale fullscreen still")
	overlay.queue_free()
	await process_frame
	_finish()
func _finish() -> void:
	print("PrologueOverlay: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
