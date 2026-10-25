extends SceneTree
const Player = preload("res://scripts/battle/presentation/battle_event_player.gd")
var checks: int = 0
var failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func check(value: bool, text: String) -> void:
	checks += 1
	if not value:
		failures.append(text)
		push_error(text)
func _run() -> void:
	var events: Array = [{"type": "skill", "actorId": "ella"}, {"type": "damage", "actorId": "foe", "damage": 24}, {"type": "turn", "actorId": "finn"}]
	for speed: int in [1, 2, 0]:
		var player: Player = Player.new()
		player.speed = speed
		var sequence: Array = []
		player.started.connect(func(event: Dictionary) -> void: sequence.append("start:" + event["type"]))
		player.ended.connect(func(event: Dictionary) -> void: sequence.append("end:" + event["type"]))
		player.finished.connect(func() -> void: sequence.append("done"))
		player.play(events)
		for tick: int in 80:
			player._physics_process(1.0 / 60)
		check(sequence == ["start:skill", "end:skill", "start:damage", "end:damage", "start:turn", "end:turn", "done"], "all speeds preserve exact event order and finish once")
		player.free()
	var stopped: Player = Player.new()
	var done: Array = []
	stopped.finished.connect(func() -> void: done.append(true))
	stopped.play(events)
	stopped.stop()
	for tick: int in 80:
		stopped._physics_process(1.0 / 60)
	check(done.is_empty(), "stopping playback never advances a disposed battle")
	stopped.free()
	print("BattleEventPlayer: %d checks, %d failures" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)
