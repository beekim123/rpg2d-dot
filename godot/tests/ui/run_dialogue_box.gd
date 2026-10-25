extends SceneTree
## Exercise the native dialogue control with the shipped font and source portraits.

var _checks: int = 0
var _failures: Array[String] = []
var _advance_requests: int = 0
var _progress_events: int = 0

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	_checks += 1
	if not condition:
		_failures.append(message)
		push_error("FAIL: " + message)

func _on_advance_requested() -> void:
	_advance_requests += 1

func _on_progress_changed() -> void:
	_progress_events += 1

func _run() -> void:
	var packed: PackedScene = load("res://scenes/ui/dialogue_box.tscn") as PackedScene
	_check(packed != null, "dialogue scene loads")
	if packed == null:
		_finish()
		return
	var catalog: AssetCatalog = AssetCatalog.new()
	_check(catalog.load_pack(), "shipped resources load")
	var box: Control = packed.instantiate()
	root.add_child(box)
	await process_frame
	box.call("configure", catalog.pixel_font(), catalog.frame_texture(catalog.binding("panel"), 0), "Z 继续 · X 快显")
	box.connect("advance_requested", _on_advance_requested)
	box.connect("visibility_progress_changed", _on_progress_changed)
	_check(not bool(box.get("is_open")) and not box.visible, "new dialogue is closed")
	box.call("request_confirm")
	_check(_advance_requests == 0, "closed dialogue ignores confirm")
	var text: String = "灯不会自己亮。\n脚下的路，要自己看清。"
	var portrait: AtlasTexture = catalog.frame_texture("portrait.hob", 0)
	box.call("show_line", "霍伯", text, portrait)
	box.set_process(false)
	_check(bool(box.get("is_open")) and box.visible, "show_line opens the panel")
	_check(box.call("visible_text") == "" and not box.call("is_revealed"), "new line starts unrevealed")
	_check(box.get_node("Speaker").text == "霍伯", "speaker is caller-provided localized text")
	_check(box.get_node("Portrait").texture == portrait, "portrait is caller-provided atlas")
	_check(box.get_node("Portrait").size == Vector2(48, 48), "portrait uses its native 48px dimensions")
	_check(box.position == Vector2.ZERO and box.size == Vector2(468, 90), "panel owns its 468x90 size while the parent owns placement")
	_check(box.get_node("Body").visible_characters_behavior == TextServer.VC_CHARS_AFTER_SHAPING, "typing preserves final wrapped layout")
	_check(box.get_node("Body").get_theme_font_size("font_size") == 12, "body uses the native pixel font size")
	_check(box.get_node("Body").get_theme_font("font") == catalog.pixel_font(), "body uses injected bundled font")
	_check(box.get_node("Panel").texture != null, "nine-patch background uses the injected PNG")
	var events_before: int = _progress_events
	box.call("_process", 0.01)
	_check(_progress_events == events_before, "sub-character time does not publish redundant snapshots")
	box.call("_process", 1.0 / 30.0)
	_check(box.call("visible_text") == "灯", "one character appears at the configured pace")
	_check(_progress_events == events_before + 1, "visible character change publishes one snapshot")
	box.call("request_confirm")
	_check(box.call("visible_text") == text and box.call("is_revealed"), "first confirm reveals the complete line including newline")
	_check(_advance_requests == 0, "reveal does not consume the next story line")
	box.call("request_confirm")
	_check(_advance_requests == 1, "second confirm requests exactly one story advance")
	box.call("show_line", "芬恩", "先看脚下。", catalog.frame_texture("portrait.finn", 0))
	box.set_process(false)
	box.call("reveal_all")
	_check(_advance_requests == 1, "fast reveal never advances the script")
	var click: InputEventMouseButton = InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	box.call("_gui_input", click)
	_check(_advance_requests == 2, "left click on revealed panel requests advance")
	click.button_index = MOUSE_BUTTON_RIGHT
	box.call("_gui_input", click)
	_check(_advance_requests == 2, "other mouse buttons do not advance dialogue")
	box.call("show_line", "霍伯", "灯".repeat(30) + "\n" + "路".repeat(30) + "\n" + "星".repeat(30), portrait)
	box.call("reveal_all")
	await process_frame
	_check(box.call("content_fits"), "three thirty-character Chinese lines fit without clipping")
	_check(box.get_node("Body").get_line_count() == 3, "three authored lines remain three rendered lines")
	_check(box.get_node("Body").position.y + box.get_node("Body").size.y <= box.get_node("Hint").position.y, "body and hint do not overlap")
	box.call("show_line", "霍伯", "灯\n路\n星\n家", portrait)
	box.call("reveal_all")
	await process_frame
	_check(not box.call("content_fits"), "authoring check catches a fourth line instead of accepting clipped text")
	box.call("close")
	_check(not bool(box.get("is_open")) and not box.visible and not box.is_processing(), "close hides panel and stops typing work")
	_check(box.call("visible_text") == "", "closed dialogue does not expose stale text")
	box.call("request_confirm")
	_check(_advance_requests == 2, "closed confirm remains harmless")
	box.queue_free()
	await process_frame
	_finish()

func _finish() -> void:
	print("Dialogue UI: %d checks, %d failures" % [_checks, _failures.size()])
	quit(0 if _failures.is_empty() else 1)
