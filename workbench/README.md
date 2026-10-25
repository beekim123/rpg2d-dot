# 独立素材工作台

这是持续维护的资源展示工具，独立于Godot和旧网页游戏。它不导入任何游戏脚本，也不读取游戏运行状态。

## 制作与使用

```sh
npm run resources:refresh
npm run workbench:dev
```

开发预览在 `http://127.0.0.1:8787/`。构建产物是 `build/asset-workbench/index.html`：可以直接双击，也可以只复制这一个文件到任意文件夹或静态网站，不需要Node、Godot、Vite或仓库目录。所有图像、动画清单、字体、字体许可及声音合成器均已内嵌；页面不请求网络。导出包是当次构建的快照，资源修改后用`npm run resources:refresh`一并构建、校验、审图、同步Godot和更新HTML，避免漏掉一边。单独更新展示代码只需`npm run workbench:build`。

支持按素材ID搜索、分类、动画选择、暂停/重播、手动逐帧、1–4倍整数放大、锚点检查、下载原PNG/清单、调色板与声音试听。

## 一致性和隔离

- 唯一美术源仍是`resources/art/`，Godot和工作台都消费它生成的PNG和清单。
- 构建器检查每张PNG的SHA256，并将源清单、PNG和字体逐字节与Godot受管副本比较；不相同就拒绝生成。工作台不重画、不压缩、不替换图片。
- `viewer.js`只消费内嵌的`astra.workbench/1`数据及可选合成器接口。它没有import、fetch、游戏代码路径或服务依赖。
- 仓库路径与验证规则只在`tools/workbench/build.mjs`这个适配器里；未来独立为其他项目，只需提供相同数据契约。
- 音频试听来自`resources/audio/synth.ts`，仍属于资源制作源；Godot原生音频接入进度单独记录，不把试听页当作游戏已经接入声音。
- 旧网页的`/workbench/`入口只展示此工具的构建副本，不再维护第二套实现。

## 数据契约

HTML中`#astra-workbench-data`为JSON：`format`、`art.manifest`、`art.manifest_json`、按ID索引的`art.pngs`（PNG data URI）、`palette`、`font.data_url`、`font.licenses`及`audio`元数据。`window.ASTRA_SYNTH`提供同源`renderCue(id, sampleRate)`等接口。

源文件只包含HTML模板、CSS、普通浏览器JavaScript及独立音频展示名称。构建器内联这些文件，安全转义JSON和脚本终止符。许可证全文可在导出的页面中展开阅读。

## 验证

```sh
npm run workbench:test
npm run workbench:build
npm run workbench:test:web
```

浏览器验证会把HTML复制到仓库外的临时目录，通过`file://`真实打开；检查动画、暂停、整数倍率、分类、PNG下载字节和零网络请求。另验HTTP展示和192kHz设备下44100Hz资源试听。所有测试单worker。

构建最低Node 22.13（本机和CI验证Node24）。采用Node内置stripTypeScriptTypes处理仓库合成器，不另引入旧版编译器；API版本依据[Node官方文档](https://nodejs.org/api/module.html#modulestriptypescripttypescode-options)。成品HTML运行不需要Node。
