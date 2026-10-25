# 伴星 ASTRA（暂定名）

> 每个人心里，都有一颗会醒来的星。

2D 俯视角像素风回合制 RPG。三百年前天上最亮的星碎裂坠落，从此任何人都可能觉醒属于自己的"伴星"，一个由灵魂化成的战斗化身。你是一个刚觉醒的点灯人学徒，为了夺回姐姐被偷走的伴星踏上旅途。

- 本体 + 伴星的格子回合制战斗：保护本体、控制星距、看破敌人伴星的隐藏法则
- 修行小游戏、星轨技能树、星阶进阶：看着自己的伴星一点点变强
- 序章 + 7 章 + 终章的完整故事
- 美术全部由代码绘制，音乐音效全部由代码合成

## 当前主工程：Godot

后续开发已切换到 Godot 4.7.2，入口为 [`godot/project.godot`](godot/project.godot)。原生G0场景已通过117项检查与Web移动/碰撞验收；战斗、对话、存档还在迁移前阶段。计划见 [`Godot迁移计划`](docs/plan/godot-migration.md)。

```sh
npm run godot:sync
npm run godot:import
npm run godot:run
```

`npm run godot:export:web` 导出，`npm run godot:serve` 预览；编辑器和模板不提交。

## 网页参考实现（历史进度）

**M0 地基已可玩**：标题、灯谷测试地图、四向移动、对话、点灯、三手动存档位与自动存档、文件导入导出、调试菜单、原创合成声音和美术工作台。人物有呼吸/眨眼/围巾轻摆，树木、花和灌木随风轻摆，灯火跳动。现在增加了可操作的两场战斗候选：双单位移动、星绳、技能、公开意图、重试及完整动作反馈。正式序章剧情尚未接完。

设计文档见 [`docs/`](docs/README.md)，规则见 [`AGENTS.md`](AGENTS.md)，进度与下一步见 [`docs/plan/progress.md`](docs/plan/progress.md)、[`docs/v2/status.md`](docs/v2/status.md)。

## 运行与操作

需要 Node.js 22.12+（已在 Node 24 验证）。

```sh
npm ci
npm run dev
```

打开终端给出的本机网址；素材工作台位于同一网址的 `/workbench/`。

- 方向键 / WASD 移动，Shift 跑步，Z / 空格 / 回车交互。
- C / Tab 打开菜单，X / Esc 返回。靠近点亮的灯柱可以手动存档；交互点灯时自动存档。
- F2 打开格子/碰撞、传送、重置以及两场战斗演练入口。
- 战斗也可用 `?battle=prologue_ella` 或 `?battle=prologue_shade` 直达；直达入口保留原有自动存档。
- 战斗中 Z 确定、X 返回/撤销、C 切换1×/2×/即时动画，鼠标可点指令与格子。
- 调试入口：`?map=lantern.test&at=10,12`。非法地图/障碍坐标安全回退。
- 第一次按键后启动声音；菜单可静音，后台页面暂停声音与绘制。

## 制作与检查

```sh
npm run art:build
npm run art:verify
npm run art:sheet
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` 顺序执行类型、逻辑单测、美术单测、内容引用与可达性、美术重绘、声音数值、自动路线、静态构建。所有测试单 worker；项目工具启动器还固定构建/数值库线程为1。本机已有 Chrome 时可用 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`，无需另下载浏览器。

`npm run build` 输出到 `dist/`，`npm run preview` 预览生产版本。游戏只加载随发行包提供的本地资源，无外部服务、统计或网络依赖。字体及全套许可证随构建打包。

截图在 [`docs/plan/screenshots/`](docs/plan/screenshots/)，美术表在 [`art/export/sheets/`](art/export/sheets/)。当前声音只完成技术检验，正式乐曲和主观听审属于后续制作。

GitHub Actions 检查代码并保留静态构建产物；在线 Pages 尚未开启，不将仓库地址当成已上线试玩地址。

场景待机动态预览见 [`scene-idle.gif`](docs/plan/screenshots/scene-idle.gif)。重录预览：`ASTRA_CAPTURE_IDLE=1 npm run test:e2e`，再用可选的Pillow运行 `python3 tools/idle-preview.py`；这只处理本项目实景QA帧，不引入外部素材。

战斗重设计说明与来源见 [`battle-presentation-redesign.md`](docs/plan/battle-presentation-redesign.md)，动态片段见 [`battle-redesign.gif`](docs/plan/screenshots/battle-redesign.gif)。
