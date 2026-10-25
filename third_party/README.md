# 第三方依赖与许可

游戏美术和声音全部原创。主工程使用Godot；此前无运行时框架的网页原型保留作参考。

| 依赖 | 用途 | 许可证 |
|---|---|---|
| Godot 4.7.2 | 原生主工程与Web导出引擎（本机编辑器/模板不提交） | MIT；引擎包含的第三方许可随官方发行包保留 |
| TypeScript | 严格类型检查 | Apache-2.0 |
| Vite | 开发服务与静态构建 | MIT |
| Vitest | 逻辑单元测试 | MIT |
| Playwright | 浏览器操作和截图测试 | Apache-2.0 |
| @types/node | Node 类型 | MIT |
| Pillow（可选开发工具） | 将本项目浏览器QA帧导出GIF预览，不进入游戏运行时 | HPND |
| Fusion Pixel 12px proportional zh-Hans | 中文像素字体 | OFL-1.1；完整许可证在 `fonts/fusion-pixel-12px/` |

字体来自作者本机 ele-pushbox 工程中合法保留的 Fusion Pixel 字体包；上游 https://github.com/TakWolf/fusion-pixel-font 。仅复制字体及其许可证与说明，没有使用该工程任何角色、美术或声音素材。包内保留 Ark Pixel、Cubic 11 等组成字库的许可证。
