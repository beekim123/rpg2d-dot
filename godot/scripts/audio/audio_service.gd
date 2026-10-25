extends Node
## Bounded presentation service. No gameplay state, synthesis or physical paths live here.
signal changed
const EFFECT_VOICES: int = 6
const FADE_SECONDS: float = 0.6
const MUSIC_GAIN: float = 0.5
var _catalog: AssetCatalog
var _effects: Array[AudioStreamPlayer] = []
var _music_players: Array[AudioStreamPlayer] = []
var _next_voice: int = 0
var _current_slot: int = -1
var _requested_music: String = ""
var _unlocked: bool = false
var _muted: bool = false
var _suspended: bool = false
var _manual_suspended: bool = false
var _focused: bool = true
var _page_visible: bool = true
var _fade: Tween
var _bus: StringName = &""
var _web_document: Variant
var _web_callback: Variant
func setup(catalog: AssetCatalog) -> void:
	if _catalog != null:
		return
	_catalog = catalog
	_bus = StringName("ASTRA_" + str(get_instance_id()))
	AudioServer.add_bus()
	var index: int = AudioServer.bus_count - 1
	AudioServer.set_bus_name(index, _bus)
	AudioServer.set_bus_send(index, &"Master")
	var limiter: AudioEffectHardLimiter = AudioEffectHardLimiter.new()
	limiter.ceiling_db = -1.0
	AudioServer.add_bus_effect(index, limiter)
	for voice: int in EFFECT_VOICES:
		_effects.append(_make_player("Effect" + str(voice)))
	for slot: int in 2:
		_music_players.append(_make_player("Music" + str(slot)))
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var bridge: Object = Engine.get_singleton("JavaScriptBridge")
		_web_document = bridge.call("get_interface", "document")
		_web_callback = bridge.call("create_callback", _visibility_changed)
		_web_document.addEventListener("visibilitychange", _web_callback)
		_set_page_visible(not bool(_web_document.hidden))
func _make_player(label: String) -> AudioStreamPlayer:
	var player: AudioStreamPlayer = AudioStreamPlayer.new()
	player.name = label
	player.bus = _bus
	# Stream supports the limiter on the no-thread Web build as well as native.
	player.playback_type = AudioServer.PLAYBACK_TYPE_STREAM
	add_child(player)
	player.finished.connect(func() -> void: changed.emit())
	return player
func unlock() -> void:
	if _unlocked:
		return
	_unlocked = true
	if _audible() and not _requested_music.is_empty():
		_start_music()
	changed.emit()
func play(id: String) -> bool:
	if not _audible() or _catalog.audio_kind(id) != "effect":
		return false
	var stream: AudioStreamWAV = _catalog.audio_stream(id)
	if stream == null:
		return false
	var player: AudioStreamPlayer = _effects[_next_voice]
	_next_voice = (_next_voice + 1) % EFFECT_VOICES
	player.stop()
	player.stream = stream
	player.volume_db = -2.0
	player.play()
	changed.emit()
	return true
func music(id: String) -> bool:
	if _catalog == null or (not id.is_empty() and _catalog.audio_kind(id) != "music"):
		return false
	if id == _requested_music:
		return true
	_requested_music = id
	if _audible():
		_start_music()
	changed.emit()
	return true
func stop_effects() -> void:
	for player: AudioStreamPlayer in _effects:
		player.stop()
	changed.emit()
func set_muted(value: bool) -> void:
	if _muted == value:
		return
	_muted = value
	_refresh_audibility()
func is_muted() -> bool:
	return _muted
func set_suspended(value: bool) -> void:
	_manual_suspended = value
	_update_suspension()
func _update_suspension() -> void:
	var value: bool = _manual_suspended or not _focused or not _page_visible
	if _suspended == value:
		return
	_suspended = value
	_refresh_audibility()
func _refresh_audibility() -> void:
	_stop_all()
	if _audible() and not _requested_music.is_empty():
		_start_music()
	changed.emit()
func _audible() -> bool:
	return _catalog != null and _unlocked and not _muted and not _suspended
func _start_music() -> void:
	var stream: AudioStreamWAV = null if _requested_music.is_empty() else _catalog.audio_stream(_requested_music)
	if not _requested_music.is_empty() and stream == null:
		return
	if _fade != null:
		_fade.kill()
	_fade = create_tween().set_parallel(true)
	if _requested_music.is_empty():
		for player: AudioStreamPlayer in _music_players:
			_fade.tween_property(player, "volume_linear", 0.0, FADE_SECONDS)
		_fade.chain().tween_callback(_stop_music)
		return
	var previous: int = _current_slot
	_current_slot = 0 if previous < 0 else 1 - previous
	var incoming: AudioStreamPlayer = _music_players[_current_slot]
	incoming.stop()
	incoming.stream = stream
	incoming.volume_linear = 0.0
	incoming.play()
	_fade.tween_property(incoming, "volume_linear", MUSIC_GAIN, FADE_SECONDS)
	if previous >= 0:
		var outgoing: AudioStreamPlayer = _music_players[previous]
		_fade.tween_property(outgoing, "volume_linear", 0.0, FADE_SECONDS)
		_fade.chain().tween_callback(outgoing.stop)
func _stop_music() -> void:
	for player: AudioStreamPlayer in _music_players:
		player.stop()
	_current_slot = -1
	changed.emit()
func _stop_all() -> void:
	if _fade != null:
		_fade.kill()
	stop_effects()
	_stop_music()
func snapshot() -> Dictionary:
	var effects_playing: int = 0
	var music_playing: int = 0
	for player: AudioStreamPlayer in _effects:
		effects_playing += int(player.playing)
	for player: AudioStreamPlayer in _music_players:
		music_playing += int(player.playing)
	return {"unlocked": _unlocked, "muted": _muted, "suspended": _suspended, "music": _requested_music, "music_playing": music_playing, "effects_playing": effects_playing, "effect_players": _effects.size(), "limiter_db": -1.0}
func _visibility_changed(_arguments: Array) -> void:
	_set_page_visible(not bool(_web_document.hidden))
func _set_page_visible(value: bool) -> void:
	_page_visible = value
	_update_suspension()
func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_focused = false
		_update_suspension()
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_focused = true
		_update_suspension()
func _exit_tree() -> void:
	_stop_all()
	if _web_document != null and _web_callback != null:
		_web_document.removeEventListener("visibilitychange", _web_callback)
	_web_callback = null
	_web_document = null
	var index: int = AudioServer.get_bus_index(_bus)
	if index > 0:
		AudioServer.remove_bus(index)
