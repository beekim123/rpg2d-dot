extends SceneTree
const Book = preload("res://scripts/resources/battle_catalog.gd")
const Session = preload("res://scripts/battle/battle_session.gd")
var checks: int = 0
var failures: Array[String] = []
func _initialize() -> void:
	_run.call_deferred()
func check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures.append(label)
		push_error("FAIL: " + label)
func _run() -> void:
	var catalog: AssetCatalog = AssetCatalog.new()
	check(catalog.load_pack(), "resource pack loads")
	var tables: Dictionary = catalog.table_data("battle.skills")
	tables["skills"][0]["power"] = 999
	check(catalog.table_data("battle.skills")["skills"][0]["power"] == 16, "table consumers cannot mutate cached source")
	var maps: Dictionary = {}
	for id: String in catalog.map_ids():
		maps[id] = catalog.map_data(id)
	var worlds: WorldData = WorldData.new()
	check(worlds.configure(maps).is_empty(), "all authored maps configure")
	var words: Dictionary = catalog.locale(catalog.binding("locale"))
	var book: Book = Book.new()
	book.configure(catalog, worlds, words)
	for id: String in ["prologue_ella", "prologue_shade"]:
		var result: Dictionary = book.prepare(id)
		check(result["ok"], id + " prepares from semantic registered tables")
		if not result["ok"]:
			continue
		check(result["presentation"]["map"] == "lv.town" and result["arena"]["x"] == 14 and result["arena"]["y"] == 15, "uses town's authored square without scene coordinates in logic")
		var session: Session = Session.new()
		check(session.configure(result["balance"], result["skills"]).is_empty() and session.start(result["definition"])["ok"], "prepared native battle starts")
		check(result["definition"]["actors"].size() == (3 if id == "prologue_ella" else 2), "native support profile applies only to Ella teaching battle")
		result["definition"]["actors"][0]["hp"] = 0
		check(book.prepare(id)["definition"]["actors"][0]["hp"] > 0, "prepared definitions are independent")
	check(not book.prepare("missing")["ok"], "unknown battle rejected")
	var original: Dictionary = catalog.definitions["char.ella"]
	catalog.definitions.erase("char.ella")
	check(not book.prepare("prologue_ella")["ok"], "missing actor art fails before opening battle")
	catalog.definitions["char.ella"] = original
	maps["lv.town"]["entities"] = maps["lv.town"]["entities"].filter(func(e: Dictionary) -> bool: return e["id"] != "lv.town.pillar_n")
	var changed: WorldData = WorldData.new()
	check(changed.configure(maps).is_empty(), "fixture changed map remains valid for exploration")
	book.configure(catalog, changed, words)
	check(not book.prepare("prologue_ella")["ok"], "map/battle collision mismatch rejected")
	maps["lv.town"] = catalog.map_data("lv.town")
	for bad: Variant in [null, [], "square", 1, false]:
		var malformed_maps: Dictionary = maps.duplicate(true)
		malformed_maps["lv.town"]["arenas"] = bad
		var malformed: WorldData = WorldData.new()
		check(malformed.configure(malformed_maps).is_empty(), "exploration accepts unrelated arena metadata")
		book.configure(catalog, malformed, words)
		var refused: Dictionary = book.prepare("prologue_ella")
		check(refused.has("ok") and not refused["ok"] and refused.has("error"), "bad arena container returns a structured refusal")
	print("BattleCatalog: %d checks, %d failures" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)
