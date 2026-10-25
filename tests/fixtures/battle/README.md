# 共享战斗回放

`math.json` 是冻结TypeScript参考实现的可重复导出，供Node与Godot共用；不是游戏内容或存档。记录参考源SHA-256、平衡表、独立调用（输入/期望输出）和连续共享HP初态/命令/期望状态。后续战斗引擎回放另存定义、指令及每步完整状态/有序事件。

- `npm run battle:fixtures:verify` 只读重算比较；CI不能自动刷新期望。
- `npm run battle:fixtures:write` 显式刷新。修改参考或平衡后必须审查差异；不能为了让原生测试通过而随意改期望。
- `npm run godot:test:battle` 运行原生对照。JSON整数在Godot解析为float，比较器递归按数值精确比较，字段/类型/数组顺序严格检查；只有星距系数允许1e-12误差。最终伤害、HP与行动tick不允许误差。
- NaN/Infinity无法无损表示成JSON，因此额外放在原生边界测试。数值与状态仍遵守JS安全整数上限，避免未来Web/原生存档和重放发生漂移。

当前只完成G2a数学技术检查；这些回放不意味着原生战斗场景或完整序章完成。
