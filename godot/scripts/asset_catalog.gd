class_name AssetCatalog
extends RefCounted
## Converts the existing horizontal PNG strips and animation manifest to Godot resources.

const ART_ROOT: String = "res://assets/art/"
const FONT_PATH: String = "res://assets/fonts/fusion-pixel-12px/fusion-pixel-12px-proportional-zh_hans.otf.woff2"

var definitions: Dictionary = {}
var _frames: Dictionary = {}
var _textures: Dictionary = {}

func load_manifest() -> bool:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(ART_ROOT + "manifest.json"))
	if not parsed is Dictionary or parsed.get("format") != "astra.art/1":
		push_error("Invalid ASTRA art manifest")
		return false
	for asset: Dictionary in parsed.get("assets", []):
		definitions[String(asset["id"])] = asset
	return not definitions.is_empty()

func texture(asset_id: String) -> Texture2D:
	if not _textures.has(asset_id):
		var definition: Dictionary = definitions[asset_id]
		_textures[asset_id] = load(ART_ROOT + String(definition["file"])) as Texture2D
	return _textures[asset_id] as Texture2D

func anchor(asset_id: String) -> Vector2:
	var point: Array = definitions[asset_id]["anchor"]
	return Vector2(float(point[0]), float(point[1]))

func frame_texture(asset_id: String, frame_index: int) -> AtlasTexture:
	var dimensions: Array = definitions[asset_id]["size"]
	var frame: AtlasTexture = AtlasTexture.new()
	frame.atlas = texture(asset_id)
	frame.region = Rect2(frame_index * int(dimensions[0]), 0, int(dimensions[0]), int(dimensions[1]))
	return frame

func sprite_frames(asset_id: String) -> SpriteFrames:
	if _frames.has(asset_id):
		return _frames[asset_id] as SpriteFrames
	var frames: SpriteFrames = SpriteFrames.new()
	frames.remove_animation(&"default")
	var animations: Dictionary = definitions[asset_id]["animations"]
	for animation_name: String in animations:
		var animation: Dictionary = animations[animation_name]
		frames.add_animation(animation_name)
		frames.set_animation_speed(animation_name, float(animation["fps"]))
		frames.set_animation_loop(animation_name, bool(animation["loop"]))
		for frame_index: Variant in animation["frames"]:
			frames.add_frame(animation_name, frame_texture(asset_id, int(frame_index)))
	_frames[asset_id] = frames
	return frames

func animated_sprite(asset_id: String, animation: StringName = &"idle", phase: int = 0) -> AnimatedSprite2D:
	var sprite: AnimatedSprite2D = AnimatedSprite2D.new()
	sprite.sprite_frames = sprite_frames(asset_id)
	sprite.centered = false
	sprite.offset = -anchor(asset_id)
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.play(animation)
	var count: int = sprite.sprite_frames.get_frame_count(animation)
	if count > 0:
		sprite.frame = posmod(phase, count)
	return sprite

func pixel_font() -> FontFile:
	var font: FontFile = load(FONT_PATH) as FontFile
	if font != null:
		font.antialiasing = TextServer.FONT_ANTIALIASING_NONE
		font.hinting = TextServer.HINTING_NONE
		font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
		font.generate_mipmaps = false
		font.multichannel_signed_distance_field = false
		font.allow_system_fallback = false
		font.oversampling = 1.0
	return font
