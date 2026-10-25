class_name SaveMenu
extends Control
## Native presentation only. The controller supplies slot summaries and handles actions.

signal action_requested(action: String, slot: int)
signal closed
signal state_changed

const ACTIONS: Array[String] = ["save", "load", "export", "import", "new", "close"]
const ACTION_NAMES: Array[String] = ["Save", "Load", "Export", "Import", "New", "Close"]
const INK: Color = Color("#1a1220")
const PAPER: Color = Color("#f2e6cf")
const GOLD: Color = Color("#ffe36b")

var is_open: bool = false
var selected_slot: int = 1

var _slots: Array[Dictionary] = []
var _slot_buttons: Array[Button] = []
var _action_buttons: Dictionary = {}
var _font: Font
var _texture: Texture2D
var _words: Dictionary = {}
var _can_save: bool = false
var _confirming: bool = false
var _busy: bool = false
var _confirmation_frame: int = 0
var _pending_action: String = ""
var _accept: Button
var _cancel: Button
var _styles: Dictionary = {}

@onready var _panel: NinePatchRect = $Panel
@onready var _title: Label = $Title
@onready var _status: Label = $Status
@onready var _hint: Label = $Hint
@onready var _slots_container: Control = $Slots
@onready var _actions_container: Control = $Actions
@onready var _overlay: Control = $ConfirmOverlay
@onready var _prompt: NinePatchRect = $ConfirmOverlay/Prompt
@onready var _message: Label = $ConfirmOverlay/Prompt/Message

func _ready() -> void:
	_build_controls()
	_apply_configuration()
	_refresh_view()
	visible = is_open
	if is_open:
		_focus_selected.call_deferred()

func _input(event: InputEvent) -> void:
	if not is_open:
		return
	# Native Button input and custom Z confirmation share the same repeat policy.
	if event is InputEventKey and event.echo and event.is_action_pressed(&"ui_accept", true):
		get_viewport().set_input_as_handled()
	elif _confirming and event is InputEventMouseButton and event.pressed and event.double_click:
		get_viewport().set_input_as_handled()

func configure(font: Font, panel: Texture2D, words: Dictionary) -> void:
	_font = font
	_texture = panel
	_words = words.duplicate(true)
	if is_node_ready():
		_apply_configuration()
		_refresh_view()

func show_menu(slots: Array[Dictionary], can_save: bool) -> void:
	_slots = slots.duplicate(true)
	_can_save = can_save
	_confirming = false
	_pending_action = ""
	_busy = false
	is_open = true
	selected_slot = clampi(selected_slot, 0, 3)
	if is_node_ready():
		_status.text = ""
		_refresh_view()
	show()
	_focus_selected.call_deferred()

func refresh_slots(slots: Array[Dictionary], can_save: bool) -> void:
	_slots = slots.duplicate(true)
	_can_save = can_save
	# A changed store snapshot invalidates any pending overwrite decision.
	_confirming = false
	_pending_action = ""
	if is_node_ready():
		_refresh_view()

func set_status(text: String) -> void:
	if is_node_ready():
		_status.text = text

func set_busy(value: bool) -> void:
	_busy = value
	if is_node_ready():
		_refresh_view()
		if not value and is_open:
			_focus_selected.call_deferred()

func close() -> void:
	if not is_open:
		return
	is_open = false
	_confirming = false
	_pending_action = ""
	_busy = false
	if is_node_ready():
		var focused: Control = get_viewport().gui_get_focus_owner()
		if focused != null and is_ancestor_of(focused):
			focused.release_focus()
		_overlay.hide()
	hide()
	state_changed.emit()
	closed.emit()

func cancel() -> void:
	if not is_open or _busy:
		return
	if _confirming:
		_cancel_confirmation()
	else:
		close()

func confirm_focused() -> void:
	if not is_open or _busy or not is_node_ready():
		return
	var focused: Control = get_viewport().gui_get_focus_owner()
	var button: Button = focused as Button
	if button != null and is_ancestor_of(button) and not button.disabled:
		button.pressed.emit()

func snapshot() -> Dictionary:
	var action: String = ""
	if is_node_ready():
		var focused: Control = get_viewport().gui_get_focus_owner()
		if focused == _accept:
			action = "confirm"
		elif focused == _cancel:
			action = "cancel"
		else:
			for key: String in _action_buttons:
				if focused == _action_buttons[key]:
					action = key
	return {"slot":selected_slot,"confirming":_confirming,"action":_pending_action if _confirming else action,"busy":_busy}

func content_fits() -> bool:
	if not is_node_ready() or _font == null:
		return false
	for label: Label in [_title, _status, _hint]:
		if _font.get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x > label.size.x:
			return false
	for button: Button in _slot_buttons:
		for child: Node in button.get_children():
			if child is Label and _font.get_string_size((child as Label).text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x > (child as Label).size.x:
				return false
	return not _confirming or _message.get_line_count() <= 2

func _word(key: String) -> String:
	return String(_words.get(key, key))

func _build_controls() -> void:
	_styles["normal"] = _style(Color("#2e1f2b"), Color("#85706a"), 1)
	_styles["selected"] = _style(Color("#1c2a5a"), GOLD, 1)
	_styles["hover"] = _style(Color("#1c2a5a"), GOLD, 1)
	_styles["pressed"] = _style(INK, GOLD, 1)
	_styles["disabled"] = _style(Color("#2e1f2b"), Color("#5c4b4f"), 1)
	_styles["focus"] = _style(Color.TRANSPARENT, Color("#5ad6c0"), 2)
	for slot: int in range(4):
		var button: Button = _button("Slot" + str(slot), _slots_container, Rect2(0,slot * 36,230,34))
		button.pressed.connect(_on_slot_pressed.bind(slot))
		button.focus_entered.connect(_on_slot_focused.bind(slot))
		var name_label: Label = _label("Name", button, Rect2(8,2,214,14), PAPER)
		var subtitle: Label = _label("Subtitle", button, Rect2(8,17,214,14), Color("#d6c3ab"))
		name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		subtitle.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_slot_buttons.append(button)
	for index: int in range(ACTIONS.size()):
		var action: String = ACTIONS[index]
		var button: Button = _button(ACTION_NAMES[index], _actions_container, Rect2(0,index * 24,190,22))
		button.pressed.connect(_on_action.bind(action))
		button.focus_entered.connect(_on_action_focused)
		_action_buttons[action] = button
	_accept = _button("Accept", _prompt, Rect2(18,68,150,28))
	_cancel = _button("Cancel", _prompt, Rect2(204,68,150,28))
	_accept.focus_entered.connect(_on_action_focused)
	_cancel.focus_entered.connect(_on_action_focused)
	_accept.pressed.connect(_accept_confirmation)
	_cancel.pressed.connect(_cancel_confirmation)
	_accept.focus_neighbor_right = _accept.get_path_to(_cancel)
	_accept.focus_neighbor_left = _accept.get_path_to(_cancel)
	_cancel.focus_neighbor_left = _cancel.get_path_to(_accept)
	_cancel.focus_neighbor_right = _cancel.get_path_to(_accept)

func _style(fill: Color, border: Color, width: int) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(width)
	style.set_content_margin_all(4)
	return style

func _button(node_name: String, parent: Node, rect: Rect2) -> Button:
	var button: Button = Button.new()
	button.name = node_name
	button.position = rect.position
	button.size = rect.size
	button.focus_mode = Control.FOCUS_ALL
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.add_theme_font_size_override("font_size",12)
	button.add_theme_color_override("font_color",PAPER)
	button.add_theme_color_override("font_hover_color",GOLD)
	button.add_theme_color_override("font_pressed_color",GOLD)
	button.add_theme_color_override("font_disabled_color",Color("#85706a"))
	for state: String in ["normal","hover","pressed","disabled","focus"]:
		button.add_theme_stylebox_override(state,_styles[state])
	parent.add_child(button)
	return button

func _label(node_name: String, parent: Node, rect: Rect2, color: Color) -> Label:
	var label: Label = Label.new()
	label.name = node_name
	label.position = rect.position
	label.size = rect.size
	label.clip_text = true
	label.add_theme_font_size_override("font_size",12)
	label.add_theme_color_override("font_color",color)
	parent.add_child(label)
	return label

func _apply_configuration() -> void:
	_panel.texture = _texture
	_prompt.texture = _texture
	_title.text = _word("save.title")
	_accept.text = _word("save.confirm.accept")
	_cancel.text = _word("save.confirm.cancel")
	for action: String in _action_buttons:
		(_action_buttons[action] as Button).text = _word("save.action." + action)
	if _font != null:
		_apply_font(self)

func _apply_font(node: Node) -> void:
	if node is Control:
		(node as Control).add_theme_font_override("font",_font)
	for child: Node in node.get_children():
		_apply_font(child)

func _slot_data(slot: int) -> Dictionary:
	return _slots[slot] if slot >= 0 and slot < _slots.size() else {"name":"","subtitle":"","status":"empty"}

func _refresh_view() -> void:
	if not is_node_ready():
		return
	for slot: int in range(_slot_buttons.size()):
		var button: Button = _slot_buttons[slot]
		var data: Dictionary = _slot_data(slot)
		(button.get_node("Name") as Label).text = String(data.get("name",""))
		(button.get_node("Subtitle") as Label).text = String(data.get("subtitle",""))
		button.tooltip_text = String(data.get("name","")) + "\n" + String(data.get("subtitle",""))
		button.add_theme_stylebox_override("normal",_styles["selected" if slot == selected_slot else "normal"])
		button.disabled = _busy or _confirming
		button.focus_neighbor_top = button.get_path_to(_slot_buttons[posmod(slot - 1,4)])
		button.focus_neighbor_bottom = button.get_path_to(_slot_buttons[(slot + 1) % 4])
		button.focus_neighbor_right = button.get_path_to(_action_buttons["save"])
	for action: String in _action_buttons:
		var button: Button = _action_buttons[action]
		button.disabled = _busy or _confirming or (action == "save" and (selected_slot == 0 or not _can_save)) or (action == "load" and _slot_data(selected_slot).get("status") != "valid")
		button.focus_neighbor_left = button.get_path_to(_slot_buttons[selected_slot])
	var enabled_actions: Array[Button] = []
	for action: String in ACTIONS:
		var button: Button = _action_buttons[action]
		if not button.disabled:
			enabled_actions.append(button)
	for index: int in range(enabled_actions.size()):
		var button: Button = enabled_actions[index]
		button.focus_neighbor_top = button.get_path_to(enabled_actions[posmod(index - 1,enabled_actions.size())])
		button.focus_neighbor_bottom = button.get_path_to(enabled_actions[(index + 1) % enabled_actions.size()])
	if not enabled_actions.is_empty():
		for button: Button in _slot_buttons:
			button.focus_neighbor_right = button.get_path_to(enabled_actions[0])
	_overlay.visible = _confirming
	_accept.disabled = _busy
	_cancel.disabled = _busy
	_hint.text = _word("save.hint.busy" if _busy else ("save.hint.controls" if _can_save else "save.hint.near_lamp"))
	state_changed.emit()

func _focus_selected() -> void:
	if is_open and is_node_ready() and not _busy and not _confirming:
		_slot_buttons[selected_slot].grab_focus()

func _on_action_focused() -> void:
	state_changed.emit()

func _on_slot_focused(slot: int) -> void:
	if is_open and not _busy and not _confirming and selected_slot != slot:
		selected_slot = slot
		_refresh_view()
	else:
		state_changed.emit()

func _on_slot_pressed(slot: int) -> void:
	if not is_open or _busy or _confirming:
		return
	selected_slot = clampi(slot,0,3)
	_refresh_view()
	_focus_selected()

func _on_action(action: String) -> void:
	if not is_open or _busy or _confirming or not _action_buttons.has(action) or (_action_buttons[action] as Button).disabled:
		return
	if action == "close":
		close()
	elif action == "new" or (action == "save" and _slot_data(selected_slot).get("status") != "empty"):
		_confirming = true
		_pending_action = action
		_confirmation_frame = Engine.get_process_frames() + 1
		_message.text = _word("save.confirm.new") if action == "new" else _word("save.confirm.overwrite").replace("{slot}",String(_slot_data(selected_slot).get("name","")))
		_accept.text = _word("save.confirm.new_accept" if action == "new" else "save.confirm.accept")
		_refresh_view()
		_cancel.grab_focus.call_deferred()
	else:
		action_requested.emit(action,selected_slot)

func _cancel_confirmation() -> void:
	if not is_open or _busy or not _confirming:
		return
	var previous_action: String = _pending_action
	_confirming = false
	_pending_action = ""
	_refresh_view()
	(_action_buttons[previous_action] as Button).grab_focus()

func _accept_confirmation() -> void:
	if not is_open or _busy or not _confirming or Engine.get_process_frames() < _confirmation_frame:
		return
	if _pending_action == "save" and (selected_slot == 0 or not _can_save):
		return
	var action: String = _pending_action
	_confirming = false
	_pending_action = ""
	_refresh_view()
	(_action_buttons[action] as Button).grab_focus()
	action_requested.emit(action,selected_slot)
