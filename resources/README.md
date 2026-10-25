# 第一方资源制作源

本目录管理美术与声音，不依赖游戏场景、输入、存档或战斗代码。

- [`art/`](art/README.md)：`source/` 字符图与整数像素绘图模块、`lib/` 绘图库、`palette.json` 主调色板；`export/` 是可重复生成并提交的 PNG、清单与分页审图表。
- [`audio/`](audio/README.md)：纯确定性 `synth.ts`、音符与音色参数、曲谱说明。播放器属于各运行时，不放进合成器。
- 第三方字体的唯一来源在 [`third_party/fonts/`](../third_party/fonts/)，同步时必须带齐许可证。

修改源后运行 `npm run art:build` → `art:verify` → `art:sheet` 并亲自看图；声音运行 `npm run audio:check` 并单独记录试听。所有图像/声音只能来自本仓代码，禁止生成模型和外部素材。

`npm run godot:sync` 将登记使用的文件复制进 Godot，并维护 `godot/resource-pack.json`；`npm run godot:verify` 检查复制内容。游戏通过语义 ID 使用资源，不从本目录导入绘图实现。Godot 内副本不能反向成为制作源。
