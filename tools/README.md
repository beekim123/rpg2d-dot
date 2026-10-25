# 制作与验证工具

所有命令从仓库根目录运行，优先使用 `package.json` 的脚本入口。

| 路径 | 职责 |
|---|---|
| `resources/art.mjs` | 原创像素图构建、重绘校验、分页审图表 |
| `resources/audio-check.ts` | 合成确定性、峰值、RMS、循环接缝检查 |
| `resources/sync-godot-assets.mjs` | 资源/内容副本与资源包索引的同步、验证 |
| `godot/cli.mjs` | 引擎定位、导入、原生测试、运行、编辑器与导出 |
| `godot/serve.mjs` | Godot Web 导出目录的本地预览 |
| `godot/install-web-templates.py` | 获取匹配官方版本的 Web 模板 |
| `qa/` | 内容检查、参考自动路线、QA 帧预览转换 |
| `lib/` | 工具共用路径与基础设施 |
| `run.mjs` | 限制计算线程的 Node 工具启动器 |

工具读取 `resources/` 和 `content/`，游戏运行时不导入制作工具。Godot 同步只清理索引拥有的旧生成文件，不能删除未登记的用户文件。编辑器、缓存、参考截图和临时文件进入忽略目录；可分享的检查图片进入 `artifacts/screenshots/`。

测试与构建默认单 worker，运行前核对整机已有任务；不得按 CPU 核数自动扩并发。

`workbench/`把已验证的共享资源打包为无外部依赖的单文件HTML，并提供可选本机预览服务。它不导入游戏源码。
