# 伴星 ASTRA（暂定名）

> 每个人心里，都有一颗会醒来的星。

2D 俯视角像素风回合制 RPG。点灯人学徒芬恩为了夺回姐姐被偷走的伴星，带着自己的伴星踏上旅途。目标是完成序章、七章与终章，以本体保护、星距和敌人能力法则构成战斗核心。所有美术由仓库代码绘制，所有声音由仓库代码合成。

## 当前状态

**Godot 是后续主工程**，入口为 [`godot/project.godot`](godot/project.godot)。已完成G0、G1a及G1b：原生五图、双向门、碰撞、待机动画、室内镜头、中文对话/调查与安全剧情旗标。Godot 战斗、灯柱/存档和完整序章尚未完成；详细顺序见 [Godot 迁移计划](docs/plan/godot-migration.md)。

原 TypeScript/Canvas 原型收进 [`reference/web/`](reference/web/README.md)，保留已完成的探索和两场战斗候选，用于回放对照。它的历史 M0/M1 记录不能代表 Godot 的完成状态。

## 运行 Godot

需要 Node.js 22.13+（本机验证使用 Node 24）和 Godot 4.7.2。可以使用根目录的本机 `Godot.app`、`ASTRA_GODOT_BIN` 指定的编辑器，或 PATH 中的 Godot；编辑器不提交。

```sh
npm ci
npm run godot:sync
npm run godot:import
npm run dev
```

方向键或 WASD 按格移动。`npm run godot:editor` 打开编辑器；目前从芬恩家出发，可经灯谷镇进入灯铺、面包房与麦田路；可面对镇民或家具按Z/空格/回车交互，X快显本句；点灯/存档尚未接入。

```sh
npm run build
npm run godot:serve
```

Web 产物在 `build/godot-web/`，预览地址为 `http://127.0.0.1:8060/`。导出需要与编辑器版本匹配的 Web 模板；本仓提供 `python3 tools/godot/install-web-templates.py` 从官方模板包安装对应 Web 文件。Godot 编辑器、模板、缓存和 Web 导出包均不提交。

## 目录与制作

| 目录 | 职责 |
|---|---|
| [`godot/`](godot/README.md) | 原生场景、GDScript、运行时测试；资源和内容副本由工具同步 |
| [`resources/`](resources/README.md) | 独立美术源、PNG 导出、声音合成器与曲谱 |
| [`content/`](content/README.md) | 地图、角色/技能数据、剧情与多语言文本的唯一制作源 |
| [`reference/web/`](reference/web/README.md) | 冻结的网页原型 |
| [`workbench/`](workbench/README.md) | 独立素材展示器，导出单个可离线HTML，与Godot资源逐字节一致 |
| [`tools/`](tools/README.md)、[`tests/`](tests/README.md)、[`config/`](config/README.md) | 制作工具、分层验证、开发配置 |
| [`docs/`](docs/README.md) | 设计、计划、进度与交接 |
| [`artifacts/screenshots/`](artifacts/screenshots/) | 已检查的游戏截图与动态预览 |
| [`third_party/`](third_party/README.md) | OFL 字体及完整许可、工具依赖说明 |

具体目录边界与修改入口见 [仓库目录与资源管理](docs/tech/repository-layout.md)。美术改 `resources/art/source/`，声音改 `resources/audio/`，游戏改 `godot/scripts/` 和 `godot/scenes/`；不要直接修改 `godot/resources/` 或 `godot/data/` 中的自动同步副本。

```sh
npm run art:build
npm run art:verify
npm run art:sheet
npm run godot:sync
npm run check
npm run build
npm run godot:test:web
```

`check` 顺序检查类型、参考逻辑、资源、内容、自动路线、Godot 资源副本及原生行为；实际 Web 验收单独运行。浏览器测试需要 Playwright Chromium（`npx playwright install chromium`）；本机已有 Chrome 时可以设置 `PLAYWRIGHT_CHANNEL=chrome`。所有计算默认单 worker，启动前仍须遵守整机共享资源预算。

`npm run workbench:dev` 打开独立素材工作台；`npm run workbench:build` 生成 `build/asset-workbench/index.html`，可以把这一个HTML搬走后直接双击使用。展示器不依赖游戏源码，详见 [工作台说明](workbench/README.md)。

资源对照表在 [`resources/art/export/sheets/`](resources/art/export/sheets/)。数值和技术检查通过不代表正式美术、主观听审或用户体验验收。GitHub Actions 保留构建产物；Pages 尚未开启，没有公开试玩部署地址。

工作规则见 [AGENTS.md](AGENTS.md)，最近结果和下一步见 [进度日志](docs/plan/progress.md) 与 [交接状态](docs/v2/status.md)。
