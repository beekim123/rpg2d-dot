extends Node
## Presentation ticks only. Playback speed never feeds back into battle rules.
signal started(event: Dictionary)
signal progressed(event: Dictionary, tick: int, duration: int)
signal ended(event: Dictionary)
signal finished
var speed: int = 1
var _queue: Array = []
var _current: Dictionary = {}
var _index: int = 0
var _tick: int = 0
var _duration: int = 1
var _running: bool = false
var _generation: int = 0
func play(events: Array) -> void:
	stop()
	_queue = events.duplicate(true)
	_running = true
	_next()
	if speed == 0:
		_flush()
func stop() -> void:
	_generation += 1
	_running = false
	_queue.clear()
	_current = {}
	_index = 0
	_tick = 0
func _physics_process(_delta: float) -> void:
	if not _running:
		return
	if speed == 0:
		_flush()
		return
	var budget: int = maxi(1, speed)
	var generation: int = _generation
	while _running and budget > 0 and generation == _generation:
		var advance: int = mini(budget, _duration - _tick)
		_tick += advance
		budget -= advance
		progressed.emit(_current.duplicate(true), _tick, _duration)
		if _tick == _duration and generation == _generation:
			ended.emit(_current.duplicate(true))
			if generation == _generation:
				_next()
func _flush() -> void:
	var generation: int = _generation
	while _running and generation == _generation:
		progressed.emit(_current.duplicate(true), _duration, _duration)
		if generation != _generation:
			return
		ended.emit(_current.duplicate(true))
		if generation == _generation:
			_next()
func _next() -> void:
	if _index >= _queue.size():
		_running = false
		_current = {}
		finished.emit()
		return
	_current = _queue[_index]
	_index += 1
	_tick = 0
	_duration = _event_ticks(_current)
	started.emit(_current.duplicate(true))
static func _event_ticks(event: Dictionary) -> int:
	match event["type"]:
		"move": return maxi(1, (event["path"].size() - 1) * 6)
		"skill", "heal", "shield": return 15
		"recall", "manifest": return 12
		"damage": return 18
		"undo": return 8
		"cheer", "cancelled_skill": return 12
		"knockback", "tether_pull": return 6
		"collision": return 4
		"outcome": return 18
		_: return 1
