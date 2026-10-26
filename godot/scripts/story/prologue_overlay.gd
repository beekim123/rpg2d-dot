extends CanvasLayer
## Native text and choices. This layer never grants items or advances story flags.
signal option_chosen(id: String)
signal segment_finished
signal cancelled
signal sound_requested(cue: String)
signal gesture_received
signal settings_requested(key: String)
signal changed
const BoxScene = preload("res://scenes/ui/dialogue_box.tscn")
var _catalog: AssetCatalog
var _words: Dictionary = {}
var _root: Control
var _image: TextureRect
var _panel: NinePatchRect
var _title: Label
var _subtitle: Label
var _hint: Label
var _warning: Label
var _box: DialogueBox
var _skip: Button
var _buttons: Array[Button] = []
var _options: Array = []
var _selected: int = 0
var _mode: String = ""
var _segment: Dictionary = {}
var _images: Array[String] = []
var _line: int = 0
var _summary: bool = false
var _image_id: String = ""

func setup(catalog: AssetCatalog, words: Dictionary) -> void:
	_catalog = catalog
	_words = words.duplicate(true)
	_root = Control.new()
	_root.size = Vector2(480,270)
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(_root)
	_image = TextureRect.new()
	_image.position = Vector2.ZERO
	_image.size = Vector2(480,270)
	_image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_image.stretch_mode = TextureRect.STRETCH_KEEP_CENTERED
	_image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_image)
	_panel = NinePatchRect.new()
	_panel.position = Vector2(72,54)
	_panel.size = Vector2(336,184)
	_panel.texture = catalog.frame_texture(catalog.binding("panel"),0)
	_panel.patch_margin_left = 4
	_panel.patch_margin_right = 4
	_panel.patch_margin_top = 4
	_panel.patch_margin_bottom = 4
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_panel)
	_title = _label(Rect2(88,68,304,32),24)
	_subtitle = _label(Rect2(88,102,304,28),12)
	_hint = _label(Rect2(88,219,304,14),12)
	_hint.text = _word("prologue.ui.choice.hint")
	_box = BoxScene.instantiate() as DialogueBox
	_box.position = Vector2(6,174)
	_root.add_child(_box)
	_box.configure(catalog.pixel_font(),catalog.frame_texture(catalog.binding("panel"),0),_word("prologue.ui.dialogue.hint"))
	_box.advance_requested.connect(_advance_line)
	_box.visibility_progress_changed.connect(func() -> void: changed.emit())
	_skip = _button(Rect2(358,149,116,19),_word("prologue.ui.skip.short"))
	_skip.pressed.connect(_show_summary)
	_warning = _label(Rect2(8,6,464,16),12)
	_warning.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_warning.add_theme_color_override("font_color",Color("f07a5a"))
	_warning.hide()
	close()

func present_segment(segment: Dictionary, images: Array = []) -> void:
	_clear_buttons()
	_mode = "dialogue"
	_segment = segment.duplicate(true)
	_images.clear()
	for id: String in images:
		_images.append(id)
	_line = 0
	_summary = false
	_panel.hide()
	_title.hide()
	_subtitle.hide()
	_hint.hide()
	_skip.show()
	_root.show()
	_show_line()

func present_choices(context: String, title_key: String, options: Array, subtitle_key: String = "", image_id: String = "") -> void:
	_clear_buttons()
	_mode = context
	_segment = {}
	_summary = false
	_box.close()
	_skip.hide()
	_options = options.duplicate(true)
	if context in ["choice","new_confirm","dough_offer"]:
		_options.append({"id":"__cancel","label":"prologue.ui.choice.cancel","enabled":true})
	_selected = 0
	for index: int in _options.size():
		var option: Dictionary = _options[index]
		var button: Button = _button(Rect2(140,132+index*29,200,22),_word(option["label"]))
		button.disabled = not option.get("enabled",true)
		button.pressed.connect(_activate.bind(index))
		button.mouse_entered.connect(_select.bind(index))
		_buttons.append(button)
	if not _buttons.is_empty() and _buttons[0].disabled:
		_navigate(1)
	_panel.show()
	_title.show()
	_subtitle.show()
	_hint.show()
	_title.add_theme_font_size_override("font_size",24 if context in ["title","ending"] else 12)
	_title.text = _word(title_key)
	_subtitle.text = "" if subtitle_key.is_empty() else _word(subtitle_key)
	_set_image(image_id)
	_root.show()
	_restyle()
	changed.emit()

func close() -> void:
	_mode = ""
	_segment = {}
	_images.clear()
	_image_id = ""
	_clear_buttons()
	if _root != null:
		_box.close()
		_root.hide()
	changed.emit()
func is_active() -> bool:
	return not _mode.is_empty()
func set_warning(text: String) -> void:
	_warning.text = text
	_warning.visible = not text.is_empty()
func snapshot() -> Dictionary:
	var options: Array = []
	for index: int in _buttons.size():
		var r: Rect2 = _buttons[index].get_global_rect()
		options.append({"id":_options[index]["id"],"enabled":not _buttons[index].disabled,"selected":index==_selected,"rect":[r.position.x,r.position.y,r.size.x,r.size.y]})
	return {"mode":_mode,"line":_line,"summary":_summary,"revealed":_box.is_revealed() if _box != null and _box.is_open else false,"text":_box.visible_text() if _box != null and _box.is_open else "","image":_image_id,"options":options,"selected":_options[_selected]["id"] if not _options.is_empty() else ""}

func _input(event: InputEvent) -> void:
	if not is_active():
		return
	if event.is_pressed() and not event.is_echo():
		gesture_received.emit()
	if not event is InputEventKey or not event.pressed:
		return
	var viewport: Viewport = get_viewport()
	viewport.set_input_as_handled()
	var key: Key = event.physical_keycode if event.physical_keycode != 0 else event.keycode
	if not event.echo and key in [KEY_M,KEY_R]:
		settings_requested.emit("mute" if key == KEY_M else "reduced")
		return
	if _mode == "dialogue":
		if event.echo:
			return
		if key in [KEY_Z,KEY_ENTER,KEY_KP_ENTER,KEY_SPACE]:
			sound_requested.emit("confirm")
			_box.request_confirm()
		elif key in [KEY_X,KEY_ESCAPE]:
			_show_summary()
	elif key in [KEY_UP,KEY_W,KEY_LEFT,KEY_A]:
		_navigate(-1)
	elif key in [KEY_DOWN,KEY_S,KEY_RIGHT,KEY_D]:
		_navigate(1)
	elif not event.echo and key in [KEY_Z,KEY_ENTER,KEY_KP_ENTER,KEY_SPACE]:
		_activate(_selected)
	elif not event.echo and key in [KEY_X,KEY_ESCAPE] and _mode != "title":
		sound_requested.emit("cancel")
		cancelled.emit()

func _advance_line() -> void:
	if _mode != "dialogue":
		return
	if _summary or _line+1 >= _segment["lines"].size():
		segment_finished.emit()
		return
	_line += 1
	_show_line()
func _show_line() -> void:
	var line: Dictionary = _segment["lines"][_line]
	_set_image(_images[_line] if _line < _images.size() else "")
	_box.show_line(_word(line["speaker"]),_word(line["text"]),null if line["portrait"] == "" else _catalog.frame_texture(line["portrait"],0))
	changed.emit()
func _show_summary() -> void:
	if _mode != "dialogue":
		return
	if _summary:
		_box.reveal_all()
		return
	_summary = true
	_skip.hide()
	_box.show_line(_word("prologue.ui.summary.title"),_word(_segment["summary"]),null)
	sound_requested.emit("cancel")
	changed.emit()
func _set_image(id: String) -> void:
	_image_id = id
	_image.visible = not id.is_empty()
	_image.texture = null if id.is_empty() else _catalog.frame_texture(id,0)
func _activate(index: int) -> void:
	if index < 0 or index >= _buttons.size() or _buttons[index].disabled:
		return
	var id: String = _options[index]["id"]
	sound_requested.emit("cancel" if id == "__cancel" else "confirm")
	if id == "__cancel":
		cancelled.emit()
	else:
		option_chosen.emit(id)
func _select(index: int) -> void:
	if index >= 0 and index < _buttons.size() and not _buttons[index].disabled:
		_selected = index
		_restyle()
		changed.emit()
func _navigate(direction: int) -> void:
	if _buttons.is_empty():
		return
	for attempt: int in _buttons.size():
		_selected = posmod(_selected+direction,_buttons.size())
		if not _buttons[_selected].disabled:
			break
	_restyle()
	changed.emit()
func _clear_buttons() -> void:
	for button: Button in _buttons:
		_root.remove_child(button)
		button.queue_free()
	_buttons.clear()
	_options.clear()
func _restyle() -> void:
	for index: int in _buttons.size():
		var style: StyleBoxFlat = _style(index==_selected)
		for key: String in ["normal","hover","pressed","disabled"]:
			_buttons[index].add_theme_stylebox_override(key,style)
		_buttons[index].size = Vector2(200,22)
func _button(rect: Rect2, text: String) -> Button:
	var button: Button = Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_NONE
	button.add_theme_font_override("font",_catalog.pixel_font())
	button.add_theme_font_size_override("font_size",12)
	button.add_theme_color_override("font_color",Color("f2e6cf"))
	button.add_theme_color_override("font_disabled_color",Color("85706a"))
	for key: String in ["normal","hover","pressed","disabled"]:
		button.add_theme_stylebox_override(key,_style(false))
	_root.add_child(button)
	button.position = rect.position
	button.size = rect.size
	return button
func _label(rect: Rect2, size: int) -> Label:
	var label: Label = Label.new()
	label.position = rect.position
	label.size = rect.size
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font",_catalog.pixel_font())
	label.add_theme_font_size_override("font_size",size)
	label.add_theme_color_override("font_color",Color("fff6c8"))
	label.add_theme_color_override("font_outline_color",Color("1a1220"))
	label.add_theme_constant_override("outline_size",1)
	_root.add_child(label)
	return label
static func _style(selected: bool) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color("1c2a5a") if selected else Color("2e1f2b")
	style.border_color = Color("ffe36b") if selected else Color("85706a")
	style.set_border_width_all(1)
	style.content_margin_top = 0
	style.content_margin_bottom = 0
	return style
func _word(key: String) -> String:
	return String(_words.get(key,key))
