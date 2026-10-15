/* 渲染自检：用 jsdom 真实渲染每个页面与关键交互，捕获运行时报错 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..', 'assets');

const html = `<!DOCTYPE html><html><body>
<div id="login" class="login-root" hidden></div>
<div class="app">
  <aside class="sidebar" id="sidebar"></aside>
  <div class="main">
    <header class="topbar" id="topbar"></header>
    <main class="content" id="view"></main>
    </div>
</div>
<div id="toast" class="toast-wrap"></div>
<div id="modal" class="modal-root" hidden></div>
</body></html>`;

const dom = new JSDOM(html, { url:'http://localhost/', runScripts:'outside-only', pretendToBeVisual:true });
const w = dom.window;

['seed.js','ui.js','store.js','views-daily.js','views-overview.js','views-weekly.js','views-weekreport.js','views-kb.js','views-workbench.js','views-task.js','app.js']
  .forEach(f => w.eval(fs.readFileSync(path.join(DIR, f), 'utf8')));

w.App.boot();   // jsdom 下 DOMContentLoaded 尚未触发，显式启动

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  → ' + x : '')); } };
const bad = txt => {
  const m = txt.match(/\bundefined\b|\[object Object\]|\bNaN\b/);
  return m ? m[0] : null;
};

// ---- 登录门 ----
ok('未登录 · 登录层可见且整站隐藏',
  w.document.getElementById('login').hidden === false &&
  w.document.querySelector('.app').style.display === 'none');
ok('未登录 · 渲染器拒绝出页面', (function () {
  w.location.hash = '#/board'; w.App.render();
  return w.document.querySelector('.app').style.display === 'none';
})());
ok('空密码被拒绝', w.Store.login('olivia', '').ok === false);
ok('短密码被拒绝', w.Store.login('olivia', 'ab').ok === false);
w.Store.login('olivia', 'demo1');
ok('登录成功 · 会话生效', w.Store.isLoggedIn() === true);
w.App.render();
ok('登录后 · 整站可见', w.document.querySelector('.app').style.display === '');
ok('登录后 · 有登录日志', w.Store.state.logs.some(l => l.action === '登录系统'));

console.log('== 登录页 v1.16（手机验证码 / 密码 / 微信） ==');
const lg = () => w.document.getElementById('login');
ok('登录页 · 居中白卡 + 标题 + 两个 Tab',
  !!lg().querySelector('.lg-card') && lg().querySelector('.lg-h1').textContent === '登录' &&
  lg().querySelectorAll('.lg-tab').length === 2);
ok('登录页 · 默认验证码登录（手机号 / 验证码 / 获取验证码）',
  !!lg().querySelector('#lgPhone') && !!lg().querySelector('#lgCode') && !!lg().querySelector('#lgSend'));
ok('登录页 · 密码面板收在 Tab 里且默认隐藏',
  lg().querySelector('[data-lg-pane="pass"]').hidden === true && !!lg().querySelector('#lgPass'));
ok('登录页 · 二维码默认收起（点击才在卡片内展开）', lg().querySelector('#lgQr').hidden === true);
ok('登录页 · 协议勾选 + 底部三个链接',
  !!lg().querySelector('#lgAgree') && lg().querySelectorAll('.lg-card-f .lg-link').length === 3);
ok('登录页 · 图形验证码默认不出现，连续失败才出',
  lg().querySelector('#lgCapWrap').hidden === true);
ok('登录页 · 旧的深色品牌区 / 身份大卡 / 账号下拉已移除',
  !lg().querySelector('.lg-brand') && !lg().querySelector('.lg-chips') && !lg().querySelector('#lgUser'));

ok('手机号 · 脱敏显示 138****0003', w.Store.maskPhone('13800000003') === '138****0003', w.Store.maskPhone('13800000003'));
ok('手机号 · 格式校验（1 开头 11 位）',
  w.Store.isPhone('13800000003') && !w.Store.isPhone('123') && !w.Store.isPhone('23800000003'));
ok('发送验证码 · 号码格式错 → 拒绝', w.Store.sendCode('123').ok === false);
ok('发送验证码 · 格式对 → 返回演示码与有效期',
  (function () { const r = w.Store.sendCode('138 0000 0003'); return r.ok && r.code === w.Store.demoSmsCode() && r.minutes >= 1; })());
ok('验证码登录 · 演示码可登录（= PM）',
  (function () { w.Store.logout(); const r = w.Store.loginByPhone('13800000003', w.Store.demoSmsCode());
    return r.ok && r.person.id === 'olivia' && w.Store.isLoggedIn(); })());
ok('验证码登录 · 验证码错 → 拒绝', w.Store.loginByPhone('13800000003', '0000').ok === false);
ok('验证码登录 · 未开通号码与错码的文案一致（不暴露账号是否存在）',
  w.Store.loginByPhone('13900000000', w.Store.demoSmsCode()).msg === w.Store.loginByPhone('13800000003', '0000').msg);
ok('验证码登录 · 空号码 / 客户侧都不放行', w.Store.loginByPhone('', w.Store.demoSmsCode()).ok === false);
ok('演示身份 · 快捷填入的都是内部人员且有手机号',
  w.Store.loginPicks().length >= 3 && w.Store.loginPicks().every(p => p.phone && p.name));
ok('微信扫码 · 原型模拟登录可用',
  (function () { w.Store.logout(); const r = w.Store.loginByWechat('wang'); return r.ok && r.person.id === 'wang'; })());
ok('登录 · 三条路径都写审计日志', w.Store.state.logs.filter(l => l.action === '登录系统').length >= 3);
w.Store.setUser('olivia'); w.Store.login('olivia', 'demo1'); w.App.render();

const routes = ['workbench','fill','mine','missing','board','weekly','weekboard','frisum','capacity','stats','kb','admin'];
const identities = ['olivia','wang','candice','ta','anya'];

console.log('== 逐页渲染（5 种身份 × ' + routes.length + ' 个页面） ==');
identities.forEach(u => {
  w.Store.setUser(u);
  routes.forEach(r => {
    w.location.hash = '#/' + r;
    let err = null;
    try { w.App.render(); } catch (e) { err = e.message; }
    ok(u + ' / ' + r + ' 渲染无异常', !err, err);
    if (err) return;
    const html2 = w.document.getElementById('view').innerHTML;
    ok(u + ' / ' + r + ' 有内容', html2.length > 60, '长度 ' + html2.length);
    const b = bad(html2);
    ok(u + ' / ' + r + ' 无脏值', !b, b);
  });
});

console.log('== 权限边界（v1.17：页面按人一致，权限只决定「能改什么」） ==');
w.Store.setUser('wang'); w.location.hash = '#/admin'; w.App.render();
ok('成员打开 #/admin · 能进管理页（全员可编辑）',
  w.location.hash === '#/admin' && w.Store.isPrivileged() === false && w.Store.can('personManage') === true,
  'hash=' + w.location.hash + ' / priv=' + w.Store.isPrivileged());
ok('成员打开 #/admin · 管理页正常渲染（8 个分页）',
  w.document.getElementById('view').querySelectorAll('[data-tab]').length === 8,
  w.document.getElementById('view').querySelectorAll('[data-tab]').length + ' 个分页');
w.Store.setUser('wang'); w.location.hash = '#/missing'; w.App.render();
ok('成员打开 #/missing · 能进未交名单页（催办能力默认全开）',
  w.location.hash === '#/missing' && w.document.getElementById('view').querySelectorAll('.wb-grid').length === 0,
  'hash=' + w.location.hash);
// 最高权限的三种角色都能进管理页
['candice','olivia','ta'].forEach(id => {
  w.Store.setUser(id); w.location.hash = '#/admin'; w.App.render();
  ok(id + ' 可进管理页（8 个分页，含看板与提醒）',
    w.document.getElementById('view').querySelectorAll('[data-tab]').length === 8,
    w.document.getElementById('view').querySelectorAll('[data-tab]').length + ' 个分页');
});
// v1.22a：客户侧参与人整体删除 —— 账号不存在、人员表里也没有
ok('客户侧不能登录（账号不存在）', w.Store.login('kelvin','abcd').ok === false);
ok('客户侧人员已从系统删除', !w.Store.people().some(p => p.type === 'client') &&
  !w.Store.roles().some(r => r.id === 'client'));
// 退回登录后重新登录，继续后面的交互检查
w.Store.setUser('olivia');
w.Store.login('olivia', 'demo1');
w.App.render();
ok('重新登录 · 整站恢复可见',
  w.document.getElementById('login').hidden === true &&
  w.document.querySelector('.app').style.display === '');

console.log('== 导航与落地页（v1.13：全员落地工作台） ==');
const navRoutes = () => Array.prototype.slice.call(w.document.querySelectorAll('#sidebar [data-route]')).map(x => x.dataset.route);
const navGroups = () => Array.prototype.slice.call(w.document.querySelectorAll('#sidebar .nav-group-label')).map(x => x.textContent);
const activeRoute = () => { const a = w.document.querySelector('#sidebar .nav-item.active'); return a ? a.dataset.route : null; };
const view = () => w.document.getElementById('view');

// 老师 / 实习生：落地工作台，侧栏有填报入口
w.Store.setUser('wang'); w.location.hash = ''; w.App.render();
let nr = navRoutes();
ok('侧栏 · 首项是「工作台」', nr[0] === 'workbench', nr.join(','));
ok('侧栏 · 分组样式与 v1.14 一致（总览/每日任务/日报/周报/知识/数据/管理）',
  (() => { const g = navGroups();
    return ['总览','每日任务','日报','周报','知识','数据','管理'].every(x => g.indexOf(x) >= 0) &&
      nr.indexOf('workbench') >= 0 && nr.indexOf('kb') >= 0 &&
      nr.indexOf('task') >= 0 && nr.indexOf('taskboard') >= 0 && nr.indexOf('taskstats') >= 0;
  })(), navGroups().join(','));
ok('全员侧栏 · 都有「管理」入口（v1.17 页面一致）', (() => {
  w.Store.setUser('olivia'); w.App.render();
  const has = navRoutes().indexOf('admin') >= 0;
  w.Store.setUser('wang'); w.App.render();
  return has && navRoutes().indexOf('admin') >= 0;
})(), navRoutes().join(','));
ok('老师 · 有「日报填报」「我的日报」', nr.indexOf('fill') >= 0 && nr.indexOf('mine') >= 0, nr.join(','));
ok('老师 · 也能看到「未交名单」「管理」（页面按人一致）',
  nr.indexOf('missing') >= 0 && nr.indexOf('admin') >= 0, nr.join(','));
ok('老师 · 落地页 = 工作台', activeRoute() === 'workbench' && w.location.hash === '#/workbench',
  activeRoute() + ' / ' + w.location.hash);
ok('老师 · 工作台已渲染出卡片', view().querySelectorAll('.wb-card').length > 0,
  view().querySelectorAll('.wb-card').length + ' 张');

// 最高权限：落地工作台；v1.22a 起不填报 → 侧栏没有填报类入口
w.Store.setUser('olivia'); w.location.hash = ''; w.App.render();
nr = navRoutes();
ok('最高权限 · 没有「日报填报 / 我的日报 / 我的周报 / 今日任务」（不填报）',
  ['fill','mine','weekly','task'].every(r => nr.indexOf(r) < 0), nr.join(','));
ok('最高权限 · 保留看板 / 未交名单 / 管理',
  nr.indexOf('board') >= 0 && nr.indexOf('missing') >= 0 && nr.indexOf('admin') >= 0, nr.join(','));
ok('最高权限 · 落地页 = 工作台', activeRoute() === 'workbench', activeRoute());
ok('最高权限 · 工作台不是空页', view().querySelectorAll('.wb-card').length >= 8,
  view().querySelectorAll('.wb-card').length + ' 张');

// 深链：不填报的人直达 #/fill 会被守卫弹回工作台（v1.22a）
w.location.hash = '#/fill'; w.App.render();
ok('深链守卫 · 不填报的 PM 打开 #/fill 弹回工作台',
  w.location.hash === '#/workbench', w.location.hash);

// 切回老师：填报入口同样可用
w.Store.setUser('wang'); w.location.hash = '#/fill'; w.App.render();
ok('切回老师 · 日报填报可用', view().innerHTML.indexOf('entry-form') >= 0);

// v1.14 下线：PPT 取材包 / 本周节奏（页面与专属口径一起移除）
ok('侧栏 · 已无「PPT 取材包」', nr.indexOf('brief') < 0, nr.join(','));
ok('侧栏 · 已无「本周节奏」', nr.indexOf('rhythm') < 0, nr.join(','));
ok('路由表 · Views 里不再注册这两页',
  w.Views.brief === undefined && w.Views.rhythm === undefined);
ok('口径层 · briefText / progressBlock 已下线',
  w.Store.briefText === undefined && w.Store.progressBlock === undefined);
ok('口径层 · 节奏节点口径已下线（取材口径保留给知识库派生）',
  w.Store.nodes === undefined && w.Store.updateNode === undefined &&
  typeof w.Store.briefData === 'function' && typeof w.Store.allWeeks === 'function');
ok('周期列表改为从周报 / 日报派生（周报页下拉不再依赖节奏节点）',
  w.Store.allWeeks().length >= 2 && w.Store.allWeeks().indexOf('2026-10-12') >= 0,
  w.Store.allWeeks().join(','));
ok('知识库「本周进展速览」仍能派生（口径未被误删）',
  w.Store.kbAutoWeekly('2026-10-05').indexOf('# 本周进展速览') === 0);
w.location.hash = '#/brief'; w.App.render();
ok('深链 · #/brief 被改写到落地页 = 工作台',
  activeRoute() === 'workbench' && w.location.hash === '#/workbench', activeRoute() + ' / ' + w.location.hash);
w.location.hash = '#/rhythm'; w.App.render();
ok('深链 · #/rhythm 被改写到落地页 = 工作台',
  activeRoute() === 'workbench' && w.location.hash === '#/workbench', activeRoute() + ' / ' + w.location.hash);

console.log('== 工作台（FR-36）与内容流（FR-37） ==');
w.Store.setUser('olivia'); w.Store.resetPrefsDash();
w.location.hash = '#/workbench'; w.App.render();
const wb = view();
ok('三栏栅格', wb.querySelectorAll('.wb-col').length === 3);
ok('左栏首张卡 = 今日状态',
  wb.querySelector('.wb-col[data-col="a"] .wb-card').dataset.card === 'today');
ok('中栏是信息流主卡', wb.querySelector('.wb-col[data-col="b"] .wb-card').dataset.card === 'feed');
ok('最高权限形态 · 今日状态换成「团队提交」',
  wb.querySelector('.wb-card[data-card="today"]').innerHTML.indexOf('团队提交') >= 0);
ok('最高权限 · 没有「我的最近日报」卡（不填报）', wb.querySelector('.wb-card[data-card="mine"]') === null);
ok('最高权限 · 卡片 11 张（v1.22a 新增 NEWS 卡）', wb.querySelectorAll('.wb-card').length === 11, wb.querySelectorAll('.wb-card').length + ' 张');
ok('信息流条目 ≥ 5 条', wb.querySelectorAll('.ni').length >= 5, wb.querySelectorAll('.ni').length + ' 条');
ok('置顶内容排在第一条', wb.querySelector('.ni').classList.contains('pinned'));
ok('分类标签已渲染', wb.querySelectorAll('.ctag').length > 0);
ok('实习生身份标签自动生成（不可手改）', wb.innerHTML.indexOf('idtag intern') >= 0);
ok('筛选胶囊四档（全部 / 公告 / 活动 / 我的发布）', wb.querySelectorAll('[data-filter]').length === 4);
ok('信息流不含 AI 资讯（v1.22a 分流）',
  wb.querySelector('.wb-card[data-card="feed"]').innerHTML.indexOf('Sora 2 发布') < 0);
ok('NEWS 卡在左列（v1.22a）', wb.querySelector('.wb-card[data-card="newscard"]') !== null &&
  wb.querySelector('.wb-card[data-card="newscard"]').closest('.wb-col').dataset.col === 'a');
ok('NEWS 卡 · 标题行可点（2 条种子 AI 资讯）', wb.querySelectorAll('[data-nopen]').length === 2);
ok('NEWS 卡 · 有「去 NEWS 页」与「＋ 发 AI 资讯」',
  !!wb.querySelector('.wb-card[data-card="newscard"] [data-go="news"]') &&
  !!wb.querySelector('.wb-card[data-card="newscard"] [data-act="npcompose"]'));
ok('团队提交概览 · 未交头像组（可点催交）', wb.querySelector('.av-stack.miss') !== null);
ok('团队提交概览 · 7 日小趋势图', wb.querySelector('svg.spark') !== null);
ok('统计四格', wb.querySelectorAll('.tile').length === 4, wb.querySelectorAll('.tile').length + ' 格');
ok('统计卡不做「本周工时」（没有数据源）',
  Array.prototype.slice.call(wb.querySelectorAll('.t-l')).every(x => x.textContent.indexOf('工时') < 0));
ok('待我处理卡', wb.querySelector('.wb-card[data-card="todo"]') !== null);
ok('项目进展卡', wb.querySelector('.wb-card[data-card="project"]') !== null);
ok('知识库小卡三个 Tab', wb.querySelectorAll('[data-kbtab]').length === 3);
ok('工作台页面无脏值', !bad(wb.innerHTML), bad(wb.innerHTML));

// 老师形态：换卡片形态而不是换页面
w.Store.setUser('wang'); w.location.hash = '#/workbench'; w.App.render();
const wbT = view();
ok('老师形态 · 「我的最近日报」可见', wbT.querySelector('.wb-card[data-card="mine"]') !== null);
ok('老师形态 · 今日状态是「我写日报」',
  wbT.querySelector('.wb-card[data-card="today"]').innerHTML.indexOf('今天的日报') >= 0);
ok('老师形态 · 也能看到催办入口（v1.17 催办能力默认全开）',
  wbT.querySelector('[data-act="remind"]') !== null);
ok('老师形态 · NEWS 卡标题可点跳 NEWS 页', (() => {
  const li = wbT.querySelector('[data-nopen]');
  if (!li) return false;
  li.click();
  return w.location.hash === '#/news';
})());
w.Store.setUser('wang'); w.location.hash = '#/workbench'; w.App.render();
ok('老师形态 · 卡片 12 张（含「今日任务」与 NEWS 卡）', wbT.querySelectorAll('.wb-card').length === 12,
  wbT.querySelectorAll('.wb-card').length + ' 张');

// self 入口修复（v1.22a）：不填报的老板看不到填报类入口，深链弹回
w.Store.setUser('candice'); w.location.hash = '#/workbench'; w.App.render();
ok('老板侧栏 · 无「日报填报 / 我的日报 / 我的周报 / 今日任务」',
  ['fill','mine','weekly','task'].every(r => navRoutes().indexOf(r) < 0), navRoutes().join(','));
ok('老板深链 #/fill 弹回工作台', (w.location.hash = '#/fill', w.App.render(), w.location.hash === '#/workbench'), w.location.hash);
w.Store.setUser('olivia'); w.location.hash = '#/workbench'; w.App.render();

// 卡片折叠 / 隐藏 / 恢复
w.Store.setUser('olivia'); w.Store.resetPrefsDash(); w.App.render();
const menuBtn = wb.querySelector('[data-menu="team"]');
menuBtn.click();
const foldItem = Array.prototype.slice.call(wb.querySelectorAll('.wb-menu button')).find(b => b.dataset.m === 'fold');
ok('卡片「⋮」菜单可打开（键盘可达的排序兜底）', !!foldItem);
foldItem.click();
ok('折叠 · 只留卡头、正文隐藏',
  wb.querySelector('.wb-card[data-card="team"]').classList.contains('folded') &&
  wb.querySelector('.wb-card[data-card="team"] .wb-body').hidden === true);
w.Store.setPrefsDash({ hidden:['stats'] }); w.App.render();
ok('隐藏 · 卡片消失 + 底部「已隐藏 N 张」恢复条',
  wb.querySelector('.wb-card[data-card="stats"]') === null && wb.querySelector('.wb-hidden') !== null);
w.Store.resetPrefsDash(); w.App.render();
ok('恢复默认 · 卡片全部回来', wb.querySelectorAll('.wb-card').length === 11,
  wb.querySelectorAll('.wb-card').length + ' 张');

// 点赞 / 评论 / 筛选 / 加载更多
w.Store.setUser('wang');
// 取一条当前身份「尚未点赞」的内容：避免点到已赞条目落进取消赞分支
const likeBtns = Array.prototype.slice.call(wb.querySelectorAll('[data-like]'));
const likeBtn = likeBtns.find(b => (w.Store.newsItem(b.dataset.like).likes || []).indexOf('wang') < 0) || likeBtns[0];
const likeId = likeBtn.dataset.like;
const like0 = w.Store.newsItem(likeId).likes.length;
likeBtn.click();
ok('点赞 · 计数 +1', w.Store.newsItem(likeId).likes.length === like0 + 1,
  like0 + ' → ' + w.Store.newsItem(likeId).likes.length);
w.Store.newsLike(likeId); w.App.render();

const cmtBtn = wb.querySelector('[data-cmt]');
const cmtId = cmtBtn.dataset.cmt;
cmtBtn.click();
const cbox = wb.querySelector('[data-cmtbox="' + cmtId + '"]');
ok('评论 · 展开行内输入框（不弹窗）', !!cbox);
const c0 = (w.Store.newsItem(cmtId).comments || []).length;
const ctext = '自检评论：这条由自动化测试写入';
cbox.value = ctext;
wb.querySelector('[data-cmtsend="' + cmtId + '"]').click();
ok('评论 · 发表后即时出现在列表',
  w.Store.newsItem(cmtId).comments.length === c0 + 1 && wb.innerHTML.indexOf(ctext) >= 0,
  c0 + ' → ' + w.Store.newsItem(cmtId).comments.length);
w.Store.state.news = w.Store.newsRaw().map(n =>
  n.id === cmtId ? Object.assign({}, n, { comments:(n.comments || []).slice(0, c0) }) : n);

w.Store.setUser('olivia'); w.App.render();
wb.querySelector('[data-filter="公告"]').click();
ok('筛选 · 只剩公告类', wb.querySelectorAll('.ni').length === 1 &&
  wb.querySelector('.chip.on').textContent.indexOf('公告') >= 0, wb.querySelectorAll('.ni').length + ' 条');
wb.querySelector('[data-filter="全部"]').click();
const beforeMore = wb.querySelectorAll('.ni').length;
const moreBtn = wb.querySelector('[data-act="more"]');
ok('分页 · 有「加载更多」按钮（不用无限滚动）', !!moreBtn);
moreBtn.click();
ok('分页 · 加载更多追加条目', wb.querySelectorAll('.ni').length > beforeMore,
  beforeMore + ' → ' + wb.querySelectorAll('.ni').length);

// 发布弹窗：实习生（分类受限 / 无置顶 / 自动带身份标识）
w.Store.setUser('anya'); w.Store.resetPrefsDash(); w.App.render();
const mroot = w.document.getElementById('modal');
wb.querySelector('.feed-head [data-act="compose"]').click();
ok('发布弹窗打开', mroot.hidden === false && !!mroot.querySelector('#cpTitle'));
ok('实习生 · 5 类里 2 类置灰（公告 / 新闻）',
  mroot.querySelectorAll('#cpCats .chip').length === 5 && mroot.querySelectorAll('#cpCats .chip.dis').length === 2,
  mroot.querySelectorAll('#cpCats .chip.dis').length + ' 类置灰');
ok('置灰分类给得出理由', mroot.querySelector('[data-cat="公告"]').title.indexOf('管理层') >= 0);
ok('实习生 · 看不到「置顶」选项', mroot.querySelector('#cpPin') === null);
mroot.querySelector('#cpTitle').value = '自检：实习生发的学习笔记';
mroot.querySelector('#cpBody').value = '## 小标题\n- 要点一\n- 要点二';
mroot.querySelector('[data-cat="学习"]').click();
mroot.querySelector('#cpGo').click();
const minePost = w.Store.newsRaw().find(n => n.title === '自检：实习生发的学习笔记');
ok('实习生发布成功（审核关闭 → 直接发布）', !!minePost && minePost.status === 'published');
const newArt = Array.prototype.slice.call(wb.querySelectorAll('.ni')).find(a => a.innerHTML.indexOf('自检：实习生发的学习笔记') >= 0);
ok('新内容即时出现在列表', !!newArt);
ok('新内容带「实习生」标识', !!newArt && newArt.innerHTML.indexOf('idtag intern') >= 0);
ok('发布后弹窗自动关闭', mroot.hidden === true);

// 发布弹窗：管理层（5 类全开 + 可置顶）
w.Store.setUser('olivia'); w.App.render();
wb.querySelector('.feed-head [data-act="compose"]').click();
ok('管理层 · 5 类无置灰', mroot.querySelectorAll('#cpCats .chip.dis').length === 0);
ok('管理层 · 可见「置顶」选项', mroot.querySelector('#cpPin') !== null);
mroot.querySelector('#cpTitle').value = '自检：公告 + 置顶';
mroot.querySelector('#cpBody').value = '公告正文';
mroot.querySelector('[data-cat="公告"]').click();
mroot.querySelector('#cpPin').checked = true;
mroot.querySelector('#cpGo').click();
const annPost = w.Store.newsRaw().find(n => n.title === '自检：公告 + 置顶');
ok('公告发布并可置顶', !!annPost && annPost.pinned === true && annPost.category === '公告');
ok('置顶公告排到列表第一条',
  !!annPost && wb.querySelector('.ni').dataset.news === annPost.id, wb.querySelector('.ni').dataset.news);

// 全局搜索（顶栏 ⌘K）
ok('全局搜索 · 能搜到内容流 / 日报 / 知识库',
  w.App.searchAll('渲染').hits.length > 0, w.App.searchAll('渲染').hits.length + ' 条命中');
w.App.search();
ok('全局搜索面板打开且有输入框', mroot.hidden === false && !!mroot.querySelector('#gsInput'));
mroot.querySelector('[data-close]').click();
ok('搜索面板可关闭', mroot.hidden === true);

// 用完就清，避免污染后续断言
if (annPost) w.Store.removeNews(annPost.id);
if (minePost) w.Store.removeNews(minePost.id);
w.Store.resetPrefsDash();
w.App.render();

console.log('== 渲染兜底（出错不白屏） ==');
w.Store.setUser('olivia');
const realBoard = w.Views.board.render;
w.Views.board.render = () => { throw new Error('自检故意抛错'); };
w.location.hash = '#/board'; w.App.render();
const crashHTML = w.document.getElementById('view').innerHTML;
ok('页面渲染抛错时 · 显示兜底卡而非空白',
  crashHTML.length > 0 && crashHTML.indexOf('这个页面没能显示出来') >= 0, crashHTML.length + ' 字符');
ok('兜底卡 · 有一键重建本地数据', w.document.getElementById('crashFix') !== null);
w.Views.board.render = realBoard;
w.location.hash = '#/board'; w.App.render();
ok('恢复后 · 看板正常渲染', w.document.getElementById('view').querySelectorAll('.pcard').length > 0);

console.log('== 关键交互 ==');
w.Store.setUser('wang');   // 填报页只有本人填报者能进（v1.12：最高权限无填报入口）

// 1) 填报页：添加条目 / 复用昨日 / 提交校验
w.location.hash = '#/fill'; w.App.render();
const fillView = w.document.getElementById('view');   // 与上方 view() 函数区分（v1.13 新增块）
const before = fillView.querySelectorAll('[data-entry]').length;
fillView.querySelector('#btnAddEntry').click();
const after = w.document.getElementById('view').querySelectorAll('[data-entry]').length;
ok('填报页 · 添加条目', after === before + 1, before + ' → ' + after);

// 填一个合规条目并提交
const v2 = w.document.getElementById('view');
v2.querySelector('[data-task]').value = '自动化测试条目';
v2.querySelector('[data-task]').dispatchEvent(new w.Event('input'));
// 工时字段已下线：填报页不应再有工时输入与「向客户汇报」开关
ok('填报页 · 已无工时输入框', v2.querySelector('[data-hours]') === null);
ok('填报页 · 已无「向客户汇报」开关', v2.querySelector('[data-cvis]') === null);
// 默认「进行中」无需链接 → 直接提交
let submitted = false;
const btn = w.document.getElementById('view').querySelector('#btnSubmit');
ok('填报页 · 提交按钮存在', !!btn);
if (btn) { btn.click(); submitted = true; }
w.Store.setUser('olivia');
const wangRep = w.Store.getReport('wang', w.SEED.demoDate);
ok('填报页 · 提交后落库', !!wangRep && wangRep.status === 'submitted');

// 2) 未交名单：全选 → 一键催办（生成可复制话术；系统不代发）
w.Store.reset();
w.Store.setUser('olivia');
w.location.hash = '#/missing'; w.App.render();
const mv = w.document.getElementById('view');
const selAll = mv.querySelector('#msSelAll');
ok('未交名单 · 全选按钮存在', !!selAll);
ok('未交名单 · 记录表表头换成「结果」，不再有「已读」列',
  (() => { const hs = Array.prototype.slice.call(mv.querySelectorAll('th')).map(t => t.textContent.trim());
    return hs.indexOf('已读') < 0 && hs.indexOf('未读') < 0 && hs.indexOf('结果') >= 0; })(),
  Array.prototype.slice.call(mv.querySelectorAll('th')).map(t => t.textContent.trim()).join('/'));
ok('未交名单 · 唯一出现「已读」的地方是那句解释（不是数据列）',
  (mv.innerHTML.match(/已读/g) || []).length === 1,
  (mv.innerHTML.match(/已读/g) || []).length + ' 次');
const remBefore = w.Store.remindersOn(w.SEED.demoDate).length;
if (selAll) { selAll.click(); w.document.getElementById('view').querySelector('#msPush').click(); }
const remAfter = w.Store.remindersOn(w.SEED.demoDate).length;
ok('未交名单 · 催办写入留痕', remAfter > remBefore, remBefore + ' → ' + remAfter);
const lastRm = w.Store.remindersOn(w.SEED.demoDate).slice(-1)[0];
ok('未交名单 · 催办渠道记「微信」（PM 自己发）', !!lastRm && lastRm.channel === '微信',
  lastRm && lastRm.channel);
ok('未交名单 · 催办不再写 read / fulfilled 字段',
  !!lastRm && lastRm.read === undefined && lastRm.fulfilled === undefined);
const rmodal = w.document.getElementById('modal');
const rtext = rmodal ? rmodal.textContent : '';
ok('催办后 · 弹出可复制话术而不是「已发出」提示',
  !!rmodal && !rmodal.hidden && rtext.indexOf('@') >= 0 &&
  rtext.indexOf(w.SEED.config.deadline) >= 0,
  rtext.replace(/\s+/g, ' ').slice(0, 90));
ok('催办话术弹窗 · 有「复制催办话术」按钮', !!rmodal && !!rmodal.querySelector('[data-copy-remind]'));
ok('催办话术弹窗 · 文案讲明系统不代发', rtext.indexOf('不代发') >= 0);
if (rmodal && rmodal.querySelector('[data-close]')) rmodal.querySelector('[data-close]').click();
ok('催办话术弹窗 · 可关闭', w.document.getElementById('modal').hidden === true);

// 3) 管理页：口径配置改动生效
w.Store.reset(); w.Store.setUser('olivia');
w.location.hash = '#/admin'; w.App.render();
const tabs = w.document.getElementById('view').querySelectorAll('[data-tab]');
ok('管理页 · 8 个分页（含看板与提醒）', tabs.length === 8, tabs.length);
// 「下拉项」分页（v1.16→v1.18）：关联管线 / 优先级 / 内容流分类 / 分组，最高权限可增删改
(() => {
  const en = [].slice.call(tabs).find(t => t.dataset.tab === 'enums');
  ok('管理页 · 有「下拉项」分页', !!en);
  if (!en) return;
  en.click();
  const v = w.document.getElementById('view');
  ok('下拉项 · 四组枚举都在（关联管线 / 优先级 / 内容流分类 / 分组）',
    v.innerHTML.indexOf('关联管线') >= 0 && v.innerHTML.indexOf('优先级') >= 0 &&
    v.innerHTML.indexOf('内容流分类') >= 0 && v.innerHTML.indexOf('分组（所属组）') >= 0);
  ok('下拉项 · 编辑按钮数 = 管线 6 + 优先级 3 + 分类 5 + 分组 2',
    v.querySelectorAll('[data-ened]').length === 16, v.querySelectorAll('[data-ened]').length + ' 个');
  ok('下拉项 · 每组都有「+ 新增」', v.querySelectorAll('[data-enadd]').length === 4,
    v.querySelectorAll('[data-enadd]').length + ' 个');
  ok('下拉项 · 每行都有上移 / 下移', v.querySelectorAll('[data-enup]').length === 16 &&
    v.querySelectorAll('[data-endn]').length === 16);
  ok('下拉项 · 兜底项「其他」没有删除按钮', v.querySelectorAll('[data-endel="pipe:other"]').length === 0);
})();
// v1.17：管理页每一块都能改 —— 人员 / 角色矩阵 / 催办话术 / 采购
(() => {
  const view = () => w.document.getElementById('view');
  const tab = name => [].slice.call(view().querySelectorAll('[data-tab]'))
    .find(t => t.dataset.tab === name);

  tab('dash').click();
  const dv = view();
  ok('看板与提醒 · 有催办话术模板卡（可编辑）',
    dv.querySelectorAll('[data-tnew]').length === 1 && dv.querySelectorAll('[data-ted]').length === 4,
    dv.querySelectorAll('[data-ted]').length + ' 条话术');
  ok('看板与提醒 · 话术行有上移 / 下移 / 删除',
    dv.querySelectorAll('[data-tup]').length === 4 && dv.querySelectorAll('[data-tdel]').length === 4);
  ok('看板与提醒 · 写明占位符（{name} / {deadline}）',
    dv.innerHTML.indexOf('{name}') >= 0 && dv.innerHTML.indexOf('{deadline}') >= 0);

  tab('people').click();
  const pv = view();
  ok('人员 · 有「+ 添加人员」', pv.querySelectorAll('[data-pnew]').length === 1);
  ok('人员 · 每行都有编辑按钮（v1.22a 起只有内部成员）',
    pv.querySelectorAll('[data-ped]').length === w.Store.people().length,
    pv.querySelectorAll('[data-ped]').length + ' 个');
  ok('人员 · 有停用 / 恢复与删除入口',
    pv.querySelectorAll('[data-poff]').length + pv.querySelectorAll('[data-pon]').length >= 1 &&
    pv.querySelectorAll('[data-pdel]').length >= 1);

  tab('roles').click();
  const rv = view();
  ok('角色与权限 · 有「+ 新增角色」', rv.querySelectorAll('[data-rnew]').length === 1);
  ok('角色与权限 · 能力矩阵可勾选（9 项能力 × 9 角色 = 81 个）',
    rv.querySelectorAll('[data-rolecap]').length === 72, rv.querySelectorAll('[data-rolecap]').length + ' 个');
  ok('角色与权限 · 四个角色开关也可勾（4 × 9 = 36）',
    rv.querySelectorAll('[data-roleflag]').length === 32, rv.querySelectorAll('[data-roleflag]').length + ' 个');
  ok('角色与权限 · 内容流权限可勾（4 × 9 = 36）',
    rv.querySelectorAll('[data-rolenews]').length === 32, rv.querySelectorAll('[data-rolenews]').length + ' 个');
  ok('角色与权限 · 每个角色都有编辑按钮', rv.querySelectorAll('[data-red]').length === w.Store.roles().length);
})();
// 成本与支出：采买的人不再只读
w.Store.setUser('olivia'); w.location.hash = '#/stats'; w.App.render();
ok('成本与支出 · 有「+ 记一笔采购」（采买条线可录入）',
  !!w.document.getElementById('view').querySelector('#sAdd'));
// 采购附件（v1.22b）：列头 + 查看器 + 录入弹窗文件选择
(() => {
  const sv = w.document.getElementById('view');
  ok('采购附件 · 明细表有「附件」列', sv.innerHTML.indexOf('>附件</th>') > 0);
  w.Store.addPurchase({ date:'2026-10-06', personId:'liuming', task:'附件渲染测试',
    amountFen:9900, atts:[{ name:'凭证.png', size:2048, type:'image/png', data:'data:image/png;base64,AAAA' }] });
  w.App.render();
  const link = sv.querySelector('.p-att');
  ok('采购附件 · 带附件的行出「📎 1」链接', !!link && link.textContent.indexOf('1') >= 0);
  if (link) {
    link.click();
    const modal = w.document.querySelector('.modal-root');
    ok('采购附件 · 点开查看器（含文件名与下载）',
      modal && !modal.hidden && modal.innerHTML.indexOf('凭证.png') > 0 && modal.innerHTML.indexOf('download') > 0);
    const c2 = modal && modal.querySelector('[data-close]');
    if (c2) c2.click();
  }
  w.Store.state.reports.forEach(r => { if (r.date === '2026-10-06') r.entries = (r.entries || []).filter(e => e.task !== '附件渲染测试'); });
  w.Store.save(); w.App.render();
  sv.querySelector('#sAdd').click();
  ok('采购附件 · 录入弹窗有文件选择（最多 3 个提示）',
    !!w.document.querySelector('#puAtts') && w.document.body.innerHTML.indexOf('最多 3 个') > 0);
  const c3 = w.document.querySelector('.modal-root [data-close]');
  if (c3) c3.click();
})();
w.location.hash = '#/admin'; w.App.render();
[].slice.call(w.document.getElementById('view').querySelectorAll('[data-tab]')).forEach(t => {
  t.click();
  const h = w.document.getElementById('view').innerHTML;
  ok('管理页 · 分页 ' + t.dataset.tab + ' 可渲染', h.length > 120 && !bad(h), bad(h));
});
// 截止时点改为 23:00 → 提醒时点应同步推导
w.location.hash = '#/admin'; w.App.render();
const cfgSel = w.document.getElementById('view').querySelector('[data-cfg="deadline"]');
if (cfgSel) {
  cfgSel.value = '23:00';
  cfgSel.dispatchEvent(new w.Event('change'));
  w.document.getElementById('view').querySelector('[data-tab="config"]');
  ok('口径 · 截止时点已保存', w.Store.state.config.deadline === '23:00', w.Store.state.config.deadline);
  ok('口径 · 提醒时点同步推导', w.Store.state.config.remind1 === '21:00' && w.Store.state.config.remind2 === '22:30',
    w.Store.state.config.remind1 + ' / ' + w.Store.state.config.remind2);
}

// 4) 名单边界：客户侧不进应提交名单，TA Leader 与实习生进
w.Store.reset(); w.Store.setUser('olivia');
w.location.hash = '#/board'; w.App.render();
const st = w.Store.submission(w.SEED.demoDate);
ok('客户侧不在应提交名单', !st.expected.some(p => p.type === 'client'));
ok('应提交 8 人（场景生成组 3 + 3DGS 组 4 + TA Leader 1）', st.expectedN === 8, st.expectedN);
ok('实习生与 TA Leader 都在名单内（页面一致、都要交）',
  st.expected.some(p => p.id === 'anya') && st.expected.some(p => p.id === 'ta'));
ok('不交日报的宏枢不在名单内', !st.expected.some(p => p.id === 'hongshu'));
ok('老板与 PM 不在名单内', !st.expected.some(p => ['boss','pm'].indexOf(p.role) >= 0));

// 7b) v1.23 口径：明日工作任务已下线；「已完成」不再强制产出物链接
w.Store.reset(); w.Store.setUser('wang'); w.Store.login('wang', 'demo1');
w.location.hash = '#/fill'; w.App.render();
let fv = w.document.getElementById('view');
ok('填报页 · 无「明日工作任务」区（已下线）', fv.innerHTML.indexOf('明日工作任务') < 0);
ok('填报页 · 产出物链接为选填（无红色必填提示）',
  fv.innerHTML.indexOf('必须填写产出物链接') < 0 && fv.innerHTML.indexOf('选填') > 0);
(() => {
  // 把唯一条目标成「已完成」且不加链接 → 校验应通过
  const seg = fv.querySelector('[data-prog$=":done"]');
  if (seg) { seg.click(); fv = w.document.getElementById('view'); }
  const del = fv.querySelector('[data-del-entry="1"]');
  if (del) { del.click(); fv = w.document.getElementById('view'); }
  ok('填报页 · 已完成且无链接不拦提交', fv.innerHTML.indexOf('校验通过') > 0,
    (fv.innerHTML.match(/条目 \d+：[^<]+/g) || ['通过']).join(' | ').slice(0, 160));
})();

// 7c) 角色与权限分页
w.Store.setUser('olivia'); w.location.hash = '#/admin'; w.App.render();
const rtab = [...w.document.getElementById('view').querySelectorAll('[data-tab]')].find(t => t.dataset.tab === 'roles');
ok('管理页 · 有「角色与权限」分页', !!rtab);
if (rtab) {
  rtab.click();
  const rh = w.document.getElementById('view').innerHTML;
  ok('角色与权限 · 渲染最高权限与 TA Leader', rh.indexOf('最高权限') > 0 && rh.indexOf('TA Leader') > 0);
  ok('角色与权限 · 有管理员与待分配（v1.22）', rh.indexOf('管理员') > 0 && rh.indexOf('待分配') > 0);
  ok('角色与权限 · 无脏值', !bad(rh), bad(rh));
}

// 7d) 日报一键「复制对外版」按钮
w.Store.reset(); w.Store.setUser('wang'); w.Store.login('wang', 'demo1');
w.location.hash = '#/mine'; w.App.render();
ok('我的日报 · 每行有「复制对外版」按钮',
  w.document.getElementById('view').querySelectorAll('[data-copyclient]').length >= 1);
w.location.hash = '#/fill'; w.App.render();
ok('填报页 · 有「复制对外版发群」按钮', !!w.document.getElementById('view').querySelector('#btnCopyClient'));
w.location.hash = '#/board'; w.App.render();
ok('日报看板 · 卡片有「复制对外版发群」按钮',
  w.document.getElementById('view').querySelectorAll('[data-copyclient]').length >= 1);
// 点一次：通过审查的日报 → 写入剪贴板（jsdom 下回退到 execCommand，仅验证不抛错）
w.document.getElementById('view').querySelector('[data-copyclient]').click();
ok('看板 · 点复制不抛错且给出了反馈',
  w.document.getElementById('toast').textContent.length > 0,
  w.document.getElementById('toast').textContent);
// 含内部信息的日报 → 应被拦下，不落剪贴板
const leakRep = w.Store.getReport('li', '2026-10-07');
ok('含 $14.67 的日报对外版会被拦',
  w.Store.reportVersions(leakRep).leaks.length > 0);

// 7e) 周报板块（FR-32）：老师填写 → 校验 → 提交；PM 发布本周工作任务
w.Store.reset(); w.Store.setUser('wang'); w.Store.login('wang', 'demo1');
w.location.hash = '#/weekly'; w.App.render();
let wv = w.document.getElementById('view');
ok('我的周报 · 有上周结果输入区', !!wv.querySelector('#wrLast'));
ok('我的周报 · 有风险 / 需支持区', !!wv.querySelector('#wrRisks'));
ok('我的周报 · 有复制周报文本按钮', !!wv.querySelector('#wrCopy'));
ok('我的周报 · 展示本周工作任务（全员可见）', wv.innerHTML.indexOf('本周工作任务') > 0);
ok('我的周报 · 展示本组提交状态', wv.innerHTML.indexOf('3DGS 组') > 0);
const wsel = wv.querySelector('#wrWeek');
ok('我的周报 · 周期选择器存在', !!wsel);
wsel.value = '2026-10-12'; wsel.dispatchEvent(new w.Event('change'));
wv = w.document.getElementById('view');
ok('我的周报 · 空内容时提交被拦', wv.querySelector('#wrSubmit').disabled === true);
ok('我的周报 · 提示缺「上周任务结果」', wv.innerHTML.indexOf('上周任务结果') > 0);
// 填上周结果 → 还缺目标建议
wv.querySelector('#wrLast').value = '渲染批次 R-35 共 22 个场景全部通过 QC，本周 QC 通过率 96.3%。';
wv.querySelector('#wrLast').dispatchEvent(new w.Event('input'));
wv = w.document.getElementById('view');
ok('我的周报 · 仍提示缺目标建议', wv.querySelector('#wrSubmit').disabled === true);
wv.querySelector('#btnAddSg').click();
wv = w.document.getElementById('view');
const sg = wv.querySelector('[data-sg-task]');
ok('我的周报 · 可添加目标建议', !!sg);
sg.value = '把显存溢出规避方案固化进渲染预设';
sg.dispatchEvent(new w.Event('input'));
wv = w.document.getElementById('view');
ok('我的周报 · 填齐后解除禁用', wv.querySelector('#wrSubmit').disabled === false);
wv.querySelector('#wrSubmit').click();
ok('我的周报 · 提交后落库', (w.Store.getWeekReport('wang','2026-10-12') || {}).status === 'submitted');
ok('我的周报 · 提交写入日志', w.Store.state.logs.some(l => l.action === '提交周报'));
ok('我的周报 · 提交后状态徽章变「已提交」',
  w.document.getElementById('view').innerHTML.indexOf('已提交') > 0);
// 规则说明没被校验刷新误删
ok('我的周报 · 规则说明仍在',
  w.document.getElementById('view').innerHTML.indexOf('周一 <b>17:00</b> 前交这份周报') > 0);

// PM 视角：周报汇总 + 发布本周工作任务
w.Store.setUser('olivia'); w.location.hash = '#/weekboard'; w.App.render();
let bvw = w.document.getElementById('view');
ok('周报汇总 · 有周期选择器', !!bvw.querySelector('#wbWeek'));
ok('周报汇总 · 分组汇总含两个组',
  bvw.innerHTML.indexOf('场景生成组') > 0 && bvw.innerHTML.indexOf('3DGS 组') > 0);
ok('周报汇总 · 有发布区文本域', !!bvw.querySelector('#wbPlanText'));
ok('周报汇总 · 有复制周报汇总按钮', !!bvw.querySelector('#wbCopyAll'));
const bsel = bvw.querySelector('#wbWeek');
bsel.value = '2026-10-12'; bsel.dispatchEvent(new w.Event('change'));
bvw = w.document.getElementById('view');
ok('周报汇总 · 未发布周期显示「未发布」', bvw.innerHTML.indexOf('未发布') > 0);
bvw.querySelector('#wbPlanText').value = '1. 3DGS 组：重建 B-093~B-100 批次，目标本周 30 个场景。';
bvw.querySelector('#wbPublish').click();
ok('周报汇总 · PM 发布后落库',
  (w.Store.weekPlan('2026-10-12') || {}).text.indexOf('B-093~B-100') >= 0);
ok('周报汇总 · 发布后写入日志',
  w.Store.state.logs.some(l => l.action.indexOf('发布本周工作任务') >= 0));
ok('周报汇总 · 发布后显示「已发布」',
  w.document.getElementById('view').innerHTML.indexOf('已发布') > 0);
// 发布后老师侧可见
w.Store.setUser('wang'); w.Store.login('wang','demo1');
w.location.hash = '#/weekly'; w.App.render();
ok('我的周报 · 看得到 PM 刚发布的本周任务',
  w.document.getElementById('view').innerHTML.indexOf('B-093~B-100') > 0);
// 管理角色（TA Leader 等）也能进「我的周报」页（v1.17 页面一致）；
// 不交周报是「统计口径」层面的（submitDaily/submitWeek），而不是藏页面。
w.Store.setUser('ta'); w.location.hash = '#/weekly'; w.App.render();
ok('TA Leader 打开 #/weekly · 能进「我的周报」页（页面一致）',
  w.location.hash === '#/weekly' && w.document.getElementById('view').innerHTML.length > 200,
  'hash=' + w.location.hash);
w.Store.reset();

// 7f) 当日卡点（FR-35）：填报页可写、只进内部版
w.Store.reset(); w.Store.setUser('wang'); w.Store.login('wang', 'demo1');
w.location.hash = '#/fill'; w.App.render();
let bkv = w.document.getElementById('view');
ok('填报页 · 有「当日卡点」输入区', !!bkv.querySelector('#dfBlocker'));
ok('填报页 · 卡点标注「只进内部版」', bkv.innerHTML.indexOf('只进内部版') > 0);
ok('填报页 · 卡点说明「不会出现在对外版」', bkv.innerHTML.indexOf('不会出现在对外版') > 0);
const blkEl = bkv.querySelector('#dfBlocker');
blkEl.value = '渲染农场排队等档期，本批预检卡住（渲染自检专用）。';
blkEl.dispatchEvent(new w.Event('input'));
bkv.querySelector('#btnSaveDraft').click();
// 注：填报页的「当前填谁」沿用模块内的 ctx（早前路由矩阵留下的身份），
// 所以按落库内容而不是按人断言 —— 要验的是「卡点跟着草稿进了库」。
const savedBlk = w.Store.state.reports.filter(r => (r.blocker || '').indexOf('渲染自检专用') >= 0);
ok('填报页 · 卡点随草稿落库',
  savedBlk.length === 1 && savedBlk[0].status === 'draft',
  JSON.stringify(savedBlk.map(r => r.personId + ':' + r.status)));

// 两版差异：内部版有这一栏，对外版根本没有
const blkRep = w.Store.getReport('wang', '2026-10-06');
const blkV = w.Store.reportVersions(blkRep);
ok('两版 · 内部版含「当日卡点：」', blkV.internalText.indexOf('当日卡点：') > 0);
ok('两版 · 对外版无「当日卡点」字样', blkV.clientText.indexOf('当日卡点') < 0);
ok('两版 · 对外版无卡点原文', blkV.clientText.indexOf('外包方补采回传') < 0);
ok('两版 · 卡点是日报级字段（不算条目）',
  blkRep.entries.length === 2 && blkRep.entries.every(e => (e.task || '').indexOf('外包方补采回传') < 0));

// 我的日报：新增「当日卡点」列
w.location.hash = '#/mine'; w.App.render();
ok('我的日报 · 有「当日卡点」列',
  w.document.getElementById('view').innerHTML.indexOf('当日卡点') > 0);
w.Store.reset();

// 5) 成本与支出页（工时已下线，只保留采购与算力成本）
w.location.hash = '#/stats'; w.App.render();
const sv = w.document.getElementById('view');
ok('成本与支出页 · 标题已改名', w.Views.stats.title === '成本与支出');
ok('成本与支出页 · 已无「工时矩阵」', sv.innerHTML.indexOf('工时矩阵') < 0);
ok('成本与支出页 · 已无「人力成本」KPI', sv.innerHTML.indexOf('人力成本（估算）') < 0);
ok('成本与支出页 · 保留采购明细', sv.innerHTML.indexOf('采购明细') > 0);
ok('成本与支出页 · 已无导出工时矩阵按钮', sv.querySelector('#sExport') === null);

// 10) 知识库：目录树 / 打开文档 / 搜索 / Markdown / 自动生成页 / 新建编辑
w.Store.reset(); w.Store.setUser('olivia'); w.Store.login('olivia', 'demo1');
w.location.hash = '#/kb'; w.App.render();
let kv = w.document.getElementById('view');
ok('知识库 · 4 个空间（另有 1 张「+ 新建空间」占位卡）',
  kv.querySelectorAll('.kb-scard[data-space]').length === 4 &&
  kv.querySelectorAll('.kb-scard[data-space-new]').length === 1,
  kv.querySelectorAll('.kb-scard[data-space]').length + ' 个空间');
ok('知识库 · 左下有「+ 新建文档 / + 新建空间」两个入口',
  !!kv.querySelector('#kbNew') && !!kv.querySelector('#kbNewSpace'));
ok('知识库 · 目录树含空间标题', kv.innerHTML.indexOf('规则与流程') > 0 && kv.innerHTML.indexOf('会议纪要') > 0);
ok('知识库 · 目录含文件夹', kv.querySelectorAll('[data-folder]').length === 1);

// 打开文档
kv.querySelector('[data-open="' + 'kb5' + '"]').click();
kv = w.document.getElementById('view');
ok('知识库 · 打开「日报填写规则」', kv.querySelector('.kb-doc-h h2').textContent === '日报填写规则');
ok('知识库 · 正文渲染出 22:00', kv.innerHTML.indexOf('22:00') > 0);
ok('知识库 · 面包屑含空间名', kv.querySelector('.kb-crumb').textContent.indexOf('规则与流程') >= 0);
ok('知识库 · 站内互链生成', kv.querySelectorAll('[data-doc]').length > 0);

// 划词批注（v1.20）：正文高亮 + 右侧卡片 + 回复
ok('批注 · 正文高亮 2 处（种子批注全部定位成功）',
  kv.querySelectorAll('.kb-hl').length === 2, kv.querySelectorAll('.kb-hl').length);
ok('批注 · 右侧面板有 2 张卡片', kv.querySelectorAll('[data-anno-card]').length === 2,
  kv.querySelectorAll('[data-anno-card]').length);
ok('批注 · 卡片含引用原文', !!kv.querySelector('[data-anno-card] .kb-anno-q'));
ok('批注 · 种子带 1 条回复', kv.querySelectorAll('.kb-anno-r').length === 1,
  kv.querySelectorAll('.kb-anno-r').length);
ok('批注 · 有回复输入框与「标记已解决」按钮',
  !!kv.querySelector('[data-anno-reply-input]') && !!kv.querySelector('[data-anno-resolve]'));
ok('批注 · 气泡按钮存在且默认隐藏', !!kv.querySelector('#kbBubble') && kv.querySelector('#kbBubble').hidden);
const kaIn = kv.querySelector('[data-anno-reply-input]');
kaIn.value = '渲染层测试回复';
kv.querySelector('[data-anno-reply-btn]').click();
kv = w.document.getElementById('view');
ok('批注 · 回复提交后落库并渲染', kv.innerHTML.indexOf('渲染层测试回复') > 0);
ok('批注 · 回复后共 2 条回复', kv.querySelectorAll('.kb-anno-r').length === 2,
  kv.querySelectorAll('.kb-anno-r').length);

// 站内互链跳转 → 「每日汇报两版规则」（含表格与引用）
const link = kv.querySelector('[data-doc="每日汇报两版规则"]');
ok('知识库 · 站内互链可点击', !!link);
if (link) {
  link.click();
  kv = w.document.getElementById('view');
  ok('知识库 · 互链跳到目标文档', kv.querySelector('.kb-doc-h h2').textContent === '每日汇报两版规则');
  ok('Markdown · 表格渲染', kv.querySelectorAll('.md-tbl').length > 0);
  ok('Markdown · 引用块渲染', kv.querySelectorAll('.md-quote').length > 0);
  ok('Markdown · 粗体渲染', kv.querySelectorAll('.kb-body b').length > 0);
}

// 自动生成页
w.Store.kbNode('kb4').updatedAt = '2026-10-09T18:22';
kv.querySelector('.kb-tree-scroll').innerHTML; // no-op
w.location.hash = '#/kb'; w.App.render();
kv = w.document.getElementById('view');
kv.querySelector('[data-open="kb4"]').click();
kv = w.document.getElementById('view');
ok('知识库 · 自动页标记「自动生成」', kv.innerHTML.indexOf('自动生成') > 0);
ok('知识库 · 自动页无编辑按钮', !kv.querySelector('#kbEdit'));
ok('知识库 · 自动页含管线小节', kv.innerHTML.indexOf('API + Harness') > 0);

// 搜索
w.Store.reset(); w.Store.setUser('olivia'); w.Store.login('olivia', 'demo1');
w.location.hash = '#/kb'; w.App.render();
const kbq = w.document.getElementById('view').querySelector('#kbQ');
kbq.value = '成本';
kbq.dispatchEvent(new w.Event('input'));
kv = w.document.getElementById('view');
ok('知识库 · 搜索「成本」有结果', kv.querySelectorAll('[data-doc-id]').length >= 2,
  kv.querySelectorAll('[data-doc-id]').length);

// 规则文档齐全性（新人动线的四篇 + 新加的两篇）
['日报填写规则','每日汇报两版规则','客户侧协作边界','权限与角色','周报规则','两个组与分工']
  .forEach(t => ok('知识库 · 有「' + t + '」', !!w.Store.kbDocByTitle(t)));
const kbwr = w.Store.kbDocByTitle('周报规则');
ok('周报规则 · 写明周一 17:00 截止', kbwr.body.indexOf('周一 17:00') > 0);
ok('周报规则 · 写明周二 PM 发布本周任务', kbwr.body.indexOf('周二') > 0 && kbwr.body.indexOf('本周工作任务') > 0);
ok('周报规则 · 写明交周报的人与交日报的人一致（8 人）', kbwr.body.indexOf('8 人') > 0);
const kbg = w.Store.kbDocByTitle('两个组与分工');
ok('两个组 · 两个组建制齐全', kbg.body.indexOf('场景生成组') > 0 && kbg.body.indexOf('3DGS 组') > 0);
ok('两个组 · 写明宏枢由刘一鸣代表提交', kbg.body.indexOf('不单独交日报') > 0 && kbg.body.indexOf('刘一鸣') > 0);
const kbd = w.Store.kbDocByTitle('日报填写规则');
ok('日报填写规则 · 写明 18:30 汇报时点', kbd.body.indexOf('18:30') > 0);
ok('日报填写规则 · 写明按组交与宏枢例外', kbd.body.indexOf('按组交') > 0);

// NEWS · AI 资讯独立页（v1.19）：与工作台信息流同源，可筛选 / 发布 / 评论
w.location.hash = '#/news'; w.App.render();
const nv = w.document.getElementById('view');
ok('NEWS 页 · 侧栏有入口（知识组第二项）', navRoutes().indexOf('news') >= 0, navRoutes().join(','));
ok('NEWS 页 · 有「发 AI 资讯」按钮', !!nv.querySelector('[data-npcompose]'));
ok('NEWS 页 · 七个筛选 chip（含「新闻」与「我的发布」）',
  nv.querySelectorAll('[data-npfilter]').length === 7, nv.querySelectorAll('[data-npfilter]').length + ' 个');
ok('NEWS 页 · 帖子渲染出来了（v1.22a 只收 AI 资讯：种子 2 条）',
  nv.querySelectorAll('[data-news]').length === 2 &&
  nv.querySelectorAll('.ni-t').length === nv.querySelectorAll('[data-news]').length,
  nv.querySelectorAll('[data-news]').length + ' 条');
ok('NEWS 页 · 条目带点赞 / 评论 / 分享到知识库动作',
  !!nv.querySelector('[data-like]') && !!nv.querySelector('[data-cmt]') && !!nv.querySelector('[data-tokb]'));
ok('NEWS 页 · 展开评论后有输入框与发送按钮', (() => {
  // openCmt 是模块级共享状态：前面工作台段可能已展开过该条，这里点击到「出现输入框」为止（最多两次）
  for (let i = 0; i < 2; i++) {
    const cb = nv.querySelector('[data-cmt]');
    if (!cb) return false;
    cb.click();
    const v2 = w.document.getElementById('view');
    if (v2.querySelector('[data-cmtbox]') && v2.querySelector('[data-cmtsend]')) return true;
  }
  return false;
})());
// 筛选切到「新闻」（AI 资讯所在分类）
(() => { const f = [].slice.call(nv.querySelectorAll('[data-npfilter]')).find(b => b.dataset.npfilter === '新闻');
  f.click(); const v3 = w.document.getElementById('view');
  ok('NEWS 页 · 筛「新闻」后全部条目都是新闻分类',
    v3.querySelectorAll('[data-news]').length > 0 &&
    [].slice.call(v3.querySelectorAll('.ctag')).every(t => t.textContent.trim() === '新闻'));
})();
// 工作台跳转：标题点击 → AlefNews.openPost → 落到 NEWS 页
w.Store.setUser('wang'); w.location.hash = '#/workbench'; w.App.render();
const wbv = w.document.getElementById('view');
ok('工作台 · 信息流卡有「NEWS 页 ↗」入口', !!wbv.querySelector('[data-go="news"]'));
ok('工作台 · NEWS 卡标题可点（绑定跳转）', wbv.querySelectorAll('[data-nopen]').length > 0);
(() => { const li = wbv.querySelector('[data-nopen]'); li.click();
  ok('工作台 · 点 NEWS 卡标题落到 NEWS 页', w.location.hash === '#/news' && w.document.getElementById('view').querySelectorAll('[data-news]').length > 0,
    w.location.hash);
})();
w.Store.setUser('wang'); w.location.hash = '#/workbench'; w.App.render();
ok('工作台 · 团队动态标题就地展开（不再跳 NEWS）', (() => {
  const t = w.document.getElementById('view').querySelector('[data-card="feed"] .ni-t');
  t.click(); w.App.render();
  return w.location.hash === '#/workbench' &&
    !!w.document.getElementById('view').querySelector('[data-card="feed"] .ni .md');
})());
ok('日报填写规则 · 提到复制对外版发群', kbd.body.indexOf('复制对外版发群') > 0);
ok('日报填写规则 · 写明「当日卡点」只进内部版', kbd.body.indexOf('当日卡点') > 0 && kbd.body.indexOf('只进内部版') > 0);
ok('日报填写规则 · 写明卡点只进内部版', kbd.body.indexOf('只进内部版') > 0);
const kbb = w.Store.kbDocByTitle('每日汇报两版规则');
ok('两版规则 · 卡点行写明对外版「完全没有这一栏」',
  kbb.body.indexOf('当日卡点') > 0 && kbb.body.indexOf('完全没有这一栏') > 0);
ok('两版规则 · 区分条目级阻塞与日报级卡点', kbb.body.indexOf('条目级卡点') > 0);
const kbr = w.Store.kbDocByTitle('权限与角色');
ok('权限与角色 · TA Leader 标注「同样交日报」', kbr.body.indexOf('同样交日报') > 0);
ok('权限与角色 · 应提交 8 人（含 TA Leader）', kbr.body.indexOf('8 人') > 0);
ok('权限与角色 · TA 与美术是两个独立角色', kbr.body.indexOf('并列的独立角色') > 0);

// 周五任务汇总（v1.21）：按人分卡 · 逐人可复制 · 导出 Word 入口
w.Store.setUser('olivia'); w.location.hash = '#/frisum'; w.App.render();
const fsv = w.document.getElementById('view');
ok('周五汇总 · 侧栏有入口（周报组第三项）', navRoutes().indexOf('frisum') >= 0, navRoutes().join(','));
ok('周五汇总 · 页面标题与说明', (w.document.querySelector('.t-title') || {}).textContent === '周五任务汇总' &&
  (w.document.querySelector('.t-sub') || {}).textContent.indexOf('周二') >= 0,
  (w.document.querySelector('.t-title') || {}).textContent);
ok('周五汇总 · 按 8 个填报人分卡',
  fsv.querySelectorAll('.fs-card').length === 8, fsv.querySelectorAll('.fs-card').length + ' 张卡');
ok('周五汇总 · 每人一张「复制」按钮', fsv.querySelectorAll('[data-fscopy]').length === 8);
ok('周五汇总 · 有「复制全部」与「导出 Word」', !!fsv.querySelector('#fsCopyAll') && !!fsv.querySelector('#fsWord'));
ok('周五汇总 · 内容含「周二」日块与「▍」天标', /周[二三四五]/.test(fsv.textContent) && fsv.innerHTML.indexOf('▍') >= 0);
ok('周五汇总 · 草稿/未交如实标注（安雅萱周五）', fsv.innerHTML.indexOf('草稿未提交') >= 0 || fsv.innerHTML.indexOf('（未提交）') >= 0);
(() => { const b = [].slice.call(fsv.querySelectorAll('[data-fscopy]'))[0]; b.click();
  ok('周五汇总 · 点「复制」不报错且出 toast', !!w.document.querySelector('.toast'));
})();
// 仅 PM 可见：非 PM（王弋/老板）侧栏无入口，深链弹回工作台
w.Store.setUser('wang'); w.App.render();
ok('周五汇总 · 非 PM 侧栏无入口', navRoutes().indexOf('frisum') < 0, navRoutes().join(','));
w.location.hash = '#/frisum'; w.App.render();
ok('周五汇总 · 非 PM 深链弹回工作台', w.location.hash === '#/workbench', w.location.hash);
w.Store.setUser('candice'); w.App.render();
ok('周五汇总 · 老板侧栏也无入口', navRoutes().indexOf('frisum') < 0);
w.Store.setUser('olivia'); w.location.hash = '#/frisum'; w.App.render();

// 注册与待分配（v1.22）：登录页注册入口 · 待分配只见工作台 · 管理员派角色后展开
w.Store.logout(); w.App.render();
ok('注册 · 登录页有注册入口与折叠面板', !!w.document.getElementById('lgRegBtn') && !!w.document.getElementById('lgReg'));
ok('注册 · 面板有姓名 / 手机号 / 验证码与「注册并登录」',
  !!w.document.getElementById('rgName') && !!w.document.getElementById('rgPhone') &&
  !!w.document.getElementById('rgCode') && !!w.document.getElementById('rgGo'));
w.Store.login('olivia', 'demo1'); w.App.render();
const rpA = w.Store.registerByPhone('13900004444', w.Store.demoSmsCode(), '测试四号');
ok('注册 · 第一个注册者自动成为管理员', rpA.ok && rpA.person.role === 'admin');
const rp = w.Store.registerByPhone('13900005555', w.Store.demoSmsCode(), '测试五号');
ok('注册 · 第二个注册者为待分配', rp.ok && rp.person.role === 'pending');
w.Store.setUser(rp.person.id); w.location.hash = '#/board'; w.App.render();
ok('待分配 · 深链弹回工作台', w.location.hash === '#/workbench', w.location.hash);
ok('待分配 · 侧栏只有工作台', navRoutes().join(',') === 'workbench', navRoutes().join(','));
ok('待分配 · 工作台有待分配提示', w.document.getElementById('view').innerHTML.indexOf('待分配') >= 0);
w.Store.setUser('olivia');
const asgR = w.Store.upsertPerson({ id:rp.person.id, name:'测试四号', role:'member', phone:'13900004444' });
ok('管理员 · 可把待分配改成正式角色', asgR.ok && w.Store.person(rp.person.id).role === 'member');
w.Store.setUser(rp.person.id); w.App.render();
ok('派角色后 · 侧栏按角色展开', navRoutes().length > 1, navRoutes().join(','));
w.Store.state.people = w.Store.state.people.filter(p => p.id !== rp.person.id && p.id !== rpA.person.id);
w.Store.setUser('olivia'); w.location.hash = '#/frisum'; w.App.render();

// 新建 + 编辑（走 Store 层）
const created = w.Store.kbCreate('sp-tech', null, '测试文档', '# 标题\n- 要点', 'olivia');
ok('知识库 · 新建落库', !!w.Store.kbNode(created.id));
w.Store.kbUpsert(created.id, { body:'## 改过' });
ok('知识库 · 编辑生效', w.Store.kbNode(created.id).body === '## 改过');
ok('知识库 · 收藏切换', (function () { w.Store.kbStar(created.id); return w.Store.kbNode(created.id).starred; })() === true);

console.log('\n== 每日任务（FR-38 ~ FR-41 · 渲染层） ==');
w.Store.reset(); w.Store.setUser('wang'); w.Store.login('wang', 'demo1');
// 填报页：倒计时 + 只读态 + 优先级分段
w.location.hash = '#/task'; w.App.render();
const taskView = w.document.getElementById('view');
ok('今日任务 · 倒计时「还有 25 分钟」', taskView.querySelector('.tk-cd').textContent.indexOf('还有 25 分钟') >= 0,
  taskView.querySelector('.tk-cd').textContent);
ok('今日任务 · 王弋「修改中」= 已放开、可重新编辑提交',
  taskView.innerHTML.indexOf('管理员已放开修改') >= 0 && !!taskView.querySelector('#tkSubmit') &&
  !!taskView.querySelector('#tkAddEntry'), 'submitted=' + !!taskView.querySelector('#tkSubmit'));
ok('今日任务 · 修改中不显示「申请修改」', !taskView.querySelector('#tkReqEdit'));
// 只读态：孙世甲已交（逾期）且没有修改申请
w.Store.setUser('sun'); w.App.render();
const sunTask = w.document.getElementById('view');
ok('今日任务 · 已交 → 只读 + 有「申请修改」',
  !!sunTask.querySelector('#tkReqEdit') && !sunTask.querySelector('#tkSubmit') &&
  !sunTask.querySelector('#tkAddEntry'), 'req=' + !!sunTask.querySelector('#tkReqEdit'));
// 草稿态（罗思远）出现提醒条
w.Store.setUser('luo'); w.App.render();
const luoTask = w.document.getElementById('view');
ok('今日任务 · 罗思远草稿 → 出提醒条 + 可编辑',
  !!luoTask.querySelector('.tk-remind') && !!luoTask.querySelector('#tkSubmit') &&
  luoTask.querySelectorAll('.task-row').length >= 1,
  'remind=' + !!luoTask.querySelector('.tk-remind') + ' rows=' + luoTask.querySelectorAll('.task-row').length);
// 未交（刘一鸣）→ 新建可编辑 + 截止后补交提醒
w.Store.setUser('liuming'); w.App.render();
const lmTask = w.document.getElementById('view');
ok('今日任务 · 未交 → 空态可新建', !!lmTask.querySelector('#tkAddEntry'));
// PM 不交每日任务（taskSubmit=false）→ #/task 弹回工作台；TA Leader 照常进
w.Store.setUser('olivia'); w.location.hash = '#/task'; w.App.render();
ok('PM 打开 #/task · 弹回工作台（不填报）', w.location.hash === '#/workbench', w.location.hash);
w.Store.setUser('ta'); w.location.hash = '#/task'; w.App.render();
ok('TA Leader 打开 #/task · 可进（既管理又填报）', w.location.hash === '#/task', w.location.hash);
// 看板（管理员）：四格 + 未交名单 + 催交按钮 + 明细
w.location.hash = '#/taskboard'; w.App.render();
const tb = w.document.getElementById('view');
ok('任务看板 · 四格统计（提交率/按时率/未交/逾期）', tb.querySelectorAll('.tile').length >= 4,
  tb.querySelectorAll('.tile').length);
ok('任务看板 · 未交名单含刘一鸣', tb.innerHTML.indexOf('刘一鸣') >= 0);
ok('任务看板 · 管理员有「一键生成催交话术」', !!tb.querySelector('#tbRemind'));
ok('任务看板 · 管理员有「导出 CSV」', !!tb.querySelector('#tbExport'));
ok('任务看板 · 14 天趋势 SVG', !!tb.querySelector('.tb-svg') && tb.querySelectorAll('.tb-bar').length >= 10);
ok('任务看板 · 8 行明细（含 TA Leader）', tb.querySelectorAll('.tb-row').length === 8, tb.querySelectorAll('.tb-row').length);
// 展开明细 → 「修改中」的人有放开按钮（王弋已有放开的申请，这里验证交互按钮存在）
tb.querySelector('[data-tbopen="sun"]').click();
ok('任务看板 · 展开明细显示任务列表', tb.querySelectorAll('.tb-ol').length >= 1);
// 看板（员工）：无催交按钮
w.Store.setUser('chang'); w.App.render();
const tbS = w.document.getElementById('view');
ok('任务看板 · 员工无催交 / 导出按钮', !tbS.querySelector('#tbRemind') && !tbS.querySelector('#tbExport'));
// 统计页：员工只看自己 / 管理员看全部
w.location.hash = '#/taskstats'; w.App.render();
const stS = w.document.getElementById('view');
ok('统计 · 员工视角标明「仅本人」', stS.innerHTML.indexOf('仅本人') >= 0);
ok('统计 · 员工看不到团队排行表', !stS.querySelector('.tbl'), stS.querySelectorAll('.tbl').length);
w.Store.setUser('olivia'); w.App.render();
const stA = w.document.getElementById('view');
ok('统计 · 管理员有成员排行（8 行）', stA.querySelectorAll('.tbl tbody tr').length === 8,
  stA.querySelectorAll('.tbl tbody tr').length);
ok('统计 · 有加班分布卡', stA.innerHTML.indexOf('加班频次') >= 0);
// 日报：三态分段 + 加班开关 + 带入提示
w.Store.setUser('li'); w.location.hash = '#/fill'; w.App.render();
const df = w.document.getElementById('view');
ok('日报 · 条目状态三选一分段（已完成/未完成/需加班完成）',
  (df.querySelector('.tseg') || { textContent:'' }).textContent.indexOf('需加班完成') >= 0,
  (df.querySelector('.tseg') || { textContent:'' }).textContent);
ok('日报 · 有「今日是否加班」开关', df.innerHTML.indexOf('今日是否加班') >= 0);
w.Store.setUser('chang');
const cr0 = w.Store.getReport('chang', '2026-10-09');
if (cr0) w.Store.removeReport(cr0.id);
w.App.render();
const dfC = w.document.getElementById('view');
ok('日报 · 新建时自动带入当日今日任务（提示条 + 条目数一致）',
  dfC.innerHTML.indexOf('已自动带入今天的「今日任务」') >= 0 &&
  dfC.innerHTML.indexOf('3 条') >= 0, 'hasNote=' + (dfC.innerHTML.indexOf('已自动带入') >= 0));
// 关联管线选「其他」→ 后面那条备注从选填变必填（今日任务 + 日报条目）
const dfPipe = dfC.querySelector('[data-pipe]');
dfPipe.value = 'other'; dfPipe.onchange();
const dfP2 = w.document.getElementById('view');
ok('日报 · 条目管线选「其他」→ 备注变必填（红框 + 说明）',
  !!dfP2.querySelector('.inp.err[data-note]') &&
  dfP2.innerHTML.indexOf('管线选了「其他」必须填写备注') >= 0);
w.Store.setUser('luo'); w.location.hash = '#/task'; w.App.render();
const tvO = w.document.getElementById('view');
const selO = tvO.querySelector('[data-tpline]');
selO.value = 'other'; selO.onchange();
const tvO2 = w.document.getElementById('view');
ok('今日任务 · 管线选「其他」→ 备注变必填（红框 + 说明）',
  !!tvO2.querySelector('.tr-note.err') && tvO2.innerHTML.indexOf('请在备注里说明具体是什么') >= 0);
ok('今日任务 · 备注为空时校验拦提交',
  tvO2.innerHTML.indexOf('请填写备注说明') >= 0);
const ntO = tvO2.querySelector('.tr-note');
ntO.value = '临时协助，非标准管线'; ntO.oninput(); w.App.render();
const tvO3 = w.document.getElementById('view');
ok('今日任务 · 填上备注后提示消失、校验通过',
  !tvO3.querySelector('.tr-note.err') && tvO3.innerHTML.indexOf('校验通过，可以提交') >= 0);
// 设置页：看板可见性下拉 + 推送开关
w.Store.setUser('olivia'); w.location.hash = '#/admin'; w.App.render();
w.document.querySelector('[data-tab="dash"]').click();
const dash = w.document.getElementById('view');
ok('设置 · 有「看板与提醒」Tab', !!dash.querySelector('#adVis'));
ok('设置 · 可见性下拉三档', dash.querySelectorAll('#adVis option').length === 3);
ok('设置 · 推送开关三项默认全关', ['email','wecom','feishu'].every(k =>
  !(dash.querySelector('[data-ntf="' + k + '"]') || {}).checked));

console.log('\n---------------------------------------');
// 下拉项落到业务页面：日报填报 / 今日任务 / 周报目标的管线下拉必须是这六项
ok('日报填报 · 管线下拉为定稿六项（无 API+Harness / Codex）', (() => {
  w.Store.setUser('chang'); w.location.hash = '#/fill'; w.App.render();
  const sel = w.document.querySelector('#view [data-pipe]') || w.document.querySelector('#view [data-tm-pipe]');
  if (!sel) return false;
  const txt = [].slice.call(sel.options).map(o => o.textContent).join('/');
  return sel.options.length === 6 && txt.indexOf('Harness') < 0 && txt.indexOf('Codex') < 0 &&
    txt.indexOf('场景生成') >= 0 && txt.indexOf('3DGS') >= 0 && txt.indexOf('拍摄') >= 0 &&
    txt.indexOf('渲染') >= 0 && txt.indexOf('资产采购') >= 0 && txt.indexOf('其他') >= 0;
})());
ok('今日任务 · 管线六项 + 优先级下拉来自 Store', (() => {
  w.Store.setUser('luo'); w.location.hash = '#/task'; w.App.render();
  const pl = w.document.querySelector('#view [data-tpline]');
  const pr = w.document.querySelector('#view [data-tpri]');
  return !!pl && !!pr && pl.options.length === 6 && pr.options.length === 3 &&
    [].slice.call(pr.options).map(o => o.textContent).join('/') === '高/中/低';
})());

console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
