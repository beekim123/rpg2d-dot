extends RefCounted
## Test-only exact JSON equality: JSON has one numeric type, but no boolean coercion.
static func equal(actual: Variant, expected: Variant) -> bool:
	if (actual is int or actual is float) and (expected is int or expected is float):
		return actual == expected
	if typeof(actual) != typeof(expected):
		return false
	if actual is Dictionary:
		if actual.size() != expected.size():
			return false
		for key: Variant in expected:
			if not actual.has(key) or not equal(actual[key], expected[key]):
				return false
		return true
	if actual is Array:
		if actual.size() != expected.size():
			return false
		for index: int in expected.size():
			if not equal(actual[index], expected[index]):
				return false
		return true
	return actual == expected
