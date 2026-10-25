# Godot 主工程迁移与后续实施计划

> 日期：2026-10-25。依据用户对 Godot 的明确预期校准路线。原 TypeScript/Canvas 实现是网页原型；过去的 M0/M1 记录不等于 Godot 完成进度。

**目标**：以 Godot 原生场景和 GDScript 完成《伴星 ASTRA》，保留浏览器可试玩、纯逻辑确定性、代码美术/合成声音和自动通关要求。
**技术栈**：已实测用户提供的 Godot `4.7.2.stable.official.ed1daf0bf`；GDScript；Compatibility 渲染；Web 单线程导出。
**主工程**：`godot/project.godot`。根目录 `Godot.app` 只是本机编辑器，不提交。后续不再新增 Canvas 专用游戏功能。
**设计依据**：`docs/00-vision.md`、`docs/tech/architecture.md`、`docs/plan/roadmap.md`、`docs/plan/m1-implementation.md`、美术与音频方向。

## 为什么现在转向

最初按设计文档的推荐选择了 TypeScript + Canvas，并未安排随后迁入 Godot。用户现已明确 Godot 预期，且已把编辑器放入仓库根目录。因此从当前工作项开始建立 Godot 主工程，不等待网页序章做完。旧网页保留作可运行参考与测试对照，不继续双线开发章节内容。

## 已有成果如何处理

| 成果 | 处理方式 | 仍需验证 |
|---|---|---|
| 代码绘图源、PNG、清单、角色动画 | 继续作为唯一源，由同步工具复制到 Godot 资源目录并校验字节 | SpriteFrames/AtlasTexture 的帧、锚点、过滤、循环节奏 |
| 地图/角色/技能 JSON、中文文本、剧情草稿 | 复用数据和稳定ID；新五图仍是候选 | Godot 加载、碰撞、出口、阶段显隐和文字布局 |
| 确定性战斗规则与自动路线 | 移植到独立 GDScript 逻辑模块 | 同一初态/指令的状态和事件与参考实现一致 |
| Canvas 场景、HUD、输入和表现队列 | 用 Node2D、TileMapLayer、AnimatedSprite2D、Control、AnimationPlayer 重建 | 原生交互、遮挡、动画时序与性能 |
| 仓库合成器和曲谱 | 保留代码，构建时导出 WAV/适合发行的编码文件 | 导出后响度/循环、Godot播放、Web延迟和混音 |
| 网页存档 | 保留旧文件，支持 JSON 导出/导入迁移 | 字段版本、剧情旗标和物品不能丢失；不假定两个运行时共用存储 |
| 现有 Vitest / 浏览器测试 | 保留作参考和资源检查 | 另外建立 Godot headless 与导出网页版测试，不能把旧测试数字冒充 Godot 测试 |

Godot 工程使用 `godot/resources/` 与 `godot/data/` 的受控副本，源仍在`resources/art/`、`content/`、`resources/audio/`。同步脚本只复制自身管理的文件，不手工维护两份内容；资源同步必须可验证。这样不会让 Godot 扫描根目录的 Node 依赖和编辑器程序。

## G0 · 原生起步与导出链路（技术验证完成）

**产物**：`godot/project.godot`、`godot/scenes/main.tscn`、`godot/scripts/` 下的素材目录/格子角色/地图脚本、`godot/tests/run_smoke.gd`、`tools/resources/sync-godot-assets.mjs`、Web导出预设。

- [x] 从用户放入的编辑器读取真实版本：4.7.2 官方版。
- [x] 将编辑器、`.godot` 缓存和导出目录加入忽略规则。
- [x] 新建 Compatibility 项目，480×270、最近邻和整数像素，关闭默认引擎启动Logo，图标使用仓库原创图片。
- [x] 同步已有PNG/清单/中文表/字体及全套许可证，验证复制字节一致。
- [x] 原生场景能显示一张地图、角色/NPC/植物待机，方向键/WASD按格移动且不能穿过障碍。
- [x] Headless smoke 验证素材、中文字体、合法移动/阻挡和动画标签；日志无解析错误。
- [x] 获取匹配4.7.2的Web模板并执行真实导出；浏览器能进入场景、移动且无加载错误。

本机初查模板不匹配；现已补齐4.7.2 Web模板并真实导出，117项原生检查与Web移动/碰撞实测通过。

示例验证命令（实际执行使用项目工具封装，路径保持相对）：

```sh
node tools/resources/sync-godot-assets.mjs
./Godot.app/Contents/MacOS/Godot --headless --path godot --render-thread safe --editor --import --quit
./Godot.app/Contents/MacOS/Godot --headless --path godot --render-thread safe --script tests/run_smoke.gd
```

**验收边界**：G0只是首个可运行Godot工程，不等同于完整M0或M1。

## G1 · Godot 探索闭环

**产物**：原生地图加载器、玩家/NPC场景、对话Control场景、灯柱/门、存档服务；复用已写的五图JSON候选。

- [x] 接入芬恩家、灯谷镇、灯铺、面包房、麦田路，校验所有出口及安全落点（G1a）。
- [x] 用原生节点播放角色/环境动画，按脚点排序；镜头与像素规则保持一致（G1a）。
- [x] 对话、调查、点灯、3手动+1自动存档、导出导入和旧版本迁移可用（不支持的旧布局明确拒绝，不丢字段）。
- [x] 显隐NPC不会重叠玩家、堵门或造成读档死局。
- [x] 通过“起点→走动→交谈→点灯→切图→存读档”的Godot自动路线和Web实测；后端错误与立即刷新有回归。

## G2 · 战斗逻辑移植与一致性验证

**产物**：`godot/scripts/battle/` 独立于场景树的状态/数值/规则/意图模块，以及 `godot/tests/battle/` 和共享JSON回放夹具。

- [x] G2a：伤害/星距/共享HP与基础时间轴数学；227共享案例、3段HP回放。
- [x] G2b：双单位移动/撤销/显现/收回/待机及时间轴轮转；9段完整状态与事件回放。
- [x] G2c：技能/碰撞/灯印及生命底线，512原生检查。
- [x] G2d/G2e1：固定意图及两战真实胜负/失败重试，576+152原生检查。
- [ ] G2e2：未觉醒芬恩辅助与G2整体技术检查点。
- [x] 用参考实现导出初态、指令、期望状态和事件；Godot逐步重放比较，另外覆盖非法数据边界。
- [x] 定点/锁定计划不因玩家行动暗改，预计扣血反映护盾/收回/落空。
- [ ] 艾拉候选、影匠候选都能合法通关；真实失败后重建、固定重放一致；补未觉醒芬恩的道具辅助。

**不迁移**：JavaScript时间循环、Canvas绘制代码和DOM输入。这些由Godot表现层承担。

## G3 · Godot 原生战斗表现

**产物**：`godot/scenes/battle/` 原地战场、角色/伴星场景、HUD、目标选择、动作播放器、音频服务。

- [ ] 原地图展开战场；用Control容器组织紧凑HUD，直接展示意图与目标预览。
- [ ] AnimationPlayer/AnimatedSprite2D播放起手、命中、受击、收招；事件推进与逻辑时间分离。
- [ ] 共享伤害、星绳、命中停顿、血条、独立音效和动画速度/减弱演出设置可用。
- [ ] 原生窗口与导出网页都用真实键鼠完成两战与重试，逐张看图并录制复核。

## G4 · 完整序章，再接原路线图

- [ ] 在Godot接通既定11节拍、10名镇民、三灯教学、摘星/觉醒、两场战斗与黎明出发。
- [ ] 补场景静帧、伴星名片、正式乐曲与必要菜单；可选面团谜题可重置、可退出。
- [ ] 自动路线从标题走到真实出发变量，覆盖失败重试、分段存读档与剧情跳过边界。
- [ ] 完整试玩记录节奏/时长/问题，达到M1质量门槛才验收；此前网页进度不能替代此验收。
- [ ] 然后按原 `roadmap.md` 继续M2–M9，全部以Godot为主工程。

## 执行约束与当前交接

- 全部美术/声音仍由仓库代码制作，不调用生成模型，不使用外部素材（合规字体除外）。
- 全机并发预算仍适用：默认1计算worker，Godot工作线程限制1，不按CPU核数扩展；启动前核对已有进程。
- 不提交编辑器、模板、`.godot` 缓存、导出包、密钥或单个超过2MB的文件；不删除既有分支、不改写历史。
- 每个可运行增量独立测试/记录/提交；分开记录候选、技术审核、用户验收。
- **当前阶段**：G0与G1探索技术检查点已通过本机及远端Linux CI，`godot-g1`指向`2e1ba07`；完整序章尚未完成。
- **最近下一步/执行人**：当前开发代理按 [G2执行拆分](godot-g2-implementation.md) 建立共享回放及独立GDScript战斗规则。当前无需用户操作。

## 官方依据

- [Godot 4.7.2官方发布页](https://godotengine.org/download/archive/4.7.2-stable/)
- [命令行与headless说明](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)
- [Web导出要求与单线程说明](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)：Web使用Compatibility；本项目选择GDScript与单线程路径。声音优先离线合成为资源，避免默认Web Sample播放对程序式生成的限制。
