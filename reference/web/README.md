# TypeScript / Canvas 网页参考

保留原探索原型与两场序章战斗候选，作为 Godot 移植的回放对照。完整序章剧情未接通；后续章节只在 Godot 实施。

从仓库根目录运行：

```sh
npm run reference:dev
npm run reference:build
npm run reference:test
npm run reference:test:web
```

素材工作台已独立到`../../workbench/`（从仓库根看为`workbench/`）；旧`/workbench/`网址仅展示同一工具的构建副本。游戏构建产物写入 `build/reference-web/`。Vite/Vitest/Playwright/TypeScript 配置集中在 `config/`。

- 方向键 / WASD 移动，Shift 跑步，Z / 空格 / 回车交互。
- C / Tab 菜单，X / Esc 返回；灯柱提供手动存档，点灯自动存档。
- F2 调试入口；`?battle=prologue_ella`、`?battle=prologue_shade` 直达候选战斗且保留旧自动存档。
- 战斗 Z 确定、X 返回/撤销、C 切换动画速度，鼠标可以点指令与格子。
- 第一次按键后启用声音；菜单支持静音，后台暂停声音与绘制。

`src/` 保留原型运行逻辑和浏览器适配器；美术从共享清单加载，合成器引用 `resources/audio/synth.ts`，不再复制一套制作源。浏览器公开的 `/art/export/` 是兼容资源路由，不是仓库目录位置。

已有视觉记录：[场景待机](../../artifacts/screenshots/scene-idle.gif)、[战斗候选](../../artifacts/screenshots/battle-redesign.gif)。重录待机使用 `ASTRA_CAPTURE_IDLE=1 npm run reference:test:web`，再运行 `python3 tools/qa/idle-preview.py`（可选 Pillow）。脚本只处理本项目 QA 帧。
