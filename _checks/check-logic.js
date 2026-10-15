/* 口径自检：在 node 里加载浏览器脚本，验证派生数字 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', 'assets');

// 最小浏览器环境
const store = {};
const sandbox = {
  console,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  sessionStorage: { getItem: () => '1', setItem: () => {} },
  navigator: {},
  document: {
    readyState: 'complete',
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style:{}, setAttribute(){}, appendChild(){}, remove(){}, click(){} }),
    addEventListener: () => {},
    body: { appendChild(){}, removeChild(){} }
  },
  setTimeout, clearTimeout, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  Blob: function(){}, location: { hash:'' }, addEventListener(){}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);
['seed.js','ui.js','store.js','views-daily.js','views-overview.js','views-weekly.js','views-weekreport.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename:f });
});

const Store = sandbox.Store;
Store.load();

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '   → ' + extra : '')); }
};
const eq = (name, a, b) => t(name, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

console.log('\n== 工作日历 ==');
eq('2026-10-10(周六) 非工作日', Store.isWorkday('2026-10-10'), false);
eq('2026-10-05(周一) 工作日',   Store.isWorkday('2026-10-05'), true);
eq('2026-10-09(周五) 工作日',   Store.isWorkday('2026-10-09'), true);
eq('2026-10-01(国庆) 非工作日', Store.isWorkday('2026-10-01'), false);
eq('weekStart(10-09) → 周二锚定', Store.weekStart('2026-10-09'), '2026-10-06');
eq('本周期工作日数',            Store.workdaysInRange('2026-10-05','2026-10-11').length, 5);

console.log('\n== 提交口径（10-09） ==');
const s = Store.submission('2026-10-09');
eq('应提交人数（场景生成组 3 + 3DGS 组 4 + TA Leader 1）', s.expectedN, 8);
eq('已提交',     s.submittedN, 7);
eq('准时',       s.onTimeN, 6);
eq('逾期提交',   s.lateN, 1);
eq('未交',       s.missingN, 1);
eq('其中有草稿', s.draftsN, 1);
eq('提交率',     +s.rate.toFixed(3), 0.875);
eq('准时率',     +s.onTimeRate.toFixed(3), 0.75);
t('客户侧人员不在应提交名单', s.expected.every(p => p.type === 'internal'));
t('客户侧人员不计入分母', s.expectedN === Store.submitters().length, s.expectedN + ' vs ' + Store.submitters().length);
t('老板与 PM 不交日报', !s.expected.some(p => ['boss','pm'].indexOf(p.role) >= 0));
t('TA Leader 宋天意**照常交日报**（v1.17：与 TA / 美术 / 实习生同一套页面）', s.expected.some(p => p.id === 'ta'));
t('宏枢老师不交日报（由刘一鸣代表）', !s.expected.some(p => p.id === 'hongshu'));
t('实习生安雅萱在应提交名单内', s.expected.some(p => p.id === 'anya'));

console.log('\n== 两个组 ==');
eq('组数', Store.groups().length, 2);
eq('场景生成组', Store.groups()[0].name + ':' + Store.groups()[0].members.join('+'), '场景生成组:chang+li+sun');
eq('3DGS 组',   Store.groups()[1].name + ':' + Store.groups()[1].members.join('+'), '3DGS 组:wang+luo+liuming+anya');
t('每组都由 TA Leader 管', Store.groups().every(g => g.lead === 'ta'));
eq('刘一鸣属于 3DGS 组', Store.groupOf(Store.person('liuming').group).name, '3DGS 组');
eq('宏枢不属于任何组（不交日报）', Store.groupOf(Store.person('hongshu').group), null);
eq('7 位提交人全部落在两个组内', Store.submitters().filter(p => p.group).length, 7);

console.log('\n== 角色与权限（三级） ==');
const roleSet = () => Store.roles().map(r => r.id + ':' + r.level).join(',');
eq('角色枚举（v1.22 前置管理员 + 待分配，TA 与美术是两个独立角色）', roleSet(), 'admin:3,pending:1,boss:3,pm:3,tal:3,member:2,art:2,intern:2');
t('TA 与美术角色名不同且可各配权限',
  Store.roleName('member') === 'TA' && Store.roleName('art') === '美术' &&
  Store.roles().filter(r => ['member','art'].indexOf(r.id) >= 0).every(r => r.submitDaily && r.caps.role === true));
t('最高权限 = 老板 / PM / TA Leader',
  ['candice','liudi','olivia','ta'].every(id => { Store.setUser(id); return Store.isPrivileged(); }),
  ['candice','liudi','olivia','ta'].map(id => { Store.setUser(id); return id + '=' + Store.isPrivileged(); }).join(' '));
t('TA 老师 / 实习生不是最高权限',
  !['wang','hongshu','liuming','anya'].some(id => { Store.setUser(id); return Store.isPrivileged(); }));
Store.setUser('wang');
t('成员不是最高权限，但可编辑（v1.17 全员可编辑）',
  Store.can('admin') === false && Store.can('remind') === true && Store.can('manageConfig') === true &&
  Store.can('personManage') === true && Store.can('roleManage') === true && Store.can('enumsManage') === true &&
  Store.can('finance') === true);
t('成员可以填自己的日报', Store.can('submit') === true);
Store.setUser('anya'); t('实习生可填日报', Store.can('submit') === true);
Store.setUser('ta');    t('TA Leader 是最高权限**且照常填报**（页面与 TA / 美术 / 实习生一致，只是还能管理）',
  Store.isPrivileged() === true && Store.can('submit') === true);
Store.setUser('candice'); t('老板不交日报', Store.can('submit') === false);
Store.setUser('olivia');
t('客户侧不能登录（Kelvin）', Store.login('kelvin', 'abcd').ok === false);
t('客户侧不能登录（坤 / Tim）', Store.login('kun', 'abcd').ok === false && Store.login('tim', 'abcd').ok === false);
t('内部成员可登录', Store.login('wang', 'abcd').ok === true);
Store.setUser('olivia');

console.log('\n== 周提交率 ==');
const wk = Store.weekSubmission('2026-10-05');
eq('应提交 × 工作日（8 人 × 5 天）', wk.totalExpected, 40);
eq('实际提交', wk.totalSubmitted, 39);
eq('安雅萱 4/5（10-09 有草稿未提交）', wk.rows.find(r => r.person.id === 'anya').submitted, 4);
eq('王老师 5/5', wk.rows.find(r => r.person.id === 'wang').submitted, 5);
eq('刘一鸣 5/5', wk.rows.find(r => r.person.id === 'liuming').submitted, 5);
t('周表里没有宏枢（不交日报）', !wk.rows.some(r => r.person.id === 'hongshu'));

console.log('\n== 成果上站（v1.11 已整体下线） ==');
t('口径层不再导出 onsite 系列',
  Store.onsiteStats === undefined && Store.onsiteItems === undefined && Store.onsiteOverdue === undefined);
t('条目不再带 onsite 字段',
  Store.reportsOn(Store.state.demoDate).every(r => (r.entries || []).every(e => e.onsite === undefined)));
t('配置项已移除 onsiteSlaDays / onsiteRequired',
  Store.state.config.onsiteSlaDays === undefined && Store.state.config.onsiteRequired === undefined);
t('知识库不再有「成果上站规则」', !Store.kbDocByTitle('成果上站规则'));

console.log('\n== 成本与支出（工时已下线） ==');
t('日报条目里已无 hours 字段（工时彻底移除）',
  Store.state.reports.every(r => (r.entries || []).every(e => e.hours === undefined)));
const c = Store.costStats('2026-10-05', '2026-10-09');
eq('采购笔数（不含草稿）', c.purchase.length, 3);
eq('采购金额合计(分)', c.purchaseFen, 186000 + 124000 + 98000);
t('成本对象不再含人力成本（labor / totalCost 已移除）',
  c.labor === undefined && c.totalCost === undefined);
t('Store 不再导出 hoursMatrix', Store.hoursMatrix === undefined);
const assetRow = () => Store.capacityWeek('2026-10-05','2026-10-09')
  .internal.find(x => x.id === 'asset').rows.find(r => r.label === '采购资产').value;
eq('采购资产（本周）', assetRow(), 12 + 8 + 6);
// 草稿口径闭环：把刘一鸣 10-09（含 6 套采购）临时改成草稿，本周口径应立即扣掉
const lm9 = Store.getReport('liuming', '2026-10-09');
lm9.status = 'draft'; Store.save();
const cDraft = Store.costStats('2026-10-05', '2026-10-09');
lm9.status = 'submitted'; Store.save();
eq('草稿不计入采购笔数', cDraft.purchase.length, 2);
eq('草稿不计入采购金额', cDraft.purchaseFen, 186000 + 124000);
eq('恢复提交后口径复原', Store.costStats('2026-10-05','2026-10-09').purchaseFen, 186000 + 124000 + 98000);

console.log('\n== 产能链路 ==');
const cap = Store.capacityWeek('2026-10-05', '2026-10-09');
const d3 = cap.internal.find(x => x.id === '3dgs').rows;
eq('采集场景（本周）', d3.find(r => r.label === '采集场景').value, 42 + 1 + 28);
eq('重建完成（本周）', d3.find(r => r.label === '重建完成').value, 8 + 8 + 2 + 6);
const ai = cap.internal.find(x => x.id === 'scene').rows;
eq('场景生成 · 尝试（本周）', ai.find(r => r.label === '尝试生成').value, 20 + 24 + 60 + 8 + 75 + 80);
eq('场景生成 · 成功（本周）', ai.find(r => r.label === '生成成功').value, 17 + 21 + 47 + 6 + 62 + 69);
t('场景生成累计标记待确认', cap.cumulative.find(r => r.label.indexOf('场景生成') === 0).pending === true);
eq('客户侧可用（最新）', cap.client.find(r => r.label === '客户侧可用资产').value, 618);
eq('客户侧确认点位', cap.client.find(r => r.label === '确认点位').value, 23);

console.log('\n== 宏枢 → 刘一鸣（一条线） ==');
t('宏枢没有独立日报（不在提交名单就不该有日报）',
  Store.state.reports.every(r => r.personId !== 'hongshu'));
t('刘一鸣每天都有渲染 + 采购两条',
  ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'].every(d => {
    const r = Store.getReport('liuming', d);
    return r && (r.entries || []).some(e => e.pipeline === 'render') && (r.entries || []).some(e => e.pipeline === 'asset');
  }));
t('刘一鸣明日任务含采购条线',
  Store.tomorrowOf(Store.getReport('liuming','2026-10-05')).some(x => x.pipeline === 'asset'));
t('周报里刘一鸣写的是「接手资产采购与查重的台账维护」',
  (Store.getWeekReport('liuming','2026-10-05').suggest || []).some(x => x.pipeline === 'asset'));

console.log('\n== 周进展取材口径 / 群文本 ==');
const b = Store.briefData('2026-10-05', '2026-10-09');
t('取材口径含多条产线', b.groups.length >= 4, b.groups.length);
t('取材口径卡点非空', b.groups.some(g => g.blocked.length > 0));
t('取材口径被知识库「本周进展速览」消费', Store.kbAutoWeekly('2026-10-05').indexOf('# 本周进展速览') === 0);
t('页面级 briefText / progressBlock 已随页面一起下线',
  Store.briefText === undefined && Store.progressBlock === undefined);
t('节奏节点口径（nodes / updateNode）已下线',
  Store.nodes === undefined && Store.updateNode === undefined);
t('周期列表改为从周报 / 日报派生，仍含两个周期',
  Store.allWeeks().length >= 2 && Store.allWeeks().indexOf('2026-10-12') >= 0, Store.allWeeks().join(','));
t('节奏模板数据已从种子移除', Store.state.rhythmTemplate === undefined && Store.state.nodes === undefined);
const gt = Store.groupText(Store.getReport('wang','2026-10-06'));
t('群汇报文本含卡点', gt.indexOf('卡点') >= 0);
t('内部版不再含合计工时', gt.indexOf('合计工时') < 0);

console.log('\n== 明日工作任务 ==');
const w6 = Store.getReport('wang','2026-10-06');
eq('王弋 10-06 有 1 条明日任务', Store.tomorrowOf(w6).length, 1);
t('明日任务带管线', Store.tomorrowOf(w6)[0].pipeline === '3dgs');
t('明日任务文本非空', Store.tomorrowOf(w6)[0].task.length > 4);
t('汇报文本不再输出「明日工作任务」段（v1.23 下线该字段）',
  Store.reportVersions(w6).internalText.indexOf('明日工作任务') < 0 &&
  Store.reportVersions(w6).clientText.indexOf('明日工作任务') < 0);
// 明日计划不参与泄漏判定之外的口径：合计工时只由条目决定
eq('明日计划不影响合计工时', Store.sum(Store.tomorrowOf(w6), t2 => 1), 1);
const allTm = ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09']
  .every(d => Store.reportsOn(d).filter(r => r.status === 'submitted').every(r => Store.tomorrowOf(r).length > 0));
t('本周每个已提交日报都有明日任务', allTm);

console.log('\n== 汇报文本两版（内部 / 对外） ==');
const w8 = Store.reportVersions(Store.getReport('wang','2026-10-08'));
t('内部版不再含工时（字段已下线）', w8.internalText.indexOf('工时') < 0);
t('内部版仍含条目明细', w8.internalText.indexOf('1. ') > 0);
eq('客户版无「工时」字样', /工时|人天|\d+\s*小时/.test(w8.clientText), false);
eq('客户版无金额符号', /[¥$]\s?\d/.test(w8.clientText), false);
eq('客户版通过外发审查', w8.leaks.length, 0);
t('两版同源：客户版条目 ⊆ 内部版条目', w8.included.every(e => w8.internalText.indexOf(e.task.slice(0, 12)) >= 0));

// 对外版 = 除当日卡点以外的全部内容：条目一律不筛，靠外发审查兜底
const hsRep = Store.getReport('liuming','2026-10-05');
const hs = Store.reportVersions(hsRep);
eq('该日报 2 条（渲染 + 采购）全部进对外版', hs.included.length, 2);
eq('对外版条目数 = 内部版条目数（不再逐条筛选）', hs.included.length, (hsRep.entries || []).length);
t('reportVersions 不再回传 excluded', hs.excluded === undefined);

// 含成本 / 金额描述的自由文本必须被拦下
const li = Store.reportVersions(Store.getReport('li','2026-10-07'));
t('李老师 10-07（含 $14.67）客户版被拦下', li.leaks.length > 0, JSON.stringify(li.leaks.map(l => l.kind)));
t('拦截类型含金额', li.leaks.some(l => l.kind === '金额'));
t('拦截类型含成本', li.leaks.some(l => l.kind === '成本'));

// 内部链接不得出现在客户版
const wang8 = Store.getReport('wang','2026-10-08');
eq('docs.internal 是内部链接', Store.isClientLink('https://docs.internal/alef/x'), false);
eq('客户网站链接可外发', Store.isClientLink('https://kev.alef.site/stage/b-072'), true);
t('客户版不含 docs.internal', wang8 && Store.reportVersions(wang8).clientText.indexOf('docs.internal') < 0);

console.log('\n== 当日卡点（FR-35 · 只进内部版） ==');
const withBlocker = Store.state.reports.filter(r => (r.blocker || '').trim());
eq('种子里有 4 份日报带当日卡点', withBlocker.length, 4);
const b6 = Store.reportVersions(Store.getReport('wang','2026-10-06'));
t('内部版有「当日卡点：」栏', b6.internalText.indexOf('当日卡点：') >= 0);
t('内部版含卡点原文', b6.internalText.indexOf('外包方补采回传') >= 0);
eq('对外版无「当日卡点」字样', b6.clientText.indexOf('当日卡点') >= 0, false);
t('对外版不含卡点原文', b6.clientText.indexOf('外包方补采回传') < 0);
t('reportVersions 回传 blocker 字段', b6.blocker.indexOf('外包方') >= 0);

// 卡点是日报级字段：不算工作条目、不进对外版
const repB = Store.getReport('wang','2026-10-06');
const keepB = repB.blocker;
repB.blocker = '临时卡点：等权限开通';
eq('加卡点不改变条目数', repB.entries.length, 2);
t('临时卡点同样不进对外版', Store.reportVersions(repB).clientText.indexOf('等权限开通') < 0);
repB.blocker = keepB;

// 即便卡点里写了金额，也只出现在内部版（对外版不生成这一栏，不靠过滤）
const repL = Store.getReport('luo','2026-10-08');
const keepL = repL.blocker;
repL.blocker = '农场档期要预付 ¥58,000 才能锁时段（内部卡点）';
const vL = Store.reportVersions(repL);
eq('卡点里写金额也不会漏进对外版', vL.leaks.length, 0);
t('金额只出现在内部版', vL.internalText.indexOf('58,000') >= 0 && vL.clientText.indexOf('58,000') < 0);
repL.blocker = keepL;

// 日报级卡点：只进内部口径，对外版白名单不含它
const blist = Store.briefData('2026-10-05', '2026-10-09').reports.filter(r => (r.blocker || '').trim());
t('内部口径能取到日报级卡点明细（供内会材料）', blist.length > 0, blist.length);

// 空卡点不占版面
const b8 = Store.reportVersions(Store.getReport('wang','2026-10-08'));
eq('没写卡点的日报内部版无该栏', b8.internalText.indexOf('当日卡点') >= 0, false);
eq('没写卡点时 blocker 为空串', b8.blocker, '');

console.log('\n== 客户侧数据 / 提醒 / 日志 ==');
eq('客户侧 2 条', Store.clientData().length, 2);
eq('10-09 催办 3 条', Store.remindersOn('2026-10-09').length, 3);
t('日志非空', Store.state.logs.length >= 6);

console.log('\n== 催办（v1.12：没有企业微信 → 系统不代发，只出话术） ==');
t('催办记录不带「已读」字段（拿不到回执，不存假数据）',
  Store.remindersOn('2026-10-09').every(r => r.read === undefined && r.fulfilled === undefined));
t('催办渠道只有「站内」（系统自动）与「微信」（PM 手工）',
  Store.remindersOn('2026-10-09').every(r => ['站内','微信'].indexOf(r.channel) >= 0),
  Store.remindersOn('2026-10-09').map(r => r.channel).join(','));
t('站内自动提醒是 kind=auto，PM 催办是 kind=manual',
  Store.remindersOn('2026-10-09').filter(r => r.kind === 'auto').length === 2 &&
  Store.remindersOn('2026-10-09').filter(r => r.kind === 'manual').length === 1);
t('口径层能生成催办话术', typeof Store.reminderText === 'function' && typeof Store.reminderBulkText === 'function');
const oneMsg = Store.reminderText('anya', '2026-10-09');
t('话术含 @姓名 / 未交日期 / 截止时间', oneMsg.indexOf('@安雅萱') === 0 &&
  oneMsg.indexOf('10月09日') > 0 && oneMsg.indexOf(Store.state.config.deadline) > 0, oneMsg);
t('话术是「没提交」口径（模板可编辑，草稿也算未交）', oneMsg.indexOf('还没提交') > 0, oneMsg);
const bulkMsg = Store.reminderBulkText(['anya','chang'], '2026-10-09');
t('批量话术一人一行、共 2 行', bulkMsg.split('\n').length === 2 &&
  bulkMsg.indexOf('@安雅萱') >= 0 && bulkMsg.indexOf('@常吉祥') >= 0, bulkMsg.replace(/\n/g, ' | '));
t('话术里不出现金额 / 成本等内部信息', bulkMsg.indexOf('¥') < 0 && bulkMsg.indexOf('成本') < 0);

console.log('\n== 周报板块（FR-32） ==');
const st5 = Store.weekReportStatus('2026-10-05');
eq('2026-10-05 应交周报 8 人（含 TA Leader）', st5.expectedN, 8);
eq('2026-10-05 已交 8 人', st5.submittedN, 8);
eq('2026-10-05 未交 0 人', st5.missingN, 0);
eq('2026-10-05 提交率 100%', st5.rate, 1);
t('应交周报的人 = 应交日报的人（同口径）',
  st5.expectedN === Store.submitters().length && st5.expected.every(p => p.dailySubmit !== false));
const st12 = Store.weekReportStatus('2026-10-12');
eq('2026-10-12 已交 0 人', st12.submittedN, 0);
eq('2026-10-12 有 1 份草稿', st12.draftsN, 1);
eq('2026-10-12 未交 8 人', st12.missingN, 8);
t('2026-10-05 已有 PM 发布的「本周工作任务」', !!Store.weekPlan('2026-10-05'));
t('2026-10-12 尚未发布', !Store.weekPlan('2026-10-12'));
const sum5 = Store.weekReportSummary('2026-10-05');
eq('周报按两个组 + 「直属 PM」汇总（TA Leader 不带组）', sum5.length, 3);
eq('场景生成组 3 人', sum5[0].rows.length, 3);
eq('3DGS 组 4 人', sum5[1].rows.length, 4);
eq('直属 PM 1 人（宋天意）', sum5[2].rows.length, 1);
eq('汇总覆盖全部 8 位提交人', sum5.reduce((a, g) => a + g.rows.length, 0), 8);
t('周报文本含「上周结果」', Store.weekReportText('2026-10-05').indexOf('上周结果') >= 0);
t('周报文本含「本周工作任务」', Store.weekReportText('2026-10-05').indexOf('本周工作任务') >= 0);
t('周报文本标注 PM 已发布', Store.weekReportText('2026-10-05').indexOf('PM 已发布') >= 0);
t('未发布周期在文本里标为等待中', Store.weekReportText('2026-10-12').indexOf('等待 PM') >= 0);
// 每条周报都带「本周目标建议」或风险（演示数据完整性）
t('已交周报都写了上周结果',
  Store.weekReportsAll().filter(w => w.status === 'submitted').every(w => (w.lastResult || '').length > 8));
t('已交周报风险字段存在（可为空）',
  Store.weekReportsAll().filter(w => w.status === 'submitted').every(w => w.risks !== undefined));
// PM 发布 → 全员可见 → 可再次覆盖
Store.saveWeekPlan('2026-10-12', '1. 测试用本周任务');
eq('PM 保存后即可读到', Store.weekPlan('2026-10-12').text, '1. 测试用本周任务');
eq('发布人记为当前用户', Store.weekPlan('2026-10-12').by, Store.currentUser().id);
Store.state.weekPlans = Store.state.weekPlans.filter(p => p.week !== '2026-10-12'); Store.save();
eq('还原后 2026-10-12 回到未发布', Store.weekPlan('2026-10-12'), null);

console.log('\n== 内容流与工作台（FR-36 / FR-37 · v1.13） ==');
const newsSnap = JSON.stringify(Store.state.news);
const cfgSnap = JSON.stringify({ n:Store.state.config.internNews, r:Store.state.config.internReview });

eq('五个分类', Store.newsCats().join('/'), '公告/新闻/活动/分享/学习');
t('种子内容非空（≥7 条）', Store.newsRaw().length >= 7);
eq('信息流置顶优先', Store.newsFeed()[0].id, 'nw1');
eq('每页 5 条', Store.NEWS_PAGE, 5);
t('分页：首页 5 条 + 还有更多', Store.newsPage({}).items.length === 5 && Store.newsPage({}).hasMore === true);
eq('分类配色映射', Store.newsTone('公告') + '/' + Store.newsTone('学习'), 'announce/study');
eq('实习生身份判定', Store.isIntern('anya') === true && Store.isIntern('wang') === false, true);

// 分类权限：唯一判定处是 Store.myCats()
Store.setUser('olivia');
eq('管理层 5 类全开', Store.myCats().join('/'), '公告/新闻/活动/分享/学习');
Store.setUser('wang');
eq('TA 老师：有新闻、无公告', Store.myCats().join('/'), '新闻/活动/分享/学习');
eq('TA 老师不能发公告', Store.canPostCat('公告'), false);
Store.setUser('anya');
eq('实习生默认只有活动/分享/学习', Store.myCats().join('/'), '活动/分享/学习');
eq('实习生不能发公告', Store.canPostCat('公告'), false);
eq('实习生不能发新闻（开关关闭）', Store.canPostCat('新闻'), false);
eq('发布后状态 = 已发布（审核关闭）', Store.newsPublishStatus(), 'published');
Store.state.config.internNews = true; Store.state.config.internReview = true;
eq('打开开关 → 实习生可发新闻', Store.canPostCat('新闻'), true);
eq('公告永不对实习生开放', Store.canPostCat('公告'), false);
eq('打开审核 → 实习生发布落入待审核', Store.newsPublishStatus(), 'pending');
Store.state.config.internNews = false; Store.state.config.internReview = false;

// 可见性：自己的草稿自己可见，别人看不到
eq('自己的草稿可见', Store.newsFeed({ uid:'anya' }).some(n => n.id === 'nw7'), true);
eq('别人的草稿不可见', Store.newsFeed({ uid:'wang' }).some(n => n.id === 'nw7'), false);

// 互动
const likeBefore = Store.newsItem('nw2').likes.length;
Store.newsLike('nw2');
eq('点赞 +1', Store.newsItem('nw2').likes.length, likeBefore + 1);
Store.newsLike('nw2');
eq('再点一次取消', Store.newsItem('nw2').likes.length, likeBefore);
const cmtBefore = (Store.newsItem('nw2').comments || []).length;
Store.newsComment('nw2', '收到，按确认点位排期', ['olivia']);
eq('评论 +1', Store.newsItem('nw2').comments.length, cmtBefore + 1);
eq('评论带 @ 信息', Store.newsItem('nw2').comments[cmtBefore].mentions.join(), 'olivia');

// @ 我的（收拢到「待我处理」）
Store.setUser('chang');
eq('常老师：2 条 @ 我', Store.mentionMe().length, 2);
Store.setUser('wang');
eq('王老师：没有 @ 我', Store.mentionMe().length, 0);

// 审核流 + 置顶
Store.setUser('olivia');
Store.newsApprove('nw7');
eq('审核通过 → 已发布', Store.newsItem('nw7').status, 'published');
Store.newsReject('nw7', '自检：驳回');
eq('驳回 → 状态 + 理由', Store.newsItem('nw7').status + '/' + !!Store.newsItem('nw7').reviewNote, 'rejected/true');
Store.newsPin('nw3');
eq('置顶可切换', Store.newsItem('nw3').pinned, true);
Store.newsPin('nw3');

// 分享到知识库
const kbN = Store.state.kb.nodes.length;
Store.newsShareToKb('nw4');
eq('分享到知识库 → 新增一篇文档', Store.state.kb.nodes.length, kbN + 1);
Store.state.kb.nodes.pop();

// 知识库空间可新建（v1.15）
const spN = Store.kbSpaces().length;
const newSp = Store.kbCreateSpace('外包与采购', '外包方与采购台账');
eq('新建知识库空间 → 空间 +1', Store.kbSpaces().length, spN + 1);
eq('新建空间落库名称', newSp.name, '外包与采购');
eq('新建空间篇数为 0', Store.kbSpaceCount(newSp.id), 0);
t('重名空间允许存在（由页面拦，存储层不管）', !!Store.kbCreateSpace('外包与采购'));
eq('新建空间后回到原数量', Store.kbSpaces().length, spN + 2);
Store.kbSpaces().splice(-2, 2);
eq('空间数还原', Store.kbSpaces().length, spN);
eq('空名空间不创建', Store.kbCreateSpace('   '), null);
t('kbFolders 只返回该空间的文件夹', Store.kbFolders('sp-rule').every(f => f.spaceId === 'sp-rule' && f.type === 'folder'));
const kbDocNew = Store.kbCreate('sp-rule', null, '临时测试文档', '# 测试', 'olivia');
t('新建文档默认挂空间顶级', kbDocNew.parentId === null && kbDocNew.spaceId === 'sp-rule');
Store.kbUpsert(kbDocNew.id, { title:'临时测试文档' });
Store.state.kb.nodes.pop();

// 知识库划词批注（v1.20）
eq('种子文档自带 2 条批注', Store.kbAnnos('kb5').length, 2);
eq('空文档批注为空数组', Store.kbAnnos('kb1').length, 0);
const kaN = Store.kbAnnos('kb5').length;
const kaNew = Store.kbAnnoAdd('kb5', { quote:'22:00', prefix:'提交截止', suffix:'', text:'测试批注' });
t('添加批注 → 返回记录（作者=当前用户 / 未解决）',
  !!kaNew && kaNew.author === 'olivia' && kaNew.resolved === false && Array.isArray(kaNew.replies));
eq('添加批注 → 数量 +1', Store.kbAnnos('kb5').length, kaN + 1);
eq('空内容批注不创建', Store.kbAnnoAdd('kb5', { quote:'x', text:'  ' }), null);
Store.kbAnnoReply('kb5', kaNew.id, '第一条回复');
eq('回复落库', Store.kbAnnos('kb5').find(a => a.id === kaNew.id).replies.length, 1);
eq('空回复不落库', Store.kbAnnoReply('kb5', kaNew.id, '  '), null);
eq('解决前为 false', Store.kbAnnos('kb5').find(a => a.id === kaNew.id).resolved, false);
Store.kbAnnoResolve('kb5', kaNew.id);
eq('可标记已解决', Store.kbAnnos('kb5').find(a => a.id === kaNew.id).resolved, true);
Store.kbAnnoResolve('kb5', kaNew.id);
eq('可重新打开', Store.kbAnnos('kb5').find(a => a.id === kaNew.id).resolved, false);
Store.setUser('ta');
t('别人（宋天意）删不了 Olivia 的批注', Store.kbAnnoDelete('kb5', kaNew.id) === false);
eq('删不了 → 数量不变', Store.kbAnnos('kb5').length, kaN + 1);
Store.setUser('olivia');
t('作者本人可删', Store.kbAnnoDelete('kb5', kaNew.id) === true);
eq('删除 → 数量还原', Store.kbAnnos('kb5').length, kaN);

// 周五任务汇总（v1.21）
const fdg = Store.weekDigest('2026-10-06');   // 演示周已改为周二锚定
eq('汇总按人分 · 8 个填报人', fdg.rows.length, 8);
eq('汇总只收周二 → 周五 4 天', fdg.days.length, 4);
eq('汇总起点是周二', fdg.from, '2026-10-06');
eq('汇总终点是周五', fdg.to, '2026-10-09');
t('每人都有 4 个「人·天」格', fdg.rows.every(r => r.days.length === 4));
t('王弋本周周二 → 周五至少 3 天已提交', fdg.rows.find(r => r.person.id === 'wang').days.filter(x => x.report).length >= 3);
t('格子里的日报口径 = submitted', fdg.rows.every(r => r.days.every(x => !x.report || x.report.status === 'submitted')));
eq('不传周期 → 默认演示周期', Store.weekDigest().week, Store.weekStart(Store.state.demoDate));

// 工作台派生口径
t('连续写日报天数（王弋 ≥5）', Store.myStreak('wang', '2026-10-09') >= 5);
eq('草稿不算连续（安雅萱）', Store.myStreak('anya', '2026-10-09'), 0);
eq('我的最近日报取 5 条', Store.myRecentReports('wang', 5).length, 5);
eq('近 7 个工作日趋势', Store.submissionTrend('2026-10-09', 7).length, 7);
const ds = Store.dashStats('wang', '2026-10-09');
eq('统计：我的本周提交 4/4（周二锚定周，10-06→10-09）', ds.mySubmitted + '/' + ds.myExpected, '4/4');
t('统计：团队本周提交率在 (0,1]', ds.teamRate > 0 && ds.teamRate <= 1);
t('统计：知识库本周新增为数字', typeof ds.kbNew === 'number');
t('待办：安雅萱有「待交日报」', Store.pendingTodo('anya', '2026-10-09').some(x => x.kind === '待交日报'));
t('待办：PM 有「待催办」', Store.pendingTodo('olivia', '2026-10-09').some(x => x.kind === '待催办'));
eq('项目：五条管线', Store.projectProgress('wang', '2026-10-09').total, 5);
t('知识库最近更新非空', Store.kbRecent(4).length > 0);
t('常用模板可读', Store.kbTemplates(3).length > 0);
t('工作台偏好可读写（折叠 → 恢复）', (() => {
  Store.setPrefsDash({ collapsed:['mine'] });
  const ok = Store.prefsDash().collapsed.indexOf('mine') >= 0;
  Store.resetPrefsDash();
  return ok && Store.prefsDash().collapsed.length === 0;
})());
eq('缓存结构版本号已升到 12（NEWS 分流 + 删客户侧）', Number(Store.seedVersion()), 12);

// 注册账号机制（v1.22）：首个注册者自动成管理员，之后进「待分配」
t('预置角色里有「管理员」与「待分配」',
  Store.roles().some(r => r.id === 'admin') && Store.roles().some(r => r.id === 'pending'));
const pBefore = Store.people().length;
const admHad = Store.people().some(p => p.role === 'admin');
const r1 = Store.registerByPhone('13900001111', Store.demoSmsCode(), '测试一号');
t('第一个注册 → 成管理员', r1.ok && r1.person.role === 'admin');
t('首个注册自动登录', Store.currentUser().id === r1.person.id);
const r2 = Store.registerByPhone('13900002222', Store.demoSmsCode(), '测试二号');
t('第二个注册 → 待分配', r2.ok && r2.person.role === 'pending');
t('待分配不填报、不算最高权限', Store.roleDef('pending').submitDaily === false && Store.roleDef('pending').admin === false);
const rDup = Store.registerByPhone('13900001111', Store.demoSmsCode(), '重复号码');
t('同号重复注册被拒', rDup.ok === false);
const rBad = Store.registerByPhone('13900003333', '0000', '测试三号');
t('验证码错 → 注册被拒（不落库）', rBad.ok === false && Store.people().length === pBefore + 2);
eq('注册各落一条审计日志', Store.state.logs.filter(l => l.action === '注册账号').length >= 2, true);

// NEWS 与团队信息流分流（v1.22a）
const nwFeed = Store.newsFeed({ source:'feed' });
const nwNews = Store.newsFeed({ source:'news' });
t('AI 资讯（nw8 / nw9）只进 NEWS 口径', nwNews.every(n => n.source === 'news') &&
  nwNews.some(n => n.id === 'nw8') && nwNews.some(n => n.id === 'nw9'));
t('团队信息流不含 AI 资讯', nwFeed.every(n => n.source !== 'news') && nwFeed.some(n => n.id === 'nw1'));
t('两个口径加起来 = 全部可见内容',
  Store.newsFilterCounts('news')['全部'] + Store.newsFilterCounts('feed')['全部'] ===
  Store.newsFilterCounts()['全部']);
t('本周统计也分口径（feed ≤ 全部）', Store.newsStats(undefined, 'feed').count <= Store.newsStats().count);
// 管理员派角色：待分配 → TA
Store.setUser(r1.person.id);
const asg = Store.upsertPerson({ id:r2.person.id, name:'测试二号', role:'member', phone:'13900002222' });
t('管理员能把待分配改成正式角色', asg.ok && Store.person(r2.person.id).role === 'member');
// 清理注册出来的测试账号，还原人员表
Store.state.people = Store.state.people.filter(p => p.id !== r1.person.id && p.id !== r2.person.id);
t('人员数还原（测试账号已清）', Store.people().length, pBefore);
Store.setUser('olivia');

// 还原
Store.state.news = JSON.parse(newsSnap);
const cs = JSON.parse(cfgSnap);
Store.state.config.internNews = cs.n;
Store.state.config.internReview = cs.r;
Store.save();
Store.setUser('olivia');

console.log('\n== 时间点与提醒（配置项） ==');
const cfg2 = Store.state.config;
eq('18:30 汇报当日任务 + 明日计划', cfg2.reportTime, '18:30');
eq('22:00 提交截止', cfg2.deadline, '22:00');
eq('提醒 18:30 / 21:30', cfg2.remind1 + '/' + cfg2.remind2, '18:30/21:30');
eq('周报截止：周一（1）', cfg2.weeklyDueDay, 1);
eq('周报截止时间 17:00', cfg2.weeklyDue, '17:00');

console.log('\n== 每日任务（FR-38 ~ FR-41 · v1.15） ==');
eq('每日任务截止 10:45', cfg2.taskDeadline, '10:45');
eq('提醒节点 10:15 / 10:35', (cfg2.taskRemind || []).join('/'), '10:15/10:35');
eq('看板可见性默认全员可见', cfg2.taskVisibility, 'all');
eq('预计加班时长默认选填', cfg2.taskOtRequired, false);
t('推送开关默认全关（只走站内）', ['email','wecom','feishu'].every(k => !(cfg2.notify || {})[k]));
eq('能力位：最高权限都能管任务（老板 / PM / TA Leader）', Store.roles().filter(r => r.admin).every(r => r.taskManage), true);
eq('能力位：要交日报的角色都能交每日任务', Store.roles().filter(r => r.submitDaily).every(r => r.taskSubmit), true);
eq('能力位：TA Leader 既交任务也能管任务（唯一重合）',
  Store.roles().filter(r => r.taskSubmit && r.taskManage).map(r => r.id).join(','), 'tal');
t('任务种子覆盖最近 12 个工作日', (() => {
  const days = Array.from(new Set(Store.state.tasks.map(x => x.date)));
  return days.length === 12 && Store.state.tasks.length >= 80;
})());
eq('演示日 10-09 有 7 条任务记录（刘一鸣未交 = 无记录）',
  Store.state.tasks.filter(x => x.date === '2026-10-09').length, 7);
eq('演示日：常吉祥按时', Store.taskState('chang', '2026-10-09').key, 'ontime');
eq('演示日：孙世甲 11:20 交 → 逾期', Store.taskState('sun', '2026-10-09').key, 'late');
eq('演示日：罗思远停在草稿', Store.taskState('luo', '2026-10-09').key, 'draft');
eq('演示日：刘一鸣未交', Store.taskState('liuming', '2026-10-09').key, 'missing');
eq('演示日：王弋的修改申请已被放开 → 修改中', Store.taskState('wang', '2026-10-09').key, 'editing');
eq('演示日：安雅萱按时', Store.taskState('anya', '2026-10-09').key, 'ontime');
eq('演示日：已交 6 / 未交 2（含草稿）',
  Store.taskSubmission('2026-10-09').submittedN + '/' + Store.taskSubmission('2026-10-09').missingN, '6/2');
eq('演示时钟 10:20 → 距截止 25 分钟', Store.taskClock('2026-10-09').left, 25);
eq('倒计时文案', Store.taskCountdownText('2026-10-09'), '还有 25 分钟');
t('10:20 已过 10:15 提醒节点', Store.taskClock('2026-10-09').remind, '10:15');
eq('「今天」与日报页同口径（周六 → 演示基准日）', Store.today(), '2026-10-09');
t('日报「明日计划」可单向预填次日任务', Store.taskFromDailyPlan('chang', '2026-10-09').length >= 1);
eq('今日任务可带入日报条目（常 3 条）', Store.taskToDailyEntries('chang', '2026-10-09').length, 3);
t('连续按时天数为非负整数', Number.isInteger(Store.taskStreak('chang')) && Store.taskStreak('chang') >= 0);
eq('近 10 个工作日趋势', Store.taskTrend(10).length, 10);
t('任务统计口径完整', (() => { const s = Store.taskStats(10);
  return s.days === 10 && s.byPerson.length === 8 && s.rate > 0 && s.overtime != null; })());
eq('加班口径：10-05 ~ 10-09 有 2 条日报加班（刘一鸣 1.5h + 孙世甲 2h）',
  Store.overtimeStats('2026-10-05', '2026-10-09').n, 2);
eq('加班总时长 3.5h', Store.overtimeStats('2026-10-05', '2026-10-09').hours, 3.5);
eq('条目状态三选一（文案）', Object.keys(Store.PROG_TEXT || {}).sort().join(','), 'done,overtime,undone');
t('未完成条目必须带原因（种子已迁移）', Store.state.reports.every(r =>
  (r.entries || []).every(e => e.progress !== 'undone' || (e.reason || e.note || '').trim())));
eq('安雅萱有「需加班完成」条目（1.5h）',
  (Store.getReport('anya', '2026-10-09').entries || []).some(e => e.progress === 'overtime' && e.otHours === 1.5), true);
eq('全员可见时员工也能看别人任务（可看 ≠ 可配）',
  (() => { Store.setUser('wang'); const v = Store.canSeeTask('li'); Store.setUser('olivia'); return v; })(), true);
t('员工也能改可见性（v1.17 全员可编辑）', (() => {
  Store.setUser('wang'); const r = Store.setTaskVisibility('self');
  const ok = r === true && Store.taskVisibility() === 'self';
  Store.setTaskVisibility('all'); Store.setUser('olivia');
  return ok;
})());
t('管理员改可见性成功且写日志', (() => {
  const before = Store.state.logs.length;
  Store.setTaskVisibility('group');
  const ok = Store.taskVisibility() === 'group' && Store.state.logs.length === before + 1;
  Store.setTaskVisibility('all');
  return ok;
})());
eq('仅本组可见：同组成员可见、跨组不可见', (() => {
  Store.setTaskVisibility('group');
  Store.setUser('chang');
  const ok = Store.canSeeTask('li') && !Store.canSeeTask('wang');
  Store.setUser('olivia'); Store.setTaskVisibility('all'); return ok;
})(), true);
t('「放开修改」是一次性授权：重新提交后清掉申请、回到常规只读', (() => {
  const rec = Store.taskOf('wang', '2026-10-09');
  if (!rec) return false;
  const granted = !!(rec.editRequest && rec.editRequest.granted);
  Store.submitTask(rec);
  const cleared = Store.taskOf('wang', '2026-10-09').editRequest === null;
  const key = Store.taskState('wang', '2026-10-09').key;
  return granted && cleared && key === 'ontime';
})());
t('提交后再申请修改 → 回到「待放开」状态', (() => {
  const rec = Store.taskOf('wang', '2026-10-09');
  Store.requestTaskEdit(rec, '描述有误，需补充场景编号');
  const st = Store.taskState('wang', '2026-10-09');
  return st.key === 'requested' && st.rec.editRequest.granted === false &&
    !!st.rec.editRequest.reason;
})());

/* == 下拉项（枚举）管理（v1.16）== */
eq('优先级默认三项（state 派生）', Store.priorities().length, 3);
t('TASK_PRIORITY 走 getter，与 priorities() 同源', Store.TASK_PRIORITY === Store.priorities());
eq('管线枚举六条', Store.pipelines().length, 6);
eq('内容流分类五项', Store.newsCats().length, 5);
t('员工也能改下拉项（v1.17 全员可编辑）', (() => {
  Store.setUser('chang');
  const before = Store.pipelines().length;
  const ok = Store.upsertPipeline({ name:'测试管线' }) === true && Store.pipelines().length === before + 1;
  const id = Store.pipelines()[Store.pipelines().length - 1].id;
  Store.removePipeline(id);
  Store.setUser('olivia');
  return ok && Store.pipelines().length === before;
})());

/* == 管理区 CRUD（v1.17：人员 / 角色 / 催办话术 / 采购都能改）== */
eq('能力清单 9 项（供角色矩阵勾选）', Store.caps().length, 9);
t('角色矩阵可写：关掉某能力立刻生效、再开回来', (() => {
  const before = Store.capOf('member', 'finance');
  Store.setRoleCap('member', 'finance', false);
  const off = Store.capOf('member', 'finance') === false;
  Store.setUser('wang');
  const blocked = Store.can('finance') === false;
  Store.setUser('olivia');
  Store.setRoleCap('member', 'finance', before);
  return off && blocked && Store.capOf('member', 'finance') === before;
})());
t('人员可增删改（含角色调整，删除友好报错）', (() => {
  const n0 = Store.people().length;
  const r = Store.upsertPerson({ name:'测试同学', role:'member', group:'d3', title:'3DGS 组 · 测试', mainPipe:'3dgs', unitPrice:200 });
  if (!r.ok) return false;
  const id = r.person.id;
  const added = Store.people().length === n0 + 1 && (Store.groupOf('d3').members || []).indexOf(id) >= 0;
  const edited = Store.upsertPerson({ id:id, name:'测试同学2', role:'intern', dailySubmit:false }).ok &&
    Store.person(id).name === '测试同学2' && Store.person(id).role === 'intern' && Store.person(id).dailySubmit === false &&
    (Store.groupOf('d3').members || []).indexOf(id) < 0;   // 编辑时未传组 → 退出原组，同步已生效
  const removed = Store.removePerson(id).ok && Store.people().length === n0;
  return added && edited && removed;
})());
t('角色可新增/改名/删除（有人员时拒绝删除）', (() => {
  const n0 = Store.roles().length;
  const r = Store.upsertRole({ name:'测试角色', level:2, submitDaily:true, taskSubmit:true });
  if (!r.ok) return false;
  const id = r.role.id;
  const added = Store.roles().length === n0 + 1;
  const renamed = Store.upsertRole({ id:id, name:'测试角色2' }).ok && Store.roleName(id) === '测试角色2';
  const pr = Store.upsertPerson({ name:'角色测试人员', role:id });
  const blocked = pr.ok && Store.removeRole(id).ok === false;
  if (pr.ok) Store.removePerson(pr.person.id);
  const removed = Store.removeRole(id).ok && Store.roles().length === n0;
  return added && renamed && blocked && removed;
})());
t('催办话术模板可增删改 + 占位符渲染', (() => {
  const n0 = Store.remindTemplates().length;
  const add = Store.upsertRemindTpl({ name:'测试话术', when:'手动', text:'@{name} 请交 {date} 日报，截止 {deadline}，共 {count} 人' });
  if (!add.ok) return false;
  const id = Store.remindTemplates()[Store.remindTemplates().length - 1].id;
  const rendered = Store.reminderBulkText(['anya'], '2026-10-09', id);
  const okText = rendered.indexOf('@安雅萱') === 0 && rendered.indexOf('10月09日') > 0 &&
    rendered.indexOf(Store.state.config.deadline) > 0 && rendered.indexOf('1 人') > 0;
  const moved = Store.moveRemindTpl(id, -1) === true;
  const del = Store.removeRemindTpl(id).ok && Store.remindTemplates().length === n0;
  return okText && moved && del;
})());
t('采购可记一笔（同步到日报）并可删除', (() => {
  const before = Store.costStats('2026-10-05', '2026-10-09').purchaseFen;
  const att = { name:'发票.png', size:1024, type:'image/png', data:'data:image/png;base64,AAAA' };
  const add = Store.addPurchase({ date:'2026-10-09', personId:'liuming', task:'测试采购 · 硬盘',
    purchased:2, amountFen:123400, note:'自检', atts:[att] });
  if (!add.ok) return false;
  const cs = Store.costStats('2026-10-05', '2026-10-09');
  const grew = cs.purchaseFen === before + 123400;
  const row = cs.purchase.filter(p => p.task === '测试采购 · 硬盘')[0];
  const attOk = row && row.atts && row.atts.length === 1 && row.atts[0].name === '发票.png';
  const del = row && Store.removePurchase(row.date, row.personId, row.entry).ok &&
    Store.costStats('2026-10-05', '2026-10-09').purchaseFen === before;
  return grew && attOk && !!del;
})());
t('采购附件 · 无附件的记录读出空数组（兼容旧数据）',
  Store.costStats('2026-10-05', '2026-10-09').purchase.every(p => Array.isArray(p.atts)));
t('采购附件 · 超过 3 个拒绝', (() => {
  const many = [1, 2, 3, 4].map(i => ({ name:'f' + i + '.png', size:10, type:'image/png', data:'data:image/png;base64,AA' }));
  return Store.addPurchase({ date:'2026-10-09', personId:'liuming', task:'超限测试',
    amountFen:100, atts:many }).ok === false;
})());
t('采购附件 · 单文件超 10MB 拒绝', (() => {
  const big = { name:'big.png', size:11 * 1024 * 1024, type:'image/png', data:'data:image/png;base64,' + 'A'.repeat(11 * 1024 * 1024) };
  return Store.addPurchase({ date:'2026-10-09', personId:'liuming', task:'超大测试',
    amountFen:100, atts:[big] }).ok === false;
})());
t('最高权限可新增 / 改名 / 删除管线', (() => {
  Store.setUser('olivia');
  const n0 = Store.pipelines().length;
  const add = Store.upsertPipeline({ name:'特效合成' });
  const added = Store.pipelines().find(p => p.name === '特效合成');
  const ren = added ? Store.upsertPipeline({ id:added.id, name:'特效与合成' }) : false;
  const renamed = Store.pipelines().some(p => p.name === '特效与合成');
  const del = added ? Store.removePipeline(added.id) : false;
  return add && !!added && ren && renamed && del && Store.pipelines().length === n0;
})());
t('兜底项「其他」不可删', Store.removePipeline('other') === false);
t('最高权限可增删优先级', (() => {
  const n0 = Store.priorities().length;
  Store.upsertPriority({ t:'紧急' });
  const added = Store.priorities().some(p => p.t === '紧急');
  const del = Store.removePriority((Store.priorities().find(p => p.t === '紧急') || {}).id);
  return added && del && Store.priorities().length === n0;
})());
t('最高权限可增删内容流分类', (() => {
  const n0 = Store.newsCats().length;
  Store.upsertNewsCat('案例');
  const added = Store.newsCats().indexOf('案例') >= 0;
  const del = Store.removeNewsCat('案例');
  return added && del && Store.newsCats().length === n0;
})());
const priSnap = JSON.stringify(Store.priorities());
t('优先级最少留一项（不可清空）', (() => {
  const keep = Store.priorities()[0].id;
  Store.priorities().slice(1).forEach(p => Store.removePriority(p.id));
  const left = Store.priorities().length;
  const blocked = Store.removePriority(keep) === false;
  Store.state.priorities = JSON.parse(priSnap);
  return left === 1 && blocked;
})());
Store.setUser('olivia');

// 还原

console.log('\n---------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
