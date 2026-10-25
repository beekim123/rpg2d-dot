# Godot 原生主工程

使用 Godot 4.7.2、GDScript、Compatibility 渲染和单线程 Web 导出。入口为 [`project.godot`](project.godot)。G0 已有地图/按格移动/碰撞/待机；完整探索与战斗按 [迁移计划](../docs/plan/godot-migration.md) 继续。

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
