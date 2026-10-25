# ASTRA 原创像素美术管线

所有图像均由本仓库字符源或整数像素代码绘制，未调用生成模型、未使用外部图像、未复制第三方绘图代码。主调色板按 `docs/art/art-direction.md` 的表格保留 49 个不透明颜色，`.` 为隐含透明色。光线来自左上，alpha 只能为 0 或 255。

```sh
node tools/art.mjs build
node tools/art.mjs verify
node tools/art.mjs sheet
node --test --test-concurrency=1 tests/art.test.mjs
```

`source/characters/*.json` 保存每帧完整字符画；程序素材模块导出 `assets: [{meta, draw(canvas, {frame, seed})}]`。程序图像同样接受尺寸、调色板和 alpha 校验。`lib/png.mjs` 使用 Node zlib 编码 RGBA8 PNG，并解码全部五种 PNG 行过滤器；CRC 和解压尺寸都会验证。

`export/manifest.json` 是游戏唯一图像索引。每个 PNG 横向排列等宽帧，第 n 帧的裁切区域为 `[n * size[0], 0, size[0], size[1]]`。`file` 相对于 `art/export/`。`hash` 是 PNG 字节的 SHA-256。`verify` 重新绘制并比较整个清单和全部 PNG 字节，也检查实际解码尺寸、alpha 与调色板。

| ID | 帧大小 | 锚点 | 动画 / 帧 |
|---|---|---|---|
| char.finn | 16×24 | 8,24 | down 0–5；up 6–11；left 12–17；right 18–23 |
| char.hob | 16×24 | 8,24 | idle / idle_down `[0,1]`，2 fps |
| portrait.finn / portrait.hob | 48×48 | 24,48 | idle `[0]` |
| tile.grass | 16×16 | 8,16 | 4 个固定变体：0 纯底、1/2 一个小簇、3 两个小簇；地图宜以约 70% 纯底留白 |
| tile.path | 16×16 | 8,16 | 4 个固定纹理变体，由坐标选择 |
| tile.water | 16×16 | 8,16 | idle `[0,1]`，4 fps |
| tile.bridge | 16×16 | 8,16 | idle `[0]`；横向通行木桥，可连续平铺 |
| tile.edge | 16×16 | 8,16 | 16 个邻接 mask；N=1 E=2 S=4 W=8；置位表示该边邻土；透明叠在草地上 |
| prop.lamp | 16×32 | 8,32 | unlit `[0]`；lit `[1,2]`，4 fps |
| prop.tree | 32×48 | 16,48 | idle `[0]` |
| prop.hedge | 16×16 | 8,16 | idle `[0]`；低矮深绿花边灌木，用于一格高边界 |
| prop.house | 80×80 | 40,80 | idle `[0]`；脚点中心，碰撞由地图另行定义 |
| prop.flower | 16×16 | 8,16 | idle `[0]` |
| prop.shadow | 16×8 | 8,8 | idle `[0]`；草地暗一阶实色椭圆，无半透明 |
| ui.panel | 16×16 | 8,16 | 深靛蓝底、暖金细边与角星；idle `[0]`；nineSlice `[4,4,4,4]` 按左、上、右、下 |

芬恩每方向六帧中，前两帧用于 `idle_<方向>`，4 fps；后四帧用于 `walk_<方向>`，8 fps。`idle` 是朝下待机的别名。右行由左行字符源精确镜像导出。

对照表 `export/sheets/m0.png` 展示所有素材及调色板；`m0-characters.png` 展示全部角色动画姿势、草地上的辨识度和纯色剪影，均放大 3 倍。帧图已目视检查；实际游戏组合截图由主集成流程检查。M0 素材通过管线技术校验不等同于 M1 正式美术或用户验收。
