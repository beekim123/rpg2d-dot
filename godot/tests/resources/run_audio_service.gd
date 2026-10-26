extends SceneTree
var checks: int = 0
var failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error("FAIL: " + label)
func _run() -> void:
	var catalog: AssetCatalog = AssetCatalog.new()
	check(catalog.load_pack(), "canonical resource pack loads")
	check(catalog.has_method("audio_stream"), "catalog exposes semantic audio resources")
	check(ResourceLoader.exists("res://scripts/audio/audio_service.gd"), "native audio service exists")
	if failures.is_empty():
		for id: String in catalog.call("audio_ids"):
			var stream: AudioStreamWAV = catalog.call("audio_stream", id)
			var raw: PackedByteArray = FileAccess.get_file_as_bytes("res://resources/audio/" + id + ".wav")
			check(stream != null and stream.mix_rate == raw.decode_u32(24) and not stream.stereo and stream.format == AudioStreamWAV.FORMAT_16_BITS, id + " imports uncompressed mono PCM16 at authored rate")
			if stream == null:
				continue
			check(stream.data == raw.slice(44), id + " native samples exactly match release PCM16")
			check((stream.loop_mode == AudioStreamWAV.LOOP_FORWARD) == (catalog.call("audio_kind", id) == "music"), id + " loops only music")
			stream.loop_mode = AudioStreamWAV.LOOP_PINGPONG
			check(catalog.call("audio_stream", id).loop_mode != AudioStreamWAV.LOOP_PINGPONG, id + " caller cannot mutate cached playback resource")
		var before: int = AudioServer.bus_count
		var service: Node = load("res://scripts/audio/audio_service.gd").new()
		root.add_child(service)
		service.setup(catalog)
		check(not service.play("confirm"), "effects before first gesture are discarded")
		check(service.music("battle_theme"), "music request is queued before first gesture")
		check(service.snapshot()["music_playing"] == 0, "no autoplay before gesture")
		service.unlock()
		check(service.snapshot()["music_playing"] == 1, "gesture starts pending music")
		for index: int in 12:
			check(service.play("battle_hit"), "effects reuse bounded pool")
		check(service.snapshot()["effect_players"] == 6 and service.snapshot()["effects_playing"] <= 6, "sound pool cannot grow beyond six voices")
		check(not service.play("missing") and not service.music("confirm"), "unknown/effect music requests preserve valid music")
		check(service.snapshot()["music"] == "battle_theme", "invalid requests do not replace current track")
		service.set_muted(true)
		check(not service.play("confirm") and service.snapshot()["effects_playing"] == 0 and service.snapshot()["music_playing"] == 0, "mute immediately silences all sounds")
		service.set_muted(false)
		check(service.snapshot()["music_playing"] == 1, "unmute resumes only requested music")
		service.set_suspended(true)
		check(not service.play("confirm") and service.snapshot()["music_playing"] == 0, "hidden application cannot continue sounds")
		service.set_suspended(false)
		service._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
		service._set_page_visible(false)
		service._set_page_visible(true)
		check(service.snapshot()["suspended"] and service.snapshot()["music_playing"] == 0, "visibility restoration cannot override a still-unfocused application")
		service._notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
		service._set_page_visible(false)
		service._notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
		check(service.snapshot()["suspended"] and service.snapshot()["music_playing"] == 0, "focus restoration cannot override a still-hidden page")
		service._set_page_visible(true)
		service.music("test_theme")
		service.music("battle_theme")
		service.stop_effects()
		await create_timer(0.7).timeout
		check(service.snapshot()["music_playing"] == 1 and service.snapshot()["music"] == "battle_theme", "rapid crossfades settle to exactly the last track")
		service.music("")
		await create_timer(0.7).timeout
		check(service.snapshot()["music_playing"] == 0, "music fades completely to silence")
		service.free()
		check(AudioServer.bus_count == before, "disposing the service removes its own bus")
	print("AudioService: %d checks, %d failures" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)
