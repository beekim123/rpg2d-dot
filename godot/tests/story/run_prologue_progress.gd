extends SceneTree
const Book = preload("res://scripts/story/prologue_content.gd")
const Session = preload("res://scripts/battle/battle_session.gd")
const Encounters = preload("res://scripts/battle/battle_encounter.gd")
const BattleBook = preload("res://scripts/resources/battle_catalog.gd")
var checks: int = 0
var failures: Array[String] = []
var world: WorldData = WorldData.new()
var codec: SaveCodec = SaveCodec.new()
var catalog: AssetCatalog = AssetCatalog.new()
var book: Book = Book.new()
var battles: BattleBook = BattleBook.new()
var words: Dictionary = {}
var flow: Dictionary = {}
var rules: RefCounted
var templates: Dictionary = {}
var checkpoints: Dictionary = {}
func _initialize() -> void:
	_run.call_deferred()
func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error("FAIL: " + label)
func _run() -> void:
	check(catalog.load_pack(), "package loads for prologue progression")
	check(ResourceLoader.exists("res://scripts/story/prologue_progress.gd"), "independent phase transactions exist")
	if not failures.is_empty():
		_finish()
		return
	var maps: Dictionary = {}
	for id: String in catalog.map_ids():
		maps[id] = catalog.map_data(id)
	check(world.configure(maps).is_empty() and codec.configure(maps).is_empty(), "world and v3 save validation configure")
	words = catalog.locale("zh-Hans")
	var portraits: Array[String] = []
	for id: String in catalog.definitions:
		if catalog.definitions[id].get("category") == "portrait":
			portraits.append(id)
	book.configure(catalog.cinematic_data("prologue"), words, portraits)
	battles.configure(catalog, world, words)
	for id: String in ["prologue_ella","prologue_shade"]:
		templates[id] = battles.prepare(id)
	flow = catalog.table_data("prologue.flow")
	rules = load("res://scripts/story/prologue_progress.gd").new()
	check(rules.configure(flow, world, codec, book, words, catalog.table_data("battle.support"),templates).is_empty(), "authored thirty-step flow configures")
	var fresh: Dictionary = codec.fresh("lv.finn_house")
	if "--configuration-only" in OS.get_cmdline_user_args():
		_test_boundaries(rules.begin(fresh)["state"])
		_finish()
		return
	check(rules.offer(fresh, "automatic").is_empty(), "old exploratory saves never enter the main story implicitly")
	check(rules.validate_save(fresh) == "", "old v3 snapshot remains valid")
	var result: Dictionary = rules.begin(fresh)
	check(result["ok"] and not fresh["flags"].has("p.main_started"), "explicit new journey begins without mutating old snapshot")
	var state: Dictionary = result.get("state", {})
	check(not rules.begin(state)["ok"], "begin cannot reset an already started story")
	check(not rules.can_light_lamp(state), "unawakened Finn cannot light lamps before borrowing the physical travel lamp")
	for step: Dictionary in flow["steps"]:
		for lamp: String in step.get("require", {}).get("lamps", []):
			if lamp in state["lamps"]:
				continue
			check(rules.can_light_lamp(state), "lamp action is permitted by actual inventory")
			state = _face_entity(state, "lv.town", [lamp])
			var lit: Dictionary = codec.light_lamp(state, lamp)
			check(lit["ok"], "real lamp transaction lights " + lamp)
			state = lit["state"]
		state = _position_for(state, step["trigger"])
		var offered: Dictionary = rules.offer(state, step["trigger"]["kind"])
		check(offered.get("id") == step["id"], "real prerequisites and map target offer " + step["id"])
		if offered.get("id") != step["id"]:
			break
		checkpoints[step["id"]] = state.duplicate(true)
		var choice: String = ""
		var session: Session = null
		if step["presentation"]["kind"] == "choice":
			check(not rules.commit(state, step["id"], step["trigger"]["kind"], "cancel")["ok"], "cancel never advances a choice")
			choice = step["presentation"]["choices"][0]["id"]
		if step["presentation"]["kind"] == "battle":
			check(not rules.commit(state, step["id"], step["trigger"]["kind"])["ok"], "dialogue skip cannot settle a battle")
			var forged: Session = _forged_session(state, step["presentation"]["battleId"])
			check(forged.snapshot().get("battle",{}).get("phase") == "won", "forged definition really creates a terminal Session for the regression")
			check(not rules.commit(state, step["id"], step["trigger"]["kind"], "", forged)["ok"], "same ID and supplies cannot authorize a forged or wrong-goal battle")
			check(not rules.authorize_battle(state,step["id"],step["trigger"]["kind"],forged), "a pre-ended forged Session cannot acquire authority")
			_authorization_edges(state,step,forged)
			session = _battle_session(state, step["presentation"]["battleId"])
			check(not rules.commit(state, step["id"], step["trigger"]["kind"], "", session)["ok"], "an active encounter cannot advance the story")
			check(rules.authorize_battle(state,step["id"],step["trigger"]["kind"],session), "only a canonical active Session is authorized for this exact checkpoint")
			var initial_battle: Dictionary = session.snapshot()
			var exposed_supply: Dictionary = session.starting_inventory()
			exposed_supply.clear()
			check(session.starting_inventory() == rules.battle_inventory(state), "exposed battle supply cannot alter its retry seed")
			var spent: bool = _lose(session)
			check(session.snapshot()["battle"]["phase"] == "lost", "ordinary waits and real damage lose the story battle")
			check(spent or initial_battle["battle"].get("inventory",{}).get("bread",0) == 0, "defeat route really spends a healing supply")
			check(not rules.commit(state, step["id"], step["trigger"]["kind"], "", session)["ok"], "a real defeat cannot unlock the next scene")
			check(session.retry()["ok"] and session.snapshot() == initial_battle, "retry restores supplies and full authored encounter")
			_win(session)
			check(session.snapshot()["battle"]["phase"] == "won", "normal battle commands truly win " + step["presentation"]["battleId"])
			var different_checkpoint: Dictionary = state.duplicate(true)
			different_checkpoint["steps"] += 1
			check(rules.commit(different_checkpoint,step["id"],step["trigger"]["kind"],"",session).get("error") == "battle_not_authorized", "victory is bound to its exact exploration checkpoint")
		var before: Dictionary = state.duplicate(true)
		result = rules.commit(state, step["id"], step["trigger"]["kind"], choice, session)
		check(result["ok"], "stage transaction commits " + step["id"] + ": " + str(result.get("error", "")))
		check(state == before, "stage commit never mutates its caller snapshot")
		if not result["ok"]:
			break
		state = result["state"]
		check(not rules.commit(state, step["id"], step["trigger"]["kind"], choice, session)["ok"], "completed stage cannot grant anything twice")
		check(rules.validate_save(state) == "", "committed stage has consistent history and unique items")
		var encoded: Dictionary = codec.encode(state)
		check(encoded["ok"] and codec.decode(encoded.get("text", "")).get("state") == state, "every boundary round-trips through unchanged v3 storage")
	check(state["flags"].get("p.departed", false) and state["flags"].get("p.s11_done", false), "route stops at actual prologue departure")
	check(state["inventory"].get("hob_travel_lamp", 0) == 1 and state["inventory"].get("item.star_pendant", 0) == 1, "one travel lamp and one pendant survive the entire route")
	check(state["flags"].get("p.attack_started", false), "dawn keeps attack_started to prevent duplicate day NPCs")
	var malformed: Dictionary = state.duplicate(true)
	malformed["inventory"]["hob_travel_lamp"] = 2
	check(rules.validate_save(malformed) != "", "duplicate key item is rejected for main-story saves")
	malformed = state.duplicate(true)
	malformed["flags"].erase("p.ella_battle_won")
	check(rules.validate_save(malformed) != "", "later scene cannot exist without its real battle checkpoint")
	var bag: Dictionary = state.duplicate(true)
	bag["inventory"]["bread"] = 25
	bag["inventory"]["star_candy"] = 2
	check(rules.battle_inventory(bag) == {"bread":9,"star_candy":2}, "battle transfer caps supplies and excludes every key item")
	_test_boundaries(state)
	_test_alternatives()
	_finish()
func _authorization_edges(state: Dictionary, step: Dictionary, forged: Session) -> void:
	var id: String = step["presentation"]["battleId"]
	var session: Session = _battle_session(state,id)
	var proof: Dictionary = session.provenance()
	var changed: Dictionary = session.provenance()
	changed["definition"]["actors"].clear()
	changed["configuration"]["balance"].clear()
	check(session.provenance() == proof, "provenance getter cannot mutate the authoritative seed or rules")
	check(rules.authorize_battle(state,step["id"],step["trigger"]["kind"],session), "canonical encounter gets a stage ticket")
	rules.cancel_battle()
	check(rules.commit(state,step["id"],step["trigger"]["kind"],"",session).get("error") == "battle_not_authorized", "cancelling removes the old ticket")
	rules.authorize_battle(state,step["id"],step["trigger"]["kind"],session)
	check(session.start(forged.provenance()["definition"])["ok"], "same Session can be restarted by generic battle API")
	check(rules.commit(state,step["id"],step["trigger"]["kind"],"",session).get("error") == "battle_not_authorized", "restarting an authorized object with a fake win invalidates authority")
	session = _battle_session(state,id)
	rules.authorize_battle(state,step["id"],step["trigger"]["kind"],session)
	proof = session.provenance()
	session.configure(proof["configuration"]["balance"],proof["configuration"]["skills"])
	session.start(proof["definition"])
	check(rules.commit(state,step["id"],step["trigger"]["kind"],"",session).get("error") == "battle_not_authorized", "even identical reconfiguration requires a new stage ticket")
	var adjusted_balance: Dictionary = proof["configuration"]["balance"].duplicate(true)
	adjusted_balance["damage"]["defaultOpeningMultiplier"] = 2
	session.configure(adjusted_balance,proof["configuration"]["skills"])
	session.start(proof["definition"])
	check(not rules.authorize_battle(state,step["id"],step["trigger"]["kind"],session), "a matching map with altered battle math cannot acquire authority")
	rules.cancel_battle()
func _test_boundaries(valid_state: Dictionary) -> void:
	for corruption: String in ["unknown_entity","unknown_lamp","invalid_flag_id","condition_typo","trigger_typo","unknown_item","missing_target","effect_for_old_step","unknown_prerequisite","future_prerequisite","ambiguous_choices","dialogue_choices_null","dialogue_choices_text","dialogue_choices_bad_entry"]:
		var candidate: Dictionary = flow.duplicate(true)
		match corruption:
			"unknown_entity": candidate["steps"][3]["trigger"]["entityIds"] = ["lv.town.missing"]
			"unknown_lamp": candidate["steps"][4]["require"]["lamps"] = ["lv.lamp.missing"]
			"invalid_flag_id": candidate["steps"][0]["done"] = "bad-key"
			"condition_typo": candidate["steps"][0]["require"]["lampz"] = ["lv.lamp.bakery"]
			"trigger_typo": candidate["steps"][0]["trigger"]["map"] = "lv.town"
			"unknown_item": candidate["steps"][2]["inventory"] = {"unknown_item":1}
			"missing_target": candidate["steps"][3]["trigger"].erase("entityIds")
			"effect_for_old_step": candidate["steps"][2]["set"] = {"p.s01_done":true}
			"unknown_prerequisite": candidate["steps"][1]["require"]["flags"] = {"p.main_started":true,"p.s01_dno":true}
			"future_prerequisite": candidate["steps"][1]["require"]["flags"]["p.departed"] = true
			"ambiguous_choices":
				candidate["steps"][11]["presentation"]["choices"][0]["set"] = {}
				candidate["steps"][11]["presentation"]["choices"][1]["set"] = {}
			"dialogue_choices_null": candidate["steps"][0]["presentation"]["choices"] = null
			"dialogue_choices_text": candidate["steps"][0]["presentation"]["choices"] = "bad"
			"dialogue_choices_bad_entry": candidate["steps"][0]["presentation"]["choices"] = [null]
		var configured: Variant = rules.configure(candidate,world,codec,book,words,catalog.table_data("battle.support"),templates)
		check(configured is Array and not configured.is_empty(), "invalid flow rejected at configuration: " + corruption)
		check(rules.validate_save(valid_state) == "", "bad flow replacement preserves working checkpoints")
		rules.configure(flow,world,codec,book,words,catalog.table_data("battle.support"),templates)
	var unsupported: Dictionary = catalog.table_data("battle.support")
	unsupported["rules"]["inventoryLimit"] = 10
	check(not rules.configure(flow,world,codec,book,words,unsupported,templates).is_empty(), "story supply limit cannot exceed the battle engine contract")
	rules.configure(flow,world,codec,book,words,catalog.table_data("battle.support"),templates)
	var both: Dictionary = valid_state.duplicate(true)
	both["flags"]["p.paper_fold_leaf"] = true
	check(rules.validate_save(both) != "", "mutually exclusive paper folds cannot both be saved")
	var early: Dictionary = rules.begin(codec.fresh("lv.finn_house"))["state"]
	early["flags"]["p.attack_started"] = true
	check(rules.validate_save(early) != "", "the attack cannot hide NPCs before the actual release action")
	var malformed: Dictionary = valid_state.duplicate(true)
	malformed["inventory"]["bread"] = "3"
	check(rules.battle_inventory(malformed).is_empty(), "malformed supplies fail closed instead of coercing text")
func _test_alternatives() -> void:
	var folded: Dictionary = rules.commit(checkpoints["fold_share"],"fold_share","interact","leaf")
	check(folded["ok"] and folded["state"]["flags"].get("p.paper_fold_leaf",false) and not folded["state"]["flags"].get("p.paper_fold_star",true), "the alternate paper fold remains valid and exclusive")
	check(rules.offer(folded["state"],"automatic").get("id") == "pendant", "the alternate cosmetic choice reaches the same next story scene")
	var early_lamps: Dictionary = checkpoints["daily"].duplicate(true)
	for lamp: String in ["lv.lamp.bridge","lv.lamp.square"]:
		early_lamps = _face_entity(early_lamps,"lv.town",[lamp])
		early_lamps = codec.light_lamp(early_lamps,lamp)["state"]
	var completed: Dictionary = rules.commit(early_lamps,"lamps_complete","automatic")
	check(completed["ok"], "three lamps can be completed before meeting Brio")
	early_lamps = _position_for(completed["state"],flow["steps"][5]["trigger"])
	check(rules.commit(early_lamps,"daily","interact")["ok"], "Brio remains reachable after early lamp completion")
	var full_bag: Dictionary = checkpoints["departure_gate"].duplicate(true)
	full_bag["inventory"]["bread"] = 999
	var departure: Dictionary = rules.commit(full_bag,"departure_gate","interact")
	check(departure["ok"] and departure["state"]["inventory"]["bread"] == 999, "ordinary reward overflow cannot block departure or remove existing supplies")
	var maps: Dictionary = {}
	for id: String in catalog.map_ids():
		maps[id] = catalog.map_data(id)
	maps["lv.town"]["anchors"]["blocked_test"] = {"x":0,"y":0}
	var blocked_world: WorldData = WorldData.new()
	var blocked_codec: SaveCodec = SaveCodec.new()
	blocked_world.configure(maps)
	blocked_codec.configure(maps)
	var blocked_flow: Dictionary = flow.duplicate(true)
	blocked_flow["steps"][3]["relocate"] = {"mapId":"lv.town","anchor":"blocked_test"}
	var blocked_rules: RefCounted = load("res://scripts/story/prologue_progress.gd").new()
	check(blocked_rules.configure(blocked_flow,blocked_world,blocked_codec,book,words,catalog.table_data("battle.support"),templates).is_empty(), "focal anchor can be structurally valid but not a safe checkpoint")
	var borrow_before: Dictionary = checkpoints["borrow"].duplicate(true)
	var rejected: Dictionary = blocked_rules.commit(borrow_before,"borrow","interact")
	check(not rejected["ok"] and rejected["error"] == "unsafe_story_checkpoint" and rejected["state"] == borrow_before, "unsafe transition rolls back both inventory gift and completion flag")
func _lose(session: Session) -> bool:
	var spent: bool = false
	for turn: int in 240:
		var current: Dictionary = session.snapshot()["battle"]
		if current["phase"] != "active":
			return spent
		var actor: Dictionary = current["actors"].filter(func(a: Dictionary) -> bool:return a["id"] == current["activeId"])[0]
		if actor["team"] == "enemy":
			session.advance_enemy()
		elif not spent and actor["hp"] < actor["maxHp"] and current.get("inventory",{}).get("bread",0) > 0:
			spent = session.command({"type":"item","actorId":actor["id"],"itemId":"bread","targetId":actor["id"],"target":"body"})["ok"]
			if not spent:
				session.command({"type":"wait","actorId":actor["id"]})
		else:
			session.command({"type":"wait","actorId":actor["id"]})
	return spent
func _position_for(state: Dictionary, trigger: Dictionary) -> Dictionary:
	var next: Dictionary = state.duplicate(true)
	var map_id: String = trigger.get("mapId", state["mapId"])
	if trigger.has("entityIds"):
		return _face_entity(state, map_id, trigger["entityIds"])
	if trigger.has("anchor"):
		var point: Dictionary = world.anchor_point(map_id, trigger["anchor"])
		var radius: int = trigger.get("radius", 0)
		var map: Dictionary = world.get_map(map_id, state["flags"])
		for y: int in range(int(point["y"]) - radius, int(point["y"]) + radius + 1):
			for x: int in range(int(point["x"]) - radius, int(point["x"]) + radius + 1):
				if abs(x - int(point["x"])) + abs(y - int(point["y"])) <= radius and world.is_safe_entry(map, Vector2i(x,y)):
					next["mapId"] = map_id
					next["player"] = {"x":x,"y":y,"facing":"down"}
					return next
	check(map_id == state["mapId"], "automatic scene stays on expected map")
	return next
func _face_entity(state: Dictionary, map_id: String, ids: Array) -> Dictionary:
	var map: Dictionary = world.get_map(map_id, state["flags"])
	for entity: Dictionary in map["entities"]:
		if not entity["id"] in ids:
			continue
		for direction: Vector2i in [Vector2i.UP,Vector2i.DOWN,Vector2i.LEFT,Vector2i.RIGHT]:
			var cell: Vector2i = Vector2i(int(entity["x"]),int(entity["y"])) - direction
			if world.is_safe_entry(map, cell) and world.interaction_target(map,cell,direction).get("id") in ids:
				var next: Dictionary = state.duplicate(true)
				next["mapId"] = map_id
				next["player"] = {"x":cell.x,"y":cell.y,"facing":{Vector2i.UP:"up",Vector2i.DOWN:"down",Vector2i.LEFT:"left",Vector2i.RIGHT:"right"}[direction]}
				return next
	check(false, "authored interaction target has a real safe standing cell: " + str(ids))
	return state.duplicate(true)
func _battle_session(state: Dictionary, id: String) -> Session:
	var prepared: Dictionary = battles.prepare(id, state["flags"])
	var definition: Dictionary = prepared["definition"].duplicate(true)
	definition["inventory"] = rules.battle_inventory(state)
	var session: Session = Session.new()
	session.configure(prepared["balance"], prepared["skills"])
	check(session.start(definition)["ok"], "story battle starts from filtered supplies")
	return session
func _forged_session(state: Dictionary, id: String) -> Session:
	var prepared: Dictionary = battles.prepare(id,state["flags"])
	var definition: Dictionary = prepared["definition"].duplicate(true)
	definition["inventory"] = rules.battle_inventory(state)
	definition.erase("goal")
	definition.erase("hpFloors")
	for actor: Dictionary in definition["actors"]:
		if actor["team"] == "enemy":
			actor["hp"] = 0
			actor["mode"] = "extinguished"
			actor["astral"] = null
	var session: Session = Session.new()
	session.configure(prepared["balance"],prepared["skills"])
	check(session.start(definition)["ok"], "forged alternate definition is structurally accepted by the generic battle engine")
	return session
func _win(session: Session) -> void:
	var planner: Encounters = Encounters.new()
	var skills: Dictionary = catalog.table_data("battle.skills")
	skills["support"] = catalog.table_data("battle.support")
	planner.configure(catalog.table_data("battle.balance"), skills)
	for turn: int in 200:
		var current: Dictionary = session.snapshot()
		if current["battle"]["phase"] != "active":
			return
		var actor: Dictionary = current["battle"]["actors"].filter(func(a: Dictionary) -> bool:return a["id"] == current["battle"]["activeId"])[0]
		if actor["team"] == "enemy":
			session.advance_enemy()
		else:
			for command: Dictionary in planner.plan_player_turn(current):
				check(session.command(command)["ok"], "story encounter uses ordinary valid commands")
func _finish() -> void:
	print("PrologueProgress: %d checks, %d failures" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)
