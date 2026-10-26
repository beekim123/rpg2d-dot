class_name GridActor
extends Node2D
## One logical grid step is resolved before the fixed-tick visual interpolation.

signal step_finished(cell: Vector2i)

const TILE_SIZE: int = 16
const STEP_TICKS: int = 10

var grid_position: Vector2i = Vector2i.ZERO
var is_moving: bool = false
var facing: String = "down"
var visual_id: String = ""
var _step_tick: int = 0
var _start_position: Vector2 = Vector2.ZERO
var _target_position: Vector2 = Vector2.ZERO

@onready var sprite: AnimatedSprite2D = $Sprite
@onready var _shadow: Sprite2D = $Shadow

func setup(catalog: AssetCatalog, cell: Vector2i) -> void:
	grid_position = cell
	position = cell_feet(cell)
	var shadow: Sprite2D = Sprite2D.new()
	var shadow_id: String = catalog.binding("shadow")
	shadow.name = "Shadow"
	shadow.centered = false
	shadow.offset = -catalog.anchor(shadow_id)
	shadow.texture = catalog.frame_texture(shadow_id, 0)
	add_child(shadow)
	var body: AnimatedSprite2D = catalog.animated_sprite(catalog.binding("player"), StringName("idle_" + facing))
	visual_id = catalog.binding("player")
	body.name = "Sprite"
	add_child(body)

func set_visual_asset(catalog: AssetCatalog, id: String) -> void:
	if visual_id == id or not catalog.definitions.has(id):
		return
	visual_id = id
	sprite.sprite_frames = catalog.sprite_frames(id)
	sprite.offset = -catalog.anchor(id)
	sprite.play(StringName(("walk_" if is_moving else "idle_") + facing))

func set_ground_shadow(catalog: AssetCatalog, terrain_asset_id: String) -> void:
	var shadow_id: String = catalog.shadow_for_terrain(terrain_asset_id)
	_shadow.texture = catalog.frame_texture(shadow_id, 0)
	_shadow.offset = -catalog.anchor(shadow_id)
	_shadow.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST

func _physics_process(_delta: float) -> void:
	if not is_moving:
		return
	_step_tick += 1
	position = _start_position.lerp(_target_position, float(_step_tick) / STEP_TICKS).round()
	if _step_tick >= STEP_TICKS:
		position = _target_position
		is_moving = false
		sprite.play(StringName("idle_" + facing))
		step_finished.emit(grid_position)

func face(direction: Vector2i) -> void:
	match direction:
		Vector2i.UP: facing = "up"
		Vector2i.DOWN: facing = "down"
		Vector2i.LEFT: facing = "left"
		Vector2i.RIGHT: facing = "right"
	if not is_moving:
		sprite.play(StringName("idle_" + facing))

func begin_step(direction: Vector2i) -> void:
	face(direction)
	_start_position = position
	grid_position += direction
	_target_position = cell_feet(grid_position)
	_step_tick = 0
	is_moving = true
	sprite.play(StringName("walk_" + facing))

static func cell_feet(cell: Vector2i) -> Vector2:
	return Vector2(cell.x * TILE_SIZE + TILE_SIZE / 2, (cell.y + 1) * TILE_SIZE)
