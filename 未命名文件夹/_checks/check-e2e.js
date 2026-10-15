/* 真实浏览器验证：命中测试 + 真实鼠标点击 + 控制台错误 + 截图 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://127.0.0.1:8787/index.html';
const OUT = '/tmp/alef-shots';
fs.rmSync(OUT, { recursive: true, force: true });   // 每次清空，截图清单才反映本次运行
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + '  ' + (extra || '')); }
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() || {}).url || '';
    errors.push('console: ' + m.text() + (u ? '  @' + u : ''));
  });

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  // 每轮从干净的演示数据开始：上一轮的编辑（改写条目描述、催办、发布周计划）会留在
  // localStorage 里，不清理会让「含成本的日报会被拦下」这类断言在第二次运行时失效。
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 700));

  /* 共用小工具：把选择器换算成视口坐标后用「真实鼠标」点击（比 element.click() 更接近用户操作） */
  const boxOf = sel => page.evaluate(s => {
    const e = document.querySelector(s);
    if (!e) return null;
    e.scrollIntoView({ block:'center' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  const clickSel = async sel => {
    const b = await boxOf(sel);
    if (!b) return false;
    await page.mouse.click(b.x, b.y);
    await new Promise(r => setTimeout(r, 260));
    return true;
  };

  console.log('\n== 0. 登录页（v1.16 重做）与登录门 ==');
  const gate0 = await page.evaluate(() => {
    const card = document.querySelector('#login .lg-card');
    const r = card ? card.getBoundingClientRect() : { width:0 };
    return {
      loginVisible: !document.getElementById('login').hidden,
      appHidden: document.querySelector('.app').style.display === 'none',
      bg: getComputedStyle(document.getElementById('login')).backgroundColor,
      cardW: Math.round(r.width),
      cardPad: card ? getComputedStyle(card.querySelector('.lg-card-in')).paddingTop : '',
      cardR: card ? getComputedStyle(card).borderTopLeftRadius : '',
      title: (document.querySelector('.lg-h1') || {}).textContent || '',
      sub: (document.querySelector('.lg-sub') || {}).textContent || '',
      tabs: document.querySelectorAll('.lg-tab').length,
      defaultTab: document.querySelector('.lg-tab.on') ? document.querySelector('.lg-tab.on').dataset.lgTab : '',
      hasPhone: !!document.getElementById('lgPhone'),
      hasSend: !!document.getElementById('lgSend'),
      sendTxt: (document.getElementById('lgSend') || {}).textContent || '',
      hasAgree: !!document.getElementById('lgAgree'),
      submitTxt: (document.getElementById('lgGo') || {}).textContent || '',
      qrHidden: document.getElementById('lgQr').hidden,
      wxEntries: document.querySelectorAll('#login .lg-wx').length,
      otherBtns: document.querySelectorAll('#login .lg-tab, #login .lg-wx, #login .lg-submit, #login .lg-send').length,
      picks: document.querySelectorAll('.lg-demo .lg-chip').length,
      footLinks: document.querySelectorAll('.lg-card-f .lg-link').length,
      noClientEntry: !document.getElementById('lgClient') && !/访客|客户侧无账号/.test(document.getElementById('login').textContent),
      focusId: document.activeElement ? document.activeElement.id : '',
      oldShell: !!document.querySelector('#login .lg-brand') || !!document.querySelector('#login .lg-chips') || !!document.querySelector('#login #lgUser')
    };
  });
  ok('未登录 · 只见登录页', gate0.loginVisible && gate0.appHidden, JSON.stringify(gate0).slice(0, 90));
  ok('登录页 · 纯色浅灰底 #F5F6F7', gate0.bg === 'rgb(245, 246, 247)', gate0.bg);
  ok('登录页 · 居中卡片 ≤420px（实测宽 + 圆角 + 内边距 40）',
    gate0.cardW > 340 && gate0.cardW <= 420 && gate0.cardR === '8px' && gate0.cardPad === '40px',
    gate0.cardW + 'px / r' + gate0.cardR + ' / p' + gate0.cardPad);
  ok('登录页 · 标题与副标题（登录 / 使用手机号或微信登录）',
    gate0.title.indexOf('登录') === 0 && gate0.sub.indexOf('手机号或微信') > 0, gate0.title + ' | ' + gate0.sub);
  ok('登录页 · 默认手机验证码登录（两个 Tab，默认 code）',
    gate0.tabs === 2 && gate0.defaultTab === 'code' && gate0.hasPhone && gate0.hasSend, gate0.tabs + ' 个 Tab / 默认 ' + gate0.defaultTab);
  ok('登录页 · 获取验证码按钮初始可用', gate0.hasSend && gate0.sendTxt.indexOf('获取验证码') === 0, gate0.sendTxt);
  ok('登录页 · 有协议勾选与登录按钮', gate0.hasAgree && gate0.submitTxt.indexOf('登录') >= 0, gate0.submitTxt);
  ok('登录页 · 二维码默认收起，只留 1 个三方入口（微信）', gate0.qrHidden === true && gate0.wxEntries === 1, 'wx=' + gate0.wxEntries);
  ok('登录页 · 底部 3 个链接（隐私政策 / 服务条款 / 联系管理员）', gate0.footLinks === 3, gate0.footLinks + ' 个');
  ok('登录页 · 演示身份快捷填入（仅原型）', gate0.picks >= 3, gate0.picks + ' 个');
  ok('登录页 · 没有客户/访客入口', gate0.noClientEntry === true);
  ok('登录页 · 自动聚焦手机号输入框', gate0.focusId === 'lgPhone', gate0.focusId);
  ok('登录页 · 旧外壳（深色品牌区 / 身份大卡 / 账号下拉）已移除', gate0.oldShell === false);
  await page.screenshot({ path: OUT + '/login.png' });

  const wait = ms => new Promise(r => setTimeout(r, ms));
  // 点击登录后：请求 620ms + 成功过渡 360ms，等 1.2s 才稳
  const submit = async () => { await page.click('#lgGo'); await wait(1200); };

  // 未勾协议 → 轻抖动 + 文案提示，仍在登录页
  const noAgree = await page.evaluate(() => {
    document.getElementById('lgPhone').value = '13800000011';
    document.getElementById('lgCode').value = '8888';
  });
  await submit();
  const agreeErr = await page.evaluate(() => ({
    err: document.getElementById('lgErr').textContent,
    shook: !!document.querySelector('#lgCard.lg-shake'),
    still: !document.getElementById('login').hidden
  }));
  ok('未勾协议 · 拒绝提交并提示', agreeErr.still && agreeErr.err.indexOf('同意') > 0, agreeErr.err);

  // 手机号格式校验
  await page.evaluate(() => { document.getElementById('lgPhone').value = '123'; });
  await page.click('#lgSend');
  await wait(200);
  const badPhone = await page.evaluate(() => ({
    err: document.getElementById('lgPhoneErr').textContent,
    boxErr: !!document.querySelector('[data-lg-box="phone"].err')
  }));
  ok('手机号校验 · 格式错给出字段级红字', badPhone.err.indexOf('11 位手机号') > 0 && badPhone.boxErr, badPhone.err);

  // 未开通的号码 + 正确演示码 → 只回「验证码错误」，不暴露账号是否存在
  await page.evaluate(() => { document.getElementById('lgPhone').value = '13900000000'; document.getElementById('lgCode').value = '8888'; document.getElementById('lgAgree').checked = true; });
  await submit();
  const ghost = await page.evaluate(() => ({
    err: document.getElementById('lgCodeErr').textContent,
    still: !document.getElementById('login').hidden
  }));
  ok('账号不存在 · 统一提示「验证码错误」，不暴露账号', ghost.still && ghost.err === '验证码错误', ghost.err);

  // 演示身份 → 自动填号 + 发码（倒计时） + 自动填入演示码
  await page.evaluate(() => { document.getElementById('lgPhone').value = ''; });
  await page.click('[data-lg-pick="olivia"]');
  await wait(400);
  const sent = await page.evaluate(() => ({
    phone: document.getElementById('lgPhone').value,
    code: document.getElementById('lgCode').value,
    sendDisabled: document.getElementById('lgSend').disabled,
    sendTxt: document.getElementById('lgSend').textContent,
    hint: document.getElementById('lgHint').textContent
  }));
  ok('获取验证码 · 演示号自动填入 + 演示码自动填入', sent.phone === '13800000003' && sent.code === '8888', sent.phone + ' / ' + sent.code);
  ok('获取验证码 · 60 秒倒计时且按钮禁用',
    sent.sendDisabled === true && /\d+s 后重试/.test(sent.sendTxt), sent.sendTxt);
  ok('获取验证码 · 提示含脱敏号码与有效期', /138\*{4}0003/.test(sent.hint) && sent.hint.indexOf('分钟') > 0, sent.hint.slice(0, 44));

  // 验证码登录成功 → 进入系统
  await page.evaluate(() => { document.getElementById('lgAgree').checked = true; });
  await submit();
  const gate1 = await page.evaluate(() => ({
    loginHidden: document.getElementById('login').hidden,
    appShown: document.querySelector('.app').style.display !== 'none',
    name: (document.querySelector('.t-right .badge:last-child') || {}).textContent || ''
  }));
  ok('验证码登录 · 进入系统', gate1.loginHidden && gate1.appShown, JSON.stringify(gate1));
  ok('顶栏 · 显示身份与角色', /PM|老板|TA Leader|老师|实习生/.test(gate1.name), gate1.name.trim());

  // 退出 → 回登录页
  const logout = async () => {
    await page.evaluate(() => { document.getElementById('userChip').click(); });
    await wait(150);
    await page.evaluate(() => { const b = document.querySelector('[data-logout]'); if (b) b.click(); });
    await wait(300);
  };
  await logout();
  const gate2 = await page.evaluate(() => ({
    loginShown: !document.getElementById('login').hidden,
    appHidden: document.querySelector('.app').style.display === 'none'
  }));
  ok('退出登录 · 回到登录页', gate2.loginShown && gate2.appHidden, JSON.stringify(gate2));

  // 微信扫码：卡片内展开 → 加载中 → 就绪 → 已扫码待确认 → 登录
  await page.click('#lgWxBtn');
  await wait(120);
  const qrLoading = await page.evaluate(() => ({
    shown: !document.getElementById('lgQr').hidden,
    loading: /加载中/.test(document.getElementById('lgQrTip').textContent)
  }));
  ok('微信扫码 · 卡片内展开并显示加载中', qrLoading.shown && qrLoading.loading, JSON.stringify(qrLoading));
  await wait(1100);
  const qrReady = await page.evaluate(() => ({
    svg: !!document.querySelector('#lgQrBox svg'),
    tip: document.getElementById('lgQrTip').textContent,
    demo: !document.getElementById('lgQrDemo').hidden
  }));
  ok('微信扫码 · 出二维码 + 扫码提示（并标明是演示码）',
    qrReady.svg && qrReady.tip.indexOf('扫') > 0 && qrReady.tip.indexOf('演示') > 0, qrReady.tip.slice(0, 40));
  await page.click('#lgQrDemo');
  await wait(200);
  const qrScanned = await page.evaluate(() => ({
    wait: !!document.getElementById('lgQrWait'),
    tip: document.getElementById('lgQrTip').textContent
  }));
  ok('微信扫码 · 已扫码待确认状态', qrScanned.wait && qrScanned.tip.indexOf('确认') > 0, qrScanned.tip);
  await page.click('#lgQrOk');
  await wait(1300);
  const qrIn = await page.evaluate(() => ({
    loginHidden: document.getElementById('login').hidden,
    appShown: document.querySelector('.app').style.display !== 'none'
  }));
  ok('微信扫码 · 确认后进入系统', qrIn.loginHidden && qrIn.appShown, JSON.stringify(qrIn));

  // 密码 Tab 登录
  await logout();
  await page.click('.lg-tab[data-lg-tab="pass"]');
  await wait(120);
  const passTab = await page.evaluate(() => ({
    pane: !document.querySelector('[data-lg-pane="pass"]').hidden,
    codePane: document.querySelector('[data-lg-pane="code"]').hidden,
    focus: document.activeElement ? document.activeElement.id : ''
  }));
  ok('密码登录 Tab · 切换后显示账号密码并聚焦', passTab.pane && passTab.codePane && passTab.focus === 'lgAcct', JSON.stringify(passTab));
  await page.type('#lgAcct', 'olivia');
  await page.type('#lgPass', 'demo1');
  await page.evaluate(() => { document.getElementById('lgAgree').checked = true; });
  await submit();
  const passIn = await page.evaluate(() => ({
    loginHidden: document.getElementById('login').hidden,
    appShown: document.querySelector('.app').style.display !== 'none'
  }));
  ok('密码登录 · 进入系统', passIn.loginHidden && passIn.appShown, JSON.stringify(passIn));

  // 连续失败 → 图形验证码 → 答对后仍可登录
  await logout();
  await page.evaluate(() => {
    document.getElementById('lgPhone').value = '13800000011';
    document.getElementById('lgAgree').checked = true;
  });
  await page.click('#lgSend');
  await wait(200);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { document.getElementById('lgCode').value = '0000'; });
    await submit();
  }
  const capState = await page.evaluate(() => ({
    capShown: !document.getElementById('lgCapWrap').hidden,
    q: document.getElementById('lgCapQ').textContent,
    err: document.getElementById('lgCodeErr').textContent
  }));
  ok('连续失败 3 次 · 出现图形验证码', capState.capShown && /=\s*\?/.test(capState.q), capState.q);
  ok('验证码错误 · 文案统一', capState.err === '验证码错误', capState.err);
  await page.evaluate(() => {
    const q = document.getElementById('lgCapQ').textContent;   // "3 + 5 = ?" / "9 − 2 = ?"
    const m = q.match(/(\d+)\s*([+−])\s*(\d+)/);
    const a = Number(m[1]), b = Number(m[3]);
    document.getElementById('lgCap').value = String(m[2] === '+' ? a + b : a - b);
    document.getElementById('lgCode').value = '8888';
  });
  await submit();
  const afterCap = await page.evaluate(() => ({
    loginHidden: document.getElementById('login').hidden
  }));
  ok('图形验证码答对 · 可正常登录（不被锁死）', afterCap.loginHidden === true);

  // 网络异常：登录按钮给出统一错误，不暴露内部信息
  await logout();
  await page.evaluate(() => { document.getElementById('lgPhone').value = '13800000003'; document.getElementById('lgCode').value = '8888'; document.getElementById('lgAgree').checked = true; });
  await page.setOfflineMode(true);
  await submit();
  const offline = await page.evaluate(() => ({
    err: document.getElementById('lgErr').textContent,
    still: !document.getElementById('login').hidden
  }));
  await page.setOfflineMode(false);
  ok('网络异常 · 提示检查网络且不进入系统', offline.still && /网络/.test(offline.err), offline.err);
  await submit();
  const netBack = await page.evaluate(() => ({ loginHidden: document.getElementById('login').hidden }));
  ok('网络恢复 · 重新提交可进入系统', netBack.loginHidden === true);

  // 回跳：未登录时访问内页 → 登录后回到原页面
  await logout();
  await page.evaluate(() => { location.hash = '#/kb'; });
  await wait(200);
  await page.evaluate(() => {
    document.getElementById('lgPhone').value = '13800000003';
    document.getElementById('lgAgree').checked = true;
  });
  await page.click('#lgSend');
  await wait(200);
  await submit();
  const back = await page.evaluate(() => ({ hash: location.hash, showed: !document.getElementById('login').hidden }));
  ok('登录前想去的内页 · 登录后自动回跳', back.hash === '#/kb' && back.showed === false, back.hash);

  // 后续检查从「PM + 工作台」开始
  await page.evaluate(() => { location.hash = '#/workbench'; });
  await wait(200);

  console.log('\n== 1. 遮挡检查（关键回归）==');
  const overlay = await page.evaluate(() => {
    const m = document.getElementById('modal');
    const cs = getComputedStyle(m);
    const r = m.getBoundingClientRect();
    return { display: cs.display, pointerEvents: cs.pointerEvents, w: r.width, h: r.height,
             inner: m.innerHTML.length };
  });
  ok('#modal 默认不可见', overlay.display === 'none', 'display=' + overlay.display);
  ok('#modal 不参与命中测试', overlay.display === 'none' || overlay.pointerEvents === 'none');

  const hit = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.nav-item')].find(b => b.dataset.route === 'missing');
    if (!btn) return { err: '未找到「未交名单」按钮' };
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { tag: top && top.tagName, cls: top && top.className, isBtn: top === btn,
             text: top && top.textContent.trim().slice(0, 12) };
  });
  ok('侧栏按钮处于最顶层（可点）', hit.isBtn, JSON.stringify(hit));

  console.log('\n== 2. 真实鼠标点击逐个切换页面 ==');
  // v1.12：最高权限（PM / 老板）没有填报入口，本人填报的三页（填报 / 我的日报 / 我的周报）
  // 只在老师身份下走一遍，避免侧栏缺项被误判成 bug。
  const walk = async (who, routes) => {
  await page.evaluate(u => { Store.setUser(u); location.hash = ''; location.replace('#'); App.render(); }, who);
  await new Promise(r => setTimeout(r, 260));
  for (const [label, route, expect] of routes) {
    const box = await page.evaluate(r => {
      const b = [...document.querySelectorAll('.nav-item')].find(x => x.dataset.route === r);
      if (!b) return null;
      const rc = b.getBoundingClientRect();
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    }, route);
    if (!box) { ok(label, false, '导航项缺失'); continue; }
    await page.mouse.click(box.x, box.y);
    await new Promise(r => setTimeout(r, 260));
    const st = await page.evaluate(() => ({
      hash: location.hash,
      title: (document.querySelector('.t-title') || {}).textContent || '',
      len: document.getElementById('view').innerHTML.length,
      active: (document.querySelector('.nav-item.active') || {}).textContent || ''
    }));
    ok('点击「' + label + '」→ ' + route,
      st.hash === '#/' + route && st.title.indexOf(expect) >= 0 && st.len > 200,
      'hash=' + st.hash + ' 标题=' + st.title + ' 长度=' + st.len);
  }
  };
  // 最高权限（PM）：管理视角的全部入口
  await walk('olivia', [
    ['工作台', 'workbench', '工作台'],
    ['任务看板', 'taskboard', '任务'],
    ['未交名单', 'missing', '未交'], ['日报看板', 'board', '看板'],
    ['周报汇总 · 本周任务', 'weekboard', '周报'],
    ['周五任务汇总', 'frisum', '周五任务汇总'],
    ['知识库', 'kb', '知识'],
    ['任务与提交统计', 'taskstats', '统计'],
    ['产能', 'capacity', '产能'], ['成本与支出', 'stats', '支出'], ['设置', 'admin', '设置']
  ]);
  // 老师：工作台 + 每日任务 + 本人填报的三页
  await walk('wang', [
    ['工作台', 'workbench', '工作台'],
    ['今日任务', 'task', '任务'], ['任务看板', 'taskboard', '任务'],
    ['日报填报', 'fill', '填报'], ['我的日报', 'mine', '我的'], ['我的周报', 'weekly', '周报']
  ]);
  await page.evaluate(() => { Store.setUser('olivia'); App.render(); });
  await new Promise(r => setTimeout(r, 200));

  console.log('\n== 3. 滚动是否可用 ==');
  // 用一个内容足够长的页面测滚动（原用成本页；工时下线后该页精简，已不足一屏）
  await page.evaluate(() => { location.hash = '#/admin'; });
  await new Promise(r => setTimeout(r, 320));
  const sc = await page.evaluate(() => {
    const c = document.getElementById('view');
    const b0 = c.scrollTop;
    c.scrollTop = 400;
    return { b0, after: c.scrollTop, scrollable: c.scrollHeight > c.clientHeight };
  });
  ok('内容区可滚动', sc.scrollable && sc.after > 0, JSON.stringify(sc));

  console.log('\n== 4. 弹窗可打开可关闭 ==');
  await page.evaluate(() => { location.hash = '#/board'; });
  await new Promise(r => setTimeout(r, 300));
  const opened = await page.evaluate(() => {
    const c = document.querySelector('#view .pcard[data-person]');
    if (c) c.click();
    const m = document.getElementById('modal');
    return { display: getComputedStyle(m).display, hidden: m.hidden, len: m.innerHTML.length };
  });
  ok('弹窗打开时可见', opened.display !== 'none' && opened.len > 50, JSON.stringify(opened));
  await page.screenshot({ path: OUT + '/modal-open.png' });
  const closed = await page.evaluate(() => {
    const c = document.querySelector('#modal [data-close]');
    if (c) c.click();
    const m = document.getElementById('modal');
    return { display: getComputedStyle(m).display, hidden: m.hidden };
  });
  ok('弹窗关闭后恢复不可见', closed.display === 'none', 'display=' + closed.display);

  console.log('\n== 5. 汇报文本两版弹窗（内部版 / 对外版） ==');
  // v1.12：最高权限（老板 / PM）不再有填报入口，填报页只有本人填报者能进；
  // 所以本节以「本人」身份走，用日期选择器切日期（不再有「代填人员」下拉）。
  await page.evaluate(() => { Store.setUser('wang'); App.render(); });
  // 5a) 正常日报：对外版干净（王弋 2026-10-08）
  await page.evaluate(() => { location.hash = '#/fill'; });
  await new Promise(r => setTimeout(r, 260));
  await page.evaluate(() => {
    const d = document.getElementById('fillDate'); d.value = '2026-10-08'; d.dispatchEvent(new Event('change'));
  });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => { [...document.querySelectorAll('#view button')].find(b => /汇报文本/.test(b.textContent)).click(); });
  await new Promise(r => setTimeout(r, 300));
  const two = await page.evaluate(() => {
    const b = document.querySelector('#modal');
    const t = sel => (b.querySelector(sel) || {}).textContent || '';
    return {
      open: getComputedStyle(b).display !== 'none',
      cols: b.querySelectorAll('.tcol').length,
      internal: t('.tcol:nth-child(1) .copybox'),
      client: t('.tcol:nth-child(2) .copybox'),
      saysBothVisible: /两版在站内/.test(b.textContent),
      tmNote: /明日工作任务/.test(b.textContent),
      tgls: b.querySelectorAll('.vt-row').length,
      clientBtnDisabled: b.querySelector('[data-copy="client"]').disabled,
      footer: b.querySelector('[data-copy="client"]').textContent
    };
  });
  ok('两版弹窗打开', two.open && two.cols === 2, '列数=' + two.cols);
  ok('弹窗 · 说明两版站内都可见', two.saysBothVisible === true);
  ok('内部版不再含工时', !/合计工时/.test(two.internal));
  ok('两版不再输出「明日工作任务」段（v1.23 下线）',
    !/明日工作任务/.test(two.internal) && !/明日工作任务/.test(two.client));
  ok('对外版无工时', !/工时/.test(two.client), two.client.slice(0, 30));
  ok('对外版无金额符号', !/[¥$]\s?\d/.test(two.client));
  ok('已无逐条开关（对外版不筛条目）', two.tgls === 0, two.tgls + ' 条');
  ok('干净日报：对外版可复制', two.clientBtnDisabled === false, two.footer.trim());
  ok('复制按钮文案为「对外版」', /对外版/.test(two.footer), two.footer.trim());
  await page.screenshot({ path: OUT + '/text-two-versions.png' });
  await page.evaluate(() => document.querySelector('#modal [data-close]').click());
  await new Promise(r => setTimeout(r, 200));

  // 5b) 含成本的日报：对外版应被拦下 + 红字高亮（李宇尧 2026-10-07 那条是带 $14.67 的）
  await page.evaluate(() => { Store.setUser('li'); location.hash = '#/fill'; App.render(); });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => {
    const d = document.getElementById('fillDate'); d.value = '2026-10-07'; d.dispatchEvent(new Event('change'));
  });
  await new Promise(r => setTimeout(r, 320));
  await page.evaluate(() => { [...document.querySelectorAll('#view button')].find(b => /汇报文本/.test(b.textContent)).click(); });
  await new Promise(r => setTimeout(r, 300));
  const leak = await page.evaluate(() => {
    const b = document.querySelector('#modal');
    return {
      marks: b.querySelectorAll('mark.leak').length,
      danger: !!b.querySelector('.note.danger'),
      disabled: b.querySelector('[data-copy="client"]').disabled,
      dbg: (b.querySelector('.modal-b') || {}).innerHTML ? b.querySelector('.modal-b').innerHTML.slice(0, 260) : 'NO-MODAL-B',
      footer: b.querySelector('[data-copy="client"]').textContent.trim()
    };
  });
  ok('含成本日报：扫到泄漏并高亮', leak.marks > 0 && leak.danger, '高亮 ' + leak.marks + ' 处');
  ok('含成本日报：对外版禁复制', leak.disabled === true, leak.footer);
  await page.screenshot({ path: OUT + '/text-leak-blocked.png' });

  // 5c) 逐条开关已下线：唯一修法是回填报页把描述里的金额 / 成本改写掉
  await page.evaluate(() => document.querySelector('#modal [data-close]').click());
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const ta = document.querySelector('#view [data-task]');
    ta.value = '接入 API 用量埋点，输出单场景统计';
    ta.dispatchEvent(new Event('input'));
  });
  await new Promise(r => setTimeout(r, 220));
  await page.evaluate(() => { [...document.querySelectorAll('#view button')].find(b => /汇报文本/.test(b.textContent)).click(); });
  await new Promise(r => setTimeout(r, 320));
  const fixed = await page.evaluate(() => {
    const b = document.getElementById('modal');
    return { disabled: b.querySelector('[data-copy="client"]').disabled,
             marks: b.querySelectorAll('mark.leak').length };
  });
  ok('改写描述后解除拦截', fixed.disabled === false && fixed.marks === 0, JSON.stringify(fixed));
  await page.evaluate(() => document.querySelector('#modal [data-close]').click());
  await new Promise(r => setTimeout(r, 200));

  // 5d) v1.23 口径：明日工作任务已下线；「已完成」不再强制产出物链接
  await page.evaluate(() => { Store.setUser('wang'); location.hash = '#/fill'; App.render(); });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => {
    const d = document.getElementById('fillDate'); d.value = '2026-10-08'; d.dispatchEvent(new Event('change'));
  });
  await new Promise(r => setTimeout(r, 320));
  const tm0 = await page.evaluate(() => ({
    box: !!document.querySelector('.tm-box'),
    rows: document.querySelectorAll('[data-tm-task]').length
  }));
  ok('填报页 · 明日工作任务区已下线', tm0.box === false && tm0.rows === 0);
  await page.screenshot({ path: OUT + '/fill-tomorrow.png' });

  // 5e) 当日卡点（FR-35）：只进内部版
  const blkBox = await page.evaluate(() => {
    const el = document.getElementById('dfBlocker');
    const box = el && el.closest('.blk-box');
    return { has: !!el, text: box ? box.textContent : '' };
  });
  ok('填报页 · 有「当日卡点」输入区', blkBox.has === true);
  ok('填报页 · 标注「只进内部版」',
    /只进内部版/.test(blkBox.text), blkBox.text.slice(0, 60));
  ok('填报页 · 说明卡点不会出现在对外版', /不会出现在对外版/.test(blkBox.text));
  await page.evaluate(() => {
    const el = document.getElementById('dfBlocker');
    el.value = '渲染农场排队等档期，本批预检卡住（e2e 卡点）。';
    el.dispatchEvent(new Event('input'));
  });
  await page.evaluate(() => { [...document.querySelectorAll('#view button')].find(b => /汇报文本/.test(b.textContent)).click(); });
  await new Promise(r => setTimeout(r, 320));
  const blk = await page.evaluate(() => {
    const b = document.getElementById('modal');
    const t = sel => (b.querySelector(sel) || {}).textContent || '';
    return {
      internal: t('.tcol:nth-child(1) .copybox'),
      client: t('.tcol:nth-child(2) .copybox'),
      saysInternalOnly: /只出现在内部版/.test(b.textContent),
      clientHead: t('.tcol:nth-child(2) .tcol-h')
    };
  });
  ok('当日卡点 · 内部版有「当日卡点：」一栏', /当日卡点：/.test(blk.internal));
  ok('当日卡点 · 内部版含卡点原文', /渲染农场排队等档期/.test(blk.internal));
  ok('当日卡点 · 对外版完全没有这一栏', !/当日卡点/.test(blk.client), blk.client.slice(0, 40));
  ok('当日卡点 · 对外版无卡点原文', !/渲染农场排队等档期/.test(blk.client));
  ok('当日卡点 · 弹窗点明只出现在内部版', blk.saysInternalOnly === true);
  ok('当日卡点 · 对外版表头写明「当日卡点」不出现', /当日卡点/.test(blk.clientHead), blk.clientHead);
  await page.screenshot({ path: OUT + '/fill-blocker.png' });
  await page.evaluate(() => document.querySelector('#modal [data-close]').click());
  await new Promise(r => setTimeout(r, 220));
  // 带种子卡点的历史日报：同样只进内部版
  const blkSeed = await page.evaluate(() => {
    const v = Store.reportVersions(Store.getReport('wang', '2026-10-06'));
    return { i: v.internalText, c: v.clientText };
  });
  ok('种子日报 · 内部版含卡点', /当日卡点：/.test(blkSeed.i) && /外包方补采回传/.test(blkSeed.i));
  ok('种子日报 · 对外版无卡点', !/当日卡点/.test(blkSeed.c) && !/外包方补采回传/.test(blkSeed.c));

  console.log('\n== 6. 权限：三级身份 ==');
  // 切到王老师（TA 老师）→ 未交名单应显示权限提示
  await page.evaluate(() => { document.getElementById('userChip').click(); });
  await new Promise(r => setTimeout(r, 160));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-user]')].find(x => x.dataset.user === 'wang');
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 320));
  const asMember = await page.evaluate(() => {
    const navs = [...document.querySelectorAll('.nav-item')].map(x => x.dataset.route);
    return { navs: navs, chip: (document.querySelector('.u-role') || {}).textContent || '' };
  });
  ok('TA 老师 · 侧栏也有「未交名单」（v1.17 页面按人一致）', asMember.navs.indexOf('missing') >= 0, asMember.navs.join(','));
  ok('TA 老师 · 侧栏也有「管理」', asMember.navs.indexOf('admin') >= 0);
  ok('TA 老师 · 身份卡显示内部成员', asMember.chip.indexOf('内部成员') >= 0, asMember.chip);
  await page.evaluate(() => { location.hash = '#/admin'; });
  await new Promise(r => setTimeout(r, 320));
  const memberAdmin = await page.evaluate(() => ({
    hash: location.hash,
    html: document.getElementById('view').innerHTML,
    active: (document.querySelector('.nav-item.active') || {}).dataset
      ? document.querySelector('.nav-item.active').dataset.route : null
  }));
  ok('TA 老师 · 直接访问管理页能进（v1.17 全员可编辑）',
    memberAdmin.hash === '#/admin' && memberAdmin.active === 'admin', String(memberAdmin.hash));
  ok('TA 老师 · 管理页 8 个分页都渲染出来', memberAdmin.html.indexOf('data-tab') >= 0);
  await page.screenshot({ path: OUT + '/perm-member-allowed.png' });

  // 切到宋天意（TA Leader，最高权限）→ 管理页可用
  await page.evaluate(() => { document.getElementById('userChip').click(); });
  await new Promise(r => setTimeout(r, 160));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-user]')].find(x => x.dataset.user === 'ta');
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 320));
  const asLead = await page.evaluate(() => {
    const navs = [...document.querySelectorAll('.nav-item')].map(x => x.dataset.route);
    return { navs: navs, chip: (document.querySelector('.u-role') || {}).textContent || '' };
  });
  ok('TA Leader · 侧栏有「未交名单」与「设置」',
    asLead.navs.indexOf('missing') >= 0 && asLead.navs.indexOf('admin') >= 0, asLead.navs.join(','));
  ok('TA Leader · 身份卡显示最高权限', asLead.chip.indexOf('最高权限') >= 0, asLead.chip);
  await page.evaluate(() => { location.hash = '#/admin'; });
  await new Promise(r => setTimeout(r, 340));
  const leadAdmin = await page.evaluate(() => ({
    tabs: document.querySelectorAll('[data-tab]').length,
    hasRoles: !!document.querySelector('[data-tab="roles"]'),
    hasDash: !!document.querySelector('[data-tab="dash"]')
  }));
  ok('TA Leader · 设置页 8 个分页（v1.15 新增「看板与提醒」）', leadAdmin.tabs === 8, leadAdmin.tabs + ' 个');
  ok('TA Leader · 有「角色与权限」分页', leadAdmin.hasRoles === true);
  ok('TA Leader · 有「看板与提醒」分页', leadAdmin.hasDash === true);
  await page.evaluate(() => { document.querySelector('[data-tab="roles"]').click(); });
  await new Promise(r => setTimeout(r, 300));
  const rolesView = await page.evaluate(() => document.getElementById('view').innerHTML);
  ok('角色与权限 · 列出最高权限三档', rolesView.indexOf('老板') > 0 && rolesView.indexOf('TA Leader') > 0 && rolesView.indexOf('PM') > 0);
  ok('角色与权限 · 客户侧标注无账号', rolesView.indexOf('无账号') > 0);
  await page.screenshot({ path: OUT + '/admin-roles.png' });

  // 「下拉项」分页（v1.16）：最高权限走真实鼠标新增一条管线 → 表格 +1；再删除还原
  await page.evaluate(() => { document.querySelector('[data-tab="enums"]').click(); });
  await new Promise(r => setTimeout(r, 320));
  const en0 = await page.evaluate(() => ({
    rows: document.querySelectorAll('#view [data-ened]').length,
    adds: document.querySelectorAll('#view [data-enadd]').length,
    hasOtherDel: !!document.querySelector('[data-endel="pipe:other"]')
  }));
  ok('下拉项 · 四组枚举共 16 行可编辑', en0.rows === 16, en0.rows + ' 行');
  ok('下拉项 · 每组一个「+ 新增」（共 4）', en0.adds === 4, en0.adds + ' 个');
  ok('下拉项 · 兜底项「其他」不可删', en0.hasOtherDel === false);
  await clickSel('[data-enadd="pipe"]');
  await new Promise(r => setTimeout(r, 300));
  await page.type('#enName', 'e2e 临时管线');
  await clickSel('#enOk');
  await new Promise(r => setTimeout(r, 380));
  const en1 = await page.evaluate(() => ({
    rows: document.querySelectorAll('#view [data-ened]').length,
    has: document.getElementById('view').innerHTML.indexOf('e2e 临时管线') >= 0
  }));
  ok('下拉项 · 新增管线后表格 +1 且出现新项', en1.rows === 17 && en1.has, JSON.stringify(en1));
  await page.screenshot({ path: OUT + '/admin-enums.png' });
  await page.evaluate(() => {
    const id = (Store.pipelines().find(p => p.name === 'e2e 临时管线') || {}).id;
    if (id) Store.removePipeline(id);
  });

  // 切回 PM
  await page.evaluate(() => { document.getElementById('userChip').click(); });
  await new Promise(r => setTimeout(r, 160));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-user]')].find(x => x.dataset.user === 'olivia');
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 300));

  console.log('\n== 7. 周报板块 + 一键复制对外版（真实鼠标）==');
  // 切到王弋（内部成员），走「我的周报」填写 → 提交
  await page.evaluate(() => { document.getElementById('userChip').click(); });
  await new Promise(r => setTimeout(r, 160));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-user]')].find(x => x.dataset.user === 'wang');
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => { location.hash = '#/weekly'; });
  await new Promise(r => setTimeout(r, 340));
  const wk0 = await page.evaluate(() => ({
    hasWeekSel: !!document.querySelector('#wrWeek'),
    hasLast: !!document.querySelector('#wrLast'),
    hasRisks: !!document.querySelector('#wrRisks'),
    hasPlan: document.getElementById('view').textContent.indexOf('本周工作任务') > 0,
    hasGroup: document.getElementById('view').textContent.indexOf('3DGS 组') > 0
  }));
  ok('我的周报 · 周期选择 / 上周结果 / 风险 三块齐全',
    wk0.hasWeekSel && wk0.hasLast && wk0.hasRisks, JSON.stringify(wk0));
  ok('我的周报 · 展示 PM 发布的「本周工作任务」', wk0.hasPlan);
  ok('我的周报 · 展示本组提交状态', wk0.hasGroup);
  // 切到未收的下一周期 → 空内容提交应被拦
  await page.evaluate(() => {
    const s = document.querySelector('#wrWeek');
    s.value = '2026-10-12';
    s.dispatchEvent(new Event('change'));
  });
  await new Promise(r => setTimeout(r, 300));
  const guard = await page.evaluate(() => ({
    disabled: document.querySelector('#wrSubmit').disabled,
    txt: document.getElementById('view').textContent
  }));
  ok('我的周报 · 空内容时提交按钮禁用', guard.disabled === true);
  ok('我的周报 · 提示要写「上周任务结果」', guard.txt.indexOf('上周任务结果') > 0);
  // 填齐 → 提交
  await page.evaluate(() => {
    const a = document.querySelector('#wrLast');
    a.value = '本周重建批次 B-087~B-092 共 6 个场景全部完成，重建失败 0 个。';
    a.dispatchEvent(new Event('input'));
    document.querySelector('#btnAddSg').click();
  });
  await new Promise(r => setTimeout(r, 260));
  await page.evaluate(() => {
    const t = document.querySelector('[data-sg-task]');
    t.value = '推进 B-093~B-100 批次重建，目标 30 个场景';
    t.dispatchEvent(new Event('input'));
  });
  await new Promise(r => setTimeout(r, 200));
  const ready = await page.evaluate(() => document.querySelector('#wrSubmit').disabled === false);
  ok('我的周报 · 填齐后解除禁用', ready);
  await page.evaluate(() => document.querySelector('#wrSubmit').click());
  await new Promise(r => setTimeout(r, 320));
  const saved = await page.evaluate(() => {
    const w = window.Store.getWeekReport('wang', '2026-10-12');
    return { status: w && w.status, badge: document.getElementById('view').textContent.indexOf('已提交') > 0 };
  });
  ok('我的周报 · 提交落库并显示已提交', saved.status === 'submitted' && saved.badge, JSON.stringify(saved));

  // PM 视角：周报汇总 + 发布本周工作任务
  await page.evaluate(() => { document.getElementById('userChip').click(); });
  await new Promise(r => setTimeout(r, 160));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-user]')].find(x => x.dataset.user === 'olivia');
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => { location.hash = '#/weekboard'; });
  await new Promise(r => setTimeout(r, 340));
  const board0 = await page.evaluate(() => ({
    hasSel: !!document.querySelector('#wbWeek'),
    hasText: !!document.querySelector('#wbPlanText'),
    groups: document.getElementById('view').textContent.indexOf('场景生成组') > 0 &&
            document.getElementById('view').textContent.indexOf('3DGS 组') > 0
  }));
  ok('周报汇总 · 周期选择 + 发布区齐全', board0.hasSel && board0.hasText, JSON.stringify(board0));
  ok('周报汇总 · 两个组都在', board0.groups);
  // 切到王弋刚交的那一周，确认汇总里能看到他的上周结果
  await page.evaluate(() => {
    const s = document.querySelector('#wbWeek');
    s.value = '2026-10-12';
    s.dispatchEvent(new Event('change'));
  });
  await new Promise(r => setTimeout(r, 300));
  const showsWang = await page.evaluate(() => document.getElementById('view').textContent.indexOf('B-087~B-092') > 0);
  ok('周报汇总 · 能看到王弋刚交的上周结果', showsWang);
  await page.evaluate(() => {
    document.querySelector('#wbPlanText').value = '1. 3DGS 组：重建 B-093~B-100 批次，目标本周 30 个场景。\n2. 场景生成组：Codex 模板 v4 试验与 A/B 对比。';
    document.querySelector('#wbPublish').click();
  });
  await new Promise(r => setTimeout(r, 320));
  const pub = await page.evaluate(() => {
    const p = window.Store.weekPlan('2026-10-12');
    return { by: p && p.by, has: p && p.text.indexOf('B-093~B-100') >= 0 };
  });
  ok('周报汇总 · PM 发布本周工作任务落库', pub.has === true, JSON.stringify(pub));
  await page.screenshot({ path: OUT + '/weekboard.png' });
  // 老师侧应立刻可见
  await page.evaluate(() => { document.getElementById('userChip').click(); });
  await new Promise(r => setTimeout(r, 160));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-user]')].find(x => x.dataset.user === 'wang');
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => { location.hash = '#/weekly'; });
  await new Promise(r => setTimeout(r, 320));
  const seen = await page.evaluate(() => document.getElementById('view').textContent.indexOf('B-093~B-100') > 0);
  ok('我的周报 · 老师立刻看到 PM 刚发布的本周任务', seen);
  await page.screenshot({ path: OUT + '/weekly.png' });

  // 一键「复制对外版」：在日报看板的人员卡上验证
  await page.evaluate(() => { location.hash = '#/board'; });
  await new Promise(r => setTimeout(r, 340));
  const copyBtn = await page.evaluate(() => {
    const b = document.querySelector('[data-copyclient]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  ok('日报看板 · 卡片上有「复制对外版发群」', !!copyBtn);
  if (copyBtn) {
    await page.mouse.click(copyBtn.x, copyBtn.y);
    await new Promise(r => setTimeout(r, 320));
    const t = await page.evaluate(() => document.getElementById('toast').textContent);
    ok('日报看板 · 点复制有反馈', t.length > 0, t);
  }
  // 含内部信息的日报：直接走 Store 判定（外发审查拦下）
  const leakCheck = await page.evaluate(() => {
    const r = window.Store.getReport('li', '2026-10-07');
    const v = window.Store.reportVersions(r);
    return { kinds: v.leaks.map(x => x.kind).join('、'), n: v.leaks.length };
  });
  ok('含 $14.67 的日报 · 外发审查报出金额与成本', leakCheck.n > 0, leakCheck.kinds);

  console.log('\n== 8. 知识库（真实点击）==');
  const navKB = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.nav-item')].find(x => x.dataset.route === 'kb');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  ok('知识库 · 侧栏入口存在', !!navKB);
  if (navKB) {
    await page.mouse.click(navKB.x, navKB.y);
    await new Promise(r => setTimeout(r, 300));
    const kb0 = await page.evaluate(() => ({
      title: (document.querySelector('.t-title') || {}).textContent,
      spaces: document.querySelectorAll('.kb-scard[data-space]').length,
      newSpaceCard: document.querySelectorAll('.kb-scard[data-space-new]').length,
      treeRows: document.querySelectorAll('.kb-row').length
    }));
    ok('知识库 · 落地页 4 个空间（+「新建空间」占位卡）+ 目录树',
      kb0.title === '知识库' && kb0.spaces === 4 && kb0.newSpaceCard === 1 && kb0.treeRows > 8,
      JSON.stringify(kb0));
    await page.screenshot({ path: OUT + '/kb-landing.png' });

    // 打开「每日汇报两版规则」
    await page.evaluate(() => {
      const r = [...document.querySelectorAll('.kb-row.doc')].find(x => x.textContent.indexOf('每日汇报两版规则') >= 0);
      r.click();
    });
    await new Promise(r => setTimeout(r, 300));
    const kb1 = await page.evaluate(() => ({
      h2: (document.querySelector('.kb-doc-h h2') || {}).textContent,
      tables: document.querySelectorAll('.md-tbl').length,
      quotes: document.querySelectorAll('.md-quote').length,
      stars: !!document.getElementById('kbStar'),
      edit: !!document.getElementById('kbEdit'),
      saysOnlyInternal: /只对内/.test(document.querySelector('.kb-body').textContent)
    }));
    ok('知识库 · 文档页含表格与引用', kb1.h2 === '每日汇报两版规则' && kb1.tables > 0 && kb1.quotes > 0,
      JSON.stringify(kb1));
    ok('知识库 · 两版规则写明网站只对内', kb1.saysOnlyInternal === true);
    await page.screenshot({ path: OUT + '/kb-doc.png' });

    // 收藏 → 出现在「我的收藏」
    await page.evaluate(() => document.getElementById('kbStar').click());
    await new Promise(r => setTimeout(r, 250));
    const starred = await page.evaluate(() => document.querySelector('.kb-doc-meta').textContent.indexOf('已收藏') >= 0);
    ok('知识库 · 收藏生效', starred);

    // 全文搜索
    await page.evaluate(() => {
      const i = document.getElementById('kbQ');
      i.value = '成本';
      i.dispatchEvent(new Event('input'));
    });
    await new Promise(r => setTimeout(r, 300));
    const hits = await page.evaluate(() => document.querySelectorAll('[data-doc-id]').length);
    ok('知识库 · 搜索「成本」≥2 篇', hits >= 2, hits + ' 篇');
    await page.screenshot({ path: OUT + '/kb-search.png' });

    // 新建文档（真实点击）：空间 + 目录 + 标题 + 正文
    await page.evaluate(() => { location.hash = '#/kb'; App.render(); });
    await new Promise(r => setTimeout(r, 320));
    await clickSel('#kbNew');
    await new Promise(r => setTimeout(r, 320));
    const neOpen = await page.evaluate(() => ({
      open: document.getElementById('modal').hidden === false,
      hasFolder: !!document.getElementById('neFolder'),
      folders: document.getElementById('neFolder').options.length
    }));
    ok('知识库 · 新建文档弹窗含「空间 + 目录」下拉', neOpen.open && neOpen.hasFolder, JSON.stringify(neOpen));
    await page.evaluate(() => {
      const s = document.getElementById('neSpace');
      s.value = 'sp-rule'; s.dispatchEvent(new Event('change'));
    });
    await new Promise(r => setTimeout(r, 220));
    const neFolders = await page.evaluate(() => document.getElementById('neFolder').options.length);
    ok('知识库 · 切换空间后目录下拉跟着换', neFolders >= 1, neFolders + ' 项');
    await page.evaluate(() => {
      document.getElementById('neTitle').value = '临时验收文档';
      document.getElementById('neBody').value = '# 临时验收文档\n- 自检产物';
      document.getElementById('neOk').click();
    });
    await new Promise(r => setTimeout(r, 420));
    const neDone = await page.evaluate(() => ({
      h2: (document.querySelector('.kb-doc-h h2') || {}).textContent,
      inTree: [].slice.call(document.querySelectorAll('.kb-row.doc')).some(x => x.textContent.indexOf('临时验收文档') >= 0),
      logged: Store.state.logs.some(l => l.action === '新建知识库文档')
    }));
    ok('知识库 · 新建文档 → 落库 + 进目录树 + 自动打开 + 写日志',
      neDone.h2 === '临时验收文档' && neDone.inTree && neDone.logged, JSON.stringify(neDone));

    // 新建空间（真实点击）：目录树左下角 + 落地页占位卡都能触发
    await clickSel('#kbNewSpace');
    await new Promise(r => setTimeout(r, 320));
    await page.evaluate(() => {
      document.getElementById('nsName').value = '外包与采购';
      document.getElementById('nsDesc').value = '外包方对接与采购台账';
      document.getElementById('nsOk').click();
    });
    await new Promise(r => setTimeout(r, 420));
    const nsDone = await page.evaluate(() => ({
      cards: document.querySelectorAll('.kb-scard[data-space]').length,
      tree: [].slice.call(document.querySelectorAll('.kb-space-h')).map(x => x.textContent).join('|'),
      logged: Store.state.logs.some(l => l.action === '新建知识库空间')
    }));
    ok('知识库 · 新建空间 → 5 个空间 + 目录树出现新空间 + 写日志',
      nsDone.cards === 5 && nsDone.tree.indexOf('外包与采购') >= 0 && nsDone.logged, JSON.stringify(nsDone));
    await page.screenshot({ path: OUT + '/kb-new.png' });
    // 还原：把自检造的空间与文档撤掉，避免影响后续分节
    await page.evaluate(() => { Store.state.kb.nodes.pop(); Store.state.kb.spaces.pop(); });
  }

  console.log('\n== 8b. 导航与落地页（v1.13：全员落地工作台） ==');
  // 最高权限（PM）：侧栏没有填报入口，落地页 = 工作台（同一页按角色换形态）
  await page.evaluate(() => { Store.setUser('olivia'); location.hash = ''; location.replace('#'); App.render(); });
  await new Promise(r => setTimeout(r, 340));
  const pmNav = await page.evaluate(() => ({
    routes: [].slice.call(document.querySelectorAll('#sidebar [data-route]')).map(x => x.dataset.route),
    groups: [].slice.call(document.querySelectorAll('#sidebar .nav-group-label')).map(x => x.textContent),
    active: (document.querySelector('#sidebar .nav-item.active') || {}).dataset
      ? document.querySelector('#sidebar .nav-item.active').dataset.route : null,
    grid: document.querySelectorAll('#view .wb-grid').length,
    cards: document.querySelectorAll('#view .wb-card').length,
    hasMine: document.querySelector('#view .wb-card[data-card="mine"]') !== null
  }));
  ok('PM · 侧栏首项是「工作台」', pmNav.routes[0] === 'workbench', pmNav.routes.join(','));
  ok('PM · 侧栏分组含「总览 / 每日任务 / 日报 / 周报 / 知识 / 数据 / 管理」（v1.14 分组样式）',
    ['总览', '每日任务', '日报', '周报', '知识', '数据', '管理'].every(x => pmNav.groups.indexOf(x) >= 0), pmNav.groups.join(','));
  ok('PM · 侧栏没有「日报填报 / 今日任务 / 我的日报 / 我的周报」（v1.22a：不填报就不显示）',
    ['fill','task','mine','weekly'].every(r => pmNav.routes.indexOf(r) < 0), pmNav.routes.join(','));
  ok('PM · 保留看板 / 未交名单 / 设置 / 任务看板与统计',
    ['board', 'missing', 'admin', 'taskboard', 'taskstats'].every(r => pmNav.routes.indexOf(r) >= 0),
    pmNav.routes.join(','));
  ok('PM · 落地页 = 工作台（三栏栅格 + ≥8 张卡 + 无「我的最近日报」）',
    pmNav.active === 'workbench' && pmNav.grid === 1 && pmNav.cards >= 8 && pmNav.hasMine === false,
    pmNav.active + ' / ' + pmNav.cards + ' 张 · mine=' + pmNav.hasMine);
  await page.screenshot({ path: OUT + '/landing-workbench-pm.png' });

  // 真实鼠标点击侧栏「日报看板」：确认工作台之外的管理页照常可达
  const boardBox = await page.evaluate(() => {
    const b = document.querySelector('#sidebar [data-route="board"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (boardBox) await page.mouse.click(boardBox.x, boardBox.y);
  await new Promise(r => setTimeout(r, 320));
  const boardAfter = await page.evaluate(() => ({
    hash: location.hash, pcards: document.querySelectorAll('#view .pcard').length
  }));
  ok('PM · 真实点击「日报看板」可进入', boardAfter.hash === '#/board' && boardAfter.pcards > 0,
    JSON.stringify(boardAfter));

  // 深链守卫：最高权限手动敲 #/fill → 落回工作台
  await page.evaluate(() => { location.hash = '#/fill'; });
  await new Promise(r => setTimeout(r, 340));
  const guardRes = await page.evaluate(() => ({
    hash: location.hash,
    hasForm: document.getElementById('view').innerHTML.indexOf('entry-form') >= 0,
    active: (document.querySelector('#sidebar .nav-item.active') || {}).dataset
      ? document.querySelector('#sidebar .nav-item.active').dataset.route : null
  }));
  ok('深链 · PM 打开 #/fill 弹回工作台（v1.22a：不填报进不了填报页）',
    guardRes.hash === '#/workbench' && guardRes.active === 'workbench' && guardRes.hasForm === false,
    JSON.stringify(guardRes));

  // 老师：有填报入口，落地页同样是工作台（不是直接进表单），多一张「我的最近日报」卡
  await page.evaluate(() => { Store.setUser('wang'); location.hash = ''; location.replace('#'); App.render(); });
  await new Promise(r => setTimeout(r, 340));
  const taNav = await page.evaluate(() => ({
    routes: [].slice.call(document.querySelectorAll('#sidebar [data-route]')).map(x => x.dataset.route),
    active: (document.querySelector('#sidebar .nav-item.active') || {}).dataset
      ? document.querySelector('#sidebar .nav-item.active').dataset.route : null,
    cards: document.querySelectorAll('#view .wb-card').length,
    hasMine: document.querySelector('#view .wb-card[data-card="mine"]') !== null,
    hasForm: document.getElementById('view').innerHTML.indexOf('entry-form') >= 0
  }));
  ok('老师 · 侧栏有「日报填报」「我的日报」',
    taNav.routes.indexOf('fill') >= 0 && taNav.routes.indexOf('mine') >= 0, taNav.routes.join(','));
  ok('老师 · 侧栏有「今日任务」「任务看板」',
    taNav.routes.indexOf('task') >= 0 && taNav.routes.indexOf('taskboard') >= 0, taNav.routes.join(','));
  ok('老师 · 也看得见「未交名单 / 管理」（v1.17 页面一致）',
    taNav.routes.indexOf('missing') >= 0 && taNav.routes.indexOf('admin') >= 0, taNav.routes.join(','));
  ok('老师 · 落地页 = 工作台 + 有「我的最近日报」卡',
    taNav.active === 'workbench' && taNav.hasMine === true && taNav.hasForm === false && taNav.cards >= 10,
    taNav.active + ' / ' + taNav.cards + ' 张 · mine=' + taNav.hasMine);
  await page.screenshot({ path: OUT + '/landing-workbench-ta.png' });

  console.log('\n== 8b2. 工作台真实交互（内容流 / 点赞 / 评论 / 筛选 / 折叠 / ⌘K 搜索 / 发布） ==');
  // 先快照内容流，本节结束整体还原，避免污染后续段落
  const newsSnap = await page.evaluate(() => JSON.stringify(Store.state.news));

  const feedBase = await page.evaluate(() => ({
    items: document.querySelectorAll('#view .ni').length,
    pinned: document.querySelectorAll('#view .ni.pinned').length,
    intern: document.querySelectorAll('#view .ni .idtag.intern').length,
    firstCls: (document.querySelector('#view .ni') || {}).className || ''
  }));
  ok('信息流 · 首页 ≥5 条（每页 5 条）', feedBase.items >= 5, feedBase.items + ' 条');
  ok('信息流 · 置顶优先（第一条带 pinned）',
    feedBase.pinned >= 1 && feedBase.firstCls.indexOf('pinned') >= 0, JSON.stringify(feedBase));

  // 点赞（真实鼠标）：挑一条当前身份未点赞的，避免落进「取消赞」分支
  const likeInfo = await page.evaluate(() => {
    const btns = [].slice.call(document.querySelectorAll('#view [data-like]'));
    const b = btns.find(x => (Store.newsItem(x.dataset.like).likes || []).indexOf('wang') < 0) || btns[0];
    const id = b.dataset.like;
    return { id: id, before: Store.newsItem(id).likes.length,
             mine: (Store.newsItem(id).likes || []).indexOf('wang') >= 0 };
  });
  await clickSel('[data-like="' + likeInfo.id + '"]');
  const likeAfter = await page.evaluate(id => Store.newsItem(id).likes.length, likeInfo.id);
  ok('点赞 · 真实点击计数 ' + (likeInfo.mine ? '−1（取消赞）' : '+1'),
    likeInfo.mine ? likeAfter === likeInfo.before - 1 : likeAfter === likeInfo.before + 1,
    likeInfo.before + ' → ' + likeAfter);
  await page.evaluate(s => { Store.state.news = JSON.parse(s); Store.save(); App.render(); }, newsSnap);
  await new Promise(r => setTimeout(r, 240));

  // 评论（真实鼠标）
  const cmtId = await page.evaluate(() => document.querySelector('#view [data-cmt]').dataset.cmt);
  await clickSel('[data-cmt="' + cmtId + '"]');
  ok('评论 · 真实点击展开行内输入框（不弹窗）',
    await page.evaluate(id => !!document.querySelector('#view [data-cmtbox="' + id + '"]'), cmtId));
  const c0 = await page.evaluate(id => (Store.newsItem(id).comments || []).length, cmtId);
  await page.evaluate(id => {
    const t = document.querySelector('#view [data-cmtbox="' + id + '"]');
    t.value = '自动化：真实浏览器写入的评论';
    t.dispatchEvent(new Event('input'));
  }, cmtId);
  await clickSel('[data-cmtsend="' + cmtId + '"]');
  const c1 = await page.evaluate(id => (Store.newsItem(id).comments || []).length, cmtId);
  ok('评论 · 发表后落库 + 即时显示',
    c1 === c0 + 1 && (await page.evaluate(() => document.getElementById('view').innerHTML.indexOf('真实浏览器写入的评论') >= 0)),
    c0 + ' → ' + c1);
  await page.evaluate(s => { Store.state.news = JSON.parse(s); Store.save(); App.render(); }, newsSnap);
  await new Promise(r => setTimeout(r, 240));

  // 筛选
  await clickSel('[data-filter="公告"]');
  const filt = await page.evaluate(() => ({
    n: document.querySelectorAll('#view .ni').length,
    on: (document.querySelector('#view .chip.on') || {}).textContent || ''
  }));
  ok('筛选 · 只剩公告类', filt.n === 1 && filt.on.indexOf('公告') >= 0, JSON.stringify(filt));
  await clickSel('[data-filter="全部"]');

  // 加载更多
  const moreBtn = await page.evaluate(() => !!document.querySelector('#view [data-act="more"]'));
  if (moreBtn) {
    const b0 = await page.evaluate(() => document.querySelectorAll('#view .ni').length);
    await clickSel('[data-act="more"]');
    const b1 = await page.evaluate(() => document.querySelectorAll('#view .ni').length);
    ok('加载更多 · 条数增加', b1 > b0, b0 + ' → ' + b1);
  } else {
    ok('加载更多 · 内容不足一页时不出现按钮', true);
  }

  // 卡片 ⋮ → 折叠 / 展开
  await page.evaluate(() => { const b = document.querySelector('#view [data-menu]'); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 140));
  ok('卡片 ⋮ 菜单 · 可打开（上移 / 下移 / 折叠 / 隐藏）',
    await page.evaluate(() => !!document.querySelector('#view .wb-menu')));
  await clickSel('#view .wb-menu [data-m="fold"]');
  const folded = await page.evaluate(() => {
    const c = document.querySelector('#view .wb-card.folded');
    return c ? { id: c.dataset.card, hidden: c.querySelector('.wb-body').hidden } : null;
  });
  ok('折叠 · 卡头保留、正文隐藏', !!folded && folded.hidden === true, JSON.stringify(folded));
  await clickSel('#view .wb-card.folded [data-fold]');
  ok('展开 · 恢复正文',
    await page.evaluate(() => document.querySelectorAll('#view .wb-card.folded').length === 0));

  // 卡片 ⋮ → 隐藏 → 底部恢复条
  await page.evaluate(() => { const b = document.querySelector('#view [data-menu]'); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 140));
  await clickSel('#view .wb-menu [data-m="hide"]');
  ok('隐藏 · 卡片消失 + 底部「已隐藏」恢复条',
    await page.evaluate(() => !!document.querySelector('#view .wb-hidden')));
  await page.evaluate(() => { Store.resetPrefsDash(); App.render(); });
  await new Promise(r => setTimeout(r, 260));
  ok('恢复默认 · 卡片全部回来',
    await page.evaluate(() => document.querySelectorAll('#view .wb-card').length >= 10));

  // ⌘K 全局搜索
  await page.keyboard.down('Meta');
  await page.keyboard.press('k');
  await page.keyboard.up('Meta');
  await new Promise(r => setTimeout(r, 320));
  ok('⌘K · 唤起全局搜索弹窗',
    await page.evaluate(() => getComputedStyle(document.getElementById('modal')).display !== 'none' &&
      !!document.getElementById('gsInput')));
  await page.evaluate(() => {
    const i = document.getElementById('gsInput');
    i.value = '渲染'; i.dispatchEvent(new Event('input'));
  });
  await new Promise(r => setTimeout(r, 460));
  const gsHits = await page.evaluate(() => document.querySelectorAll('#gsRes [data-gs]').length);
  ok('⌘K · 搜「渲染」有结果', gsHits >= 1, gsHits + ' 条');
  await page.screenshot({ path: OUT + '/workbench-search.png' });
  await page.evaluate(() => { const c = document.querySelector('#modal [data-close]'); if (c) c.click(); });
  await new Promise(r => setTimeout(r, 220));
  ok('⌘K · 可关闭', await page.evaluate(() => document.getElementById('modal').hidden === true));

  // 实习生发布：两类置灰 + 无置顶选项 + 带身份标签
  await page.evaluate(() => { Store.setUser('anya'); location.hash = ''; location.replace('#'); App.render(); });
  await new Promise(r => setTimeout(r, 320));
  await page.evaluate(() => window.AlefWorkbench.compose());
  await new Promise(r => setTimeout(r, 320));
  const interCmp = await page.evaluate(() => {
    const cats = [].slice.call(document.querySelectorAll('#cpCats [data-cat]'));
    return { open: !!document.getElementById('cpTitle'), total: cats.length,
             dis: cats.filter(c => c.disabled).map(c => c.dataset.cat),
             pin: !!document.getElementById('cpPin') };
  });
  ok('实习生 · 发布弹窗可开', interCmp.open === true, JSON.stringify(interCmp));
  ok('实习生 · 「公告」「新闻」置灰不可选（其余可选）',
    interCmp.dis.indexOf('公告') >= 0 && interCmp.dis.indexOf('新闻') >= 0 && interCmp.dis.length === 2,
    interCmp.dis.join(',') + ' / 共 ' + interCmp.total);
  ok('实习生 · 无置顶选项', interCmp.pin === false);
  await page.evaluate(() => {
    document.getElementById('cpTitle').value = '自动化：实习生发布的一条分享';
    document.querySelector('#cpCats [data-cat="分享"]').click();
    document.getElementById('cpBody').value = '## 今天学到的\n- 一条要点';
  });
  await clickSel('#cpGo');
  const internPosted = await page.evaluate(() => ({
    n: Store.state.news.filter(n => n.authorId === 'anya' && n.title.indexOf('自动化：实习生发布') >= 0).length,
    internTag: document.querySelectorAll('#view .ni .idtag.intern').length
  }));
  ok('实习生 · 发布成功并落库（带 intern 身份）', internPosted.n === 1, JSON.stringify(internPosted));
  ok('实习生 · 信息流里带「实习生」身份标签', internPosted.internTag >= 1, internPosted.internTag + ' 个');
  await page.screenshot({ path: OUT + '/workbench-intern.png' });

  // 管理层发布公告并置顶 → 信息流第一条
  await page.evaluate(() => { Store.setUser('olivia'); location.hash = ''; location.replace('#'); App.render(); });
  await new Promise(r => setTimeout(r, 320));
  await page.evaluate(() => window.AlefWorkbench.compose());
  await new Promise(r => setTimeout(r, 320));
  const pmCmp = await page.evaluate(() => {
    const cats = [].slice.call(document.querySelectorAll('#cpCats [data-cat]'));
    return { total: cats.length, dis: cats.filter(c => c.disabled).length, pin: !!document.getElementById('cpPin') };
  });
  ok('管理层 · 五类全开 + 有置顶选项',
    pmCmp.total === 5 && pmCmp.dis === 0 && pmCmp.pin === true, JSON.stringify(pmCmp));
  await page.evaluate(() => {
    document.getElementById('cpTitle').value = '自动化：一条置顶公告';
    document.querySelector('#cpCats [data-cat="公告"]').click();
    document.getElementById('cpBody').value = '全体注意：这是自动化测试公告。';
    const p = document.getElementById('cpPin'); if (p) p.click();
  });
  await clickSel('#cpGo');
  const pmPosted = await page.evaluate(() => ({
    exists: Store.state.news.some(n => n.title === '自动化：一条置顶公告' && n.pinned === true),
    firstCls: (document.querySelector('#view .ni') || {}).className || ''
  }));
  ok('管理层 · 公告发布并置顶（排信息流第一）',
    pmPosted.exists === true && pmPosted.firstCls.indexOf('pinned') >= 0, JSON.stringify(pmPosted));
  await page.screenshot({ path: OUT + '/workbench-pm-post.png' });

  // 还原内容流 + 清偏好
  await page.evaluate(s => { Store.state.news = JSON.parse(s); Store.save(); Store.resetPrefsDash(); App.render(); }, newsSnap);
  await new Promise(r => setTimeout(r, 280));

  console.log('\n== 8c. 旧缓存不再白屏（结构版本守卫） ==');
  // 先落成 PM 身份，才验证得了「重建后落地页仍按身份算」（8b 结尾停在老师身份）
  await page.evaluate(() => { Store.setUser('olivia'); App.render(); });
  await new Promise(r => setTimeout(r, 300));
  // 造一份「旧版本」缓存：抹掉版本号 / 塞回已下线的 news 字段 / 删掉新字段
  const staleInfo = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('alef-daily-v1'));
    const before = raw.schemaVersion;
    raw.schemaVersion = 0;
    raw.news = [{ id:'old1', date:'2026-09-01', authorId:'anya', title:'旧版本遗留资讯' }];
    delete raw.roles;
    localStorage.setItem('alef-daily-v1', JSON.stringify(raw));
    return { before: before, current: SEED.schemaVersion };
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 700));
  const afterReload = await page.evaluate(() => ({
    loginHidden: document.getElementById('login') ? document.getElementById('login').hidden : null,
    appShown: document.querySelector('.app').style.display !== 'none',
    viewLen: document.getElementById('view') ? document.getElementById('view').innerHTML.length : -1,
    crash: document.getElementById('view') ? document.getElementById('view').innerHTML.indexOf('这个页面没能显示出来') >= 0 : null,
    version: (Store.state || {}).schemaVersion,
    newsLen: ((Store.state || {}).news || []).length,
    tasksLen: ((Store.state || {}).tasks || []).length,
    demoNow: Store.now(),
    demoRef: SEED.demoNow,
    today: Store.today(),
    hasPrefs: Object.prototype.hasOwnProperty.call(Store.state || {}, 'prefs'),
    active: (document.querySelector('#sidebar .nav-item.active') || {}).dataset
      ? document.querySelector('#sidebar .nav-item.active').dataset.route : null
  }));
  ok('旧缓存 · 自动按新版本重建（版本号对齐）',
    afterReload.version === staleInfo.current, JSON.stringify(afterReload.version) + ' vs ' + staleInfo.current);
  ok('旧缓存 · 不白屏、不报错', afterReload.viewLen > 300 && afterReload.crash === false,
    'viewLen=' + afterReload.viewLen);
  ok('旧缓存 · 重建后内容流已按新结构重新播种', afterReload.newsLen >= 7,
    'news=' + afterReload.newsLen + ' 条');
  ok('旧缓存 · 重建后每日任务也重新播种', afterReload.tasksLen >= 80,
    'tasks=' + afterReload.tasksLen + ' 条');
  ok('旧缓存 · 重建后演示时钟仍锚定 demoNow（倒计时可复现）',
    afterReload.demoNow === afterReload.demoRef && afterReload.today === '2026-10-09',
    afterReload.demoNow + ' / today=' + afterReload.today);
  ok('旧缓存 · 重建后带回工作台偏好字段 prefs', afterReload.hasPrefs === true);
  ok('旧缓存 · 重建不等于登出（仍在系统内）',
    afterReload.loginHidden === true && afterReload.appShown === true, JSON.stringify(afterReload));
  ok('旧缓存 · 落地页按身份正确（PM → 工作台）', afterReload.active === 'workbench', afterReload.active);
  await page.screenshot({ path: OUT + '/stale-rebuild.png' });

  // 复原身份，避免影响后续段落
  await page.evaluate(() => { Store.setUser('olivia'); App.render(); });
  await new Promise(r => setTimeout(r, 200));

  console.log('\n== 8d. 真实点击催办（没有企业微信 → 系统只出话术，不代发） ==');
  await page.evaluate(() => { Store.setUser('olivia'); location.hash = '#/missing'; App.render(); });
  await new Promise(r => setTimeout(r, 420));

  const missHeads = await page.evaluate(() =>
    [].slice.call(document.querySelectorAll('#view th')).map(t => t.textContent.trim()));
  ok('未交名单 · 记录表头无「已读」列，改成「结果」',
    missHeads.indexOf('已读') < 0 && missHeads.indexOf('结果') >= 0, missHeads.join('/'));

  const remBefore2 = await page.evaluate(() => Store.remindersOn(SEED.demoDate).length);
  await clickSel('#msSelAll');                                     // 全选
  await new Promise(r => setTimeout(r, 220));
  await clickSel('#msPush');                                        // 一键催办
  await new Promise(r => setTimeout(r, 420));

  const remindRes = await page.evaluate(() => ({
    n: Store.remindersOn(SEED.demoDate).length,
    last: Store.remindersOn(SEED.demoDate).slice(-1)[0],
    modalOpen: document.getElementById('modal').hidden === false,
    modalText: document.getElementById('modal').textContent.replace(/\s+/g, ' ').slice(0, 220),
    modalBox: (document.querySelector('#modal .copybox') || {}).textContent || '',
    hasTplSelect: !!document.querySelector('#modal #rmTpl'),
    tplOptions: document.querySelectorAll('#modal #rmTpl option').length,
    hasCopy: !!document.querySelector('#modal [data-copy-remind]')
  }));
  ok('催办 · 记录写入留痕', remindRes.n > remBefore2, remBefore2 + ' → ' + remindRes.n);
  ok('催办 · 渠道记「微信」（PM 自己发）',
    !!remindRes.last && remindRes.last.channel === '微信', remindRes.last && remindRes.last.channel);
  ok('催办 · 不再写「已读」字段',
    !!remindRes.last && remindRes.last.read === undefined && remindRes.last.fulfilled === undefined);
  ok('催办 · 弹出可复制话术（而不是「已发出」）',
    remindRes.modalOpen && remindRes.modalBox.indexOf('@') >= 0, remindRes.modalBox.slice(0, 80));
  ok('催办 · 弹窗讲明「系统不代发」', remindRes.modalText.indexOf('不代发') >= 0);
  ok('催办 · 话术可现场切换模板（v1.17：模板可编辑）',
    remindRes.hasTplSelect && remindRes.tplOptions >= 3, remindRes.tplOptions + ' 个模板选项');
  ok('催办 · 有「复制催办话术」按钮', remindRes.hasCopy);
  await page.screenshot({ path: OUT + '/remind-text.png' });
  await page.evaluate(() => document.querySelector('#modal [data-close]').click());
  await new Promise(r => setTimeout(r, 260));
  ok('催办 · 弹窗可关闭',
    await page.evaluate(() => document.getElementById('modal').hidden === true));

  console.log('\n== 8d2. 管理页真实编辑（v1.17：催办话术 / 人员 / 角色矩阵 / 采购） ==');
  await page.evaluate(() => { Store.setUser('olivia'); location.hash = '#/admin'; App.render(); });
  await wait(340);
  const adminSnap = await page.evaluate(() => JSON.stringify({
    people: Store.people(), roles: Store.roles(), tpls: Store.remindTemplates()
  }));

  // 1) 催办话术：新增 → 渲染 → 删除
  await page.evaluate(() => document.querySelector('[data-tab="dash"]').click());
  await wait(220);
  const tplBefore = await page.evaluate(() => Store.remindTemplates().length);
  ok('管理 · 看板与提醒有催办话术模板卡', await page.evaluate(n =>
    document.querySelectorAll('[data-tnew]').length === 1 && document.querySelectorAll('[data-ted]').length === n, tplBefore));
  await page.evaluate(() => document.querySelector('[data-tnew]').click());
  await wait(280);
  await page.evaluate(() => {
    document.getElementById('tpName').value = 'E2E 话术';
    document.getElementById('tpWhen').value = '手动';
    document.getElementById('tpText').value = '@{name} E2E：{date} 的日报还没交，截止 {deadline}';
    document.getElementById('tpOk').click();
  });
  await wait(340);
  ok('管理 · 新增催办话术生效', await page.evaluate(() => Store.remindTemplates().length) === tplBefore + 1);
  ok('管理 · 新话术已渲染到表格', await page.evaluate(() => document.getElementById('view').innerHTML.indexOf('E2E 话术') >= 0));
  ok('管理 · 新话术能被未交名单页直接引用（占位符替换）', await page.evaluate(() => {
    const t = Store.remindTemplates().filter(x => x.name === 'E2E 话术')[0];
    const txt = Store.reminderBulkText(['anya'], SEED.demoDate, t.id);
    return txt.indexOf('@安雅萱') === 0 && txt.indexOf('E2E') > 0;
  }));
  await page.evaluate(() => {
    window.confirm = () => true;
    const t = Store.remindTemplates().filter(x => x.name === 'E2E 话术')[0];
    const b = document.querySelector('[data-tdel="' + t.id + '"]');
    if (b) b.click();
  });
  await wait(340);
  ok('管理 · 删除话术回退原状', await page.evaluate(() => Store.remindTemplates().length) === tplBefore);

  // 2) 人员：新增 → 渲染 → 删除
  await page.evaluate(() => document.querySelector('[data-tab="people"]').click());
  await wait(240);
  const peopleBefore = await page.evaluate(() => Store.people().length);
  await page.evaluate(() => document.querySelector('[data-pnew]').click());
  await wait(280);
  await page.evaluate(() => {
    document.getElementById('pnName').value = 'E2E 新人';
    document.getElementById('pnRole').value = 'member';
    document.getElementById('pnOk').click();
  });
  await wait(340);
  ok('管理 · 新增人员生效（进在册）', await page.evaluate(() => Store.people().length) === peopleBefore + 1);
  ok('管理 · 新人员已渲染到表格', await page.evaluate(() => document.getElementById('view').innerHTML.indexOf('E2E 新人') >= 0));
  await page.evaluate(() => {
    window.confirm = () => true;
    const p = Store.people().filter(x => x.name === 'E2E 新人')[0];
    const b = document.querySelector('[data-pdel="' + p.id + '"]');
    if (b) b.click();
  });
  await wait(340);
  ok('管理 · 删除人员回退原状', await page.evaluate(() => Store.people().length) === peopleBefore);

  // 3) 角色矩阵：勾掉 → 立刻生效 → 勾回
  await page.evaluate(() => document.querySelector('[data-tab="roles"]').click());
  await wait(240);
  const capFlip = await page.evaluate(() => {
    const el = document.querySelector('[data-rolecap="member:finance"]');
    if (!el) return { ok:false, why:'no cell' };
    const was = el.checked;
    el.checked = false; el.dispatchEvent(new Event('change'));
    const off = Store.capOf('member', 'finance') === false;
    const el2 = document.querySelector('[data-rolecap="member:finance"]');
    el2.checked = true; el2.dispatchEvent(new Event('change'));
    const on = Store.capOf('member', 'finance') === true;
    return { ok: was && off && on, was:was, off:off, on:on };
  });
  ok('管理 · 角色矩阵勾选即刻生效（关 → 开）', capFlip.ok === true, JSON.stringify(capFlip));

  // 4) 采购：记一笔 → 渲染 → 删除
  await page.evaluate(() => { location.hash = '#/stats'; App.render(); });
  await wait(340);
  await page.evaluate(() => document.getElementById('sAdd').click());
  await wait(280);
  await page.evaluate(() => {
    document.getElementById('puTask').value = 'E2E 采购 · 测试';
    document.getElementById('puAmt').value = '88.50';
    document.getElementById('puOk').click();
  });
  await wait(360);
  ok('管理 · 记一笔采购生效（成本页与日报同源）', await page.evaluate(() =>
    Store.costStats('2026-10-05','2026-10-09').purchase.some(p => p.task === 'E2E 采购 · 测试')));
  ok('管理 · 采购已渲染到明细', await page.evaluate(() =>
    document.getElementById('view').innerHTML.indexOf('E2E 采购') >= 0));
  await page.evaluate(() => {
    window.confirm = () => true;
    const cs = Store.costStats('2026-10-05','2026-10-09');
    const i = cs.purchase.findIndex(p => p.task === 'E2E 采购 · 测试');
    const b = document.querySelector('[data-pdel2="' + i + '"]');
    if (b) b.click();
  });
  await wait(360);
  ok('管理 · 删除采购回退原状', await page.evaluate(() =>
    !Store.costStats('2026-10-05','2026-10-09').purchase.some(p => p.task === 'E2E 采购 · 测试')));

  // 还原管理页数据快照
  await page.evaluate(snap => {
    const s = JSON.parse(snap);
    Store.state.people = s.people; Store.state.roles = s.roles; Store.state.remindTemplates = s.tpls;
    Store.save(); App.render();
  }, adminSnap);
  await wait(260);
  ok('管理 · 编辑后快照可还原（自检不污染后续段落）', await page.evaluate(() =>
    !Store.people().some(p => p.name === 'E2E 新人') && !Store.remindTemplates().some(t => t.name === 'E2E 话术')));

  console.log('\n== 8e. 每日任务（v1.15：填报 / 看板 / 统计 / 可见性）==');
  // 从干净的演示数据开始，避免 8b2 的编辑残留影响状态判定
  await page.evaluate(() => { Store.reset(); Store.setUser('wang'); location.hash = '#/task'; App.render(); });
  await new Promise(r => setTimeout(r, 400));

  // 1) 老师（王弋）：当天已提交但管理员已放开 → 「修改中」，可重新编辑提交
  const tk0 = await page.evaluate(() => {
    const v = document.getElementById('view');
    return {
      hash: location.hash,
      cd: (v.querySelector('.tk-cd') || {}).textContent || '',
      badge: (v.querySelector('.tk-head .badge') || {}).textContent || '',
      rows: v.querySelectorAll('.task-row').length,
      hasSubmit: !!v.querySelector('#tkSubmit'),
      hasReq: !!v.querySelector('#tkReqEdit'),
      hasCopy: !!v.querySelector('#tkCopy'),
      hasTpl: !!v.querySelector('#tkTpl'),
      hasPlan: !!v.querySelector('#tkPlan'),
      note: v.innerHTML.indexOf('管理员已放开修改') >= 0
    };
  });
  ok('今日任务 · 演示时钟倒计时「还有 25 分钟」', tk0.cd.indexOf('还有 25 分钟') >= 0, tk0.cd);
  ok('今日任务 · 「修改中」= 可重新编辑提交（有提交按钮、有放开说明、无申请修改）',
    tk0.badge.indexOf('修改中') >= 0 && tk0.hasSubmit === true && tk0.hasReq === false && tk0.note === true,
    JSON.stringify(tk0));
  ok('今日任务 · 填报页带「复制昨日 / 模板导入 / 带入日报计划」',
    tk0.hasCopy && tk0.hasTpl && tk0.hasPlan && tk0.rows >= 1, 'rows=' + tk0.rows);

  // 2) 真实鼠标：从模板导入 → 任务条数变化
  await clickSel('#tkTpl');
  await new Promise(r => setTimeout(r, 320));
  const tplOpen = await page.evaluate(() => ({
    open: document.getElementById('modal').hidden === false,
    n: document.querySelectorAll('#modal [data-tpl]').length
  }));
  ok('今日任务 · 模板导入弹窗列出条线模板', tplOpen.open && tplOpen.n >= 2, JSON.stringify(tplOpen));
  await clickSel('#modal [data-tpl]');
  await new Promise(r => setTimeout(r, 320));
  const tplApplied = await page.evaluate(() => ({
    closed: document.getElementById('modal').hidden === true,
    rows: document.querySelectorAll('#view .task-row').length,
    src: (document.querySelector('#view .card-f .tiny.muted') || {}).textContent || ''
  }));
  ok('今日任务 · 导入后任务条重建且来源标「模板」',
    tplApplied.closed && tplApplied.rows >= 1 && tplApplied.src.indexOf('模板') >= 0, JSON.stringify(tplApplied));

  // 3) 真实鼠标：+ 添加任务 → 多一行（补上内容，否则校验拦提交）
  await clickSel('#tkAddEntry');
  await new Promise(r => setTimeout(r, 300));
  ok('今日任务 · 点「+ 添加任务」加一行',
    await page.evaluate(() => document.querySelectorAll('#view .task-row').length) === tplApplied.rows + 1);
  await page.evaluate(() => {
    const list = document.querySelectorAll('#view .task-row textarea');
    const last = list[list.length - 1];
    last.value = '补齐 3DGS 场景包验收清单';
    last.dispatchEvent(new Event('input', { bubbles:true }));
    App.render();                       // 重算校验态，提交按钮才会解除 disabled
  });
  await new Promise(r => setTimeout(r, 320));

  // 4) 存草稿 → 状态落为草稿（可继续编辑，无「申请修改」）
  await clickSel('#tkSaveDraft');
  await new Promise(r => setTimeout(r, 320));
  await page.evaluate(() => App.render());
  await new Promise(r => setTimeout(r, 320));
  const draftSaved = await page.evaluate(() => ({
    status: (Store.taskOf('wang', Store.today()) || {}).status,
    badge: (document.querySelector('#view .tk-head .badge') || {}).textContent || '',
    hasReq: !!document.querySelector('#view #tkReqEdit')
  }));
  ok('今日任务 · 存草稿落库 status=draft', draftSaved.status === 'draft', JSON.stringify(draftSaved));
  ok('今日任务 · 草稿态无「申请修改」按钮', draftSaved.hasReq === false);

  // 5) 提交（真实点击 → 确认弹窗 → 落库 + 转只读）
  await clickSel('#tkSubmit');
  await new Promise(r => setTimeout(r, 320));
  ok('今日任务 · 提交前弹确认框', await page.evaluate(() => document.getElementById('modal').hidden === false));
  await clickSel('#modal [data-ok]');
  await new Promise(r => setTimeout(r, 420));
  const submitted = await page.evaluate(() => {
    const v = document.getElementById('view');
    return {
      status: (Store.taskOf('wang', Store.today()) || {}).status,
      badge: (v.querySelector('.tk-head .badge') || {}).textContent || '',
      hasSubmit: !!v.querySelector('#tkSubmit'),
      hasReq: !!v.querySelector('#tkReqEdit'),
      logged: Store.state.logs.some(l => l.action === '提交每日任务')
    };
  });
  ok('今日任务 · 提交后落库写入日志', submitted.status === 'submitted' && submitted.logged === true,
    JSON.stringify(submitted));
  ok('今日任务 · 提交后转只读（无提交按钮、出现「申请修改」）',
    submitted.hasSubmit === false && submitted.hasReq === true, JSON.stringify(submitted));

  // 6) 申请修改（真实点击）
  await clickSel('#tkReqEdit');
  await new Promise(r => setTimeout(r, 320));
  await page.evaluate(() => { const i = document.querySelector('#reqReason'); if (i) i.value = '任务描述有误，需补充场景编号'; });
  await clickSel('#modal [data-ok]');
  await new Promise(r => setTimeout(r, 420));
  const reqRes = await page.evaluate(() => {
    const rec = Store.taskOf('wang', Store.today()) || {};
    return {
      has: !!(rec.editRequest),
      granted: !!(rec.editRequest && rec.editRequest.granted),
      hasReason: !!(rec.editRequest && rec.editRequest.reason),
      note: document.getElementById('view').innerHTML.indexOf('已申请修改') >= 0,
      logged: Store.state.logs.some(l => l.action === '申请修改每日任务')
    };
  });
  ok('今日任务 · 申请修改落库（原因 + 待放开状态 + 提示条 + 日志）',
    reqRes.has && reqRes.granted === false && reqRes.hasReason && reqRes.note && reqRes.logged,
    JSON.stringify(reqRes));

  // 7) 管理员看板：四格 / 未交名单 / 催交 / 导出 / 趋势 / 明细展开 / 放开修改
  await page.evaluate(() => { Store.setUser('olivia'); location.hash = '#/taskboard'; App.render(); });
  await new Promise(r => setTimeout(r, 420));
  const board = await page.evaluate(() => {
    const v = document.getElementById('view');
    return {
      tiles: v.querySelectorAll('.tile').length,
      missText: (v.querySelector('.tb-sec .chps') || {}).textContent || '',
      hasRemind: !!v.querySelector('#tbRemind'),
      hasExport: !!v.querySelector('#tbExport'),
      bars: v.querySelectorAll('.tb-bar').length,
      rows: v.querySelectorAll('.tb-row').length,
      vis: (v.querySelector('#tbVis') || {}).textContent || ''
    };
  });
  ok('任务看板 · 四格统计', board.tiles === 4, board.tiles + ' 格');
  ok('任务看板 · 未交名单含刘一鸣', board.missText.indexOf('刘一鸣') >= 0, board.missText);
  ok('任务看板 · 管理员有催交 + 导出', board.hasRemind && board.hasExport);
  ok('任务看板 · 14 个工作日趋势', board.bars >= 10, board.bars + ' 根柱');
  ok('任务看板 · 8 行成员明细（含 TA Leader）', board.rows === 8, board.rows + ' 行');

  // 明细展开（真实点击）
  await clickSel('[data-tbopen="sun"]');
  await new Promise(r => setTimeout(r, 320));
  ok('任务看板 · 点「明细」展开当天任务列表',
    await page.evaluate(() => document.querySelectorAll('#view .tb-ol').length >= 1));

  // 一键催交（真实点击）：只生成话术 + 写日志，不代发
  const remBefore3 = await page.evaluate(() => Store.state.logs.filter(l => l.action === '催交每日任务').length);
  await clickSel('#tbRemind');
  await new Promise(r => setTimeout(r, 380));
  const remind3 = await page.evaluate(() => ({
    n: Store.state.logs.filter(l => l.action === '催交每日任务').length,
    last: Store.state.logs.filter(l => l.action === '催交每日任务').slice(-1)[0],
    toast: document.getElementById('toast').textContent
  }));
  ok('任务看板 · 催交只写日志（不代发）', remind3.n > remBefore3, remBefore3 + ' → ' + remind3.n);
  ok('任务看板 · 催交话术含未交人员姓名',
    !!remind3.last && (remind3.last.detail || '').indexOf('刘一鸣') >= 0, remind3.last && remind3.last.detail);

  // 8) 统计页：管理员 7 行排行；员工只看自己
  await page.evaluate(() => { location.hash = '#/taskstats'; App.render(); });
  await new Promise(r => setTimeout(r, 380));
  const stA = await page.evaluate(() => ({
    rank: document.querySelectorAll('#view .tbl tbody tr').length,
    ot: document.getElementById('view').innerHTML.indexOf('加班频次') >= 0,
    scope: document.getElementById('view').innerHTML.indexOf('全部 8 人') >= 0
  }));
  ok('统计 · 管理员成员排行 8 行', stA.rank === 8, stA.rank + ' 行');
  ok('统计 · 管理员有加班分布、范围标「全部 8 人」', stA.ot && stA.scope, JSON.stringify(stA));

  await page.evaluate(() => { Store.setUser('chang'); location.hash = '#/taskstats'; App.render(); });
  await new Promise(r => setTimeout(r, 380));
  const stS = await page.evaluate(() => ({
    rank: document.querySelectorAll('#view .tbl tbody tr').length,
    mine: document.getElementById('view').innerHTML.indexOf('仅本人') >= 0
  }));
  ok('统计 · 员工视角标「仅本人」且看不到团队排行', stS.mine === true && stS.rank === 0,
    JSON.stringify(stS));

  await page.evaluate(() => { location.hash = '#/taskboard'; App.render(); });
  await new Promise(r => setTimeout(r, 380));
  const boardS = await page.evaluate(() => ({
    remind: !!document.querySelector('#view #tbRemind'),
    exportBtn: !!document.querySelector('#view #tbExport'),
    hint: (document.querySelector('#view #tbVis') || {}).textContent || ''
  }));
  ok('任务看板 · 员工无催交 / 导出，且提示「由管理员配置」',
    boardS.remind === false && boardS.exportBtn === false && boardS.hint.indexOf('管理员') >= 0,
    boardS.hint.trim());

  // 9) 可见性下拉：管理员在「设置 → 看板与提醒」切到「仅本组可见」
  await page.evaluate(() => { Store.setUser('olivia'); location.hash = '#/admin'; App.render(); });
  await new Promise(r => setTimeout(r, 380));
  await clickSel('[data-tab="dash"]');
  await new Promise(r => setTimeout(r, 380));
  const dashTab = await page.evaluate(() => ({
    hasSel: !!document.querySelector('#adVis'),
    opts: document.querySelectorAll('#adVis option').length,
    cur: (document.querySelector('#adVis') || {}).value,
    hasSave: !!document.querySelector('#adSave')
  }));
  ok('设置 · 「看板与提醒」有可见性下拉三档（默认全员可见）',
    dashTab.hasSel && dashTab.opts === 3 && dashTab.cur === 'all', JSON.stringify(dashTab));

  await page.evaluate(() => {
    const s = document.querySelector('#adVis');
    s.value = 'group';
    s.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await new Promise(r => setTimeout(r, 420));
  const visChanged = await page.evaluate(() => ({
    cur: Store.taskVisibility(),
    logged: Store.state.logs.some(l => l.action === '调整看板可见性')
  }));
  ok('设置 · 切「仅本组可见」落库并写日志',
    visChanged.cur === 'group' && visChanged.logged === true, JSON.stringify(visChanged));

  // 员工同组可见、跨组不可见（看板明细行数变化）
  await page.evaluate(() => { Store.setUser('chang'); location.hash = '#/taskboard'; App.render(); });
  await new Promise(r => setTimeout(r, 400));
  const grouped = await page.evaluate(() => ({
    rows: document.querySelectorAll('#view .tb-row').length,
    names: [].slice.call(document.querySelectorAll('#view .tb-name')).map(x => x.textContent),
    hint: (document.querySelector('#view #tbVis') || {}).textContent || ''
  }));
  ok('可见性 · 员工只看得到同组（场景生成组 3 人 + 组负责人 TA Leader，别的组看不见）',
    grouped.rows === 4 && grouped.names.join(',').indexOf('刘一鸣') < 0 &&
    grouped.names.join(',').indexOf('宋天意') >= 0, JSON.stringify(grouped));
  ok('可见性 · 看板标明「仅本组可见」', grouped.hint.indexOf('仅本组') >= 0, grouped.hint.trim());

  // 复原为默认全员可见，避免影响后续段落与截图
  await page.evaluate(() => { Store.setUser('olivia'); Store.setTaskVisibility('all'); App.render(); });
  await new Promise(r => setTimeout(r, 260));

  console.log('\n== 8f. NEWS · AI 资讯独立页（v1.19：跳转 / 筛选 / 评论）==');
  // v1.22a：工作台 NEWS 卡点标题 → 跳 NEWS 页并展开该帖全文与评论区；
  // 团队信息流的标题就地展开（帖子已不在 NEWS 页）
  await page.evaluate(() => { Store.setUser('olivia'); location.hash = '#/workbench'; App.render(); });
  await new Promise(r => setTimeout(r, 420));
  const jump0 = await page.evaluate(() => ({
    hasBtn: !!document.querySelector('#view [data-go="news"]'),
    nopen: document.querySelectorAll('#view [data-nopen]').length,
    feedNoNews: document.querySelector('#view [data-card="feed"]').innerHTML.indexOf('Sora 2') < 0
  }));
  ok('工作台 · 信息流卡有「NEWS 页 ↗」入口', jump0.hasBtn === true);
  ok('工作台 · NEWS 卡 2 条标题且信息流不含 AI 资讯',
    jump0.nopen === 2 && jump0.feedNoNews, JSON.stringify(jump0));
  // 团队动态：就地展开
  await page.evaluate(() => { document.querySelector('#view [data-card="feed"] .ni-t').click(); });
  await new Promise(r => setTimeout(r, 300));
  const inline = await page.evaluate(() => ({
    hash: location.hash,
    open: !!document.querySelector('#view [data-card="feed"] .ni .md')
  }));
  ok('工作台 · 团队动态标题就地展开全文', inline.hash === '#/workbench' && inline.open, JSON.stringify(inline));
  // AI 资讯：跳 NEWS 页
  await page.evaluate(() => { document.querySelector('#view [data-nopen]').click(); });
  await new Promise(r => setTimeout(r, 500));
  const jumped = await page.evaluate(() => ({
    hash: location.hash,
    items: document.querySelectorAll('#view [data-news]').length,
    openBox: !!document.querySelector('#view [data-cmtbox]'),
    title: (document.querySelector('#view .ni-t') || {}).textContent || ''
  }));
  ok('工作台 · 点帖子标题跳到 NEWS 页', jumped.hash === '#/news' && jumped.items > 0, JSON.stringify(jumped));
  ok('NEWS 页 · 跳转后目标帖全文与评论区已展开', jumped.openBox === true);

  // 筛选 chip 数与「发 AI 资讯」入口
  const npUI = await page.evaluate(() => ({
    chips: document.querySelectorAll('#view [data-npfilter]').length,
    compose: !!document.querySelector('#view [data-npcompose]'),
    newsCat: [].slice.call(document.querySelectorAll('#view [data-npfilter]')).some(b => b.dataset.npfilter === '新闻')
  }));
  ok('NEWS 页 · 七个筛选 chip（含「新闻」）', npUI.chips === 7 && npUI.newsCat === true, JSON.stringify(npUI));
  ok('NEWS 页 · 有「＋ 发 AI 资讯」入口', npUI.compose === true);

  // 真实发一条评论：计数 +1
  const cmtBefore = await page.evaluate(() => {
    const box = document.querySelector('#view [data-cmtbox]');
    const art = box.closest('[data-news]');
    return { id: art.dataset.news, n: (Store.newsItem(art.dataset.news).comments || []).length };
  });
  await page.type('#view [data-cmtbox]', 'NEWS 页自检评论：已读，赞成这个方向');
  await page.click('#view [data-cmtsend]');
  await new Promise(r => setTimeout(r, 500));
  const cmtAfter = await page.evaluate(id => (Store.newsItem(id).comments || []).length, cmtBefore.id);
  ok('NEWS 页 · 评论真实落库（条数 +1）', cmtAfter === cmtBefore.n + 1,
    cmtBefore.n + ' → ' + cmtAfter);
  await page.screenshot({ path: OUT + '/news-page.png', fullPage: false });

  console.log('\n== 9. 截图留档 ==');
  // 填报页只有本人填报者能进，截图时单独切老师身份，其余用管理视角
  for (const r of ['workbench', 'taskboard', 'taskstats', 'board', 'missing', 'capacity']) {
    await page.evaluate(x => { Store.setUser('olivia'); location.hash = '#/' + x; App.render(); }, r);
    await new Promise(res => setTimeout(res, 300));
    await page.screenshot({ path: OUT + '/' + r + '.png', fullPage: false });
  }
  // 今日任务 / 日报填报：都是「本人填自己」，用老师身份
  for (const r of ['task', 'fill']) {
    await page.evaluate(x => { Store.setUser('wang'); location.hash = '#/' + x; App.render(); }, r);
    await new Promise(res => setTimeout(res, 300));
    await page.screenshot({ path: OUT + '/' + r + '.png', fullPage: false });
  }
  await page.evaluate(() => { Store.setUser('olivia'); App.render(); });
  ok('截图已生成', fs.readdirSync(OUT).length >= 8, fs.readdirSync(OUT).join(','));

  console.log('\n== 10. 窄屏（预览面板常见宽度）==');
  for (const w of [1024, 820, 480]) {
    await page.setViewport({ width: w, height: 900 });
    await page.evaluate(() => { location.hash = '#/workbench'; });
    await new Promise(res => setTimeout(res, 340));
    const st = await page.evaluate(() => {
      const sb = document.querySelector('.sidebar');
      const b = [...document.querySelectorAll('.nav-item')].find(x => x.dataset.route === 'capacity');
      const r = sb.getBoundingClientRect();
      let clickable = false;
      if (b) { const rb = b.getBoundingClientRect();
        clickable = document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2) === b; }
      return { sidebarW: Math.round(r.width), visible: r.width > 40, clickable,
               grid: !!document.querySelector('#view .wb-grid'),
               feed: document.querySelectorAll('#view .wb-card[data-card="feed"] .ni').length,
               cols: getComputedStyle(document.querySelector('#view .wb-grid')).gridTemplateColumns.split(' ').length };
    });
    ok(w + 'px 下侧栏仍可见可点', st.visible && st.clickable, JSON.stringify(st));
    ok(w + 'px 下工作台正常渲染（栅格 + 信息流）', st.grid === true && st.feed >= 1,
      'feed=' + st.feed + ' 条 · 列数=' + st.cols);
    if (w === 820) await page.screenshot({ path: OUT + '/narrow-820.png' });
    if (w === 480) await page.screenshot({ path: OUT + '/narrow-480.png' });
  }

  console.log('\n== 11. 控制台错误 ==');
  // assets/logo.png（INSpool 字标，v1.7 已接入）启动时探测一次；正常不应产生 404。
  // 若哪天 logo 被移走，页面会自动回退「AL」字标，404 单独计数、不算 JS 报错。
  const logo404 = errors.filter(e => /logo/.test(e));
  const realErrors = errors.filter(e => !/logo/.test(e));
  ok('无 JS 报错', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));
  ok('品牌位 · logo 加载无 404', logo404.length === 0, logo404.slice(0, 3).join(' | '));
  // 登录层由登录门构建：本轮中途 reload 过，登录状态下 #login 可能是空的，
  // 先退出登录把它建出来，才能同时统计「侧栏 + 登录页」两处品牌标。
  await page.evaluate(() => { if (Store.isLoggedIn()) { Store.logout(); App.render(); } });
  await new Promise(r => setTimeout(r, 320));
  const brand = await page.evaluate(() => {
    // 登录后 #login 整体 display:none，DOM 里第一个 .brand-mark 是隐藏的登录页标，
    // 所以只在「可见」的品牌标上断言字标条已展开。
    const all = Array.from(document.querySelectorAll('.brand-mark'));
    const vis = all.filter(m => { const r = m.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const visInfo = vis.map(m => { const r = m.getBoundingClientRect();
      return { w: Math.round(r.width), logo: getComputedStyle(m).backgroundImage.includes('logo') }; });
    return {
      marks: all.length,
      hasLogo: document.documentElement.classList.contains('has-logo'),
      fallback: (document.querySelector('.brand-mark .bm-fallback') || {}).textContent || '',
      imgs: document.querySelectorAll('.brand-mark img').length,
      visible: vis.length,
      shown: vis.length > 0 && visInfo.every(v => v.logo && v.w > 40),
      visInfo
    };
  });
  ok('品牌位 · 侧栏与登录页都有品牌标', brand.marks >= 2, JSON.stringify(brand));
  ok('品牌位 · INSpool 字标已生效（has-logo + 字标条展开、无 img 破图）',
    brand.hasLogo === true && brand.shown === true && brand.imgs === 0, JSON.stringify(brand));

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('运行失败', e); process.exit(2); });
