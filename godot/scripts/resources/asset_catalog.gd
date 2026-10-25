class_name AssetCatalog
extends RefCounted
## The sole boundary between logical resource IDs and the generated resource pack.

const PACK_PATH: String = "res://resource-pack.json"

var definitions: Dictionary = {}
var _pack: Dictionary = {}
var _art_root: String = ""
var _frames: Dictionary = {}
var _textures: Dictionary = {}
var _maps: Dictionary = {}
var _locales: Dictionary = {}
var _locale_bundles: Dictionary = {}
var _cinematics: Dictionary = {}
var _stories: Dictionary = {}
var _tables: Dictionary = {}
var _palette: Dictionary = {}
var _audio: Dictionary = {}
var _font: FontFile

func load_pack() -> bool:
	_pack = _read_json_object(PACK_PATH)
	if _pack.get("format") != "astra.resource-pack/1":
		push_error("Invalid ASTRA resource pack")
		return false
	for index: String in ["maps", "locales", "stories", "bootstrap"]:
		if not _pack.get(index) is Dictionary:
			push_error("Missing resource pack index: " + index)
			return false
	if _pack.has("tables") and not _pack["tables"] is Dictionary:
		push_error("Invalid resource pack table index")
		return false
	if _pack.has("audio") and not _pack["audio"] is Dictionary:
		push_error("Invalid resource pack audio index")
		return false
	for index: String in ["cinematics", "locale_bundles"]:
		if not _pack.get(index, {}) is Dictionary:
			push_error("Invalid resource pack index: " + index)
			return false
	for id: Variant in _pack.get("cinematics", {}):
		if not id is String or not _pack["cinematics"][id] is String:
			push_error("Invalid resource pack cinematic entry")
			return false
	for locale_id: Variant in _pack.get("locale_bundles", {}):
		if not locale_id is String or not _pack["locales"].has(locale_id) or not _pack["locale_bundles"][locale_id] is Dictionary:
			push_error("Invalid resource pack locale bundle group")
			return false
		for id: Variant in _pack["locale_bundles"][locale_id]:
			if not id is String or not _pack["locale_bundles"][locale_id][id] is String:
				push_error("Invalid resource pack locale bundle entry")
				return false
	if not _pack.get("files") is Array or not _pack.get("art_manifest") is String or not _pack.get("font") is String:
		push_error("Missing resource pack file metadata")
		return false
	for key: String in ["map", "locale", "player", "shadow", "panel"]:
		if binding(key).is_empty():
			push_error("Missing bootstrap binding: " + key)
			return false
	if not _pack["maps"].has(binding("map")) or not _pack["locales"].has(binding("locale")):
		push_error("Bootstrap map or locale is absent from the pack index")
		return false
	var manifest_path: String = _pack["art_manifest"]
	var manifest: Dictionary = _read_json_object(manifest_path)
	if manifest.get("format") != "astra.art/1":
		push_error("Invalid ASTRA art manifest")
		return false
	_palette = _read_json_object(_pack["palette"]) if _pack.get("palette", "") != "" else {}
	_art_root = manifest_path.get_base_dir()
	definitions.clear()
	_frames.clear()
	_textures.clear()
	_maps.clear()
	_locales.clear()
	_locale_bundles.clear()
	_cinematics.clear()
	_stories.clear()
	_tables.clear()
	_audio.clear()
	_font = null
	for asset: Dictionary in manifest.get("assets", []):
		definitions[String(asset["id"])] = asset
	for key: String in ["player", "shadow", "panel"]:
		if not definitions.has(binding(key)):
			push_error("Bootstrap asset is absent from the manifest: " + key)
			return false
	return not definitions.is_empty()

func binding(key: String) -> String:
	var bootstrap: Dictionary = _pack.get("bootstrap", {})
	return String(bootstrap.get(key, ""))

func map_data(map_id: String) -> Dictionary:
	return _indexed_json("maps", map_id, _maps)

func map_ids() -> Array[String]:
	var ids: Array[String] = []
	for map_id: String in _pack.get("maps", {}):
		ids.append(map_id)
	ids.sort()
	return ids

func locale(locale_id: String) -> Dictionary:
	var words: Dictionary = _indexed_json("locales", locale_id, _locales)
	var groups: Dictionary = _pack.get("locale_bundles", {})
	for id: String in groups.get(locale_id, {}):
		var key: String = locale_id + ":" + id
		if not _locale_bundles.has(key):
			_locale_bundles[key] = _read_json_object(groups[locale_id][id])
		var bundle: Dictionary = _locale_bundles[key]
		for text_id: String in bundle:
			if words.has(text_id):
				push_error("Duplicate locale text key: " + text_id)
				return {}
		words.merge(bundle)
	return words

func cinematic_data(id: String) -> Dictionary:
	return _indexed_json("cinematics", id, _cinematics)

func story_scripts() -> Dictionary:
	var scripts: Dictionary = {}
	for bundle_id: String in _pack.get("stories", {}):
		var bundle: Dictionary = _indexed_json("stories", bundle_id, _stories)
		for script_id: String in bundle:
			if scripts.has(script_id):
				push_error("Duplicate story script ID: " + script_id)
				return {}
			scripts[script_id] = bundle[script_id]
	return scripts

func table_data(table_id: String) -> Dictionary:
	return _indexed_json("tables", table_id, _tables)

func has_table(table_id: String) -> bool:
	return (_pack.get("tables", {}) as Dictionary).has(table_id)

func audio_ids() -> Array[String]:
	var result: Array[String] = []
	for id: String in _pack.get("audio", {}):
		result.append(id)
	result.sort()
	return result

func audio_kind(id: String) -> String:
	return String((_pack.get("audio", {}) as Dictionary).get(id, {}).get("kind", ""))

func audio_stream(id: String) -> AudioStreamWAV:
	var index: Dictionary = _pack.get("audio", {})
	if not index.has(id):
		return null
	if not _audio.has(id):
		var entry: Dictionary = index[id]
		var stream: AudioStreamWAV = load(String(entry["path"])) as AudioStreamWAV
		if stream == null or stream.mix_rate != entry["sample_rate"] or stream.stereo or stream.format != AudioStreamWAV.FORMAT_16_BITS or stream.data.size() != int(entry["frames"]) * 2:
			push_error("Imported audio does not match canonical PCM16: " + id)
			return null
		stream = stream.duplicate() as AudioStreamWAV
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD if entry["kind"] == "music" else AudioStreamWAV.LOOP_DISABLED
		stream.loop_begin = 0
		stream.loop_end = int(entry["frames"])
		_audio[id] = stream
	return (_audio[id] as AudioStreamWAV).duplicate() as AudioStreamWAV

func shadow_for_terrain(terrain_asset_id: String) -> String:
	match terrain_asset_id:
		"tile.wood_floor", "tile.bridge":
			return "prop.shadow_wood"
		"tile.path":
			return "prop.shadow_path"
		_:
			return binding("shadow")

func texture(asset_id: String) -> Texture2D:
	if not _textures.has(asset_id):
		var definition: Dictionary = definitions[asset_id]
		_textures[asset_id] = load(_art_root.path_join(String(definition["file"]))) as Texture2D
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
	if _font == null:
		_font = load(String(_pack["font"])) as FontFile
		if _font != null:
			_font.antialiasing = TextServer.FONT_ANTIALIASING_NONE
			_font.hinting = TextServer.HINTING_NONE
			_font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
			_font.generate_mipmaps = false
			_font.multichannel_signed_distance_field = false
			_font.allow_system_fallback = false
			_font.oversampling = 1.0
	return _font

func _indexed_json(index_name: String, resource_id: String, cache: Dictionary) -> Dictionary:
	var index: Dictionary = _pack.get(index_name, {})
	if not index.has(resource_id):
		push_error("Unknown " + index_name + " resource ID: " + resource_id)
		return {}
	if not cache.has(resource_id):
		cache[resource_id] = _read_json_object(String(index[resource_id]))
	# Gameplay receives its own copy; authored source data stays unchanged in the catalog.
	return (cache[resource_id] as Dictionary).duplicate(true)

func _read_json_object(path: String) -> Dictionary:
	if not path.begins_with("res://") or not FileAccess.file_exists(path):
		push_error("Resource pack file is unavailable: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		push_error("Resource pack file is not a JSON object: " + path)
		return {}
	return parsed

func palette_dimmer(arena: Rect2) -> ShaderMaterial:
	if not _palette.get("colors") is Array or _palette["colors"].is_empty() or _palette["colors"].size() > 64:
		return null
	var sources: PackedColorArray = PackedColorArray()
	var shades: PackedColorArray = PackedColorArray()
	var previous: Dictionary = {}
	for entry: Dictionary in _palette["colors"]:
		var color: Color = Color(entry["hex"])
		sources.append(color)
		shades.append(previous.get(entry["ramp"], color))
		previous[entry["ramp"]] = color
	var count: int = sources.size()
	while sources.size() < 64:
		sources.append(Color.BLACK)
		shades.append(Color.BLACK)
	var shader: Shader = Shader.new()
	shader.code = "shader_type canvas_item; render_mode unshaded; uniform vec4 source_colors[64]; uniform vec4 shade_colors[64]; uniform int color_count; uniform vec4 arena_rect; varying vec2 world_position; void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,0.0,1.0)).xy;} void fragment(){vec4 pixel=texture(TEXTURE,UV); bool outside=world_position.x<arena_rect.x || world_position.y<arena_rect.y || world_position.x>=arena_rect.x+arena_rect.z || world_position.y>=arena_rect.y+arena_rect.w; if(outside && pixel.a>0.0){for(int i=0;i<64;i++){if(i>=color_count){break;} if(distance(pixel.rgb,source_colors[i].rgb)<0.001){pixel.rgb=shade_colors[i].rgb;break;}}} COLOR=pixel;}"
	var material: ShaderMaterial = ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("source_colors", sources)
	material.set_shader_parameter("shade_colors", shades)
	material.set_shader_parameter("color_count", count)
	material.set_shader_parameter("arena_rect", Vector4(arena.position.x, arena.position.y, arena.size.x, arena.size.y))
	return material
