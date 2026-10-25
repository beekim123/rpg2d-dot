# 技术方向

本文全部是【建议】，开发者可以按自己的判断调整。但下面几条是【定】：
- 游戏要能在浏览器里直接玩，用户不需要装特殊软件就能试玩（如果选别的引擎，也要能导出网页版）。
- 游戏逻辑和渲染分离，战斗逻辑是确定性的（见 [05-combat.md](../design/05-combat.md) 第 17 节）。
- 有一个**自动通关测试**，能证明游戏从头到尾可以打通（第 6 节）。
- 美术和声音走 [art-pipeline.md](../art/art-pipeline.md) 和 [audio-direction.md](../audio/audio-direction.md) 的管线。
- 运行时不访问网络。

## 当前实施路线（2026-10-25用户校准）

后续主工程改为 **Godot 4.7.2 + GDScript + Compatibility**，入口为 `godot/project.godot`，同时保持原生运行与Web单线程导出。版本已通过用户放入的编辑器实际确认；Godot运行/导出验收单独记录，不能沿用网页M0/M1的通过状态。

详细顺序与复用/重写边界见 [Godot迁移计划](../plan/godot-migration.md)。现有TypeScript/Canvas只保留作原型和确定性测试参考；不继续增加网页专用游戏功能。PNG/源数据/地图/文本/合成音源继续复用，场景/HUD/输入/播放服务改为Godot原生实现。

## 1 原始网页原型技术栈（历史选择）

| 项 | 推荐 | 理由 |
|---|---|---|
| 语言 | TypeScript（严格模式） | 类型帮助大型项目长期维护 |
| 构建 | Vite | 快、简单，可以直接输出静态网页 |
| 渲染 | Canvas 2D，在 480×270 的离屏画布上画，再整数倍放大到屏幕 | 像素游戏不需要 WebGL；最近邻放大最简单 |
| 引擎 | 不用大型游戏引擎，自己写一个小框架 | 回合制 RPG 需要的功能不多，自己写更可控，测试也更容易 |
| 测试 | Vitest（逻辑）+ Playwright（截图和冒烟测试） | — |
| 工具脚本 | Node 20+，`.mjs` 或 TS | 美术和声音构建、内容检查 |
| 发布 | GitHub Actions 构建，部署到 GitHub Pages（用户需在仓库设置里开启 Pages） | 用户打开网址就能玩 |

可以考虑的替代方案：Godot 4（用户的另一个项目用过，可以导出网页版）。如果选它，开发者要先确认能在命令行里无界面运行测试和导出，再决定。

## 2 目录结构

```
/
├─ AGENTS.md                 开发者工作规则
├─ README.md                 项目简介、怎么运行
├─ docs/                     设计文档（本目录）
├─ src/
│  ├─ core/                  主循环、时间、输入、场景栈、存档、随机数（带种子）
│  ├─ render/                画布、精灵、图集、地图绘制、文字、调色板换色、特效
│  ├─ audio/                 合成引擎、播放器
│  ├─ scenes/                标题、地图、战斗、菜单、修行、剧情、结局……
│  ├─ systems/               对话、剧情脚本解释器、任务、商店、成长、羁绊
│  ├─ battle/                战斗引擎（纯逻辑）、AI、法则模块、伤害计算
│  ├─ ui/                    界面组件（面板、列表、光标、对话框）
│  └─ debug/                 调试菜单、调试网址参数
├─ content/
│  ├─ data/                  数据表：伴星、技能、敌人、道具、星饰、商店、修行、数值平衡
│  ├─ maps/                  地图
│  ├─ story/                 剧情脚本
│  └─ i18n/                  多语言文字表
├─ art/                      美术源数据和导出（见美术管线）
├─ audio/                    声音源数据
├─ tools/                    构建、校验、内容检查、平衡模拟
├─ tests/                    测试
├─ workbench/                HTML 工作台
└─ third_party/              字体等第三方文件和许可证
```

## 3 运行时架构

- **主循环**：固定 60 Hz 逻辑更新 + 渲染。所有动画按帧计时，不依赖真实时间的抖动。
- **场景栈**：标题 → 地图 → （战斗 / 菜单 / 对话 / 修行压在地图上面）。
- **输入**：把键盘、手柄、鼠标统一抽象成"动作"（确认、取消、上下左右、菜单……）。
- **游戏状态**：一个可序列化的大对象（剧情变量、队伍、背包、位置、已开宝箱……）。存档就是把它保存下来。
- **素材**：启动时读取美术清单，按需加载图集。
- **逻辑与表现分离**：
  - 战斗：`battle/` 是纯函数式的状态机，输出事件列表；`scenes/battle` 负责把事件播成动画。
  - 剧情：脚本解释器产出指令，地图场景负责执行演出。
  - 这样逻辑层可以在 Node 里单独跑（测试、平衡模拟、自动通关）。

## 4 数据格式

### 4.1 地图

用文本画地图，方便直接编写和修改。示例：

```
# content/maps/lantern_vale/town.map
tileset: lantern_vale
size: 40x30
layer ground:
  gggggggggggssssssggggggggg...
  ggfffgggggsssssssgggwwwwgg...
legend:
  g: grass   s: dirt_path   f: flowers   w: water
entities:
  - { type: npc, id: brio, at: [12, 8], script: brio_talk }
  - { type: lamppost, id: lv_lamp_1, at: [20, 15] }
  - { type: door, at: [5, 6], to: finn_house@3,7 }
  - { type: enemy, id: faux_sword, at: [30, 20], patrol: [[30,20],[34,20]], arena: [26,16,10,7] }
```

具体格式由开发者决定，可以是 YAML、JSON 或者自定义格式。要求：能用文字编辑、能被工具检查、能看出地图的样子。

### 4.2 剧情脚本

建议用简单的文本脚本，对话直接写中文，工具负责抽取成多语言表。示例：

```
# content/story/prologue/awakening.story
@scene prologue_awakening
music stop
fx freeze
say 芬恩[决意] ……灯，是不会自己亮的。
say 芬恩[决意] 所以——
fx flash white
say 芬恩[怒吼] 由我来点亮！！
astral_card finn.morning_star
battle prologue_shade on_win:prologue_after on_lose:prologue_after
flag set prologue.awakened
```

脚本解释器至少支持：对话和选项、角色移动和表情、镜头、音乐音效、剧情变量的读写和条件分支、战斗、物品、入队离队、静帧插画（完整列表见 [07-exploration.md](../design/07-exploration.md) 第 10 节）。

### 4.3 数据表

伴星、技能、敌人、道具、星饰、商店、修行、平衡参数都写在 `content/data/`。每个表有 TypeScript 类型定义和校验，`tools/content-check` 检查所有引用的 id 都存在。

### 4.4 多语言

所有给玩家看的文字都走多语言表（`content/i18n/zh-Hans/`）。剧情脚本里的中文由工具抽取，每句话有稳定的 id，以后加英文时按 id 翻译。

## 5 调试工具

开发版里要有：
- 调试网址参数，例如 `?map=redsand.town&at=10,5`、`?battle=ch1_gold`、`?flags=ch1.done`，可以直接跳到任何地方。
- 调试菜单：传送、改剧情变量、给道具、调等级、开关无敌、显示格子坐标和碰撞。
- 战斗沙盒：任选队伍和敌人开战。

## 6 测试【定】

| 测试 | 内容 |
|---|---|
| 单元测试 | 伤害公式、时间轴、星绳、击退碰撞、每条 Boss 法则、AI 的确定性、存档迁移、脚本解析 |
| 内容检查 | 所有 id 引用存在；剧情里的说话人都有头像；每张地图的出口两边对得上；每个宝箱有内容；地图从入口能走到所有必经点；多语言表没有缺失 |
| 美术 / 声音校验 | `art verify`、音频确定性和响度检查 |
| 截图测试 | Playwright 打开各个调试网址，截图存档，供开发者自己检查画面 |
| **自动通关** | 在 Node 里只用逻辑层，按一份"通关路线"执行：移动到剧情点、触发剧情、用自动战斗 AI 打完每一场必打的战斗、修行到需要的程度，最后检查结局剧情变量被设置。每加一章，就把这一章加进通关路线 |
| 平衡模拟 | 让标准队伍和各章敌人批量对战，输出回合数、胜率、伤害曲线，发现数值异常 |

每次提交前，单元测试、内容检查、美术校验必须通过。自动通关在每个里程碑结束前必须通过。

## 7 持续集成与发布

- GitHub Actions：安装依赖 → 类型检查 → 测试 → 内容检查 → 美术校验 → 构建。
- 主分支构建成功后部署到 GitHub Pages（需要用户在仓库设置中开启 Pages）。
- README 里写清楚本地运行方法（例如 `npm install && npm run dev`）和在线试玩地址。

## 8 性能

- 中等笔记本上稳定 60 fps。
- 首次加载 3 秒内进入标题画面；声音可以在后台渲染，先播放短音效。
- 存档读写不超过 100 毫秒。

## 9 依赖规则

- 只用小而常见、许可证宽松（MIT / Apache / BSD / OFL）的依赖，并在 `third_party/README.md` 记录。
- 不加入运行时网络请求、统计、广告。
- 不提交密钥、本机路径和大文件（单个文件超过 2 MB 要先想办法）。

## M0 已采用的实现（2026-10-25）

- 采用 TypeScript 严格模式、Vite 8、Vitest 5、Playwright；运行 Node 22.12+，CI Node 24。测试 maxWorkers=1，文件顺序执行。
- 地图使用 JSON 的字符串行与实体表，便于检查与迁移；剧情 v0 使用带稳定文字 ID 的 JSON 指令（say/set/if/move/end）。
- 存档 v1 显式校验结构、实体布局、可达性，支持 v0 迁移；不可导入将必经NPC藏进建筑的状态。
- 模块边界、具体任务见 `../plan/m0-implementation.md`。M0只验证探索循环；战斗截图在M0不适用，M1补入。
- 美术PNG与字体跟随静态发行包，运行时仅请求同源包内资源；“不访问网络”按不依赖外部服务解释，不阻止浏览器加载游戏自己的静态文件。

- 2026-10-25：通过 `tools/run.mjs` 启动开发/构建/类型/测试工具，固定本机数值库、Rust构建和Node工作线程为1；Vitest/Playwright仍只开1测试worker。全机预算仍由开发代理在启动前核对，不按CPU核数扩并行。
