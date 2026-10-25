# 测试分层

| 目录 | 验证对象 |
|---|---|
| `resources/` | 绘图/PNG/调色板/动画、分页审图表、合成音频；音频测试也保留旧网页播放器调度回归 |
| `reference/` | 冻结网页原型的确定性规则、存档、剧情、地图等逻辑 |
| `reference/browser/` | 旧网页真实键鼠操作、保存恢复和画面检查 |
| `godot-web/` | 实际 Godot Web 导出加载、按键、碰撞及截图 |
| `godot/tests/`（工程内） | 原生 GDScript 资源与运行时行为检查 |

`npm run check` 顺序运行资源、参考与 Godot 原生检查；`npm test` 指向 Godot 原生测试。`npm run reference:test` 保留 TypeScript 测试入口；`npm run reference:test:web` 与 `npm run godot:test:web` 分别验证两个运行时，不能互相代替。

测试结果必须标明是候选、技术校验还是正式体验验收。截图写入 `artifacts/screenshots/`，临时报告与导出缓存不提交。运行时遵守整机最多两个计算 worker 的共享预算，默认只用一个。

`workbench/`独立验证展示包的资源字节、隔离边界与安全嵌入，并在仓库外通过file://测试真实HTML。
