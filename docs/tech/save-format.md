# 探索存档格式与恢复边界

G1c使用JSON version 3，字段包括mapId、player{x,y,facing}、flags、lamps、steps、inventory，以及followers/actors/actorMemory。文件不包含资源路径或脚本代码。

## 校验与迁移

- 上限512000 UTF8字节，整数在JavaScript安全整数范围内；步骤到上限后饱和，仍可继续走动与保存。
- 读取v0/v1/v2时显式转成v3。未知键/版本/地图、非法灯ID与重复、坏旗标、坏落点或被阻断的必经通路均拒绝，不改变当前世界。
- 当前未移植队伍跟随与NPC移动存档，因此非空followers/actors和非空actorMemory子表会明确拒绝，避免加载时悄悄丢字段；空旧字段正常保留。
- 旧lantern.test记录可导入。它是无出口的技术图，可通过“开始新旅途”明确回到序章；新旅途替换自动档，三个手动槽保留。尚未登记的旧地图会明确拒绝。

## 槽位与文件

- 原生环境user://astra/saves/slot_0.json为自动档，1–3为手动档。人工保存只在已亮灯柱旁可用，自动槽不作为手动保存目标。
- 原生写入先校验，再写私有临时文件、flush、读回核对，最后rename替换；上一有效版本保留为.bak。失败不毁当前槽，不扫描删除未知文件。
- Web使用按存档root和槽号分区的localStorage单key记录，包含当前JSON、上一有效JSON和保存时间，一次同步setItem成功后才报告成功。配额/权限异常保留旧key；只有key缺失才只读兼容早期IndexedDB文件档，坏新key不会回退旧状态。
- 选择分平台后端的原因：实际复现FileAccess自动同步尚未完成时立即刷新会读回旧auto，不能用人为延迟掩盖。状态规则和JSON格式仍完全共用，平台差异限于存储适配层。
- 启动只读取有效自动档；坏自动档保留且暂停自动写。明确保存/读取/导入成功后才恢复记录。
- 首次点灯和真实跨图自动记下；底层场景重建不写。用户明确读档/导入/开始新旅途成功后只更新auto，保持手动槽不变。auto写失败会保留已恢复的内存状态并明确提示备份。

## 传输与浏览器

导出的JSON是当前进度，可用于备份和跨地址迁移。Web只在用户点导入时打开文件选择器，大小与UTF8先检查，再送SaveCodec；原生使用文件对话框。浏览器存储绑定访问地址，迁移地址或设备时使用导出/导入。正常浏览器环境的刷新与同一上下文新页面已纳入验收；清除站点数据会清除浏览器档。

JavaScript测试桥仍只读。文件传输是单独的用户操作入口，不提供任意状态写入API。原生测试关闭真实持久化或使用独立临时目录，浏览器测试使用隔离上下文。

实现依据：[Godot FileAccess与Web存储说明](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)、[JavaScriptBridge文件接口](https://docs.godotengine.org/en/stable/classes/class_javascriptbridge.html)、[DirAccess重命名接口](https://docs.godotengine.org/en/stable/classes/class_diraccess.html)。

## G4 剧情边界（仍使用v3）

新主线只在既有flags/inventory/lamps中记录安全检查点，不增加顶层字段、非布尔flags或演出游标。未带`p.main_started`的旧探索记录继续按原规则读取，不强行改成新游戏。主线语义校验要求单向前置、互斥选项和唯一道具计数一致；在startup、导入和写入前向SaveCodec注册Node回调，对规范化副本同步校验。校验不修改快照，失败沿既有坏档路径处理。回调不要直接形成Progress↔Codec的RefCounted强引用环。

原生写槽与Web单key记录都复用Codec校验：不合法的新剧情不能覆盖旧槽；损坏的当前剧情数据不能晋升为有效备份。存储机制仍是原生临时文件原子替换、Web同步localStorage，没有延迟写入。

战斗途中不能保存探索快照。正式主线以战前完整状态授权Session；战场/数值配置/代次或检查点改变会使授权失效，正常失败retry保留代次。只有当前场次真实获胜才合并剩余面包/星糖并提交主线旗标；关键道具从不混入战斗库存，超过9的探索补给保留未带入余额。读档重建未完成战斗，不保存授权票据或播放帧。
