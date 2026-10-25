extends Node2D
## Pixel grid and target marks. Drawn below units; no translucent overlays.
var state: Dictionary = {}
var intents: Dictionary = {}
var mode: String = "command"
var cursor: Vector2i = Vector2i.ZERO
var cells: Array = []
var positions: Dictionary = {}
func _draw() -> void:
	if state.is_empty():
		return
	var size: Vector2 = Vector2(int(state["width"]) * 16, int(state["height"]) * 16)
	if mode in ["move_body", "move_astral", "manifest", "target"]:
		for x: int in int(state["width"]) + 1:
			draw_rect(Rect2(x * 16, 0, 1, size.y), Color("b09a8a"))
		for y: int in int(state["height"]) + 1:
			draw_rect(Rect2(0, y * 16, size.x, 1), Color("b09a8a"))
		for point: Dictionary in cells:
			draw_rect(Rect2(Vector2(point["x"] * 16 + 2, point["y"] * 16 + 2), Vector2(12, 12)), Color("3f8fd0"), false, 1)
	for id: String in intents:
		var intent: Dictionary = intents[id]
		if intent["status"] == "interrupted" or not intent.has("cell"):
			continue
		var cell: Variant = intent["cell"]
		if intent["mode"] == "unit":
			for actor: Dictionary in state["actors"]:
				if actor["id"] == intent["targetId"]:
					cell = actor[intent["target"]]
		if cell == null:
			continue
		var at: Vector2 = Vector2(cell["x"] * 16, cell["y"] * 16)
		if intent["mode"] == "unit" and positions.has(intent["targetId"] + ":" + intent["target"]):
			at = positions[intent["targetId"] + ":" + intent["target"]] - Vector2(8, 16)
		for x: int in range(2, 16, 4):
			for y: int in range(2, 16, 4):
				if (x + y) % 8 == 4:
					draw_rect(Rect2(at + Vector2(x, y), Vector2(2, 2)), Color("d6453a"))
		if intent["mode"] == "unit":
			draw_rect(Rect2(at + Vector2(1, 1), Vector2(14, 14)), Color("d6453a"), false, 1)
	for actor: Dictionary in state["actors"]:
		if actor["hp"] <= 0:
			continue
		if actor["astral"] != null:
			var body: Vector2 = positions.get(actor["id"] + ":body", Vector2(actor["body"]["x"] * 16 + 8, actor["body"]["y"] * 16 + 16))
			var astral: Vector2 = positions.get(actor["id"] + ":astral", Vector2(actor["astral"]["x"] * 16 + 8, actor["astral"]["y"] * 16 + 16))
			draw_line(body - Vector2(0, 4), astral - Vector2(0, 12), Color("ffe36b") if actor["team"] == "player" else Color("85706a"), 1, false)
		if actor["id"] == state["activeId"] and state["phase"] == "active":
			var feet: Vector2 = positions.get(actor["id"] + ":body", Vector2(actor["body"]["x"] * 16 + 8, actor["body"]["y"] * 16 + 16))
			draw_rect(Rect2(feet - Vector2(6, 3), Vector2(12, 2)), Color("ffe36b"))
	if mode in ["move_body", "move_astral", "manifest", "target"]:
		draw_rect(Rect2(Vector2(cursor * 16) + Vector2(1, 1), Vector2(14, 14)), Color("fff6c8"), false, 2)
