extends RefCounted
## Scene-facing owner of one encounter and its private authored retry seed.
## No save backend or resource access; every exposed snapshot is independent.
const Encounters = preload("res://scripts/battle/battle_encounter.gd")
var _api: Encounters
var _seed: Dictionary = {}
var _current: Dictionary = {}

func configure(balance: Variant, skills: Variant) -> String:
	var candidate: Encounters = Encounters.new()
	var error: String = candidate.configure(balance, skills)
	if not error.is_empty():
		return error
	_api = candidate
	_seed = {}
	_current = {}
	return ""

func start(definition: Variant) -> Dictionary:
	if _api == null:
		return {"ok": false, "error": "unconfigured_session"}
	var result: Dictionary = _api.create_encounter(definition)
	if not result["ok"]:
		return result
	_seed = definition.duplicate(true)
	_current = result["encounter"]
	return {"ok": true, "encounter": snapshot()}

func retry() -> Dictionary:
	if _api == null or _seed.is_empty() or _current.is_empty() or _current["battle"]["phase"] != "lost":
		return {"ok": false, "error": "retry_unavailable"}
	var result: Dictionary = _api.create_encounter(_seed)
	if not result["ok"]:
		return result
	_current = result["encounter"]
	return {"ok": true, "encounter": snapshot()}

func snapshot() -> Dictionary:
	return _current.duplicate(true)

func command(input: Variant) -> Dictionary:
	if _api == null:
		return {"ok": false, "error": "unconfigured_session"}
	return _accept(_api.command_encounter(_current, input))

func advance_enemy() -> Dictionary:
	if _api == null:
		return {"ok": false, "error": "unconfigured_session"}
	return _accept(_api.advance_enemy(_current))

func _accept(result: Dictionary) -> Dictionary:
	if result["ok"]:
		_current = result["encounter"].duplicate(true)
	return result
