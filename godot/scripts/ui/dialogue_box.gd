class_name DialogueBox
extends Control
## Present one localized story line; the world owns input mapping and script state.

signal advance_requested
signal visibility_progress_changed

const CHARACTERS_PER_SECOND: float = 30.0
const MAX_BODY_LINES: int = 3

var is_open: bool = false

var _speaker: String = ""
var _text: String = ""
var _portrait: Texture2D
var _font: Font
var _panel_texture: Texture2D
var _hint: String = ""
var _visible_count: int = 0
var _character_time: float = 0.0

@onready var _panel: NinePatchRect = $Panel
@onready var _portrait_view: TextureRect = $Portrait
@onready var _speaker_label: Label = $Speaker
@onready var _body_label: Label = $Body
@onready var _hint_label: Label = $Hint

func _ready() -> void:
	_apply_configuration()
	_apply_line()
	visible = is_open
	set_process(is_open and not is_revealed())

func _process(delta: float) -> void:
	if not is_open or is_revealed() or not is_finite(delta) or delta <= 0.0:
		return
	_character_time = minf(_character_time + delta * CHARACTERS_PER_SECOND, float(_text.length()))
	_set_visible_count(floori(_character_time))

func _gui_input(event: InputEvent) -> void:
	if is_open and event is InputEventMouseButton:
		var button: InputEventMouseButton = event
		if button.button_index == MOUSE_BUTTON_LEFT and button.pressed:
			accept_event()
			request_confirm()

func configure(font: Font, panel: Texture2D, hint: String) -> void:
	_font = font
	_panel_texture = panel
	_hint = hint
	if is_node_ready():
		_apply_configuration()

func show_line(speaker: String, text: String, portrait: Texture2D) -> void:
	_speaker = speaker
	_text = text
	_portrait = portrait
	_visible_count = 0
	_character_time = 0.0
	is_open = true
	if is_node_ready():
		_apply_line()
	show()
	set_process(is_node_ready() and not is_revealed())
	visibility_progress_changed.emit()

func request_confirm() -> void:
	if not is_open:
		return
	if not is_revealed():
		reveal_all()
	else:
		advance_requested.emit()

func reveal_all() -> void:
	if is_open:
		_character_time = float(_text.length())
		_set_visible_count(_text.length())

func close() -> void:
	is_open = false
	_speaker = ""
	_text = ""
	_portrait = null
	_visible_count = 0
	_character_time = 0.0
	if is_node_ready():
		_apply_line()
	hide()
	set_process(false)
	visibility_progress_changed.emit()

func is_revealed() -> bool:
	return is_open and _visible_count >= _text.length()

func visible_text() -> String:
	return _text.left(_visible_count) if is_open else ""

## Call after layout to reject authored text that would be clipped by the panel.
func content_fits() -> bool:
	if not is_node_ready() or _font == null:
		return false
	if _body_label.get_line_count() > MAX_BODY_LINES or _speaker_label.get_line_count() > 1 or _hint_label.get_line_count() > 1:
		return false
	var body_bounds: Rect2 = Rect2(Vector2.ZERO, Vector2(_body_label.size.x, 44))
	for index: int in range(_text.length()):
		var character: Rect2 = _body_label.get_character_bounds(index)
		if character.has_area() and not body_bounds.encloses(character):
			return false
	return _font.get_string_size(_speaker, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x <= _speaker_label.size.x \
		and _font.get_string_size(_hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x <= _hint_label.size.x

func _apply_configuration() -> void:
	if _font != null:
		for label: Label in [_speaker_label, _body_label, _hint_label]:
			label.add_theme_font_override("font", _font)
	_panel.texture = _panel_texture
	_hint_label.text = _hint

func _apply_line() -> void:
	_speaker_label.text = _speaker
	_body_label.text = _text
	_body_label.visible_characters = _visible_count
	_portrait_view.texture = _portrait
	_portrait_view.visible = _portrait != null
	var left: float = 68.0 if _portrait != null else 16.0
	_speaker_label.position.x = left
	_speaker_label.size.x = 456.0 - left
	_body_label.position.x = left
	_body_label.size.x = 456.0 - left

func _set_visible_count(count: int) -> void:
	var next: int = clampi(count, 0, _text.length())
	if next == _visible_count:
		return
	_visible_count = next
	if is_node_ready():
		_body_label.visible_characters = _visible_count
	if is_revealed():
		set_process(false)
	visibility_progress_changed.emit()
