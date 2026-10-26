extends Node2D
## Local puzzle presentation; the exploration snapshot remains untouched until exit.
signal changed
signal close_requested(exit_room: bool)
signal sound_requested(cue: String)
signal mute_requested
const Rules = preload("res://scripts/puzzles/dough_rules.gd")
const DIRECTIONS: Array[Vector2i] = [Vector2i.UP,Vector2i.DOWN,Vector2i.LEFT,Vector2i.RIGHT]
var completed_once: bool = false
var moves: int = 0
var _rules: Rules = Rules.new()
var _world: Node
var _catalog: AssetCatalog
var _definition: Dictionary = {}
var _ghost: GridActor
var _boxes: Array[AnimatedSprite2D] = []
var _hidden: Array[CanvasItem] = []
var _extras: Array[Node] = []
var _from: Array[Vector2] = []
var _moving: bool = false
var _tick: int = 0
var _count: Label
var _hint: Label
var _words: Dictionary = {}
func setup(world: Node, catalog: AssetCatalog, definition: Dictionary, words: Dictionary) -> bool:
	if not _rules.configure(definition).is_empty():
		return false
	_world = world
	_catalog = catalog
	_definition = definition.duplicate(true)
	_words = words.duplicate(true)
	world.player.hide()
	for id: String in definition["display"]["boxEntityIds"]:
		var sprite: AnimatedSprite2D = world.find_entity(id)
		if sprite != null:
			_hidden.append(sprite)
			sprite.hide()
	if world.find_entity(definition["display"]["hostEntityId"]) == null and world.find_entity("lv.bakery.brio.dawn") == null:
		var host: AnimatedSprite2D = catalog.animated_sprite(definition["display"]["sprites"]["host"])
		host.position = GridActor.cell_feet(Vector2i(5,6))
		world.actors.add_child(host)
		_extras.append(host)
	_ghost = GridActor.new()
	_ghost.setup(catalog,_point(definition["player"]))
	world.actors.add_child(_ghost)
	_ghost.step_finished.connect(_after_move)
	for point: Dictionary in definition["boxes"]:
		var sprite: AnimatedSprite2D = catalog.animated_sprite(definition["display"]["sprites"]["box"])
		sprite.position = GridActor.cell_feet(_point(point))
		world.actors.add_child(sprite)
		_boxes.append(sprite)
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 15
	add_child(layer)
	var root: Control = Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	layer.add_child(root)
	_panel(root,Rect2(6,6,302,26))
	_panel(root,Rect2(324,6,150,26))
	_panel(root,Rect2(6,246,468,22))
	_label(root,Rect2(14,11,284,16)).text = words["prologue.ui.dough.title"]
	_count = _label(root,Rect2(332,11,134,16))
	_hint = _label(root,Rect2(14,249,452,16))
	_refresh()
	return true
func _input(event: InputEvent) -> void:
	if _world == null or not event is InputEventKey or not event.pressed:
		return
	get_viewport().set_input_as_handled()
	if event.echo:
		return
	var key: Key = event.physical_keycode if event.physical_keycode != 0 else event.keycode
	if key == KEY_M:
		mute_requested.emit()
		return
	if key in [KEY_X,KEY_ESCAPE]:
		close_requested.emit(false)
		return
	if _moving:
		return
	match key:
		KEY_R:
			_rules.reset()
			_snap()
			sound_requested.emit("cancel")
		KEY_U,KEY_BACKSPACE:
			if _rules.undo()["ok"]:
				_snap()
				sound_requested.emit("cancel")
		KEY_Z,KEY_ENTER,KEY_SPACE:
			if completed_once:
				close_requested.emit(false)
		KEY_UP,KEY_W: _move(Vector2i.UP)
		KEY_DOWN,KEY_S: _move(Vector2i.DOWN)
		KEY_LEFT,KEY_A: _move(Vector2i.LEFT)
		KEY_RIGHT,KEY_D: _move(Vector2i.RIGHT)
func _physics_process(_delta: float) -> void:
	if _world == null:
		return
	if _moving:
		_tick += 1
		var state: Dictionary = _rules.snapshot()
		for index: int in _boxes.size():
			_boxes[index].position = _from[index].lerp(GridActor.cell_feet(_point(state["boxes"][index])),minf(1.0,float(_tick)/GridActor.STEP_TICKS)).round()
	else:
		for index: int in 4:
			if Input.is_action_pressed([&"move_up",&"move_down",&"move_left",&"move_right"][index]):
				_move(DIRECTIONS[index])
				break
func _move(direction: Vector2i) -> void:
	var result: Dictionary = _rules.move(direction)
	_ghost.face(direction)
	if not result["ok"]:
		return
	_from.clear()
	for sprite: AnimatedSprite2D in _boxes:
		_from.append(sprite.position)
	moves += 1
	_tick = 0
	_moving = true
	_ghost.begin_step(direction)
	sound_requested.emit("step")
	changed.emit()
func _after_move(cell: Vector2i) -> void:
	_moving = false
	_snap_boxes()
	if _rules.solved():
		if not completed_once:
			sound_requested.emit("save")
		completed_once = true
	_refresh()
	for door: Dictionary in _world.map_data["exits"]:
		if door["pair"] == _definition["display"]["exitPair"] and _point(door) == cell:
			close_requested.emit(true)
			return
func _snap() -> void:
	var state: Dictionary = _rules.snapshot()
	_ghost.grid_position = _point(state["player"])
	_ghost.position = GridActor.cell_feet(_ghost.grid_position)
	_snap_boxes()
	_refresh()
func _snap_boxes() -> void:
	var state: Dictionary = _rules.snapshot()
	for index: int in _boxes.size():
		_boxes[index].position = GridActor.cell_feet(_point(state["boxes"][index]))
func _refresh() -> void:
	var state: Dictionary = _rules.snapshot()
	var count: int = 0
	for box: Dictionary in state["boxes"]:
		if state["goals"].any(func(point: Dictionary) -> bool: return _point(point) == _point(box)):
			count += 1
	_count.text = _words["prologue.ui.dough.count"].replace("{count}",str(count))
	_hint.text = _words["prologue.ui.dough.done"] if _rules.solved() else _words["prologue.ui.dough.controls"]
	changed.emit()
func snapshot() -> Dictionary:
	return {"active":true,"state":_rules.snapshot(),"moving":_moving,"solved":_rules.solved(),"completed":completed_once,"moves":moves}
func _exit_tree() -> void:
	for sprite: CanvasItem in _hidden:
		if is_instance_valid(sprite):
			sprite.show()
	for node: Node in _extras + _boxes + [_ghost]:
		if is_instance_valid(node):
			node.queue_free()
	if _world != null and is_instance_valid(_world.player):
		_world.player.show()
	_world = null
func _panel(root: Control, rect: Rect2) -> void:
	var panel: NinePatchRect = NinePatchRect.new()
	panel.texture = _catalog.frame_texture(_catalog.binding("panel"),0)
	panel.position = rect.position
	panel.size = rect.size
	panel.patch_margin_left = 4
	panel.patch_margin_right = 4
	panel.patch_margin_top = 4
	panel.patch_margin_bottom = 4
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(panel)
func _label(root: Control, rect: Rect2) -> Label:
	var label: Label = Label.new()
	label.position = rect.position
	label.size = rect.size
	label.add_theme_font_override("font",_catalog.pixel_font())
	label.add_theme_font_size_override("font_size",12)
	label.add_theme_color_override("font_color",Color("fff6c8"))
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(label)
	return label
static func _point(point: Dictionary) -> Vector2i:
	return Vector2i(int(point["x"]),int(point["y"]))
