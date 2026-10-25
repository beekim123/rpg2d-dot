extends Node2D
## One map-scale unit, parented into the world's Y-sorted actor layer.
var actor_id: String = ""
var unit: String = "body"
var sprite: AnimatedSprite2D
var asset_height: int = 24
var _idle: StringName = &"idle"
var _flash: ShaderMaterial
var _speed: float = 1.0
func setup(catalog: AssetCatalog, actor: Dictionary, role: String, art: Dictionary) -> void:
	actor_id = actor["id"]
	unit = role
	var asset: String = art[role]
	asset_height = int(catalog.definitions[asset]["size"][1])
	var facing: String = "right" if actor["team"] == "player" else "left"
	var frames: SpriteFrames = catalog.sprite_frames(asset)
	_idle = StringName("idle_" + facing) if frames.has_animation("idle_" + facing) else &"idle"
	if role == "body":
		var shadow: Sprite2D = Sprite2D.new()
		shadow.texture = catalog.frame_texture("prop.shadow_path", 0)
		shadow.centered = false
		shadow.offset = -catalog.anchor("prop.shadow_path")
		shadow.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		add_child(shadow)
	sprite = catalog.animated_sprite(asset, _idle, int(actor_id.hash()))
	var shader: Shader = Shader.new()
	shader.code = "shader_type canvas_item; render_mode unshaded; uniform bool flash = false; void fragment(){vec4 pixel = texture(TEXTURE, UV); COLOR = flash ? vec4(1.0, 0.96470588, 0.78431373, pixel.a) : pixel;}"
	_flash = ShaderMaterial.new()
	_flash.shader = shader
	sprite.material = _flash
	add_child(sprite)
func show_actor(actor: Dictionary, origin: Vector2i) -> void:
	var point: Variant = actor[unit]
	visible = actor["hp"] > 0 and point != null
	if point != null:
		position = GridActor.cell_feet(origin + Vector2i(int(point["x"]), int(point["y"])))
	idle()
func idle() -> void:
	if sprite != null:
		sprite.play(_idle)
		sprite.speed_scale = _speed
	set_flash(false)
func walk(direction: Vector2i) -> void:
	if unit != "body" or direction == Vector2i.ZERO:
		return
	var facing: String = "right" if direction.x > 0 else "left" if direction.x < 0 else "down" if direction.y > 0 else "up"
	var name: StringName = StringName("walk_" + facing)
	if sprite.sprite_frames.has_animation(name):
		_idle = StringName("idle_" + facing)
		sprite.play(name)
func attack(toward: Vector2) -> void:
	var facing: String = "right" if toward.x >= position.x else "left"
	var name: StringName = StringName("attack_" + facing)
	if sprite.sprite_frames.has_animation(name):
		sprite.play(name)
	elif unit == "body" and sprite.sprite_frames.has_animation("idle_" + facing):
		_idle = StringName("idle_" + facing)
		sprite.play(_idle)
func hurt() -> void:
	if sprite.sprite_frames.has_animation(&"hurt"):
		sprite.play(&"hurt")
func set_flash(enabled: bool) -> void:
	if _flash != null:
		_flash.set_shader_parameter("flash", enabled)
func freeze(enabled: bool) -> void:
	if sprite != null:
		sprite.speed_scale = 0.0 if enabled else _speed
func set_speed(value: float) -> void:
	_speed = value
	if sprite != null:
		sprite.speed_scale = value
