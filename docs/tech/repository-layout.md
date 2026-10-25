# 仓库目录与资源管理

更新：2026-10-25。Godot 是后续游戏主工程，原网页实现保留作可运行参考与回放对照。

```text
rpg-astra/
├─ AGENTS.md / README.md / package.json
├─ Godot.app/                   本机编辑器；忽略，不提交
├─ godot/                       Godot 原生主工程
│  ├─ project.godot / export_presets.cfg
│  ├─ scenes/                   场景与原生UI
│  ├─ scripts/battle/           确定性战斗数学、状态与格子规则；不依赖场景或素材
│  ├─ scripts/world/            探索表现、格子角色
│  ├─ scripts/resources/        唯一资源访问服务
│  ├─ resource-pack.json        自动生成的资源索引与哈希
│  ├─ resources/                自动同步的资源包副本，禁止手工修改
│  ├─ data/                     自动同步的内容副本，禁止手工修改
│  ├─ resource-pack.json        资源入口、受管理文件与内容哈希
│  └─ tests/                    Godot运行时测试
├─ resources/                   第一方美术与声音的唯一制作源
│  ├─ art/{source,lib,palette.json,export}
│  └─ audio/                    确定性合成器、曲谱和说明
├─ content/{data,maps,story,i18n} 游戏内容数据与文字
├─ third_party/fonts/           OFL字体及完整许可证（唯一允许的外部美术类资源）
├─ reference/web/               冻结的TypeScript/Canvas原型
│  ├─ src/ / index.html
│  └─ README.md
├─ workbench/                   独立HTML素材展示器，不依赖游戏源码
├─ tools/
│  ├─ resources/                美术/声音构建校验、Godot资源包同步
│  ├─ workbench/                同源资源打包与独立HTML预览
│  ├─ godot/                    引擎启动、模板安装、导出预览
│  ├─ qa/                       内容检查与参考自动路线
│  ├─ lib/                      工具共同路径定义
│  └─ run.mjs                   单worker工具启动器
├─ tests/
│  ├─ fixtures/battle/           跨运行时共享回放，显式生成/只读校验
│  ├─ resources/                独立资源管线测试
│  ├─ reference/                旧网页逻辑与浏览器回归
│  └─ godot-web/                Godot导出网页版验收
├─ config/                      TypeScript/Vite/Vitest/Playwright配置
├─ docs/                        设计、计划、进度；docs/v2/status.md为交接入口
├─ artifacts/screenshots/       可分享的验证截图/录制
├─ build/{godot-web,reference-web,asset-workbench} 导出产物；忽略，不提交
└─ .local/                      本地参考、缓存与迁移备份；忽略，不提交
```

## 单向依赖

资源制作源 → 构建与校验 → 资源包清单 → Godot资源服务 → 表现层。

游戏规则只依赖内容数据和状态，不依赖PNG路径、画布、绘图脚本或音频播放器。表现层通过语义ID（如`char.finn`）请求资源。只有资源服务了解包内物理路径；应用图标等引擎启动配置是有记录的入口例外。

- 改美术：编辑`resources/art/source/`，重新构建、校验、分页审图，再同步Godot包。
- 改声音：编辑`resources/audio/`，执行确定性/峰值/RMS/接缝检查，再生成引擎资源。
- 改剧情/地图/数值：编辑`content/`，通过引用、入口出口、可达性与回放检查。
- 改游戏：编辑`godot/scenes/`、`godot/scripts/`；不改自动同步副本来修资源。
- 原网页只用于对照与回归，命令使用`reference:*`前缀；新增章节只进入Godot。

## 包管理与生成文件

源数据、可重复生成的PNG及必要导入设置保留在Git；编辑器、模板、`.godot`缓存和导出包不提交。所有文件仍遵守单文件2MB上限。

同步器维护受管理文件索引与内容哈希，验证Godot副本与源一致。清理只触及索引拥有的旧生成文件，不删除用户未登记文件。字体复制时连同完整许可。资源变化不得要求修改战斗规则。

`docs/plan/screenshots`保留相对兼容链接，供历史聊天里的图片地址继续使用；新记录和工具统一写`artifacts/screenshots`。

## 校验入口

- `npm run check`：类型、参考逻辑、独立资源、内容、回放及Godot资源/原生测试。
- `npm run build`：Godot Web导出；产物在`build/godot-web/`。
- `npm run godot:test:web`：实际Godot导出网页的键盘与画面验收。
- `npm run reference:build` / `npm run reference:test:web`：冻结原型对照。

目录移动不改变游戏数据ID、状态规则或素材像素；迁移后必须重新验证路径、同步、Godot启动和两套Web构建。

## 独立HTML资源展示（2026-10-25用户纠正）

素材工作台从reference/web抽离到workbench；它是持续维护的工具。制作源→PNG/清单→Godot受管包与工作台展示包，两者在构建时逐字节核对。HTML运行时没有游戏源码依赖；导出的单个index.html内嵌PNG、清单、字体/许可及合成器，可搬到仓库外双击打开或独立托管。旧网页仅保留兼容访问入口，不再拥有工作台实现。具体契约见../../workbench/README.md。

### 主线内容分包（G4a）

`content/registry.json`的`cinematics`登记独立主线分段文件，`locale_bundles`按语言登记增量文字表；与旧`stories`命令数组分开。同步器保留原始文件字节、拒绝越界路径和重复文字键，旧`ui.json`受管路径不变。Godot的AssetCatalog合并语言表、按语义ID提供主线副本，PrologueContent校验11场顺序、分段、文字/头像和跳过摘要；阶段推进不放在内容加载器。
