# 伴星 ASTRA（暂定名）

> 每个人心里，都有一颗会醒来的星。

2D 俯视角像素风回合制 RPG。三百年前天上最亮的星碎裂坠落，从此任何人都可能觉醒属于自己的"伴星"，一个由灵魂化成的战斗化身。你是一个刚觉醒的点灯人学徒，为了夺回姐姐被偷走的伴星踏上旅途。

- 本体 + 伴星的格子回合制战斗：保护本体、控制星距、看破敌人伴星的隐藏法则
- 修行小游戏、星轨技能树、星阶进阶：看着自己的伴星一点点变强
- 序章 + 7 章 + 终章的完整故事
- 美术全部由代码绘制，音乐音效全部由代码合成

## 当前状态

**M0 地基已可玩**：标题、灯谷测试地图、四向移动、对话、点灯、三手动存档位与自动存档、文件导入导出、调试菜单、原创合成声音和美术工作台。当前是制作基础，尚未包含战斗或正式序章。

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
- F2 打开格子/碰撞、出生点传送与重置调试菜单。
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

`check` 顺序执行类型、逻辑单测、美术单测、内容引用与可达性、美术重绘、声音数值、自动路线、静态构建。所有测试单 worker。本机已有 Chrome 时可用 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`，无需另下载浏览器。

`npm run build` 输出到 `dist/`，`npm run preview` 预览生产版本。游戏只加载随发行包提供的本地资源，无外部服务、统计或网络依赖。字体及全套许可证随构建打包。

截图在 [`docs/plan/screenshots/`](docs/plan/screenshots/)，美术表在 [`art/export/sheets/`](art/export/sheets/)。当前声音只完成技术检验，正式乐曲和主观听审属于后续制作。

GitHub Actions 检查代码并保留静态构建产物；在线 Pages 尚未开启，不将仓库地址当成已上线试玩地址。
