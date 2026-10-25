extends SceneTree
const Session = preload("res://scripts/battle/battle_session.gd")
const Compare = preload("res://tests/battle/json_compare.gd")
var checks: int = 0
var failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures.append(label)
		push_error("FAIL: " + label)
func _fixture(id: String, strategy: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(ProjectSettings.globalize_path("res://../tests/fixtures/battle/route-" + id + "-" + strategy + ".json")))
func _run() -> void:
	var empty: Session = Session.new()
	check(not empty.retry()["ok"], "retry before start rejected")
	for id: String in ["prologue_ella", "prologue_shade"]:
		var losing: Dictionary = _fixture(id, "wait")
		var winning: Dictionary = _fixture(id, "attack")
		var api: Session = Session.new()
		check(api.configure(losing["balance"], losing["skillData"]).is_empty(), "configure session")
		var source: Dictionary = losing["replays"][0]["initial"].duplicate(true)
		var result: Dictionary = api.start(source)
		check(result["ok"], id + " starts")
		if not result["ok"]:
			continue
		var initial: Dictionary = api.snapshot()
		source["actors"][0]["hp"] = 0
		result["encounter"]["battle"]["actors"][0]["hp"] = 0
		check(Compare.equal(api.snapshot(), initial), "start owns seed and exposed snapshot independently")
		check(not api.retry()["ok"] and Compare.equal(api.snapshot(), initial), "active battle cannot silently restart")
		check(not api.start({})["ok"] and Compare.equal(api.snapshot(), initial), "invalid new definition keeps current session")
		check(not api.configure({}, {}).is_empty() and Compare.equal(api.snapshot(), initial), "invalid config keeps current session")
		_play(api, losing["replays"][0])
		var lost: Dictionary = api.snapshot()
		check(lost["battle"]["phase"] == "lost" and lost["battle"]["actors"][0]["hp"] == 0, "real incoming actions produce defeat")
		check(api.retry()["ok"] and Compare.equal(api.snapshot(), initial), "retry restores exact authored initial state and intentions")
		_play(api, winning["replays"][0])
		check(api.snapshot()["battle"]["phase"] == "won", "retry can win with legitimate commands")
		check(lost["battle"]["phase"] == "lost", "retry leaves previous loss snapshot unchanged")
		if id == "prologue_shade":
			check(api.snapshot()["battle"]["enemyActions"]["shade"] == 3 and "shade" in api.snapshot()["battle"]["hitEnemy"]["finn"], "shade victory requires three genuine enemy actions and qualifying hit")
	print("BattleRetry: %d checks, %d failures; two real losses then clean wins" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)
func _play(api: Session, replay: Dictionary) -> void:
	for item: Dictionary in replay["steps"]:
		var result: Dictionary = api.advance_enemy() if item["step"]["kind"] == "enemy" else api.command(item["step"]["command"])
		check(result["ok"], "session accepts real route command")
		check(Compare.equal(result, item["expected"]), "session action preserves oracle state and event sequence")
