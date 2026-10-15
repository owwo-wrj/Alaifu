/* ============================================================
   阿莱夫日报系统 · 数据层
   单一事实源：所有派生口径（提交率 / 准时率 / 产能 / 成本与支出）
   都必须经由此文件计算，页面不得自行计算
   ============================================================ */
window.Store = (function () {

  const KEY = 'alef-daily-v1';
  let state = null;

  /* ---------------- 日期工具 ---------------- */
  const pad = n => (n < 10 ? '0' + n : '' + n);

  function D(s) { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function S(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(s, n) { const d = D(s); d.setDate(d.getDate() + n); return S(d); }
  function weekday(s) { return D(s).getDay(); }              // 0=周日
  const WD = ['周日','周一','周二','周三','周四','周五','周六'];
  function weekdayCN(s) { return WD[weekday(s)]; }
  function fmtCN(s) { const d = D(s); return (d.getMonth() + 1) + '月' + pad(d.getDate()) + '日 ' + weekdayCN(s); }
  function fmtShort(s) { const d = D(s); return (d.getMonth() + 1) + '/' + pad(d.getDate()); }
  function timeOf(iso) { return iso ? iso.slice(11, 16) : null; }
  function fmtAt(iso) { return iso ? iso.slice(0, 10) + ' ' + iso.slice(11, 16) : '—'; }

  function weekStart(s) {
    const w = weekday(s);
    // v1.23：一周 = 周二 → 下周一（周二周会后开启新一周任务）
    const off = (w >= 2 ? 2 - w : w - 5);
    return addDays(s, off);
  }

  /* ---------------- 工作日 ---------------- */
  function isWorkday(s) {
    const c = state.calendar;
    if (state.config.workdayMode === 'everyday') return true;
    if ((c.extraWorkdays || []).indexOf(s) >= 0) return true;
    if ((c.holidays || []).indexOf(s) >= 0) return false;
    return c.workdays.indexOf(weekday(s)) >= 0;
  }
  function prevWorkday(s) { let x = addDays(s, -1); let g = 0; while (!isWorkday(x) && g++ < 40) x = addDays(x, -1); return x; }
  function nextWorkday(s) { let x = addDays(s, 1); let g = 0; while (!isWorkday(x) && g++ < 40) x = addDays(x, 1); return x; }
  function workdaysInRange(from, to) {
    const out = []; let x = from; let g = 0;
    while (x <= to && g++ < 400) { if (isWorkday(x)) out.push(x); x = addDays(x, 1); }
    return out;
  }

  /* ---------------- 持久化 ---------------- */
  function fresh() {
    const s = JSON.parse(JSON.stringify(window.SEED));
    s.users = { current:'olivia' };
    s.session = { loggedIn:false };          // 登录会话不进 SEED，运行时态
    return s;
  }
  /* 缓存版本守卫：本地缓存与当前种子结构不匹配时，直接丢弃重建。
     页面上任何「整片空白」几乎都是旧缓存撑不起新字段造成的 ——
     与其在渲染层到处兜底，不如在入口处一刀切干净。
     stale 标记供启动时提示一次「已按最新版本重建」。 */
  let rebuilt = false;
  function seedVersion() { return window.SEED.schemaVersion || 0; }

  function load() {
    let carry = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if ((Number(parsed && parsed.schemaVersion) || 0) === seedVersion()) {
          state = parsed;
          // 同版本内的局部补齐：个别字段缺失（早期演示数据）时从 SEED 补，避免白屏
          if (!state.session) state.session = { loggedIn:false };
          if (!state.kb) state.kb = JSON.parse(JSON.stringify(window.SEED.kb || { spaces:[], nodes:[] }));
          if (!state.roles) state.roles = JSON.parse(JSON.stringify(window.SEED.roles || []));
          if (!state.groups) state.groups = JSON.parse(JSON.stringify(window.SEED.groups || []));
          if (!state.weekReports) state.weekReports = JSON.parse(JSON.stringify(window.SEED.weekReports || []));
          if (!state.weekPlans) state.weekPlans = JSON.parse(JSON.stringify(window.SEED.weekPlans || []));
          if (!state.news) state.news = JSON.parse(JSON.stringify(window.SEED.news || []));
          if (!state.prefs) state.prefs = JSON.parse(JSON.stringify(window.SEED.prefs || { dash:{ order:null, collapsed:[], hidden:[] } }));
          if (!state.tasks) state.tasks = JSON.parse(JSON.stringify(window.SEED.tasks || []));
          if (!state.priorities || !state.priorities.length) state.priorities = JSON.parse(JSON.stringify(window.SEED.priorities || []));
          if (!state.newsCats || !state.newsCats.length) state.newsCats = (window.SEED.newsCats || []).slice();
          if (!state.runtime) state.runtime = {};
          return;
        }
        // 版本不一致 → 下面重建；先留住登录态，重建不等于登出
        carry = { session: parsed && parsed.session, current: parsed && parsed.users && parsed.users.current };
        rebuilt = true;
      }
    } catch (e) { rebuilt = true; }
    state = fresh();
    if (carry) {
      if (carry.session) state.session = carry.session;
      if (carry.current) state.users.current = carry.current;
    }
    save();
  }
  const didRebuild = () => rebuilt;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('保存失败', e); }
  }
  function reset() {
    // 恢复演示数据 ≠ 登出：保留当前会话与身份，避免重置后被迫回到登录页
    const session = state && state.session;
    const cur = state && state.users ? state.users.current : null;
    state = fresh();
    if (session) state.session = session;
    if (cur) state.users.current = cur;
    save();
  }

  /* ---------------- 基础查询 ---------------- */
  const people = () => state.people;
  const person = id => state.people.find(p => p.id === id);

  /* 角色与权限：唯一来源是 SEED.roles，页面不得自行判断角色字符串 */
  const roles = () => (state.roles || window.SEED.roles || []);
  const roleDef = id => roles().find(r => r.id === id) || { id:id, name:id, level:1, admin:false, submitDaily:false, scopes:[] };
  const roleName = id => roleDef(id).name;
  const ADMIN = () => roles().filter(r => r.admin).map(r => r.id);          // 最高权限角色
  const SUBMIT_ROLES = () => roles().filter(r => r.submitDaily).map(r => r.id);

  // 应提交日报的人 = 内部 + 角色按要求交日报 + 在册 + 未挂起
  // （老板 / PM 不交日报，不进提交率分母、不进未交名单、不被催办；
  //   v1.17 起 TA Leader **照常交**，与 TA / 美术 / 实习生同一套页面、同一份名单；
  //   个人可用 dailySubmit:false 覆盖角色默认值，如宏枢老师由刘一鸣代表提交）
  function submitters() {
    const ok = SUBMIT_ROLES();
    return state.people.filter(p => p.type === 'internal' && ok.indexOf(p.role) >= 0
      && p.active && !p.pending && p.dailySubmit !== false);
  }
  const members = submitters;                       // 语义别名：进提交率分母的人
  function pendingPeople() { return state.people.filter(p => p.pending); }
  function clientPeople() { return state.people.filter(p => p.type === 'client'); }
  const groups = () => state.groups || [];
  const groupOf = id => groups().find(g => g.id === id) || null;
  const pipelines = () => state.pipelines;
  const pipeline = id => state.pipelines.find(p => p.id === id) || { id:'other', name:'其他', short:'其他', metrics:[] };
  const projects = () => state.projects;
  const currentUser = () => person(state.users.current) || person('olivia');
  function setUser(id) { state.users.current = id; save(); }

  /* ---------------- 登录会话 ----------------
     网站**只对内部开放**：客户侧参与人没有账号，不进登录逻辑。
     三条登录路径（手机验证码 / 账号密码 / 微信扫码）都归到 finishLogin()，
     「登录成功」的副作用只有这一份。演示环境验证码固定、密码任意 4 位。 */
  function isLoggedIn() { return !!(state.session && state.session.loggedIn); }

  /* 登录成功统一出口：切当前身份 + 置会话 + 记日志 */
  function finishLogin(p, how) {
    state.users.current = p.id;
    state.session.loggedIn = true;
    state.session.at = new Date().toISOString();
    save();
    addLog(p.name, '登录系统', (how || '登录') + ' · ' + roleDef(p.role).name);
    return { ok:true, person:p };
  }

  function login(personId, password) {
    const p = person(personId);
    // 文案不暴露账号是否存在：不存在 / 客户侧 / 密码错，对外都是一句「账号或密码错误」
    if (!p) return { ok:false, field:'account', msg:'账号或密码错误' };
    if (p.type === 'client') return { ok:false, field:'account', msg:'该账号未开通 —— 本系统仅对内部开放' };
    if (!(password || '').trim()) return { ok:false, field:'pass', msg:'请输入密码' };
    if ((password || '').trim().length < 4) return { ok:false, field:'pass', msg:'密码至少 4 位（演示环境任意 4 位即可）' };
    return finishLogin(p, '账号密码登录');
  }
  function logout() {
    state.session.loggedIn = false;
    save();
  }

  /* ---------------- 登录 · 手机验证码 / 微信（原型模拟） ----------------
     静态原型没有短信网关，也没有接微信开放平台：
       · 验证码固定为 SEED.demoSmsCode（页面会把演示码显示出来）
       · 微信二维码是本地绘制的占位图，「模拟扫码」把状态流转演示完整
     真接后端时只换这三个函数，登录页不用动。 */
  const normalizePhone = s => String(s == null ? '' : s).replace(/[\s\-()（）]/g, '');
  const isPhone = s => /^1[3-9]\d{9}$/.test(normalizePhone(s));
  const personByPhone = phone => {
    const n = normalizePhone(phone);
    return n ? (people().find(p => normalizePhone(p.phone) === n) || null) : null;
  };
  /* 展示用脱敏：138****0003 */
  const maskPhone = phone => {
    const n = normalizePhone(phone);
    return isPhone(n) ? n.slice(0, 3) + '****' + n.slice(7) : n;
  };
  const demoSmsCode = () => String(window.SEED.demoSmsCode || '8888');

  function sendCode(phone) {
    if (!isPhone(phone)) return { ok:false, field:'phone', msg:'请输入 11 位手机号' };
    // 不暴露「这个号有没有账号」：格式正确就一律当已发送
    const minutes = window.SEED.demoSmsMinutes || 5;
    return {
      ok:true, phone:normalizePhone(phone), minutes:minutes, code:demoSmsCode(),
      msg:'验证码已发送至 ' + maskPhone(phone) + '，' + minutes + ' 分钟内有效'
    };
  }

  function loginByPhone(phone, code) {
    if (!isPhone(phone)) return { ok:false, field:'phone', msg:'请输入 11 位手机号' };
    if (!String(code == null ? '' : code).trim()) return { ok:false, field:'code', msg:'请输入验证码' };
    if (String(code).trim() !== demoSmsCode()) return { ok:false, field:'code', msg:'验证码错误' };
    const p = personByPhone(phone);
    // 号码没开通 / 库里没这个人：只回「验证码错误」，与前一条不可区分
    if (!p || p.type === 'client') return { ok:false, field:'code', msg:'验证码错误' };
    return finishLogin(p, '手机验证码登录');
  }

  /* 微信扫码：没有真实微信开放平台，页面只调这个把状态走完 */
  function loginByWechat(personId) {
    const p = person(personId) || person('olivia');
    if (!p || p.type === 'client') return { ok:false, msg:'该身份不支持扫码登录' };
    return finishLogin(p, '微信扫码登录（原型模拟）');
  }

  /* ---------------- 注册（v1.22） ----------------
     系统**不预置管理员账号**：第一个注册的账号自动成为「管理员」（role=admin），
     之后的注册一律进入「待分配」（role=pending，只能看到工作台），
     由管理员在「管理 → 人员」里分配正式角色；页面可见范围随后展开。
     演示环境验证码仍走固定演示码；真接后端只换短信下发这一处。 */
  function registerByPhone(phone, code, name) {
    if (!isPhone(phone)) return { ok:false, field:'phone', msg:'请输入 11 位手机号' };
    if (!String(code == null ? '' : code).trim()) return { ok:false, field:'code', msg:'请输入验证码' };
    if (String(code).trim() !== demoSmsCode()) return { ok:false, field:'code', msg:'验证码错误' };
    const nm = String(name == null ? '' : name).trim();
    if (!nm) return { ok:false, field:'name', msg:'请填写姓名' };
    if (nm.length > 12) return { ok:false, field:'name', msg:'姓名请控制在 12 个字以内' };
    if (personByPhone(phone)) return { ok:false, field:'phone', msg:'该手机号已注册，请直接登录' };
    // 第一个注册者 = 管理员；之后 = 待分配（库里还没有 admin 角色的人就算「第一个」）
    const first = !state.people.some(p => p.role === 'admin');
    const role = first ? 'admin' : 'pending';
    const p = { id:newPersonId(), name:nm, en:'', type:'internal', role:role, group:null,
      title:roleDef(role).name, mainPipe:null, unitPrice:0, active:true,
      phone:normalizePhone(phone) };
    state.people.push(p);
    syncGroups(); save();
    addLog(nm, '注册账号', first ? '第一个注册 · 自动成为管理员' : '待分配 · 等待管理员派角色');
    return finishLogin(p, '注册并登录');
  }

  /* 登录页「演示身份」快捷填入：内部 + 有手机号的人 */
  const loginPicks = () => (window.SEED.demoLoginPicks || [])
    .map(person).filter(p => p && p.type === 'internal' && p.phone)
    .map(p => ({ id:p.id, name:p.name, en:p.en || '', role:roleDef(p.role).name,
                 admin:!!roleDef(p.role).admin, phone:normalizePhone(p.phone) }));

  /* 能力判定：页面一律问 Store.can(...)，不要写死角色名。
     v1.17 起：**编辑类能力全部走 roles[].caps** —— 每一项都能在
     「设置 → 角色与权限」里按角色勾选（人员 / 角色 / 下拉项 / 话术 / 资金都算）。
     老缓存没有 caps 时回退到「只有最高权限能做」，不会把权限意外放大。 */
  const CAPS = [
    { key:'remind',     t:'未交名单 / 催办',    d:'看谁没交、生成催办话术并留痕' },
    { key:'config',     t:'口径配置',          d:'截止时间 / 提醒节点 / 工作日历 / 生效口径' },
    { key:'person',     t:'人员管理',          d:'新增 / 编辑 / 停用 / 删除成员，改角色' },
    { key:'role',       t:'角色与权限',        d:'增删角色、按角色勾选能力' },
    { key:'enums',      t:'下拉项管理',        d:'关联管线 / 优先级 / 内容流分类' },
    { key:'clientData', t:'客户侧数据代录',    d:'坤 / Tim 回传的数据由谁录入' },
    { key:'editOthers', t:'代填 / 改他人日报',  d:'替别人写日报，或改他人已提交的日报' },
    { key:'kbManage',   t:'知识库空间管理',    d:'新建空间 / 目录，管理全部文档' },
    { key:'finance',    t:'资金与采购',        d:'记一笔采购，改金额与说明' }
  ];
  const caps = () => CAPS;
  function capOf(roleId, key) {
    const d = roleDef(roleId);
    const c = d.caps || {};
    return typeof c[key] === 'boolean' ? c[key] : !!d.admin;
  }
  function myCap(key) { const u = currentUser(); return u.type !== 'client' && capOf(u.role, key); }

  function can(cap) {
    const u = currentUser();
    const d = roleDef(u.role);
    if (u.type === 'client') return false;
    switch (cap) {
      case 'admin':        return !!d.admin;          // 最高权限：老板 / PM / TA Leader
      case 'remind':       return myCap('remind');    // 未交名单与催办
      case 'manageConfig': return myCap('config');    // 口径配置 / 日历
      case 'clientData':   return myCap('clientData');// 客户侧数据代录
      case 'editOthers':   return myCap('editOthers');// 代填 / 改他人日报
      case 'kbManage':     return myCap('kbManage');  // 知识库空间管理
      case 'personManage': return myCap('person');    // 人员增删改
      case 'roleManage':   return myCap('role');      // 角色与权限
      case 'enumsManage':  return myCap('enums');     // 下拉项
      case 'finance':      return myCap('finance');   // 资金 / 采购
      case 'submit':       return SUBMIT_ROLES().indexOf(u.role) >= 0 && u.type === 'internal';
      case 'viewAll':      return true;               // 看板 / 知识库：内部成员都可看
      case 'newsPost':     return !!(d.news && d.news.post);       // 发内容（分类另判，见 myCats）
      case 'newsAnnounce': return !!(d.news && d.news.announce);   // 发「公告」：仅管理层
      case 'newsPin':      return !!(d.news && d.news.pin);        // 置顶：仅管理层
      case 'newsReview':   return !!(d.news && d.news.review);     // 审核实习生内容
      case 'taskSubmit':   return !!d.taskSubmit && u.type === 'internal';  // 交每日任务（本人）
      case 'taskManage':   return !!d.taskManage;                  // 看全员任务 / 催交 / 导出 / 放开修改
      case 'taskConfig':   return !!d.taskManage || myCap('config');// 截止时间 / 提醒节点 / 可见性
      default:             return false;
    }
  }
  const isPrivileged = () => can('admin');
  const isAdminRole = roleId => ADMIN().indexOf(roleId) >= 0;

  /* ---------------- 日报 ---------------- */
  function getReport(personId, date) {
    return state.reports.find(r => r.personId === personId && r.date === date) || null;
  }
  function reportsOn(date) { return state.reports.filter(r => r.date === date); }
  function reportsInRange(from, to) {
    return state.reports.filter(r => r.date >= from && r.date <= to)
      .sort((a, b) => a.date === b.date ? a.personId.localeCompare(b.personId) : a.date.localeCompare(b.date));
  }
  // 统计口径：只认已提交的日报，草稿一律不计入
  function submittedIn(from, to) { return reportsInRange(from, to).filter(r => r.status === 'submitted'); }
  function upsertReport(rep) {
    const i = state.reports.findIndex(r => r.id === rep.id);
    if (i >= 0) state.reports[i] = rep; else state.reports.push(rep);
    save();
  }
  function removeReport(id) {
    state.reports = state.reports.filter(r => r.id !== id);
    save();
  }
  function newId(prefix) { return prefix + Math.random().toString(36).slice(2, 8); }

  /* ---------------- 提交口径（唯一实现） ---------------- */
  function submission(date) {
    const exp = members();
    const rep = id => getReport(id, date);
    const submitted = exp.filter(p => { const r = rep(p.id); return r && r.status === 'submitted'; });
    const dl = state.config.deadline;
    const onTime = submitted.filter(p => timeOf(rep(p.id).submittedAt) && timeOf(rep(p.id).submittedAt) <= dl);
    const late = submitted.filter(p => !(timeOf(rep(p.id).submittedAt) && timeOf(rep(p.id).submittedAt) <= dl));
    const missing = exp.filter(p => { const r = rep(p.id); return !r || r.status !== 'submitted'; });
    const drafts = missing.filter(p => { const r = rep(p.id); return r && r.status === 'draft'; });
    const n = exp.length;
    return {
      date: date, workday: isWorkday(date), expected: exp, expectedN: n,
      submitted: submitted, submittedN: submitted.length,
      onTime: onTime, onTimeN: onTime.length,
      late: late, lateN: late.length,
      missing: missing, missingN: missing.length,
      drafts: drafts, draftsN: drafts.length,
      rate: n ? submitted.length / n : null,
      onTimeRate: n ? onTime.length / n : null
    };
  }

  function weekSubmission(weekMon) {
    const days = workdaysInRange(weekMon, addDays(weekMon, 6)).filter(d => d <= today());
    const exp = members();
    return {
      days: days,
      rows: exp.map(p => {
        const cells = days.map(d => {
          const r = getReport(p.id, d);
          if (!r || r.status !== 'submitted') return { date:d, state: (r && r.status === 'draft') ? 'draft' : 'missing' };
          const t = timeOf(r.submittedAt);
          return { date:d, state: (t && t <= state.config.deadline) ? 'ontime' : 'late' };
        });
        const ok = cells.filter(c => c.state === 'ontime' || c.state === 'late').length;
        return { person:p, cells:cells, submitted:ok, expected:days.length };
      }),
      totalExpected: exp.length * days.length,
      totalSubmitted: exp.reduce((a, p) => a + days.filter(d => { const r = getReport(p.id, d); return r && r.status === 'submitted'; }).length, 0)
    };
  }

  /* ---------------- v1.21 周五任务汇总 ----------------
     PM 收拢材料用：按人整理本周「周二 → 周五」的日报内容。
     只认已提交（submitted）的日报；草稿标 draft、没交标 null，
     页面上如实显示「（未提交）」，不虚构内容。 */
  function weekDigest(weekMon) {
    const mon = weekStart(weekMon || window.SEED.demoDate);   // 归一到周二锚点
    const days = [0, 1, 2, 3].map(n => addDays(mon, n));   // 周二..周五（周锚点=周二）
    const rows = submitters().map(p => ({
      person: p,
      days: days.map(d => {
        const r = getReport(p.id, d);
        return { date: d, report: (r && r.status === 'submitted') ? r : null,
                 draft: !!r && r.status === 'draft' };
      })
    }));
    return { week: mon, from: days[0], to: days[3], days: days, rows: rows };
  }

  /* ---------------- 周期列表 ----------------
     周报的周期下拉用它。v1.14 起「本周节奏」页与节奏节点数据一起下线，
     这里不再读 state.nodes，改为从周报与日报数据派生：有数据才有周期，
     不会出现「可选但空」的周期。 */
  function allWeeks() {
    const set = new Set();
    (state.weekReports || []).forEach(r => { if (r.week) set.add(r.week); });
    (state.weekPlans || []).forEach(p => { if (p.week) set.add(p.week); });
    (state.reports || []).forEach(r => { if (r.date) set.add(weekStart(r.date)); });
    return Array.from(set).sort();
  }

  /* ---------------- 产能链路 ---------------- */
  const sum = (arr, f) => arr.reduce((a, e) => a + (Number(f(e)) || 0), 0);

  function entriesIn(from, to) {
    const out = [];
    submittedIn(from, to).forEach(r => (r.entries || []).forEach(e => out.push({ e:e, r:r })));
    return out;
  }

  function capacityWeek(from, to) {
    const es = entriesIn(from, to).map(x => x.e);
    const by = id => es.filter(e => e.pipeline === id);
    const g = (list, k) => sum(list, e => (e.metrics || {})[k]);

    const d3 = by('3dgs'), ai = by('scene'), as = by('asset'), rd = by('render');

    const d3Collected = g(d3,'collected'), d3Rebuilt = g(d3,'rebuilt'), d3Fail = g(d3,'rebuiltFail');
    const aiAtt = g(ai,'attempted'), aiGen = g(ai,'generated');
    const asBuy = g(as,'purchased'), asAmt = g(as,'amountFen');
    const rdDone = g(rd,'rendered'), rdFail = g(rd,'renderFail'), rdPass = g(rd,'qcPass');

    const latestClient = state.clientData[state.clientData.length - 1] || {};

    return {
      range:{ from:from, to:to },
      internal:[
        { id:'3dgs', name:'3DGS 采集与重建', rows:[
          { label:'采集场景', value:d3Collected, unit:'个' },
          { label:'重建完成', value:d3Rebuilt, unit:'个' },
          { label:'重建失败', value:d3Fail, unit:'个', warn:true }
        ]},
        { id:'scene', name:'场景生成', rows:[
          { label:'尝试生成', value:aiAtt, unit:'个' },
          { label:'生成成功', value:aiGen, unit:'个' },
          { label:'成功率', value: aiAtt ? (aiGen / aiAtt) : null, pct:true }
        ]},
        { id:'asset', name:'场景资产采购', rows:[
          { label:'采购资产', value:asBuy, unit:'套' },
          { label:'采购金额', value:asAmt, money:true }
        ]},
        { id:'render', name:'渲染与 QC', rows:[
          { label:'渲染完成', value:rdDone, unit:'个' },
          { label:'渲染失败', value:rdFail, unit:'个', warn:true },
          { label:'QC 通过率', value: rdDone ? (rdPass / (rdDone - rdFail || rdDone)) : null, pct:true }
        ]}
      ],
      cumulative:[
        { label:'采集场景（累计）', value:state.baseline.collected, unit:'个', source:'周会口径' },
        { label:'重建完成（累计）', value:state.baseline.rebuilt, unit:'个', source:'周会口径' },
        { label:'场景生成（累计）', value:null, pending:true, source:'口径未拍板' },
        { label:'资产台账（累计）', value:state.baseline.assetLedger, unit:'项', source:'采购台账' },
        { label:'渲染完成（累计）', value:null, pending:true, source:'口径未拍板' }
      ],
      client:[
        { label:'客户侧可用资产', value:latestClient.usable != null ? latestClient.usable : null,
          source:'坤（客户侧）· ' + (latestClient.date ? fmtShort(latestClient.date) : '—') + ' 回传' },
        { label:'规划点位', value:latestClient.planned != null ? latestClient.planned : null, source:'客户侧' },
        { label:'确认点位', value:latestClient.confirmed != null ? latestClient.confirmed : null, source:'客户侧' },
        { label:'客户验收结果', value:latestClient.acceptance || null, source:'客户侧' }
      ],
      clientLatest: latestClient
    };
  }

  /* ---------------- 成本与支出 ----------------
     工时已不在日报中采集（v1.9 起下线），人力成本随之取消；
     这里只保留「直接生产支出」（采购金额）与单位算力成本指标。 */
  function costStats(from, to) {
    const purchase = entriesIn(from, to)
      .filter(x => x.e.pipeline === 'asset')
      .map(x => ({
        date:x.r.date, person:person(x.r.personId), personId:x.r.personId,
        entry:x.e, note:x.e.note || '',
        atts:x.e.atts || [],
        amountFen: (x.e.metrics || {}).amountFen || 0,
        purchased: (x.e.metrics || {}).purchased || 0,
        task:x.e.task
      })).filter(x => x.amountFen > 0);
    return {
      purchase: purchase,
      purchaseFen: sum(purchase, p => p.amountFen),
      unitCostUsd: 14.67,
      note:'直接生产支出 = AI / API 充值 + 云渲染 + 淘宝采购；单位算力成本是「单位成本指标」，不是总额'
    };
  }

  /* ---------------- 汇报文本（FR-27）：内部版 / 客户版 ----------------
     两版同源：都从同一份日报派生，只差字段可见范围。
     对外版 = **除「当日卡点」以外的全部内容** —— 卡点压根不进生成逻辑，
     不是事后过滤；链接层面再清洗一次（内部系统 / 淘宝订单等不发出去）；
     生成后再跑一遍泄漏扫描，防的是「自由文本里把内部信息带出去」这种情况
     （例如事项描述里写了「实测 $14.67」「单场景成本」）。 */
  // 内部系统链接、临时签名链接、采购订单链接都不适合出现在给客户的消息里
  function isClientLink(url) {
    return !/\.internal\b|internal-|localhost|127\.0\.0\.1|^file:|taobao|weixin|dingtalk/i.test(String(url || ''));
  }

  const LEAK_RULES = [
    { kind:'金额',   re:/[¥$]\s?\d[\d,.]*|\d[\d,.]*\s*元|金额|报价/ },
    { kind:'工时',   re:/工时|人天|加班|\d+\s*小时/ },
    { kind:'成本',   re:/成本|单价|预算|计费/ },
    { kind:'采购信息', re:/淘宝|订单号|供应商|发票|对公|退货/ },
    { kind:'内部标识', re:/内部(系统|代号|链接|仓库|命名)|内网|docs\.internal/ }
  ];
  function scanLeak(text) {
    const out = [];
    LEAK_RULES.forEach(r => {
      const m = String(text).match(new RegExp(r.re.source, 'g'));
      if (m) out.push({ kind:r.kind, hits:[...new Set(m.map(s => s.trim()))].slice(0, 3) });
    });
    return out;
  }

  /* 条目状态三选一（v1.15）：不做进度百分比、不做「进行中」——当天必须收口 */
  const PROG_TEXT = { done:'已完成', undone:'未完成', overtime:'需加班完成' };

  /* 明日工作任务：条目的标准化读取（老数据没有该字段时返回空数组） */
  function tomorrowOf(report) {
    return ((report && report.tomorrow) || []).filter(x => (x.task || '').trim());
  }

  function reportVersions(report) {
    const p = person(report.personId) || { name:'—' };
    const entries = (report.entries || []).filter(e => (e.task || '').trim());
    const included = entries;

    /* 内部版：全量 + 内部链接（工时已不在日报中采集） */
    const I = ['【' + fmtCN(report.date) + ' · ' + p.name + '】'];
    entries.forEach((e, i) => {
      I.push((i + 1) + '. ' + pipeline(e.pipeline).name + '｜' + (PROG_TEXT[e.progress] || e.progress));
      I.push('   ' + e.task);
      if (e.progress === 'undone' && (e.reason || e.note)) I.push('   ⚠ 未完成原因：' + (e.reason || e.note));
      (e.links || []).forEach(l => I.push('   成果：' + l.url));
    });
    /* 当日卡点（FR-35）：日报级字段，**只进内部版**。
       它天然是内部协调事项（等谁、等什么数据、缺什么权限），所以对外版
       不是「过滤掉」而是根本不生成这一栏 —— 白名单生成，不靠事后清洗。 */
    const bl = (report.blocker || '').trim();
    if (bl) { I.push('当日卡点：'); I.push('   ' + bl); }
    /* 对外版：除「当日卡点」以外的全部内容都进；链接层面清洗内部链接；明日计划保留。
       注意：**不生成「当日卡点」**（FR-35）—— 卡点是内部协调事项，
       客户材料里没有这一栏，不是靠过滤，而是压根不写进生成逻辑。 */
    const C = ['【' + fmtCN(report.date) + ' · 工作进展】'];
    if (!included.length) C.push('今日无对外汇报事项。');
    included.forEach((e, i) => {
      C.push((i + 1) + '. ' + pipeline(e.pipeline).name + '｜' + (PROG_TEXT[e.progress] || e.progress));
      C.push('   ' + e.task);
      if (e.progress === 'undone' && (e.reason || e.note)) C.push('   ⚠ 待协调：' + (e.reason || e.note));
      (e.links || []).filter(l => isClientLink(l.url)).forEach(l => C.push('   成果：' + l.url));
    });
    const clientText = C.join('\n');

    return {
      internalText: I.join('\n'),
      clientText: clientText,
      tomorrow: ((report && report.tomorrow) || []).filter(x => (x.task || '').trim()),
      blocker: bl,
      included: included,
      leaks: scanLeak(clientText)
    };
  }

  function groupText(report, mode) {
    const v = reportVersions(report);
    return mode === 'client' ? v.clientText : v.internalText;
  }

  /* ---------------- 周进展取材口径 ----------------
     页面「PPT 取材包」（FR-16）已下线；这份口径仍然在用 ——
     知识库「本周进展速览」的自动派生（kbAutoWeekly）依赖它。 */
  function briefData(from, to) {
    const reps = reportsInRange(from, to).filter(r => r.status === 'submitted');
    const groups = state.pipelines.map(pl => {
      const items = [];
      reps.forEach(r => (r.entries || []).forEach(e => { if (e.pipeline === pl.id) items.push({ e:e, r:r }); }))
      return {
        pipeline:pl,
        progress: items.filter(x => x.e.progress === 'done'),
        blocked: items.filter(x => x.e.progress === 'undone'),
        links: items.flatMap(x => (x.e.links || []).map(l => ({ url:l.url, label:l.label, person:person(x.r.personId), date:x.r.date }))),
        tomorrow: reps.flatMap(r => tomorrowOf(r)
          .filter(t => t.pipeline === pl.id)
          .map(t => ({ task:t.task, person:person(r.personId), date:r.date }))),
        people: [...new Set(items.map(x => x.r.personId))].map(person)
      };
    }).filter(g => g.progress.length || g.blocked.length || g.links.length);
    return { from:from, to:to, groups:groups, reports:reps };
  }

  /* ---------------- 其他 ---------------- */
  /* 催办记录模型：{ date 未交日期, personId 被催人, by 催办人（'system' = 系统自动提醒）,
                    at 时间, channel 渠道, kind 'auto' | 'manual', note 备注 }
     注意**没有「已读」字段**：公司没有企业微信、也不接第三方消息平台，
     系统拿不到回执，存一个 false 只是假数据。催办有没有生效看「结果」——
     被催人后来交没交日报，那才是可核验的。 */
  function addReminder(rm) { state.reminders.push(Object.assign({ id:newId('rm') }, rm)); save(); }
  function remindersOn(date) { return state.reminders.filter(r => r.date === date); }

  /* 催办话术（口径层生成，视图只负责展示与复制）
     现实约束：**公司没有企业微信**，也不接第三方消息平台 —— 所以系统**不代发**，
     只产出可直接粘贴的一段话，由 PM 自己发到微信群 / 挨个私聊。
     v1.17：话术来自**可编辑的模板**（设置 → 看板与提醒 → 催办话术模板），
     占位符 {name} {date} {deadline} {count} 在生成时替换；
     未指定模板时按演示时钟自动选：截止前用第一条，截止后用「逾期」那条。 */
  const remindTemplates = () => state.remindTemplates || window.SEED.remindTemplates || [];
  const remindTpl = id => remindTemplates().find(t => t.id === id) || null;
  function renderTpl(text, ctx) {
    return String(text == null ? '' : text)
      .replace(/\{name\}/g, ctx.name || '')
      .replace(/\{date\}/g, ctx.date || '')
      .replace(/\{deadline\}/g, ctx.deadline || '')
      .replace(/\{count\}/g, ctx.count == null ? '' : String(ctx.count));
  }
  /* 时点比较要容错：config 里存的是 '22:00'，演示时钟是完整 ISO，两边都可能拿到 */
  const hhmm = v => { const s = String(v == null ? '' : v); return s.length > 5 ? s.slice(11, 16) : s; };
  function pickTpl(tplId) {
    const tpls = remindTemplates();
    if (tplId) { const t = remindTpl(tplId); if (t) return t; }
    const before = !now() || hhmm(now()) <= hhmm(state.config.deadline);
    if (before) return tpls[0] || null;
    return tpls.filter(x => /late/.test(x.id))[0] || tpls[0] || null;
  }
  function reminderText(personId, date, tplId) {
    const p = person(personId);
    const day = date || today();
    const t = pickTpl(tplId);
    if (!t) return '@' + (p ? p.name : personId) + ' ' + fmtCN(day) + ' 的日报还没提交，麻烦补一下，谢谢～';
    return renderTpl(t.text, { name:(p ? p.name : personId), date:fmtCN(day),
      deadline:state.config.deadline, count:1 });
  }
  function reminderBulkText(ids, date, tplId) {
    const t = pickTpl(tplId);
    return ids.map(id => {
      const p = person(id);
      if (!t) return reminderText(id, date);
      return renderTpl(t.text, { name:(p ? p.name : id), date:fmtCN(date),
        deadline:state.config.deadline, count:ids.length });
    }).join('\n');
  }
  function addLog(who, action, detail) {
    state.logs.unshift({ id:newId('lg'), at:nowISO(), who:who, action:action, detail:detail });
    save();
  }
  /* 演示时钟（FR-38）：全站「现在」锚定 SEED.demoNow —— 倒计时、提醒态、
     逾期判定才有可复现的基准。真实部署把 fallback 换成 new Date() 即可。 */
  function now() {
    if (state && state.runtime && state.runtime.now) return state.runtime.now;
    if (window.SEED && window.SEED.demoNow) return window.SEED.demoNow;
    const d = new Date();
    return S(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function setNow(iso) {
    if (!iso) { if (state.runtime) delete state.runtime.now; }
    else state.runtime = Object.assign({}, state.runtime, { now:iso });
    save();
  }
  function nowISO() { return now(); }

  /* 「今天」（工作日语义）：今天是工作日就用今天，否则回落到演示基准日。
     日报填报与每日任务共用同一个「今天」，两边闭环才对得上。 */
  function today() {
    const t = (window.SEED && window.SEED.today) || S(new Date());
    return isWorkday(t) ? t : ((window.SEED && window.SEED.demoDate) || prevWorkday(t));
  }
  function clientData() { return state.clientData.slice().sort((a, b) => b.date.localeCompare(a.date)); }

  function money(fen) {
    if (fen == null) return '—';
    const y = fen / 100;
    return '¥' + y.toLocaleString('zh-CN', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }

  /* ---------------- 知识库 ----------------
     空间 → 目录树（可含文件夹）→ 文档。正文用迷你 Markdown 渲染（views-kb.js）。
     [[doc:标题]] 是站内文档互链；auto:'weekly' 的文档正文由日报派生，不可手改。 */
  const kbSpaces = () => state.kb.spaces;
  const kbSpace = id => state.kb.spaces.find(s => s.id === id);
  const kbNodes = () => state.kb.nodes;
  const kbNode = id => state.kb.nodes.find(n => n.id === id);
  const kbDocByTitle = t => state.kb.nodes.find(n => n.type === 'doc' && n.title === t);
  function kbChildren(parentId) {
    return state.kb.nodes.filter(n => n.parentId === parentId)
      .sort((a, b) => (a.type === b.type
        ? a.title.localeCompare(b.title, 'zh')
        : (a.type === 'folder' ? -1 : 1)));
  }
  function kbSpaceCount(spaceId) {
    return state.kb.nodes.filter(n => n.spaceId === spaceId && n.type === 'doc').length;
  }
  function kbUpsert(id, patch) {
    const n = kbNode(id); if (!n) return null;
    Object.assign(n, patch, { updatedAt:nowISO() }); save(); return n;
  }
  function kbCreate(spaceId, parentId, title, body, author) {
    const n = { id:newId('kb'), spaceId:spaceId, parentId:parentId || null, type:'doc',
                title:title, body:body || '', author:author, updatedAt:nowISO() };
    state.kb.nodes.push(n); save(); return n;
  }
  function kbStar(id) { const n = kbNode(id); if (n) { n.starred = !n.starred; save(); } return n; }
  /* v1.15：知识库空间可新建（此前只有种子里的 4 个空间，站上没法加） */
  function kbCreateSpace(name, desc) {
    const nm = String(name || '').trim();
    if (!nm) return null;
    const sp = { id:newId('sp'), name:nm, desc:String(desc || '').trim() };
    state.kb.spaces.push(sp); save(); return sp;
  }
  /* ---------------- v1.20 知识库划词批注（Google Docs 式） ----------------
     批注挂在文档节点上：n.annos = [{ id, quote, prefix, suffix, author, at, resolved, text, replies:[] }]
     quote/prefix/suffix 用于渲染后重新定位并高亮正文；回复扁平存在 replies 里。 */
  const kbAnnos = docId => { const n = kbNode(docId); return (n && n.annos) || []; };
  function kbAnnoAdd(docId, a) {
    const n = kbNode(docId); if (!n) return null;
    const rec = { id:newId('ka'), quote:String(a.quote || ''), prefix:String(a.prefix || ''),
                  suffix:String(a.suffix || ''), author:currentUser().id, at:nowISO(),
                  resolved:false, text:String(a.text || '').trim(), replies:[] };
    if (!rec.text || !rec.quote) return null;
    n.annos = n.annos || []; n.annos.push(rec); save(); return rec;
  }
  function kbAnnoReply(docId, annoId, text) {
    const n = kbNode(docId); if (!n) return null;
    const a = (n.annos || []).find(x => x.id === annoId); if (!a) return null;
    const t = String(text || '').trim(); if (!t) return null;
    const r = { author:currentUser().id, at:nowISO(), text:t };
    a.replies = a.replies || []; a.replies.push(r); save(); return r;
  }
  function kbAnnoResolve(docId, annoId) {
    const n = kbNode(docId); if (!n) return null;
    const a = (n.annos || []).find(x => x.id === annoId); if (!a) return null;
    a.resolved = !a.resolved; save(); return a;
  }
  function kbAnnoDelete(docId, annoId) {
    const n = kbNode(docId); if (!n) return false;
    const a = (n.annos || []).find(x => x.id === annoId); if (!a) return false;
    if (a.author !== currentUser().id) return false;      // 只能删自己的批注
    n.annos = n.annos.filter(x => x.id !== annoId); save(); return true;
  }
  /* 新建文档时可选的挂靠目录（该空间下的文件夹） */
  const kbFolders = spaceId => state.kb.nodes
    .filter(n => n.spaceId === spaceId && n.type === 'folder')
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  function kbSearch(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return [];
    return state.kb.nodes.filter(n => n.type === 'doc').map(n => {
      const inTitle = n.title.toLowerCase().indexOf(s) >= 0;
      const i = (n.body || '').toLowerCase().indexOf(s);
      if (!inTitle && i < 0) return null;
      return { node:n, inTitle:inTitle, snippet: i >= 0 ? (n.body || '').slice(Math.max(0, i - 24), i + 44) : '' };
    }).filter(Boolean);
  }
  function kbAutoWeekly(weekMon) {
    const mon = weekMon || weekStart(window.SEED.demoDate);
    const b = briefData(mon, addDays(mon, 4));
    const L = ['# 本周进展速览（' + fmtCN(mon) + ' 起的一周）', '',
               '> 本页由已提交日报自动生成，每个周期刷新；请勿手改。', ''];
    if (!b.groups.length) L.push('本周暂无已提交日报数据。');
    b.groups.forEach(g => {
      L.push('## ' + g.pipeline.name);
      L.push('- 进展 **' + g.progress.length + '** 条 · 未完成 **' + g.blocked.length + '** 条 · 成果链接 ' + g.links.length + ' 个');
      g.progress.slice(0, 3).forEach(x => L.push('  - ' + x.e.task.slice(0, 48)));
      g.blocked.forEach(x => L.push('  - ⚠ 未完成：' + ((x.e.reason || x.e.note || x.e.task) || '').slice(0, 40)));
      L.push('');
    });
    return L.join('\n');
  }

  /* ---------------- 周报板块（FR-32） ----------------
     周一 17:00 前：老师交「上周任务结果 + 本周目标建议 + 风险」
     周二 周会后  ：PM 发布「本周工作任务」→ 所有人可见 */
  const weekReportsAll = () => state.weekReports;
  function getWeekReport(personId, week) {
    return state.weekReports.find(w => w.personId === personId && w.week === week) || null;
  }
  function upsertWeekReport(w) {
    const i = state.weekReports.findIndex(x => x.id === w.id);
    if (i >= 0) state.weekReports[i] = w; else state.weekReports.push(w);
    save();
  }
  function weekReportStatus(week) {
    const exp = submitters();
    const rep = id => getWeekReport(id, week);
    const submitted = exp.filter(p => { const r = rep(p.id); return r && r.status === 'submitted'; });
    const missing = exp.filter(p => { const r = rep(p.id); return !r || r.status !== 'submitted'; });
    const drafts = missing.filter(p => { const r = rep(p.id); return r && r.status === 'draft'; });
    return { week:week, expected:exp, expectedN:exp.length,
             submitted:submitted, submittedN:submitted.length,
             missing:missing, missingN:missing.length, drafts:drafts, draftsN:drafts.length,
             rate: exp.length ? submitted.length / exp.length : null };
  }
  // 按组汇总：场景生成组 / 3DGS 组
  function weekReportSummary(week) {
    const rows = submitters().map(p => ({ person:p, group:groupOf(p.group), rep:getWeekReport(p.id, week) }));
    const out = groups().map(g => ({ group:g, rows:rows.filter(x => x.group && x.group.id === g.id) }));
    // TA Leader 不带组（直接交 PM）：单列一档，避免「已交 8/8 却只列出 7 个人」的对不上
    const orphan = rows.filter(x => !x.group);
    if (orphan.length) out.push({ group:{ id:'__direct', name:'直属 PM（不带组）' }, rows:orphan });
    return out;
  }
  function weekPlan(week) { return (state.weekPlans || []).find(p => p.week === week) || null; }
  function saveWeekPlan(week, text, by) {
    state.weekPlans = state.weekPlans || [];
    const obj = { week:week, text:text, by:by || currentUser().id, updatedAt:nowISO() };
    const i = state.weekPlans.findIndex(p => p.week === week);
    if (i >= 0) state.weekPlans[i] = obj; else state.weekPlans.push(obj);
    save(); return obj;
  }
  function weekReportText(week) {
    const st = weekReportStatus(week);
    const cfg = state.config;
    const L = ['【周报 · ' + fmtCN(week) + ' 那一周】',
      '上周任务结果（已交 ' + st.submittedN + '/' + st.expectedN + '，截止 周一 ' + cfg.weeklyDue + '）', ''];
    weekReportSummary(week).forEach(g => {
      L.push('▍' + g.group.name);
      g.rows.forEach(x => {
        L.push('· ' + x.person.name + (x.rep && x.rep.status === 'submitted' ? '' : '（未交）'));
        if (x.rep && x.rep.status === 'submitted') {
          L.push('  上周结果：' + x.rep.lastResult);
          (x.rep.suggest || []).forEach(t => L.push('  本周目标：' + pipeline(t.pipeline).name + '｜' + t.task));
          if ((x.rep.risks || '').trim()) L.push('  风险 / 需支持：' + x.rep.risks);
        }
      });
      L.push('');
    });
    const plan = weekPlan(week);
    L.push('▍本周工作任务（' + (plan ? 'PM 已发布 · 全员可见' : 'PM 未发布') + '）');
    if (plan) String(plan.text || '').split('\n').forEach(x => L.push(x));
    else L.push('（等待 PM 在周二周会后发布）');
    return L.join('\n');
  }

  /* ============================================================
     内容流（工作台信息流 · FR-37）
     口径只在这里算一次：分类权限、可见性、排序、筛选、点赞、评论。
     页面一律问 Store，不得自行判断「这个角色能不能发这一类」。
     ============================================================ */
  const NEWS_CATS_SEED = ['公告','新闻','活动','分享','学习'];
  const NEWS_TONE = { '公告':'announce', '新闻':'news', '活动':'event', '分享':'share', '学习':'study' };
  const NEWS_PAGE = 5;                     // 信息流每页条数（「加载更多」）

  const newsRaw = () => (state.news || (state.news = []));
  const newsItem = id => newsRaw().find(n => n.id === id) || null;
  const newsCats = () => (state.newsCats && state.newsCats.length)
    ? state.newsCats : (state.newsCats = NEWS_CATS_SEED.slice());
  const newsTone = c => NEWS_TONE[c] || 'news';
  const newsAuthor = n => person(n.authorId) || { name:'—', id:n.authorId };
  const isIntern = id => { const p = person(id); return !!(p && p.role === 'intern'); };

  /* 一条内容对某个人可不可见：
     published 全员可见；自己发的（草稿 / 审核中 / 未通过）自己可见；
     特权用户额外看得到待审核队列。 */
  function newsVisibleTo(n, uid, priv) {
    if (n.status === 'published') return true;
    if (n.authorId === uid) return true;
    return !!(priv && n.status === 'pending');
  }

  function newsFeed(opt) {
    const o = opt || {};
    const uid = o.uid || currentUser().id;
    const priv = isPrivileged();
    let list = newsRaw().filter(n => newsVisibleTo(n, uid, priv));
    const f = o.filter;
    if (f && f !== '全部') {
      if (f === '我的发布') list = list.filter(n => n.authorId === uid);
      else list = list.filter(n => n.category === f);
    }
    /* v1.22a：按来源区分 —— source:'news' 是从 NEWS 页发的 AI 资讯，
       工作台「团队信息流」卡不再混入；NEWS 页只看这一类。 */
    if (o.source === 'news') list = list.filter(n => n.source === 'news');
    else if (o.source === 'feed') list = list.filter(n => n.source !== 'news');
    // 置顶优先 → 按发布时间倒序（写进一处，页面不再各自排序）
    return list.slice().sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return String(b.at).localeCompare(String(a.at));
    });
  }
  function newsPage(opt) {
    const o = opt || {};
    const all = newsFeed(o);
    const n = o.limit || NEWS_PAGE;
    return { total:all.length, items:all.slice(0, n), hasMore: all.length > n };
  }
  function newsStats(weekMon, source) {
    const mon = weekMon || weekStart(window.SEED.demoDate);
    const to = addDays(mon, 6);
    let week = newsRaw().filter(n => n.at && n.at.slice(0, 10) >= mon && n.at.slice(0, 10) <= to);
    if (source === 'news') week = week.filter(n => n.source === 'news');
    else if (source === 'feed') week = week.filter(n => n.source !== 'news');
    const byCat = {};
    newsCats().forEach(c => { byCat[c] = week.filter(n => n.category === c).length; });
    return { week:mon, count:week.length,
      byCat:byCat, pinned: newsRaw().filter(n => n.pinned).length,
      pending: newsRaw().filter(n => n.status === 'pending').length,
      mine: newsRaw().filter(n => n.authorId === currentUser().id).length };
  }
  function newsFilterCounts(source) {
    const uid = currentUser().id, priv = isPrivileged();
    let vis = newsRaw().filter(n => newsVisibleTo(n, uid, priv));
    if (source === 'news') vis = vis.filter(n => n.source === 'news');
    else if (source === 'feed') vis = vis.filter(n => n.source !== 'news');
    const out = { '全部': vis.length, '我的发布': vis.filter(n => n.authorId === uid).length };
    ['公告','活动'].forEach(c => { out[c] = vis.filter(n => n.category === c).length; });
    return out;
  }

  /* 我能发哪些分类 —— 唯一判定处。
     实习生默认「学习 / 分享 / 活动」；config.internNews 打开后追加「新闻」；
     「公告」永远只有管理层能发（不因任何开关放开）。 */
  function myCats(roleId) {
    const d = roleDef(roleId || currentUser().role);
    if (!d.news) return [];
    let cats = (d.news.cats || []).slice();
    if (d.news.intern && state.config.internNews && cats.indexOf('新闻') < 0) cats.push('新闻');
    return newsCats().filter(c => cats.indexOf(c) >= 0);   // 按固定顺序返回
  }
  const canPostCat = c => myCats().indexOf(c) >= 0;

  /* 发布后落到什么状态：实习生 + 开了审核 → pending（待主管审核），否则 published */
  function newsPublishStatus(uid) {
    const p = person(uid || currentUser().id);
    return (state.config.internReview && p && p.role === 'intern') ? 'pending' : 'published';
  }
  function newsReviewOn() { return !!state.config.internReview; }

  function upsertNews(n) {
    const i = newsRaw().findIndex(x => x.id === n.id);
    if (i >= 0) newsRaw()[i] = n; else newsRaw().push(n);
    save(); return n;
  }
  function removeNews(id) {
    state.news = newsRaw().filter(n => n.id !== id); save();
  }
  function newsLike(id) {
    const n = newsItem(id); if (!n) return null;
    n.likes = n.likes || [];
    const uid = currentUser().id;
    const k = n.likes.indexOf(uid);
    if (k >= 0) n.likes.splice(k, 1); else n.likes.push(uid);
    save(); return n;
  }
  function newsComment(id, text, mentions) {
    const n = newsItem(id); if (!n || !(text || '').trim()) return null;
    n.comments = n.comments || [];
    const c = { id:newId('c'), authorId:currentUser().id, at:nowISO(),
                text:text.trim(), mentions:(mentions || []).slice() };
    n.comments.push(c); save(); return c;
  }
  function newsPin(id) {
    const n = newsItem(id); if (!n) return null;
    n.pinned = !n.pinned; save(); return n;
  }
  function newsApprove(id) {
    const n = newsItem(id); if (!n) return null;
    n.status = 'published'; n.reviewBy = currentUser().id; n.reviewAt = nowISO();
    n.reviewNote = ''; save(); return n;
  }
  function newsReject(id, note) {
    const n = newsItem(id); if (!n) return null;
    n.status = 'rejected'; n.reviewBy = currentUser().id; n.reviewAt = nowISO();
    n.reviewNote = note || ''; save(); return n;
  }
  /* 分享到知识库：把内容流条目落成一篇知识库文档（归入「MetaHuman 项目」空间） */
  function newsShareToKb(id) {
    const n = newsItem(id); if (!n) return null;
    const sp = (state.kb.spaces[0] || {}).id;
    const body = ['# ' + n.title, '',
      '> 来自工作台信息流 · ' + (n.category || '分享') + ' · ' + newsAuthor(n).name +
      ' · ' + fmtAt(n.at) + '（[[doc:项目概览]] 空间归档）', '', n.body || ''].join('\n');
    return kbCreate(sp, null, n.title, body, currentUser().id);
  }
  /* @ 我的：发布时 @ + 评论里 @，都收拢到「待我处理」 */
  function mentionMe(uid) {
    const who = uid || currentUser().id;
    const out = [];
    newsRaw().forEach(n => {
      if (n.status !== 'published' && n.authorId !== who && !isPrivileged()) return;
      if ((n.mentions || []).indexOf(who) >= 0 && n.authorId !== who) {
        out.push({ id:n.id + '|post', newsId:n.id, authorId:n.authorId, at:n.at,
                   text:n.title, kind:'发布时 @ 了我' });
      }
      (n.comments || []).forEach(c => {
        if ((c.mentions || []).indexOf(who) >= 0 && c.authorId !== who) {
          out.push({ id:n.id + '|' + c.id, newsId:n.id, authorId:c.authorId, at:c.at,
                     text:c.text, kind:'评论里 @ 了我' });
        }
      });
    });
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function pendingNews() { return newsRaw().filter(n => n.status === 'pending'); }

  /* ============================================================
     每日任务（FR-38）—— 一人一天一条，10:45 前提交为「按时」
     状态一律派生，不落库：off / missing / draft / ontime / late / requested / editing
     ============================================================ */
  /* 优先级是「下拉项」之一（v1.16）：默认三条，最高权限可在设置页增删改。
     代码里一律走 priorities()，不要直接读常量。 */
  const PRIORITY_SEED = [
    { id:'high', t:'高', c:'danger' },
    { id:'mid',  t:'中', c:'warn' },
    { id:'low',  t:'低', c:'' }
  ];
  const priorities = () => (state.priorities && state.priorities.length)
    ? state.priorities : (state.priorities = PRIORITY_SEED.map(x => Object.assign({}, x)));
  const TASK_STATE_META = {
    off:      { label:'今日非工作日', tone:'',       hint:'按工作日历，今天不需要提交' },
    missing:  { label:'未交',         tone:'danger', hint:'还没有提交今天的任务' },
    draft:    { label:'草稿未提交',   tone:'warn',   hint:'草稿已保存，别忘了提交' },
    ontime:   { label:'已交（按时）', tone:'ok',     hint:'在截止时间前提交' },
    late:     { label:'已交（逾期）', tone:'warn',   hint:'超过截止时间提交，已留痕' },
    requested:{ label:'已申请修改',   tone:'warn',   hint:'等管理员放开修改' },
    editing:  { label:'修改中',       tone:'accent', hint:'管理员已放开，可重新编辑提交' }
  };
  const TASK_SOURCE = { daily:'日报「明日计划」预填', copy:'复制昨日', template:'模板导入', manual:'手工填写' };
  const TASK_VIS = [
    { id:'all',   t:'全员可见',   hint:'所有人都能看到彼此的每日任务' },
    { id:'group', t:'仅本组可见', hint:'只能看到自己所在组的成员' },
    { id:'self',  t:'仅自己可见', hint:'每人只能看到自己的任务' }
  ];
  /* 任务模板（从模板导入）：按三个条线预置，落地时可由知识库维护 */
  const TASK_TEMPLATES = [
    { id:'t3dgs', name:'3DGS 组 · 日常三件套', items:[
      { task:'重建 / 重跑当日批次并更新台账', priority:'high', pipeline:'3dgs' },
      { task:'排查失败场景并记录原因', priority:'mid', pipeline:'3dgs' },
      { task:'同步进度到日报与看板', priority:'low', pipeline:'other',
        note:'跨管线事务：同步进度、对接与协调' }] },
    { id:'trender', name:'渲染与 QC · 日常', items:[
      { task:'执行当日渲染批次', priority:'high', pipeline:'render' },
      { task:'输出 QC 报告并登记失败项', priority:'mid', pipeline:'render' }] },
    { id:'tgen', name:'场景生成组 · 日常', items:[
      { task:'按计划生成场景并统计成功率', priority:'high', pipeline:'scene' },
      { task:'整理失败样本与提示词迭代记录', priority:'mid', pipeline:'scene' }] }
  ];
  const taskPriority = id => priorities().find(x => x.id === id) || priorities()[1] || priorities()[0];
  const taskPriorityText = id => taskPriority(id).t;
  const taskSourceText = k => TASK_SOURCE[k] || '手工填写';

  const TASKS = () => (state.tasks || (state.tasks = []));
  const taskOf = (personId, date) => TASKS().find(t => t.personId === personId && t.date === date) || null;
  const taskCfg = () => state.config || {};
  const taskDeadline = () => taskCfg().taskDeadline || '10:45';
  const taskRemindAt = () => taskCfg().taskRemind || ['10:15', '10:35'];

  function minsBetween(aHM, bHM) {
    const f = h => { const p = String(h || '00:00').slice(0, 5).split(':').map(Number);
      return (p[0] || 0) * 60 + (p[1] || 0); };
    return f(bHM) - f(aHM);
  }
  /* 演示时钟 vs 当日截止：倒计时与提醒态的唯一来源 */
  function taskClock(date) {
    const nw = now(), d = date || today();
    const dl = taskDeadline();
    if (nw.slice(0, 10) !== d) return { sameDay:false, deadline:dl, left:null, passed:false,
      remind:null, reminding:false, urgent:false, now:nw.slice(11, 16) };
    const nowHM = nw.slice(11, 16);
    const left = minsBetween(nowHM, dl);
    const hit = taskRemindAt().filter(t => nowHM >= t);
    return { sameDay:true, now:nowHM, deadline:dl, left:left, passed:left < 0,
      remind:hit.length ? hit[hit.length - 1] : null,
      reminding:left > 0 && left <= 30, urgent:left > 0 && left <= 10 };
  }
  function taskCountdownText(date) {
    const c = taskClock(date);
    if (!c.sameDay) return '—';
    const m = Math.abs(c.left);
    if (c.passed) return '已截止 ' + m + ' 分钟';
    return '还有 ' + m + ' 分钟';
  }
  /* 单人单日状态（派生） */
  function taskState(personId, date) {
    const d = date || today();
    const rec = taskOf(personId, d);
    const base = { personId:personId, date:d, workday:isWorkday(d), rec:rec, late:false };
    const set = k => Object.assign(base, { key:k, label:TASK_STATE_META[k].label,
      tone:TASK_STATE_META[k].tone, hint:TASK_STATE_META[k].hint });
    if (!base.workday) return set('off');
    if (!rec || !(rec.items || []).length) return set('missing');
    if (rec.status !== 'submitted') return set('draft');
    base.late = !!(rec.submittedAt && timeOf(rec.submittedAt) > taskDeadline());
    const req = rec.editRequest;
    if (req && req.granted) return set('editing');
    if (req && !req.granted) return set('requested');
    return set(base.late ? 'late' : 'ontime');
  }
  /* 团队当日提交概览 */
  function taskSubmission(date) {
    const d = date || today();
    const exp = members();
    const rows = exp.map(p => ({ person:p, state:taskState(p.id, d) }));
    const pick = k => rows.filter(r => r.state.key === k);
    const doneN = pick('ontime').length + pick('late').length + pick('editing').length + pick('requested').length;
    const missingRows = pick('missing').concat(pick('draft'));
    return {
      date:d, workday:isWorkday(d), expected:exp, expectedN:exp.length, rows:rows,
      ontime:pick('ontime').map(r => r.person), ontimeN:pick('ontime').length,
      late:pick('late').map(r => r.person), lateN:pick('late').length,
      draft:pick('draft').map(r => r.person), draftN:pick('draft').length,
      missing:missingRows.map(r => r.person), missingN:missingRows.length,
      submittedN:doneN, rate: exp.length ? doneN / exp.length : null,
      onTimeRate: exp.length ? pick('ontime').length / exp.length : null
    };
  }
  /* 连续按时提交天数：今天未交不算断链（还没到截止），非工作日自动跳过 */
  function taskStreak(personId, upto) {
    const todayD = today();
    let d = upto || todayD, n = 0, g = 0;
    while (g++ < 90) {
      const st = taskState(personId, d);
      if (st.key === 'ontime') n++;
      else if (d === todayD && (st.key === 'draft' || st.key === 'missing')) { /* 今天还没交，不算断 */ }
      else break;
      const p = prevWorkday(d);
      if (p >= d) break;
      d = p;
    }
    return n;
  }
  /* 近 n 个工作日的提交趋势（按时率 / 提交率） */
  function taskTrend(n) {
    const days = [];
    let d = today(), g = 0;
    while (days.length < (n || 10) && g++ < 90) { days.push(d); const p = prevWorkday(d); if (p >= d) break; d = p; }
    days.reverse();
    return days.map(x => {
      const s = taskSubmission(x);
      return { date:x, rate:s.rate, onTimeRate:s.onTimeRate, submittedN:s.submittedN,
        expectedN:s.expectedN, lateN:s.lateN, missingN:s.missingN };
    });
  }
  /* 加班口径（FR-39）：从日报的「今日是否加班」派生。预测值，不进成本、不进提交率。 */
  function overtimeStats(from, to) {
    const reps = reportsInRange(from, to).filter(r => r.status === 'submitted');
    const rows = reps.filter(r => r.overtime && r.overtime.on);
    const hours = rows.reduce((a, r) => a + (Number(r.overtime.hours) || 0), 0);
    const buckets = [{ label:'≤1h', n:0 }, { label:'1–2h', n:0 }, { label:'2–4h', n:0 }, { label:'>4h', n:0 }];
    rows.forEach(r => { const h = Number(r.overtime.hours) || 0;
      buckets[h <= 1 ? 0 : h <= 2 ? 1 : h <= 4 ? 2 : 3].n++; });
    const byPerson = members().map(p => {
      const mine = rows.filter(r => r.personId === p.id);
      return { person:p, n:mine.length, hours:mine.reduce((a, r) => a + (Number(r.overtime.hours) || 0), 0) };
    }).filter(x => x.n).sort((a, b) => b.n - a.n);
    return { n:rows.length, hours:hours, buckets:buckets, byPerson:byPerson,
      rate: reps.length ? rows.length / reps.length : null, rows:rows, from:from, to:to };
  }
  /* 统计口径：管理员看全部，员工只看自己（页面按 scope 收敛） */
  function taskStatsScope() { return can('taskManage') ? 'all' : 'self'; }
  function taskStats(n) {
    const trend = taskTrend(n || 10);
    const from = trend.length ? trend[0].date : today();
    const to = today();
    const sum = k => trend.reduce((a, x) => a + (x[k] || 0), 0);
    const expected = sum('expectedN'), submitted = sum('submittedN'), late = sum('lateN'), missing = sum('missingN');
    const ontime = trend.reduce((a, x) => a + Math.round((x.onTimeRate || 0) * x.expectedN), 0);
    const byPerson = members().map(p => {
      let s = 0, o = 0, l = 0, m = 0, items = 0;
      trend.forEach(x => {
        const st = taskState(p.id, x.date);
        if (st.key === 'ontime') { o++; s++; }
        else if (st.key === 'late') { l++; s++; }
        else if (st.key === 'missing' || st.key === 'draft') m++;
        if (st.rec) items += (st.rec.items || []).length;
      });
      return { person:p, submitted:s, ontime:o, late:l, missing:m, items:items,
        expected:trend.length, rate: trend.length ? s / trend.length : null,
        onTimeRate: trend.length ? o / trend.length : null, streak:taskStreak(p.id) };
    }).sort((a, b) => (b.onTimeRate - a.onTimeRate) || a.person.name.localeCompare(b.person.name, 'zh'));
    const pipeCount = {};
    trend.forEach(x => members().forEach(p => {
      const rec = taskOf(p.id, x.date);
      (rec && rec.items || []).forEach(it => { pipeCount[it.pipeline] = (pipeCount[it.pipeline] || 0) + 1; });
    }));
    const byPipeline = state.pipelines.map(pl => ({ pipeline:pl, n:pipeCount[pl.id] || 0 }))
      .filter(x => x.n).sort((a, b) => b.n - a.n);
    const priority = { high:0, mid:0, low:0 };
    trend.forEach(x => members().forEach(p => {
      const rec = taskOf(p.id, x.date);
      (rec && rec.items || []).forEach(it => { priority[it.priority] = (priority[it.priority] || 0) + 1; });
    }));
    const undoneReasons = [];
    reportsInRange(from, to).forEach(r => (r.entries || []).forEach(e => {
      if (e.progress === 'undone' && (e.reason || e.note))
        undoneReasons.push({ person:person(r.personId), date:r.date, text:e.reason || e.note, pipeline:e.pipeline });
    }));
    return { trend:trend, from:from, to:to, days:trend.length,
      expected:expected, submitted:submitted, ontime:ontime, late:late, missing:missing,
      rate: expected ? submitted / expected : null, onTimeRate: expected ? ontime / expected : null,
      lateRate: expected ? late / expected : null, missingRate: expected ? missing / expected : null,
      byPerson:byPerson, byPipeline:byPipeline, priority:priority,
      overtime:overtimeStats(from, to), undoneReasons:undoneReasons };
  }
  /* 看板可见性（FR-40）：只有管理员能改，改动写操作日志 */
  function taskVisibility() { return taskCfg().taskVisibility || 'all'; }
  function taskVisText(v) { const x = TASK_VIS.find(t => t.id === (v || taskVisibility())); return x ? x.t : '全员可见'; }
  function setTaskVisibility(v) {
    if (!can('taskConfig')) return false;
    const oldT = taskVisText(), newT = taskVisText(v);
    state.config.taskVisibility = v; save();
    addLog(currentUser().name, '调整看板可见性', oldT + ' → ' + newT);
    return true;
  }
  function myGroupIds(pid) {
    const id = pid || currentUser().id;
    return groups().filter(g => (g.members || []).indexOf(id) >= 0 || g.lead === id).map(g => g.id);
  }
  function canSeeTask(ofPersonId) {
    const me = currentUser();
    if (ofPersonId === me.id) return true;
    if (can('taskManage')) return true;
    const v = taskVisibility();
    if (v === 'all') return true;
    if (v === 'self') return false;
    const mine = myGroupIds(me.id), his = myGroupIds(ofPersonId);
    return his.some(x => mine.indexOf(x) >= 0);
  }
  function taskBoardRows(date) {
    const d = date || today();
    return members().filter(p => canSeeTask(p.id)).map(p => ({ person:p, state:taskState(p.id, d) }));
  }
  function taskMissingPeople(date) {
    return taskSubmission(date).rows.filter(r => r.state.key === 'missing' || r.state.key === 'draft').map(r => r.person);
  }
  function taskLatePeople(date) {
    return taskSubmission(date).rows.filter(r => r.state.key === 'late').map(r => r.person);
  }
  /* ---- 写入 ---- */
  function upsertTask(rec) {
    const i = TASKS().findIndex(t => t.id === rec.id);
    if (i >= 0) TASKS()[i] = rec; else TASKS().push(rec);
    save();
  }
  function newTask(personId, date, source) {
    return { id:newId('tk'), personId:personId, date:date || today(), items:[],
      note:'', status:'draft', submittedAt:null, source:source || 'manual', editRequest:null };
  }
  function submitTask(rec) {
    rec.status = 'submitted';
    rec.submittedAt = now();
    /* 「放开修改」是一次性授权：重新提交即视为用掉，清掉申请、回到常规只读。
       否则这条记录会永远停在「修改中」，留痕也失去意义（日志里已有放开与提交两条）。 */
    if (rec.editRequest && rec.editRequest.granted) rec.editRequest = null;
    upsertTask(rec);
    const late = timeOf(rec.submittedAt) > taskDeadline();
    addLog(person(rec.personId).name, '提交每日任务',
      fmtShort(rec.date) + ' · ' + (rec.items || []).length + ' 条 · ' + (late ? '逾期' : '按时'));
    return { late:late };
  }
  function requestTaskEdit(rec, reason) {
    rec.editRequest = { at:now(), by:currentUser().id, reason:reason || '', granted:false };
    upsertTask(rec);
    addLog(person(rec.personId).name, '申请修改每日任务', fmtShort(rec.date) + ' · ' + (reason || ''));
  }
  function grantTaskEdit(rec) {
    rec.editRequest = Object.assign({}, rec.editRequest,
      { granted:true, grantedBy:currentUser().id, grantedAt:now() });
    upsertTask(rec);
    addLog(currentUser().name, '放开每日任务修改', person(rec.personId).name + ' · ' + fmtShort(rec.date));
  }
  function revokeTaskEdit(rec) {
    rec.editRequest = Object.assign({}, rec.editRequest, { granted:false });
    upsertTask(rec);
  }
  function taskFromPrev(personId, date) {
    let d = prevWorkday(date || today()), g = 0;
    while (g++ < 20) {
      const t = taskOf(personId, d);
      if (t && (t.items || []).length) return t;
      const p = prevWorkday(d);
      if (p >= d) break;
      d = p;
    }
    return null;
  }
  function taskCopyPrev(rec) {
    const y = taskFromPrev(rec.personId, rec.date);
    if (!y) return null;
    rec.items = y.items.map(it => ({ id:newId('ti'), task:it.task, priority:it.priority,
      pipeline:it.pipeline, note:it.note || '' }));
    rec.source = 'copy';
    upsertTask(rec);
    return y;
  }
  function taskApplyTemplate(rec, tplId) {
    const tpl = TASK_TEMPLATES.find(t => t.id === tplId);
    if (!tpl) return null;
    rec.items = tpl.items.map(it => ({ id:newId('ti'), task:it.task, priority:it.priority,
      pipeline:it.pipeline, note:it.note || '' }));
    rec.source = 'template';
    upsertTask(rec);
    return tpl;
  }
  /* 日报「明日计划」→ 次日今日任务（单向预填） */
  function taskFromDailyPlan(personId, date) {
    const rep = getReport(personId, prevWorkday(date || today()));
    const tm = rep ? tomorrowOf(rep) : [];
    return tm.map(t => ({ id:newId('ti'), task:t.task, priority:'mid', pipeline:t.pipeline, note:'' }));
  }
  /* 今日任务 → 日报条目（日报打开时自动带入；日报里临时加的条目不回写） */
  function taskToDailyEntries(personId, date) {
    const t = taskOf(personId, date);
    if (!t || !(t.items || []).length) return [];
    return t.items.map(it => ({ pipeline:it.pipeline, task:it.task, progress:'done', reason:'',
      otHours:null, links:[], note:it.note || '', metrics:{}, fromTask:true }));
  }

  /* ============================================================
     工作台派生口径（FR-36）—— 卡片数字全部从这里取，页面不自算
     ============================================================ */
  /* 连续写日报天数：从 date 往前数工作日，遇到「没交」就停（非工作日跳过不断链） */
  function myStreak(personId, date) {
    let d = date, n = 0, g = 0;
    while (g++ < 90) {
      if (isWorkday(d)) {
        const r = getReport(personId, d);
        if (r && r.status === 'submitted') n++; else break;
      }
      d = addDays(d, -1);
    }
    return n;
  }
  /* 我的最近 n 条日报（含草稿），按日期倒序 */
  function myRecentReports(personId, n) {
    return state.reports.filter(r => r.personId === personId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, n || 5);
  }
  /* 近 n 个工作日的提交率序列（小趋势图用；纯数字，SVG 在视图里画） */
  function submissionTrend(date, n) {
    const days = []; let d = date, g = 0;
    while (days.length < (n || 7) && g++ < 60) { if (isWorkday(d)) days.push(d); d = addDays(d, -1); }
    return days.reverse().map(x => {
      const s = submission(x);
      return { date:x, rate:s.rate, submittedN:s.submittedN, expectedN:s.expectedN, missingN:s.missingN };
    });
  }
  /* 统计小卡四格：我的本周提交 / 我的本周产出 / 团队本周提交率 / 知识库本周新增 */
  function dashStats(personId, date) {
    const mon = weekStart(date), sun = addDays(mon, 6);
    const wk = weekSubmission(mon);
    const row = wk.rows.find(r => r.person.id === personId);
    const myReps = reportsInRange(mon, sun).filter(r => r.personId === personId && r.status === 'submitted');
    const entries = [];
    myReps.forEach(r => (r.entries || []).forEach(e => entries.push(e)));
    const pipes = [];
    entries.forEach(e => { if (pipes.indexOf(e.pipeline) < 0) pipes.push(e.pipeline); });
    return {
      week: mon,
      mySubmitted: row ? row.submitted : 0,
      myExpected: row ? row.expected : 0,
      myEntries: entries.length,
      myPipes: pipes.length,
      teamRate: wk.totalExpected ? wk.totalSubmitted / wk.totalExpected : null,
      kbNew: state.kb.nodes.filter(n => n.type === 'doc' && n.updatedAt &&
        n.updatedAt.slice(0, 10) >= mon && n.updatedAt.slice(0, 10) <= sun).length
    };
  }
  /* 知识库最近更新 / 我的收藏 */
  function kbRecent(n) {
    return state.kb.nodes.filter(x => x.type === 'doc' && x.updatedAt)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, n || 4);
  }
  const kbStarred = () => state.kb.nodes.filter(x => x.type === 'doc' && x.starred);
  /* 常用模板：规则与流程空间里的「…规则 / …指引」，直接当模板入口 */
  function kbTemplates(n) {
    const spRule = (state.kb.spaces.find(x => x.id === 'sp-rule') || {}).id;
    return state.kb.nodes.filter(x => x.type === 'doc' && x.spaceId === spRule).slice(0, n || 3);
  }

  /* 「待我处理」聚合：待交日报 / @ 我的 / 待审核 / 待催办 —— 点进去就能做 */
  function pendingTodo(personId, date) {
    const me = person(personId) || {};
    const out = [];
    if (me.type !== 'client' && SUBMIT_ROLES().indexOf(me.role) >= 0 && me.dailySubmit !== false) {
      const r = getReport(personId, date);
      if (!r || r.status !== 'submitted') {
        out.push({ kind:'待交日报', tone:'warn', go:'fill',
          text: fmtCN(date) + ' 的日报' + ((r && r.status === 'draft') ? '（草稿已存，只差点「提交」）' : '还没交') });
      }
    }
    if (me.type === 'client') return out;
    mentionMe(personId).slice(0, 3).forEach(m => out.push({ kind:'@ 我的', tone:'accent', go:'workbench', newsId:m.newsId,
      text: ((person(m.authorId) || {}).name || '—') + '：' + String(m.text).slice(0, 34) }));
    if (can('newsReview')) {
      const n = pendingNews().length;
      if (n) out.push({ kind:'待审核', tone:'warn', go:'workbench', text: n + ' 条实习生内容等审核' });
    }
    if (isPrivileged()) {
      const miss = submission(date).missing;
      if (miss.length) out.push({ kind:'待催办', tone:'danger', go:'missing',
        text: miss.map(x => x.name).join('、') + ' 还没交' });
    }
    return out;
  }

  /* 项目进展：用五条管线的本周完成度近似（进度 = 有产出的管线占比） */
  function projectProgress(personId, date) {
    const mon = weekStart(date), sun = addDays(mon, 6);
    const es = entriesIn(mon, sun).map(x => x.e);
    const total = state.pipelines.filter(x => x.id !== 'other').length;
    const done = state.pipelines.filter(pl => pl.id !== 'other' &&
      es.some(e => e.pipeline === pl.id && e.progress === 'done')).length;
    const blocked = es.filter(e => e.progress === 'undone').length;
    return { total:total, done:done, blocked:blocked,
      pct: total ? done / total : 0, week:mon };
  }

  /* 工作台个性化：卡片顺序 / 折叠 / 隐藏（随 localStorage 一起存） */
  function prefsDash() {
    if (!state.prefs) state.prefs = {};
    if (!state.prefs.dash) state.prefs.dash = { order:null, collapsed:[], hidden:[] };
    const d = state.prefs.dash;
    if (!d.collapsed) d.collapsed = [];
    if (!d.hidden) d.hidden = [];
    if (!('order' in d)) d.order = null;
    return d;
  }
  function setPrefsDash(patch) { Object.assign(prefsDash(), patch); save(); }
  function resetPrefsDash() { state.prefs.dash = { order:null, collapsed:[], hidden:[] }; save(); }

  /* ============================================================
     下拉项（枚举）管理（v1.16）
     最高权限（老板 / PM / TA Leader，can('taskConfig')）可增删改，
     改动一律落库到 state；页面只读 Store 派生，不各写一套。
     范围：关联管线 pipelines · 优先级 priorities · 内容流分类 newsCats。
     ============================================================ */
  function slugify(s) {
    const t = String(s == null ? '' : s).trim().toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
    return t || ('x' + Date.now().toString(36));
  }
  function uniqueId(arr, base) {
    let id = base, i = 2;
    while (arr.some(x => x.id === id)) { id = base + '-' + i; i++; }
    return id;
  }
  function moveIn(list, id, dir) {
    const i = list.findIndex(x => x.id === id);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return false;
    const t = list[i]; list[i] = list[j]; list[j] = t; return true;
  }

  /* --- 关联管线 --- */
  function upsertPipeline(o) {
    if (!can('taskConfig')) return false;
    const list = state.pipelines || (state.pipelines = []);
    const name = String(o.name == null ? '' : o.name).trim();
    if (!name) return false;
    const f = o.id ? list.find(p => p.id === o.id) : null;
    if (f) { f.name = name; f.short = String(o.short || name).trim() || name; }
    else list.push({ id:uniqueId(list, slugify(name)), name:name,
      short:String(o.short || name).trim() || name, metrics:[] });
    save(); return true;
  }
  function removePipeline(id) {
    if (!can('taskConfig') || id === 'other') return false;
    const list = state.pipelines || [];
    const i = list.findIndex(p => p.id === id);
    if (i < 0) return false;
    list.splice(i, 1); save(); return true;
  }
  function movePipeline(id, dir) {
    if (!can('taskConfig') || !moveIn(state.pipelines || [], id, dir)) return false;
    save(); return true;
  }

  /* --- 分组（人员弹窗「所属组」下拉的来源，v1.18 可编辑） --- */
  function upsertGroup(o) {
    if (!can('taskConfig')) return { ok:false, msg:'没有配置权限' };
    const list = state.groups || (state.groups = []);
    const name = String(o.name == null ? '' : o.name).trim();
    if (!name) return { ok:false, msg:'请填写组名' };
    let g;
    if (o.id) {
      g = list.find(x => x.id === o.id);
      if (!g) return { ok:false, msg:'分组不存在' };
      if (list.some(x => x.name === name && x.id !== o.id)) return { ok:false, msg:'已存在同名分组' };
      g.name = name;
      if (o.note !== undefined) g.note = String(o.note || '').trim();
    } else {
      if (list.some(x => x.name === name)) return { ok:false, msg:'已存在同名分组' };
      g = { id:uniqueId(list, slugify(name)), name:name, lead:null, members:[], note:String(o.note || '').trim() };
      list.push(g);
    }
    save(); addLog(currentUser().name, (o.id ? '编辑' : '新增') + '分组', name);
    return { ok:true, group:g };
  }
  function removeGroup(id) {
    if (!can('taskConfig')) return { ok:false, msg:'没有配置权限' };
    const list = state.groups || [];
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return { ok:false, msg:'分组不存在' };
    const used = state.people.filter(p => p.group === id).length;
    if (used) return { ok:false, msg:'仍有 ' + used + ' 人属于该分组，先在「人员」页把他们转走' };
    const name = list[i].name;
    list.splice(i, 1); save();
    addLog(currentUser().name, '删除分组', name);
    return { ok:true };
  }
  function moveGroup(id, dir) {
    if (!can('taskConfig') || !moveIn(state.groups || [], id, dir)) return false;
    save(); return true;
  }

  /* --- 优先级 --- */
  function upsertPriority(o) {
    if (!can('taskConfig')) return false;
    const list = priorities();
    const t = String(o.t == null ? '' : o.t).trim();
    if (!t) return false;
    const f = o.id ? list.find(p => p.id === o.id) : null;
    if (f) f.t = t;
    else list.push({ id:uniqueId(list, slugify(t)), t:t, c:'' });
    save(); return true;
  }
  function removePriority(id) {
    if (!can('taskConfig')) return false;
    const list = priorities();
    if (list.length <= 1) return false;
    const i = list.findIndex(p => p.id === id);
    if (i < 0) return false;
    list.splice(i, 1); save(); return true;
  }
  function movePriority(id, dir) {
    if (!can('taskConfig') || !moveIn(priorities(), id, dir)) return false;
    save(); return true;
  }

  /* --- 内容流分类 --- */
  function upsertNewsCat(name, oldName) {
    if (!can('taskConfig')) return false;
    const list = newsCats();
    const nm = String(name == null ? '' : name).trim();
    if (!nm) return false;
    if (oldName) {
      const i = list.indexOf(oldName);
      if (i < 0) return false;
      list[i] = nm;
    } else {
      if (list.indexOf(nm) >= 0) return false;
      list.push(nm);
    }
    save(); return true;
  }
  function removeNewsCat(name) {
    if (!can('taskConfig')) return false;
    const list = newsCats();
    const i = list.indexOf(name);
    if (i < 0) return false;
    list.splice(i, 1); save(); return true;
  }
  function moveNewsCat(name, dir) {
    if (!can('taskConfig')) return false;
    const list = newsCats();
    const i = list.indexOf(name);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return false;
    const t = list[i]; list[i] = list[j]; list[j] = t;
    save(); return true;
  }

  /* ============================================================
     管理 CRUD（v1.17）
     「设置」页里**每一块都真的能改**，而且能力可按角色配置：
       人员增删改 · 角色与权限矩阵 · 催办话术模板 · 采购（资金）录入。
     默认（seed 的 caps）所有内部身份都可编辑 —— 想收回就把对应 caps 关掉。
     每个写操作都会问 can(...)，并落一条操作日志。
     ============================================================ */

  /* --- 人员 --- */
  const ROLE_IDS = () => roles().map(r => r.id);
  const newPersonId = () => uniqueId(state.people, 'p' + Date.now().toString(36).slice(-4));
  function nextDemoPhone() {
    let n = 13800000100;
    const used = state.people.map(x => x.phone).filter(Boolean).map(String);
    while (used.indexOf(String(n)) >= 0) n++;
    return String(n);
  }
  /* 人员的组归属变了，同步刷新 groups[].members（组的唯一来源是人员自己） */
  function syncGroups() {
    (state.groups || []).forEach(g => {
      g.members = state.people.filter(p => p.group === g.id && p.type === 'internal').map(p => p.id);
    });
  }
  function upsertPerson(o) {
    if (!can('personManage')) return { ok:false, msg:'没有人员管理权限' };
    const name = String(o.name == null ? '' : o.name).trim();
    if (!name) return { ok:false, msg:'请填写姓名' };
    const role = ROLE_IDS().indexOf(o.role) >= 0 ? o.role : 'member';
    const isClient = role === 'client';
    const group = o.group || null;
    if (o.id) {
      const p = person(o.id);
      if (!p) return { ok:false, msg:'人员不存在' };
      p.name = name;
      p.en = String(o.en || '').trim();
      p.role = role;
      p.type = isClient ? 'client' : 'internal';
      p.title = String(o.title || '').trim() || roleDef(role).name;
      p.group = group;
      p.mainPipe = o.mainPipe || null;
      p.unitPrice = Number(o.unitPrice) || 0;
      if (isClient) delete p.phone;
      else if (String(o.phone || '').trim()) p.phone = String(o.phone).trim();
      if (typeof o.active === 'boolean') p.active = o.active;
      if (o.dailySubmit === false) p.dailySubmit = false;
      else if (o.dailySubmit === true) delete p.dailySubmit;
      syncGroups(); save();
      addLog(currentUser().name, '编辑人员', p.name + ' · ' + roleDef(p.role).name);
      return { ok:true, person:p };
    }
    const p = { id:newPersonId(), name:name, en:String(o.en || '').trim(),
      type:isClient ? 'client' : 'internal', role:role, group:group,
      title:String(o.title || '').trim() || roleDef(role).name,
      mainPipe:o.mainPipe || null, unitPrice:Number(o.unitPrice) || 0, active:o.active !== false };
    if (!isClient) p.phone = String(o.phone || '').trim() || nextDemoPhone();
    if (o.dailySubmit === false) p.dailySubmit = false;
    state.people.push(p);
    syncGroups(); save();
    addLog(currentUser().name, '新增人员', p.name + ' · ' + roleDef(role).name);
    return { ok:true, person:p };
  }
  function removePerson(id) {
    if (!can('personManage')) return { ok:false, msg:'没有人员管理权限' };
    const p = person(id);
    if (!p) return { ok:false, msg:'人员不存在' };
    if (id === currentUser().id) return { ok:false, msg:'不能删除当前登录的身份' };
    state.people = state.people.filter(x => x.id !== id);
    syncGroups(); save();
    addLog(currentUser().name, '删除人员', p.name);
    return { ok:true };
  }
  function setPersonActive(id, active) {
    if (!can('personManage')) return { ok:false, msg:'没有人员管理权限' };
    const p = person(id);
    if (!p) return { ok:false, msg:'人员不存在' };
    p.active = !!active; save();
    addLog(currentUser().name, active ? '恢复人员' : '停用人员', p.name);
    return { ok:true };
  }

  /* --- 角色与权限 --- */
  function upsertRole(o) {
    if (!can('roleManage')) return { ok:false, msg:'没有角色管理权限' };
    const name = String(o.name == null ? '' : o.name).trim();
    if (!name) return { ok:false, msg:'请填写角色名称' };
    const list = roles();
    if (o.id) {
      const r = list.find(x => x.id === o.id);
      if (!r) return { ok:false, msg:'角色不存在' };
      r.name = name;
      if (o.level != null) r.level = Number(o.level) || r.level;
      ['admin','submitDaily','taskSubmit','taskManage'].forEach(k => {
        if (typeof o[k] === 'boolean') r[k] = o[k];
      });
      save(); addLog(currentUser().name, '编辑角色', r.name);
      return { ok:true, role:r };
    }
    const r = { id:uniqueId(list, slugify(name).slice(0, 12) || 'role'), name:name,
      level:Number(o.level) || 2, admin:!!o.admin, submitDaily:!!o.submitDaily,
      taskSubmit:!!o.taskSubmit, taskManage:!!o.taskManage,
      caps:Object.assign({}, o.caps || {}),
      news:{ post:true, announce:!!o.admin, pin:!!o.admin, review:!!o.admin,
             cats:['新闻','活动','分享','学习'] },
      scopes:o.scopes || ['能力见「角色与权限」矩阵'] };
    list.push(r); save();
    addLog(currentUser().name, '新增角色', r.name);
    return { ok:true, role:r };
  }
  function removeRole(id) {
    if (!can('roleManage')) return { ok:false, msg:'没有角色管理权限' };
    const r = roles().find(x => x.id === id);
    if (!r) return { ok:false, msg:'角色不存在' };
    const used = state.people.filter(p => p.role === id);
    if (used.length) return { ok:false, msg:'还有 ' + used.length + ' 人属于该角色，先把他们改成别的角色' };
    if (id === currentUser().role) return { ok:false, msg:'不能删除当前身份所在的角色' };
    const list = roles();
    list.splice(list.findIndex(x => x.id === id), 1); save();
    addLog(currentUser().name, '删除角色', r.name);
    return { ok:true };
  }
  /* 能力矩阵：勾选即改 roles[].caps —— 页面只看 can(...)，所以立刻全站生效 */
  function setRoleCap(roleId, key, val) {
    if (!can('roleManage')) return { ok:false, msg:'没有角色管理权限' };
    const r = roles().find(x => x.id === roleId);
    if (!r) return { ok:false, msg:'角色不存在' };
    const patch = {}; patch[key] = !!val;
    r.caps = Object.assign({}, r.caps || {}, patch);
    save();
    addLog(currentUser().name, '改角色权限', r.name + ' · ' + key + ' → ' + (val ? '允许' : '禁止'));
    return { ok:true };
  }
  function setRoleFlag(roleId, key, val) {
    if (!can('roleManage')) return { ok:false, msg:'没有角色管理权限' };
    const r = roles().find(x => x.id === roleId);
    if (!r) return { ok:false, msg:'角色不存在' };
    if (['admin','submitDaily','taskSubmit','taskManage'].indexOf(key) < 0) return { ok:false, msg:'不支持的字段' };
    r[key] = !!val; save();
    addLog(currentUser().name, '改角色字段', r.name + ' · ' + key + '=' + (val ? '是' : '否'));
    return { ok:true };
  }
  /* 内容流权限：发内容 / 发公告 / 置顶 / 审核实习生内容 */
  function setRoleNews(roleId, key, val) {
    if (!can('roleManage')) return { ok:false, msg:'没有角色管理权限' };
    const r = roles().find(x => x.id === roleId);
    if (!r) return { ok:false, msg:'角色不存在' };
    if (['post','announce','pin','review'].indexOf(key) < 0) return { ok:false, msg:'不支持的字段' };
    if (r.news === false) r.news = { post:false, announce:false, pin:false, review:false, cats:[] };
    r.news = Object.assign({ post:false, announce:false, pin:false, review:false,
      cats:['新闻','活动','分享','学习'] }, r.news || {});
    r.news[key] = !!val; save();
    addLog(currentUser().name, '改内容流权限', r.name + ' · ' + key + '=' + (val ? '是' : '否'));
    return { ok:true };
  }

  /* --- 催办话术模板 --- */
  const tplList = () => state.remindTemplates || (state.remindTemplates = remindTemplates().map(t => Object.assign({}, t)));
  function upsertRemindTpl(o) {
    if (!can('remind')) return { ok:false, msg:'没有催办权限' };
    const text = String(o.text == null ? '' : o.text).trim();
    if (!text) return { ok:false, msg:'请填写话术内容' };
    const list = tplList();
    const name = String(o.name || '').trim() || '未命名话术';
    if (o.id) {
      const t = list.find(x => x.id === o.id);
      if (!t) return { ok:false, msg:'话术不存在' };
      t.name = name; t.text = text;
      if (o.when != null) t.when = String(o.when).trim();
      if (o.kind) t.kind = o.kind;
      save(); addLog(currentUser().name, '编辑催办话术', t.name);
      return { ok:true };
    }
    list.push({ id:uniqueId(list, 'tpl-' + Date.now().toString(36).slice(-4)), name:name,
      when:String(o.when || '手动使用').trim() || '手动使用', kind:o.kind || 'daily', text:text });
    save(); addLog(currentUser().name, '新增催办话术', name);
    return { ok:true };
  }
  function removeRemindTpl(id) {
    if (!can('remind')) return { ok:false, msg:'没有催办权限' };
    const list = tplList();
    if (list.length <= 1) return { ok:false, msg:'至少保留一条话术' };
    const i = list.findIndex(t => t.id === id);
    if (i < 0) return { ok:false, msg:'话术不存在' };
    list.splice(i, 1); save();
    addLog(currentUser().name, '删除催办话术', id);
    return { ok:true };
  }
  function moveRemindTpl(id, dir) {
    if (!can('remind') || !moveIn(tplList(), id, dir)) return false;
    save(); return true;
  }

  /* --- 采购（资金）：落在日报的「资产采购」管线条目上，金额以分存储 ---
     附件（v1.22b）：atts = [{ name, size, type, data }]，data 是 dataURL。
     纯新增字段，读取端一律 (e.atts || []) 兜底，不需要迁移缓存。 */
  const ATTN_MAX = 3;            // 每笔最多 3 个附件
  const ATT_BYTES_MAX = 10 * 1024 * 1024; // 单文件 ≤10MB（用户口径 2026-10-15）

  function addPurchase(o) {
    if (!can('finance')) return { ok:false, msg:'没有资金 / 采购权限' };
    const pid = o.personId || currentUser().id;
    const p = person(pid);
    if (!p) return { ok:false, msg:'采购人不存在' };
    const date = o.date || today();
    const fen = Math.round(Number(o.amountFen) || 0);
    if (!fen) return { ok:false, msg:'请填写采购金额' };
    const atts = (Array.isArray(o.atts) ? o.atts : []).slice(0, ATTN_MAX).map(a => ({
      name:String(a.name || '附件').slice(0, 80),
      size:Number(a.size) || 0,
      type:String(a.type || ''),
      data:String(a.data || '')
    })).filter(a => a.data && a.data.startsWith('data:'));
    if (o.atts && o.atts.length > ATTN_MAX) return { ok:false, msg:'一笔采购最多 ' + ATTN_MAX + ' 个附件' };
    if (atts.some(a => (a.size && a.size > ATT_BYTES_MAX) || a.data.length > Math.ceil(ATT_BYTES_MAX * 4 / 3) + 128))
      return { ok:false, msg:'单个附件不能超过 10MB' };
    const at = date + 'T' + (timeOf(now()) || '18:30');
    let rep = getReport(pid, date);
    if (!rep) {
      rep = { id:newId('r'), personId:pid, date:date, status:'submitted', submittedAt:at, entries:[] };
      state.reports.push(rep);
    }
    rep.entries = rep.entries || [];
    rep.entries.push({ pipeline:'asset', task:String(o.task || '采购').trim() || '采购',
      progress:'done', reason:'', otHours:null, links:[],
      note:String(o.note || '').trim(),
      metrics:{ purchased:Number(o.purchased) || 1, amountFen:fen },
      atts:atts });
    if (rep.status !== 'submitted') { rep.status = 'submitted'; rep.submittedAt = at; }
    save();
    addLog(currentUser().name, '记一笔采购', p.name + ' · ' + (o.task || '采购') + ' · ¥' + (fen / 100).toFixed(2) +
      (atts.length ? '（含 ' + atts.length + ' 个附件）' : ''));
    return { ok:true, date:date, personId:pid };
  }
  function removePurchase(date, personId, entryRef) {
    if (!can('finance')) return { ok:false, msg:'没有资金 / 采购权限' };
    const rep = getReport(personId, date);
    if (!rep || !rep.entries) return { ok:false, msg:'找不到该记录' };
    const i = rep.entries.indexOf(entryRef);
    if (i < 0) return { ok:false, msg:'找不到该记录' };
    rep.entries.splice(i, 1); save();
    const p = person(personId);
    addLog(currentUser().name, '删除采购记录', (p ? p.name : personId) + ' · ' + date);
    return { ok:true };
  }

  return {
    // 生命周期
    load, save, reset, didRebuild, seedVersion, get state(){ return state; },
    // 日期
    D, S, addDays, weekdayCN, fmtCN, fmtShort, weekStart, timeOf, fmtAt,
    isWorkday, prevWorkday, nextWorkday, workdaysInRange,
    // 基础
    people, person, members, submitters, pendingPeople, clientPeople, pipelines, pipeline, projects, priorities,
    roles, roleDef, roleName, can, isAdminRole, groups, groupOf,
    /* 能力（v1.17）：能力清单 + 按角色读取 —— 页面用 can(...)，管理页用 caps() 画矩阵 */
    caps, capList: caps, capOf, myCap,
    /* 管理 CRUD（v1.17）：人员 / 角色 / 催办话术 / 采购 */
    upsertPerson, removePerson, setPersonActive, syncGroups,
    upsertRole, removeRole, setRoleCap, setRoleFlag, setRoleNews,
    remindTemplates, remindTpl, renderTpl,
    upsertRemindTpl, removeRemindTpl, moveRemindTpl,
    addPurchase, removePurchase,
    currentUser, setUser, isPrivileged, isLoggedIn, login, logout, finishLogin,
    /* 登录页扩展（原型）：手机验证码 / 微信扫码 / 演示身份 */
    normalizePhone, isPhone, personByPhone, maskPhone, demoSmsCode, sendCode, loginByPhone, loginByWechat, loginPicks, registerByPhone,
    // 周报
    weekReportsAll, getWeekReport, upsertWeekReport, weekReportStatus, weekReportSummary,
    weekPlan, saveWeekPlan, weekReportText,
    // 报表
    getReport, reportsOn, reportsInRange, upsertReport, removeReport, newId,
    submission, weekSubmission, allWeeks, weekDigest,
    capacityWeek, costStats,
    groupText, reportVersions, tomorrowOf, isClientLink, scanLeak, LEAK_RULES,
    briefData,
    addReminder, remindersOn, reminderText, reminderBulkText, addLog, nowISO, clientData, money, sum,
    kbSpaces, kbSpace, kbNodes, kbNode, kbChildren, kbSpaceCount,
    kbUpsert, kbCreate, kbCreateSpace, kbFolders, kbStar, kbDocByTitle, kbSearch, kbAutoWeekly,
    kbAnnos, kbAnnoAdd, kbAnnoReply, kbAnnoResolve, kbAnnoDelete,
    // 内容流（FR-37）
    newsRaw, newsItem, newsCats, newsTone, newsAuthor, isIntern, newsFeed, newsPage,
    newsStats, newsFilterCounts, myCats, canPostCat, newsPublishStatus, newsReviewOn,
    upsertNews, removeNews, newsLike, newsComment, newsPin, newsApprove, newsReject,
    newsShareToKb, mentionMe, pendingNews, get NEWS_CATS() { return newsCats(); }, NEWS_TONE, NEWS_PAGE,
    // 工作台（FR-36）
    myStreak, myRecentReports, submissionTrend, dashStats, kbRecent, kbStarred, kbTemplates,
    pendingTodo, projectProgress, prefsDash, setPrefsDash, resetPrefsDash,
    // 每日任务（FR-38）
    now, setNow, today, TASKS, taskOf, taskDeadline, taskRemindAt, taskClock, taskCountdownText,
    taskState, taskSubmission, taskStreak, taskTrend, taskStats, overtimeStats, taskStatsScope,
    taskVisibility, taskVisText, setTaskVisibility, canSeeTask, taskBoardRows,
    taskMissingPeople, taskLatePeople, taskCfg,
    upsertTask, newTask, submitTask, requestTaskEdit, grantTaskEdit, revokeTaskEdit, PROG_TEXT,
    taskFromPrev, taskCopyPrev, taskApplyTemplate, taskFromDailyPlan, taskToDailyEntries,
    TASK_STATE_META, TASK_SOURCE, TASK_VIS, TASK_TEMPLATES,
    get TASK_PRIORITY() { return priorities(); },
    // 下拉项（枚举）管理（v1.16）
    upsertPipeline, removePipeline, movePipeline,
    upsertGroup, removeGroup, moveGroup,
    upsertPriority, removePriority, movePriority,
    upsertNewsCat, removeNewsCat, moveNewsCat,
    taskPriority, taskPriorityText, taskSourceText
  };
})();
