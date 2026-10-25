# G2 · 确定性战斗移植执行拆分

依据：`godot-migration.md` G2 与 `../design/05-combat.md`。由当前开发代理在现有工作区顺序执行，保留交接改动；不另开计算 worker。

## 设计与边界

参考 TypeScript 继续冻结；夹具生成器可调用它，Godot运行规则不调用它。共享JSON放在 `tests/fixtures/battle/`，记录参考源哈希、输入和期望输出。生成后入库；正常检查只比较，不能自动重写期望。原生测试从仓库共享夹具读取，不把测试数据加入资源制作源。

规则用 RefCounted、显式类型与深拷贝；不依赖节点、绘图、文件、时钟或随机。数值由 `content/data/battle-balance.json` 注入，配置失败保留上一有效配置。保持JSON字段名，GDScript方法使用snake_case。合法调用返回 `{ok:true,value:...}`，非法数据返回 `{ok:false,error:...}`；错误文案不作为跨语言契约。回放比较完整状态及有序事件，不只比较最终HP。

相比直接翻译后手写两个测试集，共享夹具能发现跨语言取整、空值、排序及事件差异；相比运行时桥接旧JS，独立GDScript符合原生目标。当前采用前者，不修改既定玩法。

## G2a · 数学、星距、共享HP与回放基础

- [x] 在 `tools/qa/battle-fixtures.ts` 建立可重复导出/只读校验；`tests/reference/battle-fixtures.test.ts` 对手算伤害、护盾、致死案例与夹具来源做断言。
- [x] `godot/tests/battle/run_battle_math.gd` 先写失败断言，随后实现 `godot/scripts/battle/battle_math.gd`：rating、manhattan、tether_factor、calculate_damage、validate_actor、apply_shared_damage、action_interval、order_timeline、reschedule_actor。
- [x] 共享HP使用同一初态连续结算；验证护盾先扣、伤害不重乘本体倍率、致死熄灭、重复伤害、返回值深拷贝、非法输入不修改原状态。安全整数、NaN/Infinity、未知类型、溢出另测。
- [x] 把 `battle:fixtures:verify`、`godot:test:battle` 接入 `npm run check`；完整本机验证通过；提交推送与远端CI登记见progress/status。

接口示例：`calculate_damage({power:100,attackerPower:40,defenderEndurance:50,distance:1,reach:5,target:"body"})` 返回120；相同初态的伴星目标返回80，收回本体返回56。连续伤害初态HP20/盾15，先打伴星10，再打本体100：第一次HP20/盾5，第二次HP0/盾0/熄灭。

## G2b · 双单位移动、撤销、显现和待机

- [x] 参考生成器导出战场定义、createBattle状态、每条命令的ok/state/events；覆盖绕墙、累计移动、拉回并列排序、显现后撤销、非法命令原子性。
- [x] 原生 `battle_engine.gd` 先实现有界战场、稳定BFS与移动事务；顺序重放相同夹具。移动顺序上/左/右/下；拉回并列按y/x；显现不能被撤销刷次数。
- [x] 顺序接入待机/收回和时间轴，检查我方优先、order/ASCII id、回合心力恢复；技术验证后小步提交。

无空位收回保留为格子规则的防御分支。合法G2b本体移动的前一格始终空着，且在至少1格星绳内，因此不能通过合法移动制造无拉回空格；不使用非法状态冒充该路径的行为覆盖。

## G2c–G2e · 后续顺序

- [ ] G2c：技能、治疗/护盾、灯印、射线、击退/共享碰撞去重及剧情生命底线。
- [ ] G2d：固定定点/锁定意图、可见中断、实时预计扣血，完整事件回放。
- [ ] G2e：艾拉/影匠两战真实胜负与失败重建，补未觉醒芬恩道具/鼓舞；完整G2技术验收后进入G3原生表现。

验证入口：`npm run battle:fixtures:verify`、`npm run godot:test:battle`、`npm run check`。每次增量更新本表、backlog/progress/status。G2纯规则阶段不宣称原生战斗画面或完整序章已完成；画面/声音验收在G3，完整故事在G4。
