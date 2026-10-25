extends Control
signal chosen(id: String)
signal selection_changed
var _catalog: AssetCatalog
var _words: Dictionary = {}
var _font: FontFile
var _grid: Control
var _buttons: Array[Button] = []
var _options: Array = []
var _selected: int = 0
var _title: Label
var _goal: Label
var _settings: Label
var _hint: Label
var _name: Label
var _hp: Label
var _will: Label
var _bar: ColorRect
var _portrait: TextureRect
var _portrait_id: String = ""
var _banner: NinePatchRect
var _banner_label: Label
var _icons: Array[TextureRect] = []
func setup(catalog: AssetCatalog, words: Dictionary) -> void:
	_catalog = catalog
	_words = words.duplicate(true)
	_font = catalog.pixel_font()
	size = Vector2(480, 270)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_panel(Rect2(6, 6, 232, 26))
	_panel(Rect2(252, 6, 222, 26))
	_panel(Rect2(6, 206, 468, 62))
	_title = _label(Rect2(14, 11, 216, 17))
	_goal = _label(Rect2(12, 36, 238, 17))
	_settings = _label(Rect2(250, 36, 224, 17))
	_settings.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_hint = _label(Rect2(10, 187, 464, 16))
	_name = _label(Rect2(68, 211, 110, 16))
	_hp = _label(Rect2(68, 227, 110, 14))
	_will = _label(Rect2(68, 250, 110, 14))
	var backdrop: ColorRect = ColorRect.new()
	backdrop.position = Vector2(68, 243)
	backdrop.size = Vector2(104, 5)
	backdrop.color = Color("4a3040")
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(backdrop)
	_bar = ColorRect.new()
	_bar.position = backdrop.position
	_bar.size = backdrop.size
	_bar.color = Color("86c440")
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_bar)
	_portrait = TextureRect.new()
	_portrait.position = Vector2(14, 215)
	_portrait.size = Vector2(48, 48)
	_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait.stretch_mode = TextureRect.STRETCH_KEEP_CENTERED
	_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(_portrait)
	# A fixed pixel grid is positioned synchronously. Container sorting is deferred:
	# newly published actions would otherwise overlap for one input frame.
	_grid = Control.new()
	_grid.position = Vector2(182, 211)
	_grid.size = Vector2(286, 52)
	_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_grid)
	var next: Label = _label(Rect2(260, 11, 38, 16))
	next.text = _words["battle.next"]
	for index: int in 8:
		var icon: TextureRect = TextureRect.new()
		icon.position = Vector2(300 + index * 21, 11)
		icon.size = Vector2(16, 16)
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		add_child(icon)
		_icons.append(icon)
	_banner = _panel(Rect2(140, 88, 200, 64))
	_banner_label = _label(Rect2(148, 100, 184, 36))
	_banner_label.add_theme_font_size_override("font_size", 24)
	_banner_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner.hide()
	_banner_label.hide()
func show_state(state: Dictionary, actor: Dictionary, art: Dictionary, title: String, hint: String, timeline: Array, all_art: Dictionary, speed: int, reduced: bool, muted: bool, busy: bool) -> void:
	_title.text = title
	if state.has("goal"):
		var goal: Dictionary = state["goal"]
		var hit: bool = goal["enemyId"] in state["hitEnemy"].get(goal["actorId"], [])
		_goal.text = "%s %d/%d · %s" % [_words["battle.goal.actions"], state["enemyActions"].get(goal["enemyId"], 0), goal["enemyActions"], _words["battle.goal.hit_done"] if hit else _words["battle.goal.hit_needed"]]
	else:
		_goal.text = _words["battle.goal.defeat"]
	_settings.text = "C %s · R %s%s · M %s%s" % [["1×", "2×", _words["battle.instant"]][speed], _words["battle.reduce"], _words["battle.on"] if reduced else _words["battle.off"], _words["battle.sound"], _words["battle.off"] if muted else _words["battle.on"]]
	_hint.text = hint + "  ·  " + _words["battle.controls"]
	_name.text = _words[art["name"]]
	_hp.text = "%s %d/%d" % [_words["battle.hp"], actor["hp"], actor["maxHp"]]
	_will.text = _words["battle.starless.short"] if actor["kind"] == "starless" else "%s %d/%d" % [_words["battle.will"], actor["will"], actor["maxWill"]]
	_bar.size.x = roundf(104.0 * float(actor["hp"]) / float(actor["maxHp"]))
	var portrait_id: String = art.get("portrait", "")
	if portrait_id != _portrait_id:
		_portrait_id = portrait_id
		_portrait.texture = _catalog.frame_texture(portrait_id, 0) if not portrait_id.is_empty() else null
	for index: int in _icons.size():
		_icons[index].visible = index < timeline.size()
		if index < timeline.size():
			var body_id: String = all_art[timeline[index]]["body"]
			var image: AtlasTexture = _catalog.frame_texture(body_id, 0)
			image.region.size = Vector2(16, 16)
			image.region.position.x += maxi(0, (int(_catalog.definitions[body_id]["size"][0]) - 16) / 2)
			_icons[index].texture = image
	_banner.visible = state["phase"] != "active" and not busy
	_banner_label.visible = _banner.visible
	if _banner.visible:
		_banner_label.text = _words["battle.result." + state["phase"]]
func set_options(options: Array, busy: bool) -> void:
	if _options != options:
		_options = options.duplicate(true)
		for button: Button in _buttons:
			_grid.remove_child(button)
			button.queue_free()
		_buttons.clear()
		_selected = 0
		for index: int in options.size():
			var option: Dictionary = options[index]
			var button: Button = Button.new()
			button.text = _words.get(option["label"], option["label"])
			if option.has("count"):
				button.text += " ×" + str(option["count"])
			button.custom_minimum_size = Vector2(92, 16)
			button.position = Vector2((index % 3) * 95, (index / 3) * 18)
			button.size = Vector2(92, 16)
			button.focus_mode = Control.FOCUS_NONE
			button.add_theme_font_override("font", _font)
			button.add_theme_font_size_override("font_size", 12)
			button.add_theme_color_override("font_color", Color("f2e6cf"))
			button.add_theme_color_override("font_disabled_color", Color("85706a"))
			button.pressed.connect(func() -> void: chosen.emit(option["id"]))
			button.mouse_entered.connect(_select.bind(index))
			_grid.add_child(button)
			_buttons.append(button)
		_grid.position.y = 211 if options.size() > 6 else 219 if options.size() > 3 else 228
	for index: int in _buttons.size():
		_buttons[index].disabled = busy or not _options[index]["enabled"]
	if not _buttons.is_empty() and _buttons[_selected].disabled and not busy:
		for index: int in _buttons.size():
			if not _buttons[index].disabled:
				_selected = index
				break
	_restyle()
func navigate(delta: Vector2i) -> void:
	if _buttons.is_empty():
		return
	var step: int = delta.x if delta.x != 0 else delta.y * 3
	for attempt: int in _buttons.size():
		_selected = posmod(_selected + step, _buttons.size())
		if not _buttons[_selected].disabled:
			break
	_restyle()
func confirm() -> void:
	if not _buttons.is_empty() and not _buttons[_selected].disabled:
		chosen.emit(_options[_selected]["id"])
func option_state() -> Array:
	var result: Array = []
	for index: int in _buttons.size():
		var rect: Rect2 = _buttons[index].get_global_rect()
		result.append({"id": _options[index]["id"], "label": _buttons[index].text, "enabled": not _buttons[index].disabled, "selected": index == _selected, "rect": [rect.position.x, rect.position.y, rect.size.x, rect.size.y]})
	return result
func _select(index: int) -> void:
	_selected = index
	_restyle()
	selection_changed.emit()
func _restyle() -> void:
	for index: int in _buttons.size():
		var style: StyleBoxFlat = StyleBoxFlat.new()
		style.bg_color = Color("1c2a5a") if index == _selected else Color("2e1f2b")
		style.border_color = Color("ffe36b") if index == _selected else Color("85706a")
		style.set_border_width_all(1)
		style.content_margin_top = 0
		style.content_margin_bottom = 0
		style.content_margin_left = 2
		style.content_margin_right = 2
		for name: String in ["normal", "hover", "pressed", "disabled"]:
			_buttons[index].add_theme_stylebox_override(name, style)
		# Reset after applying the pixel font/style, not the engine's default theme.
		_buttons[index].size = Vector2(92, 16)
func _panel(rect: Rect2) -> NinePatchRect:
	var panel: NinePatchRect = NinePatchRect.new()
	panel.texture = _catalog.frame_texture(_catalog.binding("panel"), 0)
	panel.position = rect.position
	panel.size = rect.size
	panel.patch_margin_left = 4
	panel.patch_margin_top = 4
	panel.patch_margin_right = 4
	panel.patch_margin_bottom = 4
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(panel)
	return panel
func _label(rect: Rect2) -> Label:
	var label: Label = Label.new()
	label.position = rect.position
	label.size = rect.size
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font", _font)
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", Color("fff6c8"))
	label.add_theme_color_override("font_outline_color", Color("1a1220"))
	label.add_theme_constant_override("outline_size", 1)
	add_child(label)
	return label
