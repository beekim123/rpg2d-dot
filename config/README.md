# 开发配置

这里集中存放 TypeScript、Vite、Vitest 与两套 Playwright 配置。所有包脚本从仓库根目录执行，并显式指定此目录里的配置文件。

- `tsconfig.json`：共享工具和网页参考的严格类型检查。
- `vite.config.ts`：`reference/web/` 的开发/构建入口，输出 `build/reference-web/`；保留 `/art/export/` 资源路由。
- `vitest.config.ts`：TypeScript 参考与音频回归，单 worker。
- `playwright.config.ts`：网页参考端到端测试。
- `godot-web.config.ts`：实际 Godot 导出网页验收。

Godot 的引擎设置与导出预设仍放在 `godot/`；GitHub Actions 仍放在 `.github/workflows/`，以符合各自工具的固定发现规则。

`godot-version.txt` 是引擎与模板的共同版本锁；启动器、模板安装器和 CI 都读取它。升级时一起验证导入、原生测试与 Web 导出。

`workbench.config.ts`用于独立HTML工作台的单worker浏览器验证。
