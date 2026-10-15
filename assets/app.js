/* ============================================================
   阿莱夫日报系统 · 应用外壳与路由
   ============================================================ */
(function () {
  const E = UI.esc, $ = UI.$, $$ = UI.$$;

  /* 侧栏结构。
     两个可见性开关：
       priv:true → 仅最高权限（老板 / PM / TA Leader）可见，如未交名单、管理
       self:true → 仅本人填报者（老师 / 实习生）可见，如日报填报、我的日报、我的周报
     最高权限不填报，所以看不到任何 self 入口，只留看板与汇总。
     v1.15：新增「每日任务」组（今日任务 / 任务看板）与「任务与提交统计」。 */
  const NAV = [
    { group:'总览', items:[
      { id:'workbench', label:'工作台' }
    ]},
    { group:'每日任务', items:[
      { id:'task',      label:'今日任务', self:true },
      { id:'taskboard', label:'任务看板' }
    ]},
    { group:'日报', items:[
      { id:'fill',    label:'日报填报', self:true },
      { id:'mine',    label:'我的日报', self:true },
      { id:'board',   label:'日报看板' },
      { id:'missing', label:'未交名单', badge:'missing' }
    ]},
    { group:'周报', items:[
      { id:'weekly',    label:'我的周报', self:true },
      { id:'weekboard', label:'周报汇总 · 本周任务' },
      { id:'frisum',    label:'周五任务汇总' }
    ]},
    { group:'知识', items:[
      { id:'kb',   label:'知识库' },
      { id:'news', label:'NEWS · AI 资讯' }
    ]},
    { group:'数据', items:[
      { id:'taskstats', label:'任务与提交统计' },
      { id:'capacity',  label:'产能' },
      { id:'stats',     label:'成本与支出' }
    ]},
    { group:'管理', items:[
      { id:'admin', label:'管理' }
    ]}
  ];

  /* 某人能不能进这个路由（侧栏过滤与深链守卫共用同一份判断）
     v1.17：**页面按人一致** —— TA Leader / TA / 美术 / 实习生看到的是同一套页面
     （都能进日报填报、任务、未交名单、设置）；差别只在「能改什么」，
     由 Store.can(...) 与「角色与权限」矩阵决定，不再用侧栏藏页面。
     统计口径不受影响：提交率分母始终只认「角色要求交日报的人」（见 Store.submitters）。 */
  function navVisible(it, priv) {
    // v1.22：「待分配」角色注册后只看工作台，等管理员派角色后再展开
    if (Store.currentUser().role === 'pending') return it.id === 'workbench';
    // v1.22a：修复 —— self 入口（日报填报 / 我的日报 / 我的周报 / 今日任务）
    // 只给真正要填报的人：不填报的老板 / PM 从侧栏看不到，深链也会被弹回工作台
    if (it.self) return it.id === 'task' ? Store.can('taskSubmit') : Store.can('submit');
    // v1.21a：「周五任务汇总」只给 PM 用（收拢日报内容做周会材料是 PM 的活）
    if (it.id === 'frisum') return Store.currentUser().role === 'pm';
    return true;
  }
  function routeAllowed(r) {
    const priv = Store.isPrivileged();
    return NAV.some(g => g.items.some(it => it.id === r && navVisible(it, priv)));
  }
  // 落地页：**全员都是工作台**（v1.13 起）—— 同一张页面按角色换卡片形态，
  // 老师 / 实习生看到「我写日报」的形态，最高权限看到「团队提交状态 + 待催办」的形态。
  function defaultRoute() { return 'workbench'; }

  function currentRoute() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    if (window.Views[h] && routeAllowed(h)) return h;
    return defaultRoute();
  }

  /* ---------------- 侧栏 ---------------- */
  function renderSidebar() {
    const u = Store.currentUser();
    const priv = Store.isPrivileged();
    const missN = Store.submission(window.SEED.demoDate).missingN;

    const nav = NAV.map(g => {
      const items = g.items.filter(it => navVisible(it, priv)).map(it => {
        const active = currentRoute() === it.id ? ' active' : '';
        let badge = '';
        if (it.badge === 'missing') {
          badge = '<span class="n-badge' + (missN ? '' : ' zero') + '">' + missN + '</span>';
        }
        return '<button class="nav-item' + active + '" data-route="' + it.id + '">' + E(it.label) + badge + '</button>';
      }).join('');
      if (!items) return '';
      return '<div class="nav-group"><div class="nav-group-label">' + E(g.group) + '</div>' + items + '</div>';
    }).join('');

    $('#sidebar').innerHTML =
      '<div class="brand">' + UI.brandMark() +
        '<div class="brand-txt"><strong>阿莱夫日报</strong><span>ALAIFU DAILY</span></div></div>' +
      '<nav class="nav">' + nav + '</nav>' +
      '<div class="side-user" id="sideUser"></div>';

    $$('[data-route]', $('#sidebar')).forEach(b => b.onclick = () => go(b.dataset.route));
    renderUserChip();
  }

  function renderUserChip(openMenu) {
    const u = Store.currentUser();
    const lv = Store.roleDef(u.role).level;
    const lvLabel = u.role === 'pending' ? '待分配'
      : (u.type === 'client' ? '客户侧' : (lv >= 3 ? '最高权限' : (lv === 2 ? '内部成员' : '内部成员')));
    $('#sideUser').innerHTML =
      '<button class="user-chip" id="userChip">' +
        '<span class="avatar' + (lv >= 3 ? ' admin' : '') + '">' + E(u.name.slice(0, 1)) + '</span>' +
        '<span><span class="u-name">' + E(u.name) + '</span>' +
          '<span class="u-role">' + E(Store.roleName(u.role)) + ' · ' + lvLabel + '</span></span>' +
        '<span class="spacer"></span><span class="muted tiny">⇅</span></button>' +
      (openMenu ? menuHTML(u) : '');

    $('#userChip').onclick = ev => { ev.stopPropagation(); renderUserChip(!openMenu); };
    if (openMenu) {
      $$('[data-user]', $('#sideUser')).forEach(b => b.onclick = ev => {
        ev.stopPropagation();
        Store.setUser(b.dataset.user);
        renderUserChip(false);
        render();
        const nu = Store.currentUser();
        UI.toast('已切换到 ' + nu.name + ' · ' + Store.roleName(nu.role), 'ok');
      });
      const lo = $('[data-logout]', $('#sideUser'));
      if (lo) lo.onclick = ev => {
        ev.stopPropagation();
        renderUserChip(false);
        Store.logout();
        showLogin();
      };
      setTimeout(() => document.addEventListener('click', closeOnce, { once:true }), 0);
    }
  }
  function closeOnce() { renderUserChip(false); }

  function menuHTML(u) {
    // 按权限级别分组：最高权限（老板 / PM / TA Leader）→ 内部成员（老师 / 实习生）
    const group = (label, list) => list.length ? '<div class="nav-group-label" style="padding:6px 8px 4px">' + label + '</div>' +
      list.map(x => '<button data-user="' + x.id + '">' +
        '<span class="avatar' + (Store.roleDef(x.role).level >= 3 ? ' admin' : '') + '" style="width:22px;height:22px;font-size:10.5px">' +
        E(x.name.slice(0, 1)) + '</span><span style="font-size:13px">' + E(x.name) + '</span>' +
        '<span class="tiny muted" style="margin-left:6px">' + E(Store.roleName(x.role)) + '</span>' +
        (x.id === u.id ? '<span class="spacer"></span><span class="tiny muted">当前</span>' : '') + '</button>').join('') + '<div class="men-sep"></div>' : '';
    const admin = Store.people().filter(p => p.type === 'internal' && Store.roleDef(p.role).admin);
    const staff = Store.people().filter(p => p.type === 'internal' && !Store.roleDef(p.role).admin);
    return '<div class="user-menu">' +
      group('最高权限 · 老板 / PM / TA Leader', admin) +
      group('内部成员 · TA 老师 / 实习生', staff) +
      '<button data-logout><span class="avatar" style="width:22px;height:22px;font-size:10px">⏻</span>' +
      '<span style="font-size:13px">退出登录</span></button></div>';
  }

  /* ---------------- 顶栏与内容 ----------------
     顶栏全局固定：左「页面标题 + 副标题」· 中「全局搜索（⌘K）」· 右「＋新建 / 系统日期 / 当前身份」。 */
  function renderTopbar(view) {
    const u = Store.currentUser();
    const lv = Store.roleDef(u.role).level;
    const canSubmit = Store.can('submit');
    const canPost = Store.can('newsPost');
    $('#topbar').innerHTML =
      '<div><div class="t-title">' + E(view ? view.title : '') + '</div>' +
        (view && view.sub ? '<div class="t-sub">' + E(view.sub) + '</div>' : '') + '</div>' +
      '<button class="gsearch" id="gsBtn" aria-label="全局搜索，快捷键 Command 加 K">' +
        '<span class="gs-ico" aria-hidden="true">⌕</span>' +
        '<span class="gs-ph">搜索日报条目 / 知识库 / 内容流</span>' +
        '<span class="kbd">⌘K</span></button>' +
      '<div class="t-right">' +
        (canSubmit || canPost ? '<div class="newwrap">' +
          '<button class="btn primary sm" id="newBtn" aria-haspopup="menu" aria-expanded="false">＋ 新建 ▾</button>' +
          '<div class="newmenu" id="newMenu" hidden>' +
            (canSubmit ? '<button data-new="fill">写日报<span class="tiny muted">今天的日报</span></button>' : '') +
            (canPost ? '<button data-new="compose">发一条内容<span class="tiny muted">公告 / 新闻 / 活动 / 分享 / 学习</span></button>' : '') +
            '<button data-new="kb">新建知识库文档<span class="tiny muted">规则、口径、会议纪要</span></button>' +
          '</div></div>' : '') +
        '<span class="badge line">系统日期 ' + Store.fmtCN(window.SEED.today) + '</span>' +
        '<span class="badge ' + (lv >= 3 ? 'accent' : '') + '">' +
          '<span class="dot"></span>' + E(u.name) + ' · ' + E(Store.roleName(u.role)) + '</span>' +
      '</div>';

    const gs = $('#gsBtn');
    if (gs) gs.onclick = openSearch;
    const nb = $('#newBtn');
    if (nb) {
      const menu = $('#newMenu');
      nb.onclick = ev => {
        ev.stopPropagation();
        const open = menu.hidden;
        menu.hidden = !open;
        nb.setAttribute('aria-expanded', String(open));
        if (open) setTimeout(() => document.addEventListener('click', () => {
          menu.hidden = true; nb.setAttribute('aria-expanded', 'false');
        }, { once:true }), 0);
      };
      $$('[data-new]', menu).forEach(b => b.onclick = () => {
        menu.hidden = true;
        nb.setAttribute('aria-expanded', 'false');
        const k = b.dataset.new;
        if (k === 'fill') return go('fill');
        if (k === 'kb') { UI.toast('已打开知识库 —— 右上角「新建文档」', 'ok'); return go('kb'); }
        if (k === 'compose') {
          if (window.AlefWorkbench && window.AlefWorkbench.compose) return window.AlefWorkbench.compose();
          UI.toast('请先回到工作台再发布内容', 'warn');
        }
      });
    }
  }

  /* ---------------- 全局搜索（⌘K） ----------------
     三组结果：内容流 / 知识库文档 / 日报条目。输入 200ms 防抖，点结果直达。
     没有结果时给一个「去知识库搜索」的兜底入口。 */
  let gsHits = [];
  function searchAll(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return { hits:[], empty:true };
    const uid = Store.currentUser().id, priv = Store.isPrivileged();
    const hits = [];
    const has = t => String(t || '').toLowerCase().indexOf(s) >= 0;

    Store.newsFeed().slice(0, 200).forEach(n => {
      if (has(n.title) || has(n.body)) {
        const a = Store.newsAuthor(n);
        hits.push({ group:'内容流', title:n.title, sub:a.name + ' · ' + n.category + ' · ' + Store.fmtAt(n.at),
          kind:'news', id:n.id });
      }
    });
    Store.kbSearch(q).slice(0, 6).forEach(r => hits.push({
      group:'知识库', title:r.node.title, sub:r.inTitle ? '标题命中' : ('正文命中：' + r.snippet + '…'),
      kind:'kb', id:r.node.id }));
    Store.state.reports.filter(r => priv || r.personId === uid).forEach(r => {
      (r.entries || []).forEach(e => {
        if (has(e.task)) hits.push({
          group:'日报条目', title:(e.task || '').slice(0, 46),
          sub:(Store.person(r.personId) || {}).name + ' · ' + Store.fmtShort(r.date) + ' · ' + Store.pipeline(e.pipeline).short,
          kind:'report', id:r.personId + '|' + r.date });
      });
    });
    return { hits:hits.slice(0, 14), empty:false };
  }

  function searchResultsHTML(q) {
    const r = searchAll(q);
    if (r.empty) return '<div class="muted tiny">输入关键词开始搜索 —— 内容流、知识库文档、日报条目都会被搜到。</div>';
    if (!r.hits.length) {
      return '<div class="muted tiny">没搜到「' + E(q) + '」相关内容。' +
        '<div class="mt12"><button class="btn sm" data-gs-fallback="1">去知识库搜索</button></div></div>';
    }
    const groups = [];
    r.hits.forEach(h => { if (groups.indexOf(h.group) < 0) groups.push(h.group); });
    return groups.map(g => '<div class="gs-g">' + g + '</div>' +
      r.hits.filter(h => h.group === g).map(h => {
        const i = r.hits.indexOf(h);
        return '<button class="gs-row" data-gs="' + i + '">' +
          '<span class="gs-t">' + E(h.title) + '</span>' +
          '<span class="gs-s">' + E(h.sub) + '</span></button>';
      }).join('')).join('');
  }

  function openSearch() {
    if (!Store.isLoggedIn()) return;
    let timer = null;
    UI.modal({
      title:'全局搜索', sub:'内容流 / 知识库文档 / 日报条目 —— ⌘K 唤起，Esc 关闭',
      body:'<input class="inp" id="gsInput" autocomplete="off" placeholder="搜什么？例如「渲染」「点位」「LOD」「卡点」">' +
        '<div class="gs-results mt16" id="gsRes"></div>',
      onMount: (root, close) => {
        const inp = UI.$('#gsInput', root), box = UI.$('#gsRes', root);
        gsHits = [];
        const run = () => {
          const r = searchAll(inp.value);
          gsHits = r.hits;
          box.innerHTML = searchResultsHTML(inp.value);
          const fb = UI.$('[data-gs-fallback]', box);
          if (fb) fb.onclick = () => { close(); go('kb'); UI.toast('已打开知识库，可在右上角继续搜索', 'ok'); };
          UI.$$('[data-gs]', box).forEach(b => b.onclick = () => {
            const h = gsHits[Number(b.dataset.gs)];
            if (!h) return;
            close();
            if (h.kind === 'news') { window.AlefWorkbench.openNews(h.id); return; }
            if (h.kind === 'kb') { go('kb'); return; }
            go('board'); UI.toast('已跳到日报看板 —— 该条目属于 ' + h.sub.split(' · ')[0], 'ok');
          });
        };
        inp.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 200); };
        inp.onkeydown = e => {
          if (e.key === 'Escape') { close(); return; }
          if (e.key === 'Enter') {
            const first = UI.$('[data-gs]', box);
            if (first) first.click();
          }
        };
        run();
        setTimeout(() => inp.focus(), 30);
      }
    });
  }

  function go(route) {
    if (location.hash === '#/' + route) render(); else location.hash = '#/' + route;
  }

  function render() {
    if (!Store.isLoggedIn()) { showLogin(); return; }
    // 幂等：不管从哪条路径进来（登录成功 / 刷新 / 切身份），都确保门禁状态正确
    document.querySelector('.app').style.display = '';
    const lg = document.getElementById('login');
    if (lg) lg.hidden = true;
    const route = currentRoute();
    // 深链守卫：若地址栏指向一个当前身份看不到的页面（如最高权限停在 #/fill、切身份后遗留），
    // 就地改写成落地页，避免出现「侧栏没有高亮项、内容却渲染了」的错位
    const raw = (location.hash || '').replace(/^#\/?/, '');
    if (raw !== route && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#/' + route);
    }
    const view = window.Views[route];
    renderSidebar();
    renderTopbar(view);
    const root = $('#view');
    root.scrollTop = 0;
    // 客户侧没有账号，理论上进不来；万一 localStorage 被改成客户身份，也退回登录页
    if (Store.currentUser().type === 'client') { Store.logout(); showLogin(); return; }
    try { view.render(root); }
    catch (err) { renderCrash(root, route, err); }
  }

  /* 兜底：某一页渲染抛错时，不让用户看到整片空白（最常见的原因是本地缓存与
     当前数据结构对不上），给出出错页面与一键重建入口。 */
  function renderCrash(root, route, err) {
    const msg = (err && err.message) ? err.message : String(err);
    console.error('[阿莱夫日报] 页面渲染失败：' + route, err);
    root.innerHTML =
      '<div class="card"><div class="card-b">' +
        '<div class="sec-t">这个页面没能显示出来</div>' +
        '<p class="muted" style="line-height:1.75;margin:6px 0 12px">' +
          '页面「' + E(route) + '」渲染时出错了。最常见的原因是浏览器里存着旧版本的本地数据。' +
          '点下面的按钮会按最新版本重建演示数据（不影响其他页面）。</p>' +
        '<pre class="muted tiny" style="white-space:pre-wrap;background:var(--surface-2);' +
          'border:1px solid var(--border);border-radius:var(--r-sm);padding:9px 11px;margin:0 0 12px">' +
          E(msg) + '</pre>' +
        '<div class="row-wrap">' +
          '<button class="btn primary" id="crashFix">按最新版本重建本地数据</button>' +
          '<button class="btn" id="crashHome">回到工作台</button>' +
        '</div>' +
      '</div></div>';
    const fix = $('#crashFix', root);
    if (fix) fix.onclick = () => { Store.reset(); UI.toast('已重建本地数据', 'ok'); render(); };
    const home = $('#crashHome', root);
    if (home) home.onclick = () => go(defaultRoute());
  }

  /* ---------------- 登录门 ----------------
     未登录时整站不可见（登录层盖住 .app），登录后才进入。
     **只对内部开放**：客户侧参与人（Kelvin / 坤 / Tim）没有账号，不进这里。

     v1.16 重做（参考飞书登录页）：纯色浅灰底 + 居中白卡（400px / 圆角 8 / 内边距 40），
     默认「手机号 + 验证码」，密码登录收进 Tab，微信扫码在卡片内展开，不再同时摆多个三方按钮。

     ⚠️ 原型边界（页面文案里也写明了）：静态原型没有短信网关，也没接微信开放平台 ——
        验证码是固定演示码（SEED.demoSmsCode，页面直接显示并自动填入），
        二维码是本地绘制的占位图（不是真码、扫不出东西），「模拟扫码」只为把
        加载中 / 已扫码待确认 / 已过期 / 刷新 几个状态演示完整。
        真接后端时只换 Store.sendCode / Store.loginByPhone / 二维码轮询这三处，页面不用动。 */
  const LOGIN = {
    fails:0,          // 本次打开的连续失败次数（触发图形验证码 / 临时锁定）
    lockedUntil:0,
    capQ:null,        // 图形验证码的正确答案
    sendLeft:0, sendTimer:null,
    lockTimer:null,
    qrTimer:null, qrToken:'', lastPhone:''
  };

  function showLogin() {
    const root = document.getElementById('login');
    root.hidden = false;
    document.querySelector('.app').style.display = 'none';
    LOGIN.fails = 0; LOGIN.lockedUntil = 0; LOGIN.capQ = null;
    if (LOGIN.sendTimer) clearInterval(LOGIN.sendTimer);
    if (LOGIN.qrTimer) clearInterval(LOGIN.qrTimer);
    LOGIN.sendTimer = null; LOGIN.qrTimer = null;
    root.innerHTML = loginHTML();
    bindLogin(root);
  }

  /* 本地画一张「长得像二维码」的占位图（29×29 模块 + 三个定位角）。
     只是视觉占位，不编码任何内容 —— 真码由后端的微信开放平台返回。 */
  function qrSVG(token) {
    const N = 29, S = 4, PAD = 2, size = (N + PAD * 2) * S;
    let seed = 7;
    for (let i = 0; i < token.length; i++) seed = (seed * 31 + token.charCodeAt(i)) % 2147483647;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    const inFinder = (x, y) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
    const R = (x, y, w, h, f) => '<rect x="' + ((x + PAD) * S) + '" y="' + ((y + PAD) * S) + '" width="' + (w * S) + '" height="' + (h * S) + '" fill="' + f + '"/>';
    let cells = '';
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (inFinder(x, y)) continue;
        if (rnd() < 0.46) cells += R(x, y, 1, 1, '#1F2329');
      }
    }
    const finder = (x, y) => R(x, y, 7, 7, '#1F2329') + R(x + 1, y + 1, 5, 5, '#fff') + R(x + 2, y + 2, 3, 3, '#1F2329');
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="演示二维码">' +
      '<rect width="' + size + '" height="' + size + '" fill="#fff"/>' + cells +
      finder(0, 0) + finder(N - 7, 0) + finder(0, N - 7) + '</svg>';
  }

  function loginHTML() {
    const picks = Store.loginPicks();
    const demoRow = picks.length
      ? '<div class="lg-demo">演示环境：' +
        picks.map(p => '<button type="button" class="lg-chip" data-lg-pick="' + p.id + '" data-lg-phone="' + p.phone + '">' +
          E(p.name) + '</button>').join('') +
        '<br>密码任意 4 位 · 验证码固定 <b>' + E(Store.demoSmsCode()) + '</b></div>'
      : '';

    return '' +
    '<div class="lg-card" id="lgCard">' +
      '<div class="lg-card-in">' +
        '<div class="lg-head">' + UI.brandMark({ size:'lg' }) +
          '<div class="lg-name">团队日报系统<span>ALAIFU DAILY</span></div></div>' +
        '<h1 class="lg-h1">登录</h1>' +
        '<p class="lg-sub">使用手机号或微信登录</p>' +

        '<div class="lg-tabs" role="tablist">' +
          '<button type="button" class="lg-tab on" role="tab" data-lg-tab="code" aria-selected="true">验证码登录</button>' +
          '<button type="button" class="lg-tab" role="tab" data-lg-tab="pass" aria-selected="false">密码登录</button>' +
        '</div>' +

        '<form id="lgForm" novalidate>' +

          /* ---- 手机号 + 验证码 ---- */
          '<div data-lg-pane="code"><div class="lg-pane">' +
            '<label class="lg-lb" for="lgPhone">手机号</label>' +
            '<div class="lg-inp-box" data-lg-box="phone"><span class="lg-prefix">+86</span>' +
              '<input id="lgPhone" class="lg-inp" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="请输入手机号"></div>' +
            '<div class="lg-err" id="lgPhoneErr"></div>' +

            '<label class="lg-lb" for="lgCode">验证码</label>' +
            '<div class="lg-code">' +
              '<div class="lg-inp-box" data-lg-box="code">' +
                '<input id="lgCode" class="lg-inp" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="请输入验证码"></div>' +
              '<button type="button" class="lg-send" id="lgSend">获取验证码</button>' +
            '</div>' +
            '<div class="lg-err" id="lgCodeErr"></div>' +
            '<div class="lg-hint" id="lgHint"></div>' +

            /* 图形验证码：连续失败 3 次后才出现 */
            '<div id="lgCapWrap" hidden>' +
              '<label class="lg-lb" for="lgCap">图形验证码</label>' +
              '<div class="lg-code">' +
                '<div class="lg-inp-box" data-lg-box="cap">' +
                  '<input id="lgCap" class="lg-inp" maxlength="2" inputmode="numeric" placeholder="请输入计算结果"></div>' +
                '<button type="button" class="lg-capq" id="lgCapQ" title="看不清？点击换一题"></button>' +
              '</div>' +
              '<div class="lg-err" id="lgCapErr"></div>' +
            '</div>' +
          '</div></div>' +

          /* ---- 手机号 / 账号 + 密码 ---- */
          '<div data-lg-pane="pass" hidden><div class="lg-pane">' +
            '<label class="lg-lb" for="lgAcct">手机号 / 账号</label>' +
            '<div class="lg-inp-box" data-lg-box="acct">' +
              '<input id="lgAcct" class="lg-inp" autocomplete="username" placeholder="请输入手机号或账号"></div>' +
            '<div class="lg-err" id="lgAcctErr"></div>' +

            '<label class="lg-lb" for="lgPass">密码</label>' +
            '<div class="lg-inp-box" data-lg-box="pass">' +
              '<input id="lgPass" class="lg-inp" type="password" autocomplete="current-password" placeholder="请输入密码">' +
              '<button type="button" class="lg-eye" id="lgEye" aria-label="显示密码">显示</button></div>' +
            '<div class="lg-err" id="lgPassErr"></div>' +
            '<div class="lg-row"><span class="lg-muted">演示环境密码任意 4 位</span>' +
              '<a class="lg-link" id="lgForgot">忘记密码？</a></div>' +
          '</div></div>' +

          '<label class="lg-agree"><input type="checkbox" id="lgAgree">' +
            '<span>我已阅读并同意<a class="lg-link" data-lg-doc="terms">《用户协议》</a>和<a class="lg-link" data-lg-doc="privacy">《隐私政策》</a></span></label>' +
          '<div class="lg-err lg-err-form" id="lgErr"></div>' +

          '<button class="lg-submit" id="lgGo" type="submit"><span class="lg-spin"></span><span class="lg-submit-t">登录</span></button>' +
        '</form>' +

        '<div class="lg-div"><span>其他登录方式</span></div>' +
        '<button type="button" class="lg-wx" id="lgWxBtn">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 3C5.2 3 2 5.7 2 9c0 1.9 1.1 3.5 2.8 4.6l-.7 2.1 2.4-1.2c.8.2 1.7.4 2.6.4h.6c-.1-.5-.2-1-.2-1.5 0-3.3 3.2-6 7.1-6h.6C16.6 4.6 13.2 3 9.2 3Zm-2.5 3.4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm5 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"/>' +
          '<path d="M22 13.4c0-2.6-2.6-4.7-5.8-4.7s-5.8 2.1-5.8 4.7 2.6 4.7 5.8 4.7c.7 0 1.3-.1 1.9-.3l1.9.9-.5-1.6c1.5-.9 2.5-2.2 2.5-3.7Zm-7.7-1.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm3.9 0a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/></svg>' +
          '微信扫码登录</button>' +

        '<div class="lg-qr" id="lgQr" hidden>' +
          '<div class="lg-qr-box" id="lgQrBox"></div>' +
          '<div class="lg-qr-tip" id="lgQrTip">请使用微信扫码登录</div>' +
          '<button type="button" class="lg-link lg-qr-act" id="lgQrRefresh" hidden>二维码已过期，点击刷新</button>' +
          '<button type="button" class="lg-link lg-qr-act" id="lgQrDemo" hidden>原型演示：模拟扫码</button>' +
        '</div>' +

        /* ---- 注册（v1.22）：第一个注册的账号自动成为管理员 ---- */
        '<div class="lg-reg-toggle"><button type="button" class="lg-link" id="lgRegBtn">没有账号？注册新账号</button></div>' +
        '<div class="lg-reg" id="lgReg" hidden>' +
          '<div class="lg-reg-tip">第一个注册的账号自动成为<b>管理员</b>；之后的注册进入「待分配」，由管理员在「管理 → 人员」里分配角色。</div>' +
          '<div class="lg-pane">' +
            '<label class="lg-lb" for="rgName">姓名</label>' +
            '<div class="lg-inp-box" data-lg-box="rgname">' +
              '<input id="rgName" class="lg-inp" maxlength="12" autocomplete="name" placeholder="请输入真实姓名"></div>' +
            '<div class="lg-err" id="rgNameErr"></div>' +

            '<label class="lg-lb" for="rgPhone">手机号</label>' +
            '<div class="lg-inp-box" data-lg-box="rgphone">' +
              '<span class="lg-prefix">+86</span>' +
              '<input id="rgPhone" class="lg-inp" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="请输入手机号"></div>' +
            '<div class="lg-err" id="rgPhoneErr"></div>' +

            '<label class="lg-lb" for="rgCode">验证码</label>' +
            '<div class="lg-code">' +
              '<div class="lg-inp-box" data-lg-box="rgcode">' +
                '<input id="rgCode" class="lg-inp" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="请输入验证码"></div>' +
              '<button type="button" class="lg-send" id="rgSend">获取验证码</button>' +
            '</div>' +
            '<div class="lg-err" id="rgCodeErr"></div>' +
            '<div class="lg-hint" id="rgHint"></div>' +
            '<div class="lg-err lg-err-form" id="rgErr"></div>' +
            '<button class="lg-submit" id="rgGo" type="button"><span class="lg-spin"></span><span class="lg-submit-t">注册并登录</span></button>' +
            '<div class="lg-row"><button type="button" class="lg-link" id="rgBack">已有账号？返回登录</button></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="lg-card-f">' +
        '<a class="lg-link" data-lg-doc="privacy">隐私政策</a>' +
        '<a class="lg-link" data-lg-doc="terms">服务条款</a>' +
        '<a class="lg-link" data-lg-doc="contact">联系管理员</a>' +
      '</div>' +
    '</div>' + demoRow;
  }

  function bindLogin(root) {
    const $q = s => root.querySelector(s);
    const $all = s => Array.prototype.slice.call(root.querySelectorAll(s));
    const currentTab = () => { const b = $q('.lg-tab.on'); return b ? b.dataset.lgTab : 'code'; };
    const phoneVal = () => ($q('#lgPhone').value || '').trim();

    const setErr = (id, msg) => {
      const n = $q('#' + id);
      if (!n) return;
      n.textContent = msg || '';
      n.classList.toggle('on', !!msg);
    };
    const markBox = (key, bad) => {
      const b = $q('[data-lg-box="' + key + '"]');
      if (b) b.classList.toggle('err', !!bad);
    };
    const clearErrs = () => {
      ['lgPhoneErr', 'lgCodeErr', 'lgAcctErr', 'lgPassErr', 'lgCapErr', 'lgErr'].forEach(i => setErr(i, ''));
      ['phone', 'code', 'acct', 'pass', 'cap'].forEach(k => markBox(k, false));
    };
    const shake = () => {
      const c = $q('#lgCard');
      if (!c) return;
      c.classList.remove('lg-shake');
      void c.offsetWidth;          // 强制重排，让同一个类能反复触发动画
      c.classList.add('lg-shake');
    };

    /* ---- Tab 切换 ---- */
    const switchTab = name => {
      $all('[data-lg-tab]').forEach(b => {
        const on = b.dataset.lgTab === name;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      $all('[data-lg-pane]').forEach(p => { p.hidden = p.dataset.lgPane !== name; });
      clearErrs();
      setTimeout(() => { const f = $q(name === 'code' ? '#lgPhone' : '#lgAcct'); if (f) f.focus(); }, 20);
    };
    $all('[data-lg-tab]').forEach(b => { b.onclick = () => switchTab(b.dataset.lgTab); });

    /* ---- 密码显示 / 隐藏 ---- */
    $q('#lgEye').onclick = () => {
      const p = $q('#lgPass');
      const show = p.type === 'password';
      p.type = show ? 'text' : 'password';
      $q('#lgEye').textContent = show ? '隐藏' : '显示';
      p.focus();
    };

    /* ---- 获取验证码（60 秒倒计时） ---- */
    $q('#lgSend').onclick = () => {
      clearErrs();
      if (navigator.onLine === false) { setErr('lgPhoneErr', '验证码发送失败，请检查网络后重试'); return; }
      const r = Store.sendCode(phoneVal());
      if (!r.ok) { setErr('lgPhoneErr', r.msg); markBox('phone', true); $q('#lgPhone').focus(); shake(); return; }
      LOGIN.lastPhone = r.phone;
      const btn = $q('#lgSend');
      LOGIN.sendLeft = 60;
      const tick = () => {
        if (LOGIN.sendLeft <= 0) {
          clearInterval(LOGIN.sendTimer); LOGIN.sendTimer = null;
          btn.disabled = false; btn.textContent = '重新获取';
          return;
        }
        btn.disabled = true;
        btn.textContent = LOGIN.sendLeft + 's 后重试';
        LOGIN.sendLeft--;
      };
      tick();
      LOGIN.sendTimer = setInterval(tick, 1000);
      const hint = $q('#lgHint');
      hint.innerHTML = '验证码已发送至 ' + E(Store.maskPhone(r.phone)) + '，' + r.minutes + ' 分钟内有效。<br>' +
        '演示环境验证码：<b>' + E(r.code) + '</b>（已自动填入）';
      hint.classList.add('on');
      const ci = $q('#lgCode');
      ci.value = r.code;
      ci.focus(); ci.select();
    };

    /* ---- 图形验证码（连续失败 3 次出现） ---- */
    const newCap = () => {
      const a = 1 + Math.floor(Math.random() * 9), b = 1 + Math.floor(Math.random() * 9);
      const plus = Math.random() < 0.5;
      LOGIN.capQ = plus ? a + b : Math.max(a, b) - Math.min(a, b);
      $q('#lgCapQ').textContent = plus ? (a + ' + ' + b + ' = ?')
                                      : (Math.max(a, b) + ' − ' + Math.min(a, b) + ' = ?');
      $q('#lgCap').value = '';
    };
    const showCap = () => {
      const w = $q('#lgCapWrap');
      if (w.hidden) { w.hidden = false; newCap(); }
    };
    $q('#lgCapQ').onclick = newCap;

    /* ---- 登录按钮：loading / 禁用 ---- */
    const busy = (on, text) => {
      const b = $q('#lgGo');
      b.classList.toggle('loading', !!on);
      b.disabled = !!on;
      b.setAttribute('aria-busy', on ? 'true' : 'false');
      $q('.lg-submit-t').textContent = text || '登录';
    };
    const lockFor = sec => {
      LOGIN.lockedUntil = Date.now() + sec * 1000;
      const b = $q('#lgGo');
      b.disabled = true;
      const tick = () => {
        const left = Math.ceil((LOGIN.lockedUntil - Date.now()) / 1000);
        if (left <= 0) {
          clearInterval(LOGIN.lockTimer);
          b.disabled = false; LOGIN.fails = 0; setErr('lgErr', '');
          return;
        }
        setErr('lgErr', '尝试次数过多，账号已临时锁定，请 ' + left + ' 秒后再试');
      };
      tick();
      LOGIN.lockTimer = setInterval(tick, 1000);
    };
    const succeed = p => {
      busy(true, '登录成功');
      LOGIN.fails = 0;
      setTimeout(() => {
        if (LOGIN.sendTimer) clearInterval(LOGIN.sendTimer);
        if (LOGIN.qrTimer) clearInterval(LOGIN.qrTimer);
        if (LOGIN.lockTimer) clearInterval(LOGIN.lockTimer);
        root.hidden = true;
        document.querySelector('.app').style.display = '';
        // render() 读的是地址栏里的 hash —— 未登录前想去的内页会在这里自动回跳
        render();
        UI.toast('欢迎，' + p.name + ' · ' + Store.roleName(p.role), 'ok');
      }, 360);
    };

    /* ---- 密码登录：手机号 / 工号 / 姓名 / 英文名都能当账号（演示便利） ---- */
    const loginByAccount = () => {
      const v = ($q('#lgAcct').value || '').trim();
      const low = v.toLowerCase();
      const p = Store.personByPhone(v) ||
        Store.people().find(x => x.id === low || x.name === v || (x.en && x.en.toLowerCase() === low));
      if (!p) return { ok:false, field:'account', msg:'账号或密码错误' };
      return Store.login(p.id, $q('#lgPass').value);
    };

    const doLogin = () => {
      clearErrs();
      if (LOGIN.lockedUntil > Date.now()) { lockFor(Math.ceil((LOGIN.lockedUntil - Date.now()) / 1000)); return; }
      if (!$q('#lgAgree').checked) {
        setErr('lgErr', '请先阅读并同意《用户协议》和《隐私政策》');
        shake();
        return;
      }
      const m = currentTab();
      if (m === 'code') {
        if (!Store.isPhone(phoneVal())) {
          setErr('lgPhoneErr', '请输入 11 位手机号'); markBox('phone', true);
          $q('#lgPhone').focus(); shake(); return;
        }
        if (!($q('#lgCode').value || '').trim()) {
          setErr('lgCodeErr', '请输入验证码'); markBox('code', true);
          $q('#lgCode').focus(); shake(); return;
        }
        if (LOGIN.capQ != null) {
          const v = ($q('#lgCap').value || '').trim();
          if (v !== String(LOGIN.capQ)) {
            setErr('lgCapErr', '图形验证码错误'); markBox('cap', true);
            newCap(); $q('#lgCap').focus(); shake(); return;
          }
        }
      } else {
        if (!($q('#lgAcct').value || '').trim()) {
          setErr('lgAcctErr', '请输入手机号或账号'); markBox('acct', true);
          $q('#lgAcct').focus(); shake(); return;
        }
        if (!($q('#lgPass').value || '').trim()) {
          setErr('lgPassErr', '请输入密码'); markBox('pass', true);
          $q('#lgPass').focus(); shake(); return;
        }
      }
      if (navigator.onLine === false) { setErr('lgErr', '网络异常，请检查网络后重试'); shake(); return; }

      busy(true, '登录中…');
      setTimeout(() => {
        const r = (m === 'code') ? Store.loginByPhone(phoneVal(), $q('#lgCode').value) : loginByAccount();
        if (r.ok) { succeed(r.person); return; }
        busy(false);
        LOGIN.fails++;
        if (LOGIN.fails >= 3) showCap();
        if (r.field === 'phone') { setErr('lgPhoneErr', r.msg); markBox('phone', true); }
        else if (r.field === 'code') { setErr('lgCodeErr', r.msg); markBox('code', true); }
        else if (r.field === 'pass') { setErr('lgPassErr', r.msg); markBox('pass', true); }
        else { setErr('lgErr', r.msg); markBox('acct', true); }
        shake();
        if (LOGIN.fails >= 6) lockFor(60);
      }, 620);
    };

    // 回车提交：form 默认行为就是提交，这里只接管它
    $q('#lgForm').onsubmit = e => { e.preventDefault(); doLogin(); };

    /* ---- 微信扫码：卡片内展开 ---- */
    const qr = $q('#lgQr');
    const loadQr = () => {
      LOGIN.qrToken = 'alef-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      const box = $q('#lgQrBox');
      box.innerHTML = '<div class="lg-qr-mask"><span class="lg-spin dark"></span><span>二维码加载中…</span></div>';
      $q('#lgQrTip').textContent = '二维码加载中…';
      $q('#lgQrRefresh').hidden = true;
      $q('#lgQrDemo').hidden = true;
      if (LOGIN.qrTimer) clearTimeout(LOGIN.qrTimer);
      LOGIN.qrTimer = setTimeout(() => {
        box.innerHTML = qrSVG(LOGIN.qrToken);
        $q('#lgQrTip').innerHTML = '请使用微信扫码登录<br><span class="lg-muted">演示二维码 · 原型未接微信开放平台</span>';
        $q('#lgQrDemo').hidden = false;
        LOGIN.qrTimer = setTimeout(() => {
          box.insertAdjacentHTML('beforeend', '<div class="lg-qr-mask"><span>二维码已过期</span></div>');
          $q('#lgQrTip').textContent = '二维码已过期，请刷新后重新扫码';
          $q('#lgQrRefresh').hidden = false;
          $q('#lgQrDemo').hidden = true;
        }, 60000);
      }, 900);
    };
    $q('#lgWxBtn').onclick = () => {
      if (!qr.hidden) { qr.hidden = true; $q('#lgWxBtn').classList.remove('on'); return; }
      qr.hidden = false;
      $q('#lgWxBtn').classList.add('on');
      loadQr();
    };
    $q('#lgQrRefresh').onclick = loadQr;
    $q('#lgQrDemo').onclick = () => {
      const box = $q('#lgQrBox');
      box.insertAdjacentHTML('beforeend',
        '<div class="lg-qr-mask" id="lgQrWait"><span>扫描成功，请在手机上确认</span>' +
        '<button type="button" class="lg-link" id="lgQrOk">（演示）确认登录</button></div>');
      $q('#lgQrTip').textContent = '已扫码 · 等待你在手机端确认…';
      $q('#lgQrDemo').hidden = true;
      $q('#lgQrOk').onclick = () => {
        const p = Store.personByPhone(LOGIN.lastPhone);
        const r = Store.loginByWechat(p && p.type === 'internal' ? p.id : 'olivia');
        if (!r.ok) { $q('#lgQrTip').textContent = r.msg; return; }
        succeed(r.person);
      };
    };

    /* ---- 注册（v1.22）：首个注册者自动成为管理员 ---- */
    const RG = { sendLeft:0, timer:null };
    const setRErr = (id, msg) => {
      const n = $q('#' + id);
      if (n) { n.textContent = msg || ''; n.classList.toggle('on', !!msg); }
    };
    const markRBox = (key, bad) => {
      const b = $q('[data-lg-box="' + key + '"]');
      if (b) b.classList.toggle('err', !!bad);
    };
    const clearRErrs = () => {
      ['rgNameErr', 'rgPhoneErr', 'rgCodeErr', 'rgErr'].forEach(i => setRErr(i, ''));
      ['rgname', 'rgphone', 'rgcode'].forEach(k => markRBox(k, false));
    };
    $q('#lgRegBtn').onclick = () => {
      const open = $q('#lgReg').hidden;
      $q('#lgReg').hidden = !open;
      qr.hidden = true; $q('#lgWxBtn').classList.remove('on');
      if (open) setTimeout(() => $q('#rgName').focus(), 30);
    };
    $q('#rgBack').onclick = () => { $q('#lgReg').hidden = true; clearRErrs(); };
    $q('#rgSend').onclick = () => {
      clearRErrs();
      if (navigator.onLine === false) { setRErr('rgPhoneErr', '验证码发送失败，请检查网络后重试'); return; }
      const r = Store.sendCode($q('#rgPhone').value);
      if (!r.ok) { setRErr('rgPhoneErr', r.msg); markRBox('rgphone', true); return; }
      const btn = $q('#rgSend');
      RG.sendLeft = 60;
      const tick = () => {
        if (RG.sendLeft <= 0) { clearInterval(RG.timer); RG.timer = null; btn.disabled = false; btn.textContent = '重新获取'; return; }
        btn.disabled = true; btn.textContent = RG.sendLeft + 's 后重试'; RG.sendLeft--;
      };
      tick(); RG.timer = setInterval(tick, 1000);
      const hint = $q('#rgHint');
      hint.innerHTML = '验证码已发送至 ' + E(Store.maskPhone(r.phone)) + '。<br>' +
        '演示环境验证码：<b>' + E(r.code) + '</b>（已自动填入）';
      hint.classList.add('on');
      const ci = $q('#rgCode');
      ci.value = r.code; ci.focus(); ci.select();
    };
    $q('#rgGo').onclick = () => {
      clearRErrs();
      const name = $q('#rgName').value, phone = $q('#rgPhone').value, code = $q('#rgCode').value;
      if (!name.trim()) { setRErr('rgNameErr', '请填写姓名'); markRBox('rgname', true); return; }
      if (!Store.isPhone(phone)) { setRErr('rgPhoneErr', '请输入 11 位手机号'); markRBox('rgphone', true); return; }
      if (!code.trim()) { setRErr('rgCodeErr', '请输入验证码'); markRBox('rgcode', true); return; }
      if (navigator.onLine === false) { setRErr('rgErr', '网络异常，请检查网络后重试'); return; }
      const btn = $q('#rgGo');
      btn.classList.add('loading'); btn.disabled = true;
      btn.querySelector('.lg-submit-t').textContent = '注册中…';
      setTimeout(() => {
        const r = Store.registerByPhone(phone, code, name);
        if (!r.ok) {
          btn.classList.remove('loading'); btn.disabled = false;
          btn.querySelector('.lg-submit-t').textContent = '注册并登录';
          if (r.field === 'phone') { setRErr('rgPhoneErr', r.msg); markRBox('rgphone', true); }
          else if (r.field === 'code') { setRErr('rgCodeErr', r.msg); markRBox('rgcode', true); }
          else { setRErr('rgNameErr', r.msg); markRBox('rgname', true); }
          return;
        }
        if (RG.timer) clearInterval(RG.timer); RG.timer = null;
        succeed(r.person);
        setTimeout(() => UI.toast(r.person.role === 'admin'
          ? '你是第一个注册的账号，已自动成为管理员'
          : '注册成功 · 当前为「待分配」，请联系管理员分配角色', 'ok'), 700);
      }, 620);
    };

    /* ---- 底部协议 / 帮助 ---- */
    const DOCS = {
      terms:   { t:'用户协议', b:'本系统仅限公司内部账号使用。所有登录与关键操作（提交、修改、导出、催办）都会记入审计日志。演示环境验证码为固定演示码，正式环境由短信下发。' },
      privacy: { t:'隐私政策', b:'日报 / 任务 / 周报数据只保存在本机浏览器（演示版）或公司内网服务器，不上传到任何第三方平台。客户侧材料只使用白名单字段，复制时另有泄漏扫描。' },
      contact: { t:'联系管理员', b:'遇到登录问题请联系 PM 王润佳（Olivia）或系统管理员；如需新增账号，请提供姓名、所属组与手机号。' }
    };
    $all('[data-lg-doc]').forEach(a => {
      a.onclick = () => { const d = DOCS[a.dataset.lgDoc]; if (d) UI.modal({ title:d.t, body:'<div class="muted" style="line-height:1.95">' + E(d.b) + '</div>' }); };
    });
    $q('#lgForgot').onclick = () => UI.modal({
      title:'忘记密码',
      body:'<div class="muted" style="line-height:1.95">切换到「验证码登录」用手机号直接进入，无需密码；' +
           '密码需要重置时，请联系管理员在后台重发初始密码。</div>'
    });

    /* ---- 演示身份快捷填入（只在原型里出现） ---- */
    $all('[data-lg-pick]').forEach(b => {
      b.onclick = () => {
        if (currentTab() !== 'code') switchTab('code');
        $q('#lgPhone').value = b.dataset.lgPhone;
        markBox('phone', false); setErr('lgPhoneErr', '');
        const f = $q('#lgSend');
        if (!f.disabled) f.click();
        else $q('#lgCode').focus();
      };
    });

    // 进入页面自动聚焦手机号（含刷新 / 退出登录后回到登录页）
    setTimeout(() => { const f = $q('#lgPhone'); if (f) f.focus(); }, 60);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    Store.load();
    UI.logoProbe();   // 探测 assets/logo.png：有就换真 logo，没有就保持「AL」字标
    window.addEventListener('hashchange', () => { if (Store.isLoggedIn()) render(); });
    // 全局搜索：⌘K / Ctrl+K 唤起（顶栏搜索框也能点）
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        if (Store.isLoggedIn()) openSearch();
      }
    });
    if (!Store.isLoggedIn()) showLogin(); else render();
    // 首次访问提示
    if (!sessionStorage.getItem('alef-tip')) {
      sessionStorage.setItem('alef-tip', '1');
      setTimeout(() => UI.toast('这是可点击原型：数据存在本地，改动会立即生效', 'ok'), 600);
    } else if (Store.didRebuild()) {
      // 版本升级：旧缓存已丢弃重建，明确告知一次，避免误以为数据丢了
      setTimeout(() => UI.toast('本地缓存来自旧版本，已按最新版本重建演示数据', 'warn'), 700);
    }
  }

  window.App = { go:go, render:render, boot:boot, search:openSearch, searchAll:searchAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
