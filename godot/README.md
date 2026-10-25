# Godot 原生主工程

使用 Godot 4.7.2、GDScript、Compatibility 渲染和单线程 Web 导出。入口为 [`project.godot`](project.godot)。G0/G1探索技术检查点已完成，G2战斗纯规则正在移植；完整战斗与序章按 [迁移计划](../docs/plan/godot-migration.md) 继续。

| 路径 | 职责与修改方式 |
|---|---|
| `scenes/` | 原生节点、场景组合、Control 布局 |
| `scripts/world/` | 探索场景和格子角色；通过资源服务使用素材 |
| `scripts/resources/` | 资源包访问服务，集中解析 ID、图集、字体和内容路径 |
| `resources/`、`data/`、`resource-pack.json` | 工具生成的受管理副本与哈希索引；不可手工修改 |
| `tests/` | 直接运行 Godot 的行为/资源检查 |
| `export_presets.cfg` | Web 导出设置；产物写 `../build/godot-web/` |

从仓库根目录执行：

```sh
npm run godot:sync
npm run godot:verify
npm run godot:import
npm test
npm run dev
```

`npm run godot:editor` 打开编辑器；`npm run build` 导出 Web，`npm run godot:test:web` 验证实际导出网页。`.godot/` 是可重建缓存，编辑器和导出包不提交。

制作资源请回到 [`resources/`](../resources/README.md)，改地图与文本请回到 [`content/`](../content/README.md)。规则层应只处理状态和内容 ID；素材物理路径集中在资源服务，应用图标等引擎启动配置属于记录在案的入口例外。

G1a已接入家、镇、灯铺、面包房、麦田路的双向出口；默认从芬恩家开始。`scripts/world/world_data.gd`只处理地图、碰撞、显隐和旅行规则，不依赖Node或资源路径；`world.gd`负责表现，`AssetCatalog`负责资源。`tests/world/`覆盖规则和真实场景完整旅行。

G2a的 `scripts/battle/battle_math.gd` 以RefCounted实现伤害、星距、共享HP及时间轴数学。先用 `configure(balance)` 注入内容数值，调用返回 `{ok,value}` 或 `{ok:false,error}`；失败不修改输入。共享测试数据在根目录 `tests/fixtures/battle/`，不复制进游戏资源包；运行 `npm run godot:test:battle`。G2后续移动/技能/意图尚在迁移中，战斗UI在G3接入。

G2b新增 `battle_engine.gd` 的状态事务和 `battle_grid.gd` 的稳定有界搜索。先 `configure(balance, skill_ids)`，再 `create_battle(definition)`；`apply_command(state, command)` 返回 `{ok,state,events}`，`reachable_moves(state, unit)` 为只读预览。已支持两单位移动/撤销/显现/收回/待机；攻击技能、固定意图与完整两战在G2c–G2e接入。规则仍未挂接探索场景，不会改变探索存档。

G2c/G2d/G2e1已接入纯规则：`BattleSkills`消费完整技能包，`BattleEffects`结算技能/灯印/碰撞，`BattleAI`固定规划及真实结算预报，`BattleEncounter`隔离玩家命令与敌人执行。`BattleSession`提供私有初态、动作提交、快照和失败后重试，适合G3场景接入。`npm run godot:test:battle`覆盖全部五组战斗检查。两场序章技术候选均已用正常指令打赢、真实失败并重试再赢；无星芬恩辅助/G3画面/G4完整序章仍待完成。
