# 《伴星 ASTRA》设计文档目录

> 暂定名。2D 俯视角像素风回合制 RPG：在一个"人人都可能觉醒伴星"的奇幻世界里，带着自己的伴星旅行、战斗、修行和成长。

本目录是给开发者（GPT）的**需求与方向**，不是逐条执行的施工图。文档里的内容分三种强度：

| 标记 | 含义 | 开发者能做什么 |
|---|---|---|
| 【定】 | 核心支柱，决定这是不是"这个游戏" | 不改。确实做不下去时，写进 `plan/questions.md` 说明原因和替代方案，继续按最接近的方案做 |
| 【建议】 | 推荐的方向、数值、做法 | 可以改。改了要在对应文档里更新，并在 `plan/progress.md` 写一句为什么 |
| 【留白】 | 有意没写细，交给开发者发挥 | 自己设计、自己补进文档 |

没有标记的内容默认按【建议】处理。

## 阅读顺序

先读 1–3 了解"做什么"，再按要做的系统读对应文档。

| # | 文档 | 内容 |
|---|---|---|
| 0 | [00-vision.md](00-vision.md) | 愿景、设计支柱、目标体验、范围与不做的事 |
| 1 | [design/01-world.md](design/01-world.md) | 世界观：阿斯特拉大陆、星落之夜、伴星七法则、势力、地理、年表、术语表 |
| 2 | [design/02-story.md](design/02-story.md) | 主线故事：序章到终章的分章节剧情、关键转折、结局、支线故事库、文风 |
| 3 | [design/03-characters.md](design/03-characters.md) | 角色：主角团、反派、配角的性格、外观、伴星与成长弧 |
| 4 | [design/04-astrals.md](design/04-astrals.md) | 伴星系统：六维星图、伴星类型、星阶、能力设计规范、全部伴星档案 |
| 5 | [design/05-combat.md](design/05-combat.md) | 回合制战斗：星域、本体与伴星、时间轴、意图、法则看破、觉悟与连打、双星技 |
| 6 | [design/06-growth.md](design/06-growth.md) | 训练与强化：等级、修行小游戏、星轨、星阶试炼、营火羁绊、装备 |
| 7 | [design/07-exploration.md](design/07-exploration.md) | 探索：地图、移动、场外伴星技能、谜题、遭遇、存档灯柱、任务 |
| 8 | [design/08-content-plan.md](design/08-content-plan.md) | 内容规模与分章清单：地图、敌人、Boss、支线、曲目 |
| 9 | [design/09-ui-ux.md](design/09-ui-ux.md) | 界面与交互：分辨率、字体、画面清单、操作、无障碍 |
| A1 | [art/art-direction.md](art/art-direction.md) | 美术方向：参考图分析、调色板、规格、伴星视觉语言、禁止项 |
| A2 | [art/art-pipeline.md](art/art-pipeline.md) | 代码绘图管线：源数据 → PNG → 清单 → 工作台（参考 ele-pushbox-arts） |
| S1 | [audio/audio-direction.md](audio/audio-direction.md) | 音乐与音效：程序合成、主题动机、曲目表、音效表、规格 |
| T1 | [tech/architecture.md](tech/architecture.md) | 技术方向：Godot主线、历史网页参考、数据格式、测试与自动通关 |
| T2 | [tech/repository-layout.md](tech/repository-layout.md) | 目录职责、资源制作源/受管副本、单向依赖与验证入口 |
| T3 | [tech/save-format.md](tech/save-format.md) | 存档版本、迁移边界、原生与Web存储及失败保护 |
| P1 | [plan/roadmap.md](plan/roadmap.md) | 里程碑（按顺序，不按日期） |
| P2 | [plan/backlog.md](plan/backlog.md) | 任务池（开发者持续维护） |
| P3 | [plan/progress.md](plan/progress.md) | 进度日志（开发者每次提交后追加） |
| P4 | [plan/questions.md](plan/questions.md) | 需要用户拍板的问题（开发者记录，用户回答） |
| P5 | [plan/godot-migration.md](plan/godot-migration.md) | 当前执行顺序：G0原生起步→G4完整序章，再接M2–M9 |
| P6 | [v2/status.md](v2/status.md) | 当前结果、阶段、下一步与执行人 |
| — | [prompts/gpt-kickoff.md](prompts/gpt-kickoff.md) | 给 GPT 的启动 / 续跑 / 自查提示词 |

当前主工程是 `godot/`；资源制作源在 `resources/`，游戏内容在 `content/`，旧网页原型在 `reference/web/`。目录细则见 T2；设计文档本身保留原位置。

仓库根目录的 [`AGENTS.md`](../AGENTS.md) 是开发者每次开工必须遵守的工作规则。

## 外部参考

- 美术风格参考图：`.local/reference/style-ref-01.webp`（第三方截图，**只在本机，已加入 .gitignore，不提交、不复刻**）。风格要点已经用文字写进 [art/art-direction.md](art/art-direction.md) 第 1 节。
- 美术与声音的制作方法参考：<https://github.com/beekim123/ele-pushbox-arts>（同一作者）。可借鉴它的**做法**：像素源数据用文字存、工具导出 PNG、清单与哈希、HTML 工作台、程序合成音效。它的代码是 MIT，可以引用改写并保留署名；它的**美术和角色素材不能拿来用**（CC BY-NC-SA 且角色保留权利）。它 `third_party/fonts/` 里的 Fusion Pixel 字体是 OFL，可以连同许可证一起拷贝使用。
