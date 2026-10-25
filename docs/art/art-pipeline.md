# 美术管线：用代码画，存成 PNG

用户要求【定】：**所有图片都由代码绘制，导出成 PNG 保存在仓库里，游戏读取这些 PNG。不调用任何图片生成模型，不使用外部图片素材。**

这套管线参考 ele-pushbox-arts（<https://github.com/beekim123/ele-pushbox-arts>）的做法：像素源数据用文字保存、工具导出 PNG 和清单、哈希校验、HTML 工作台预览。那个仓库的代码是 MIT，可以参考或改写（保留署名），尤其是它的 `tools/lib/png.mjs`（零依赖 PNG 编码）和 `docs/design/art-pipeline.md`。**它的美术素材和角色不能用。**

以下是推荐的做法【建议】，开发者可以按需要简化或改进，但要保留"源数据 → 构建 → PNG + 清单 → 校验"这条链。

## 1 原则

1. **源数据是唯一真相**。PNG 是构建产物，可以随时从源数据重新生成，生成结果逐字节一致（确定性）。
2. **PNG 要提交进仓库**，这样游戏不需要先构建美术就能运行，用户也能直接看图。
3. **清单驱动**：游戏只通过清单（manifest）找素材，不在代码里写死图片路径和帧数。
4. **一切可检查**：调色板、尺寸、锚点、动画帧都由工具自动检查。

## 2 目录【建议】

| 路径 | 内容 |
|---|---|
| `resources/art/palette.json` | 主调色板：字符 → 颜色、名字、色带 |
| `resources/art/source/<分类>/<id>.json` | 像素精灵源数据（字符画） |
| `resources/art/source/<分类>/<id>.mjs` | 程序化素材（导出一个绘制函数） |
| `resources/art/lib/` | 绘图工具库（见第 4 节） |
| `resources/art/export/` | 构建输出：PNG 图集和 `manifest.json` |
| `resources/art/export/sheets/` | 对照表（审图用，可以不进游戏） |
| `tools/resources/art.mjs` | `build` / `verify` / `sheet` 命令 |
| `reference/web/workbench/` | HTML 工作台 |

## 3 三种源数据

### 3.1 字符画精灵（适合人物、伴星、敌人、图标）

```json
{
  "format": "astra.art/1",
  "id": "char.finn",
  "kind": "pixel",
  "category": "character",
  "size": [16, 24],
  "anchor": [8, 24],
  "animations": {
    "idle_down": { "fps": 4, "loop": true, "frames": [0, 1] },
    "walk_down": { "fps": 8, "loop": true, "frames": [2, 3, 4, 5] }
  },
  "frames": [
    ["....aaaa........", "...a....a......."]
  ]
}
```

每帧是一组字符串，每个字符对应调色板里的一个颜色，`.` 是透明。

### 3.2 程序化素材（适合地形、建筑、特效、界面、插画）

一个 `.mjs` 文件导出绘制函数，接收画布、参数和固定种子，用绘图工具库画出来：

```js
export const meta = { id: 'tile.redsand.ground', kind: 'procedural', size: [16, 16], frames: 1 };
export function draw(g, { seed }) {
  g.fill('sand3');
  g.speckle({ color: 'sand4', density: 0.08, cluster: 3, seed });
  g.speckle({ color: 'sand1', density: 0.02, seed: seed + 1 });
}
```

- **不能用 `Math.random()`**，只能用带种子的伪随机数（例如 mulberry32）或坐标哈希。
- 不能读取外部图片文件。

### 3.3 组合素材（适合路人、换装、伴星进阶）

由多个部件精灵按图层叠起来，再统一描边、换色。例如路人 = 身体 + 衣服 + 发型 + 头饰，各选一个，配一套换色表。

## 4 绘图工具库【建议】

开发者自己写一个小型像素绘图库，所有操作都是整数坐标、只用调色板颜色：

- 基础：`px` 点、`rect` 矩形、`line`（Bresenham）、`ellipse`、`polygon` 填充、`stamp` 盖章（把另一个精灵画上来）
- 像素风专用：
  - `outline(color)`：沿不透明区域外圈自动描边
  - `shade(region, ramp)`：按光照方向（左上）给一块区域上明暗
  - `speckle`：成簇的斑点纹理
  - `dither(pattern)`：Bayer 网点
  - `mirror`：左右镜像（侧面行走共用）
  - `recolor(map)`：换色（变体、夜晚、受击闪白）
  - `selout`：选择性描边（外圈用深色，内部线条用本色的暗一阶）
- 地形：自动拼接（根据相邻格选择过渡形状）、花边过渡、位置哈希散布

有了这个库，可以把"画一个人物"拆成"画头 → 画身体 → 自动描边 → 自动上明暗 → 局部手工修整"，既快又统一。**关键角色和伴星仍然建议逐像素写字符画**，质量更可控；程序化方法主要用在地形、建筑、特效和批量路人上。

## 5 构建与清单

```sh
node tools/resources/art.mjs build    # 所有源数据 → resources/art/export/*.png + manifest.json
node tools/resources/art.mjs verify   # 重新绘制并与 PNG 逐字节比较；检查调色板、尺寸、锚点、动画
node tools/resources/art.mjs sheet    # 生成对照表到 resources/art/export/sheets/
```

`manifest.json` 中每个素材记录：`id`、PNG 文件、在图集中的位置、帧大小、锚点、动画（帧序号、fps、是否循环）、九宫格边距（界面面板）、内容哈希。

精灵图集可以按分类打包（每类一张大图），也可以每个素材一张横条图，由开发者决定。

## 6 校验

`verify` 至少检查：
- PNG 和源数据重新绘制的结果逐字节一致
- 没有调色板以外的颜色
- 帧尺寸、锚点合法；动画引用的帧存在
- 游戏数据里引用的每个素材 id 都在清单中存在（没有缺图）
- 没有未被引用的孤立素材（警告即可）

这些检查放进测试，提交前必须通过。

## 7 工作台

`reference/web/workbench/index.html`：素材工作台入口，通过 `npm run reference:dev` 的 `/workbench/` 打开，用来看和检查美术：

- **素材库**：按分类、区域筛选，点开看大图（整数倍放大）和动画播放
- **场景预览**：把图块、建筑、人物摆成一张 480×270 的模拟画面，检查放在一起的效果
- **调色板**：所有颜色、色带和使用次数
- **伴星图鉴**：每颗伴星各星阶的精灵、名片和星图
- **声音**：试听所有音乐和音效（见 [audio-direction.md](../audio/audio-direction.md)）
- **文档**：阅读 `docs/` 里的设计文档

工作台从小做起，先有素材库和动画预览，其余的按需要加。

## 8 审图流程

开发者每做完一批美术：
1. 运行 `build`、`verify`、`sheet`。
2. **自己看图**：如果运行环境能查看图片，就打开对照表和游戏截图逐条对照 [art-direction.md](art-direction.md) 第 10 节的自查清单；不能看图时，至少用脚本检查对比度、调色板和尺寸。
3. 发现问题就改源数据，重新构建。
4. 在 `docs/plan/progress.md` 记录这批素材，并附上对照表的路径。

用户可以随时在工作台里看图，把意见写进 `docs/plan/questions.md` 或直接在对话里告诉开发者。用户的美术意见优先于本文档中的【建议】。

## 9 字体

用 Fusion Pixel（OFL-1.1），从 ele-pushbox-arts 的 `third_party/fonts/` 拷贝字体文件和**全部许可证文件**到本仓库 `third_party/fonts/`。游戏里用浏览器字体渲染加整数缩放，或者把需要的字形烘焙成位图字体（开发者决定）。不管哪种方式，都要保证文字像素清晰、没有抗锯齿。
