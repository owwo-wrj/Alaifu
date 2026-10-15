/* ============================================================
   视图 · 每周与数据：产能 / 成本与支出 / 管理
   ============================================================ */
window.Views = window.Views || {};
(function () {
  const E = UI.esc, $ = UI.$, $$ = UI.$$;
  const kpi = UI.kpi, pct = UI.pct;

  /* ============================================================
     三、产能
     ============================================================ */
  let cFrom = null, cTo = null;

  function renderCapacity(root) {
    if (!cFrom) { cFrom = '2026-10-05'; cTo = '2026-10-09'; }
    const cap = Store.capacityWeek(cFrom, cTo);
    const cfg = Store.state.config;
    const ruleLabel = { pending:'待确认', collected:'采集完成即算有效', generated:'生成完成才算有效' }[cfg.effectiveSceneRule];

    root.innerHTML =
      '<div class="wrap">' +
        '<div class="note warn mb16"><span class="n-ico">!</span><div>' +
          '<b>产能不是一条漏斗，而是四段并行链路</b>：3DGS 与 AI 生成是两条独立产线，资产采购走台账口径，' +
          '「可用筛选 / 点位确认」属客户侧。硬拼成一条漏斗会得出无意义的转化率，所以这里分开呈现。</div></div>' +

        '<div class="row-wrap mb16">' +
          '<input class="inp" type="date" style="width:150px" id="cFrom" value="' + cFrom + '">' +
          '<span class="muted tiny">至</span>' +
          '<input class="inp" type="date" style="width:150px" id="cTo" value="' + cTo + '">' +
          '<div class="spacer"></div>' +
          '<span class="tiny muted">「有效场景」口径：<b>' + ruleLabel + '</b>（在管理页配置）</span>' +
        '</div>' +

        '<div class="sec-t">本周期产能（来自日报，内部）</div>' +
        '<div class="grid g2 mb20">' +
          cap.internal.map(g => '<div class="card"><div class="card-h"><h3>' + E(g.name) + '</h3>' +
            '<div class="h-right"><span class="tag">内部</span></div></div>' +
            '<div class="card-b">' + g.rows.map(r => rowBar(r, g.rows)).join('') + '</div></div>').join('') +
        '</div>' +

        '<div class="sec-t">累计与基线</div>' +
        '<div class="card mb20"><div class="card-b tight"><table class="tbl">' +
          '<thead><tr><th style="width:230px">指标</th><th class="r" style="width:120px">数值</th><th>来源 / 口径</th></tr></thead><tbody>' +
          cap.cumulative.map(r => '<tr><td>' + E(r.label) + '</td>' +
            '<td class="r">' + (r.pending ? '<span class="badge warn"><span class="dot"></span>待确认</span>'
              : '<b class="num">' + r.value.toLocaleString('zh-CN') + '</b> <span class="muted tiny">' + (r.unit || '') + '</span>') + '</td>' +
            '<td class="tiny muted">' + E(r.source || '') + '</td></tr>').join('') +
        '</tbody></table></div>' +
        '<div class="card-f"><span class="tiny muted">' + E(Store.state.baseline.note) + '</span></div></div>' +

        '<div class="sec-t">客户侧环节（客户侧人员产出，PM 代录）</div>' +
        '<div class="grid g4 mb16">' +
          cap.client.map(c => kpi(E(c.label),
            c.value == null ? '<span class="badge warn" style="font-size:12px">未回传</span>'
              : (typeof c.value === 'number' ? c.value.toLocaleString('zh-CN') : E(c.value)),
            E(c.source))).join('') +
        '</div>' +
        '<div class="note danger"><span class="n-ico">!</span><div>' +
          '这些数字<b>不属于内部成员产出</b>，不计入内部成本，也不参与内部提交率。' +
          '未回传时显示「未回传」而不是 0 —— 否则会把「没收到数据」误读成「产出为零」。</div></div>' +
      '</div>';

    $('#cFrom', root).onchange = e => { cFrom = e.target.value; renderCapacity(root); };
    $('#cTo', root).onchange = e => { cTo = e.target.value; renderCapacity(root); };
  }

  function rowBar(r, all) {
    const vals = all.map(x => x.value).filter(v => typeof v === 'number');
    const max = Math.max.apply(null, vals.concat([1]));
    const isPct = r.pct, isMoney = r.money;
    const v = r.value;
    const display = isPct ? (v == null ? '—' : pct(v))
      : isMoney ? Store.money(v)
      : (v == null ? '—' : v.toLocaleString('zh-CN') + ' ' + (r.unit || ''));
    const w = (v == null || isPct) ? 0 : Math.max(1, Math.round(v / max * 100));
    return '<div class="fn-row" style="margin-bottom:8px">' +
      '<div class="fn-name">' + E(r.label) + (r.warn ? ' <span class="badge danger" style="height:16px">需关注</span>' : '') + '</div>' +
      '<div class="fn-track"><div class="fn-fill" style="width:' + w + '%;' + (r.warn ? 'background:var(--danger);opacity:.5' : '') + '"></div></div>' +
      '<div class="fn-val">' + display + '</div></div>';
  }

  /* ============================================================
     四、成本与支出
     工时已不在日报中采集，人力成本随之取消；
     本页保留「直接生产支出」（采购金额）与单位算力成本指标。
     ============================================================ */
  let sFrom = null, sTo = null;

  function renderStats(root) {
    if (!sFrom) { sFrom = '2026-10-05'; sTo = '2026-10-09'; }
    const c = Store.costStats(sFrom, sTo);
    const canBuy = Store.can('finance');
    const cols = canBuy ? 6 : 5;

    root.innerHTML =
      '<div class="wrap-wide">' +
        '<div class="row-wrap mb16">' +
          '<input class="inp" type="date" style="width:150px" id="sFrom" value="' + sFrom + '">' +
          '<span class="muted tiny">至</span>' +
          '<input class="inp" type="date" style="width:150px" id="sTo" value="' + sTo + '">' +
          '<button class="btn ghost sm" data-preset="week">本周（10.05–10.09）</button>' +
        '</div>' +

        '<div class="grid g3 mb16">' +
          kpi('直接生产支出', Store.money(c.purchaseFen), '采购金额（'+ c.purchase.length +' 笔）', 'accent') +
          kpi('采购笔数', c.purchase.length + '<span class="u">笔</span>', '该区间内的线下采购') +
          kpi('单场景算力成本', '$' + c.unitCostUsd, '李老师实测 · 单位成本指标') +
        '</div>' +

        '<div class="note accent mb16"><span class="n-ico">i</span><div>' +
          '<b>工时已不在日报中采集</b>，因此本页不再统计人力成本。' +
          '「$' + c.unitCostUsd + '/场景」是<b>单位成本指标</b>，不是总额 —— 把它乘上场景数当作总支出会得出失真的数字。' +
          '直接生产支出 = AI / API 充值 + 云渲染 + 淘宝采购。</div></div>' +

        '<div class="card mb16"><div class="card-h"><h3>采购明细</h3>' +
          '<span class="h-sub">直接生产支出 · 淘宝线下采购 · ' + sFrom + ' ~ ' + sTo + '</span>' +
          (canBuy ? '<div class="h-right"><button class="btn primary sm" id="sAdd">+ 记一笔采购</button></div>' : '') +
          '</div>' +
          '<div class="card-b tight">' + (c.purchase.length
            ? '<table class="tbl compact"><thead><tr><th style="width:90px">日期</th><th style="width:90px">采购人</th><th>事项</th><th style="width:64px">附件</th><th class="r" style="width:90px">金额</th>' +
                (canBuy ? '<th style="width:80px"></th>' : '') + '</tr></thead><tbody>' +
              c.purchase.map((p, i) => '<tr><td class="tiny">' + Store.fmtShort(p.date) + '</td>' +
                '<td class="tiny">' + E(p.person ? p.person.name : p.personId) + '</td>' +
                '<td class="tiny">' + E(p.task) + (p.note ? '<div class="tiny muted">' + E(p.note) + '</div>' : '') + '</td>' +
                '<td>' + ((p.atts && p.atts.length)
                  ? '<a href="javascript:void(0)" class="p-att" data-patt="' + i + '">📎 ' + p.atts.length + '</a>'
                  : '<span class="tiny muted">—</span>') + '</td>' +
                '<td class="r">' + Store.money(p.amountFen) + '</td>' +
                (canBuy ? '<td class="r"><button class="btn sm" data-pdel2="' + i + '">删除</button></td>' : '') + '</tr>').join('') +
              '<tr><td colspan="' + (cols - 1) + '" class="r"><b>合计</b></td><td class="r"><b>' + Store.money(c.purchaseFen) + '</b></td>' +
                (canBuy ? '<td></td>' : '') + '</tr></tbody></table>'
            : '<div class="empty">该区间无采购记录' + (canBuy ? ' —— 点右上角「记一笔采购」补录' : '') + '</div>') + '</div>' +
          '<div class="card-f"><span class="tiny muted">采购为线下交易，不适用支付幂等 / 对账 / 资损三件套，仅保留金额精度（以分存储）与变更留痕。</span></div>' +
        '</div>' +
      '</div>';

    $('#sFrom', root).onchange = e => { sFrom = e.target.value; renderStats(root); };
    $('#sTo', root).onchange = e => { sTo = e.target.value; renderStats(root); };
    $$('[data-preset]', root).forEach(b => b.onclick = () => { sFrom = '2026-10-05'; sTo = '2026-10-09'; renderStats(root); });
    const add = $('#sAdd', root);
    if (add) add.onclick = () => openPurchaseModal(root);
    $$('.p-att', root).forEach(a => a.onclick = () => {
      const row = c.purchase[Number(a.dataset.patt)];
      if (row && row.atts && row.atts.length) openAttsViewer(row.atts, row.task);
    });
    $$('[data-pdel2]', root).forEach(b => b.onclick = () => {
      const row = c.purchase[Number(b.dataset.pdel2)];
      if (!row) return;
      if (!window.confirm('删除这笔采购记录？（' + row.task + ' ' + Store.money(row.amountFen) + '）')) return;
      const r = Store.removePurchase(row.date, row.personId, row.entry);
      if (!r.ok) return UI.toast(r.msg, 'warn');
      renderStats(root); UI.toast('已删除采购记录', 'ok');
    });
  }

  /* 附件查看（v1.22b）：点表格里的 📎 N 打开；图片出缩略图，其余给下载链接 */
  function fmtBytes(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }
  function openAttsViewer(atts, task) {
    UI.modal({
      title:'采购附件' + (task ? ' · ' + task : ''),
      sub:atts.length + ' 个附件 · 存在这笔采购的日报条目里（同源）',
      body:'<div class="att-list">' + atts.map((a, i) => {
        const isImg = /^image\//.test(a.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name);
        return '<div class="att-row">' +
          (isImg ? '<img class="att-thumb" src="' + a.data + '" alt="">' : '<div class="att-thumb att-file">📄</div>') +
          '<div class="att-meta"><div class="att-name">' + E(a.name) + '</div>' +
            '<div class="tiny muted">' + fmtBytes(a.size || 0) + '</div>' +
            '<a class="btn ghost sm" href="' + a.data + '" download="' + E(a.name) + '">下载</a></div>' +
          '</div>';
      }).join('') + '</div>',
      footer:'<button class="btn" data-close>关闭</button>'
    });
  }

  /* 采购录入（v1.17）：落在「资产采购」管线的日报条目上 —— 成本页与日报同源，不另建一张表。
     负责采买的人（刘一鸣 / 宏枢条线）不再只读；权限按角色的 finance 能力走。 */
  function openPurchaseModal(root) {
    const people = Store.people().filter(p => p.type === 'internal');
    const u = Store.currentUser();
    const defWho = (u.type === 'internal' && !Store.roleDef(u.role).admin) ? u.id
      : (people.some(p => p.id === 'liuming') ? 'liuming' : (people[0] || {}).id);
    const personOpts = people.map(p => '<option value="' + p.id + '"' +
      (p.id === defWho ? ' selected' : '') + '>' + E(p.name) + ' · ' + E(Store.roleName(p.role)) + '</option>').join('');
    UI.modal({
      title:'记一笔采购',
      sub:'直接生产支出 · 会同时出现在该采购人当天的日报里（同源，不重复录入）',
      body:'<div class="grid-2">' +
          '<div class="field"><label>日期</label><input class="inp" type="date" id="puDate" value="' + (sTo || window.SEED.demoDate) + '"></div>' +
          '<div class="field"><label>采购人</label><select class="sel" id="puWho">' + personOpts + '</select></div>' +
          '<div class="field"><label>事项</label><input class="inp" id="puTask" placeholder="如：硬盘 4TB × 2"></div>' +
          '<div class="field"><label>金额（元）</label><input class="inp" type="number" step="0.01" id="puAmt" placeholder="0.00"></div>' +
          '<div class="field"><label>数量</label><input class="inp" type="number" id="puQty" value="1"></div>' +
        '</div><div class="field mt12"><label>备注</label>' +
        '<input class="inp" id="puNote" placeholder="供应商 / 用途，可留空"></div>' +
        '<div class="field mt12"><label>附件<span class="tiny muted">（凭证 / 发票截图，最多 3 个，单个 ≤10MB）</span></label>' +
          '<input type="file" id="puAtts" multiple style="display:none">' +
          '<div class="row-wrap" style="gap:8px"><button type="button" class="btn sm" id="puAttsBtn">📎 添加附件</button>' +
          '<span class="tiny muted" id="puAttsHint">未选择</span></div>' +
          '<div id="puAttsList" class="att-list mt8"></div></div>',
      footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="puOk">保存</button>',
      onMount:function (mroot, close) {
        /* 附件（v1.22b）：FileReader 转 dataURL，随表单一起落库 */
        const attBuf = [];
        const MAXN = 3, MAXB = 10 * 1024 * 1024;
        const listEl = $('#puAttsList', mroot), hintEl = $('#puAttsHint', mroot);
        function drawAtts() {
          hintEl.textContent = attBuf.length ? '已选 ' + attBuf.length + '/' + MAXN : '未选择';
          listEl.innerHTML = attBuf.map((a, i) =>
            '<div class="att-mini"><span class="att-mini-n">📎 ' + E(a.name) + '</span>' +
            '<span class="tiny muted">' + fmtBytes(a.size) + '</span>' +
            '<button type="button" class="btn ghost sm" data-attrm="' + i + '">移除</button></div>').join('');
          $$('[data-attrm]', listEl).forEach(b => b.onclick = () => {
            attBuf.splice(Number(b.dataset.attrm), 1); drawAtts();
          });
        }
        $('#puAttsBtn', mroot).onclick = () => $('#puAtts', mroot).click();
        $('#puAtts', mroot).onchange = e => {
          const files = [].slice.call(e.target.files || []);
          e.target.value = '';
          files.forEach(f => {
            if (attBuf.length >= MAXN) return UI.toast('一笔采购最多 ' + MAXN + ' 个附件', 'warn');
            if (f.size > MAXB) return UI.toast('「' + f.name + '」超过 10MB，已跳过', 'warn');
            const rd = new FileReader();
            rd.onload = () => { attBuf.push({ name:f.name, size:f.size, type:f.type, data:String(rd.result) }); drawAtts(); };
            rd.readAsDataURL(f);
          });
        };

        $('#puOk', mroot).onclick = () => {
          const yuan = Number($('#puAmt', mroot).value) || 0;
          const r = Store.addPurchase({ date:$('#puDate', mroot).value, personId:$('#puWho', mroot).value,
            task:$('#puTask', mroot).value, purchased:$('#puQty', mroot).value,
            amountFen:Math.round(yuan * 100), note:$('#puNote', mroot).value,
            atts:attBuf.slice() });
          if (!r.ok) return UI.toast(r.msg, 'warn');
          close(); renderStats(root); UI.toast('已记入采购（同步到日报）', 'ok');
        };
      }
    });
  }

  /* ============================================================
     五、管理
     ============================================================ */
  let adminTab = 'people';

  function renderAdmin(root) {
    if (Store.currentUser().type === 'client') {
      root.innerHTML = '<div class="wrap"><div class="note warn"><span class="n-ico">!</span><div>' +
        '客户侧参与人没有账号，进不了这个页面。</div></div></div>';
      return;
    }
    const tabs = [
      ['dash','看板与提醒'], ['people','人员'], ['roles','角色与权限'], ['enums','下拉项'], ['config','口径配置'],
      ['calendar','工作日历'], ['client','客户侧数据'], ['demo','演示数据']
    ];
    let body = '';
    if (adminTab === 'dash') body = dashTab();
    else if (adminTab === 'people') body = peopleTab();
    else if (adminTab === 'roles') body = rolesTab();
    else if (adminTab === 'enums') body = enumsTab();
    else if (adminTab === 'config') body = configTab();
    else if (adminTab === 'calendar') body = calTab();
    else if (adminTab === 'client') body = clientTab();
    else body = demoTab();

    root.innerHTML =
      '<div class="wrap">' +
        '<div class="note accent mb16"><span class="n-ico">i</span><div>' +
          '原型阶段：<b>所有内部身份都能编辑这里的一切</b>（人员增删改、角色与权限、催办话术、下拉项、口径、采购）。' +
          '「角色与权限」里可以按角色逐项勾选能力 —— 取消某项后，对应身份下次进入就会看到只读态，页面无需改代码。</div></div>' +
        '<div class="row-wrap mb16">' + tabs.map(t =>
          '<button class="btn ' + (adminTab === t[0] ? 'primary' : '') + ' sm" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') +
        '</div>' + body + '</div>';

    $$('[data-tab]', root).forEach(b => b.onclick = () => { adminTab = b.dataset.tab; renderAdmin(root); });
    if (adminTab === 'dash') bindDashTab(root);
    if (adminTab === 'people') bindPeopleTab(root);
    if (adminTab === 'roles') bindRolesTab(root);
    if (adminTab === 'enums') bindEnumsTab(root);
    bindAdmin(root);
  }

  /* 每日任务 · 看板与提醒（FR-40）：可见性、截止时间、提醒节点、推送开关。
     只有管理员（老板 / PM / TA Leader）能改；改动一律写操作日志。 */
  /* 日报 · 时间与提醒（v1.18 可编辑）：汇报时点 / 截止 / 提醒 / 周报截止，与「每日任务」时间同处一页 */
  function dailyCard() {
    const cfg = Store.state.config || {};
    const wd = Number(cfg.weeklyDueDay == null ? 1 : cfg.weeklyDueDay);
    const wdOpts = ['日','一','二','三','四','五','六'].map((d, i) =>
      '<option value="' + i + '"' + (i === wd ? ' selected' : '') + '>每周' + d + '</option>').join('');
    return '<div class="card"><div class="card-h"><h3>日报 · 时间与提醒</h3>' +
        '<span class="h-sub">改动全链路生效 · 记入操作日志</span></div><div class="card-b">' +
      '<div class="grid-2">' +
        '<div class="field"><label>约定汇报时点</label>' +
          '<input class="inp" type="time" id="adRptTime" value="' + E(cfg.reportTime || '18:30') + '">' +
          '<div class="hint">每天这个点在群里汇报「当日任务 + 明日计划」。</div></div>' +
        '<div class="field"><label>提交截止时间</label>' +
          '<input class="inp" type="time" id="adDl" value="' + E(cfg.deadline || '22:00') + '">' +
          '<div class="hint">准时 / 逾期的唯一分界；到点未交进入未交名单。</div></div>' +
        '<div class="field"><label>提醒节点（截止前两次）</label>' +
          '<div class="row-wrap"><input class="inp" type="time" id="adR1" style="max-width:130px" value="' +
            E(cfg.remind1 || '18:30') + '">' +
          '<input class="inp" type="time" id="adR2" style="max-width:130px" value="' +
            E(cfg.remind2 || '21:30') + '"></div>' +
          '<div class="hint">改截止时间会自动按「前 2 小时 / 前 30 分钟」带出，可再手动调。</div></div>' +
        '<div class="field"><label>周报截止</label>' +
          '<div class="row-wrap"><select class="sel" id="adWkDay" style="max-width:130px">' + wdOpts + '</select>' +
          '<input class="inp" type="time" id="adWkDue" style="max-width:130px" value="' + E(cfg.weeklyDue || '17:00') + '"></div>' +
          '<div class="hint">「上周任务结果 + 本周目标建议」的收取截止。</div></div>' +
      '</div>' +
      '<div class="row-wrap mt16"><button class="btn primary" id="adDailySave">保存日报口径</button>' +
        '<span class="tiny muted">保存后立即影响催办话术里的 {deadline} 与看板上的倒计时</span></div>' +
      '</div></div>';
  }

  function bindDailyCard(root) {
    const dl = $('#adDl', root);
    if (dl) dl.onchange = () => {
      const m = /^(\d{2}):(\d{2})$/.exec(dl.value);
      if (!m) return;
      const t = Number(m[1]) * 60 + Number(m[2]);
      const fmt = x => { x = (x + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
      $('#adR1', root).value = fmt(t - 120);
      $('#adR2', root).value = fmt(t - 30);
    };
    const save = $('#adDailySave', root);
    if (save) save.onclick = () => {
      const c = Store.state.config;
      const get = (id, fb) => $('#' + id, root).value || fb;
      c.reportTime = get('adRptTime', '18:30');
      c.deadline   = get('adDl', '22:00');
      c.remind1    = get('adR1', '18:30');
      c.remind2    = get('adR2', '21:30');
      c.weeklyDueDay = Number($('#adWkDay', root).value);
      c.weeklyDue  = get('adWkDue', '17:00');
      Store.save();
      Store.addLog(Store.currentUser().name, '修改日报口径',
        '汇报 ' + c.reportTime + ' · 截止 ' + c.deadline + ' · 提醒 ' + c.remind1 + '/' + c.remind2 +
        ' · 周报 ' + ['日','一','二','三','四','五','六'][c.weeklyDueDay] + ' ' + c.weeklyDue);
      UI.toast('已保存日报口径', 'ok');
    };
  }

  function dashTab() {
    const cfg = Store.state.config || {};
    const vis = Store.taskVisibility();
    const cur = Store.TASK_VIS.find(v => v.id === vis) || Store.TASK_VIS[0];
    const ntf = cfg.notify || { email:false, wecom:false, feishu:false };
    const visOpts = Store.TASK_VIS.map(v => '<option value="' + v.id + '"' + (v.id === vis ? ' selected' : '') + '>' +
      E(v.t) + '</option>').join('');
    const chk = (k, label, note) => '<label class="checkline"><input type="checkbox" data-ntf="' + k + '"' +
      (ntf[k] ? ' checked' : '') + '><span>' + label + '<span class="tiny muted">　' + note + '</span></span></label>';
    return '<div class="card"><div class="card-h"><h3>每日任务 · 看板与提醒</h3>' +
        '<span class="h-sub">仅管理员可改 · 改动记入操作日志</span></div><div class="card-b">' +
      '<div class="field" style="max-width:460px"><label>任务看板可见范围</label>' +
        '<select class="sel" id="adVis">' + visOpts + '</select>' +
        '<div class="hint" id="adVisHint">当前：<b>' + E(cur.t) + '</b> —— ' + E(cur.hint) +
          '。这一档只影响「任务看板」的明细可见性；统计页员工始终只看自己。</div></div>' +
      '<div class="grid-2 mt16">' +
        '<div class="field"><label>每日任务截止时间</label>' +
          '<input class="inp" type="time" id="adTkDl" value="' + E(cfg.taskDeadline || '10:45') + '">' +
          '<div class="hint">默认 10:45；到点未交即记「未交」，之后补交记「逾期」。</div></div>' +
        '<div class="field"><label>提醒节点（截止前两次）</label>' +
          '<div class="row-wrap"><input class="inp" type="time" id="adTkR1" style="max-width:130px" value="' +
            E((cfg.taskRemind || ['10:15','10:35'])[0]) + '">' +
          '<input class="inp" type="time" id="adTkR2" style="max-width:130px" value="' +
            E((cfg.taskRemind || ['10:15','10:35'])[1]) + '"></div>' +
          '<div class="hint">站内提醒：工作台卡片倒计时 + 提示条，不弹窗。</div></div>' +
      '</div>' +
      '<div class="mt16"><label class="checkline"><input type="checkbox" id="adTkWeekend"' +
        (cfg.taskSkipWeekend === false ? '' : ' checked') + '><span>周末跳过（无需提交）</span></label>' +
        '<label class="checkline"><input type="checkbox" id="adTkHoliday"' +
        (cfg.taskSkipHoliday === false ? '' : ' checked') + '><span>法定节假日跳过<span class="tiny muted">（复用工作日历）</span></span></label>' +
        '<label class="checkline"><input type="checkbox" id="adTkOt"' +
        (cfg.taskOtRequired ? ' checked' : '') + '><span>「预计加班时长」必填<span class="tiny muted">（默认选填）</span></span></label>' +
      '</div>' +
      '<div class="sec-t mt24">可选推送（默认全关，只走站内）</div>' +
      '<div class="hint mb8">公司没有企业微信，本期原型<b>不实际发送</b>任何外部消息；这里只是把开关位置留出来。</div>' +
      '<div>' + chk('email', '邮件', '需要 SMTP 配置') + chk('wecom', '企业微信', '当前未接入') +
        chk('feishu', '飞书', '需要自建应用') + '</div>' +
      '<div class="row-wrap mt16"><button class="btn primary" id="adSave">保存</button>' +
        '<span class="tiny muted">时区统一 Asia/Shanghai（' + E(cfg.taskTz || 'Asia/Shanghai') + '）</span></div>' +
      '</div></div>' + dailyCard() + tplCard();
  }

  /* 催办话术模板（v1.17 可编辑）：未交名单页「一键催办」引用的就是这里的内容。
     系统不代发 —— 只生成可粘贴的一段话，由 PM 自己发群 / 私聊。 */
  function tplCard() {
    const canEdit = Store.can('remind');
    const list = Store.remindTemplates();
    const rows = list.map(t =>
      '<tr><td style="width:170px"><b>' + E(t.name) + '</b>' +
        '<div class="tiny muted">' + E(t.when || '手动使用') + '</div></td>' +
      '<td class="tiny">' + E(t.text) + '</td>' +
      '<td style="white-space:nowrap;text-align:right;width:220px">' + (canEdit
        ? '<button class="btn sm" data-tup="' + t.id + '">↑</button>' +
          '<button class="btn sm" data-tdn="' + t.id + '">↓</button>' +
          '<button class="btn sm" data-ted="' + t.id + '">编辑</button>' +
          (list.length > 1 ? '<button class="btn sm" data-tdel="' + t.id + '">删除</button>' : '')
        : '<span class="tiny muted">—</span>') + '</td></tr>').join('');
    return '<div class="card mt16"><div class="card-h"><h3>催办话术模板</h3>' +
      '<span class="h-sub">未交名单页「一键催办」按截止时间自动选一条（未到点用第 1 条，过点用「逾期」那条）</span></div>' +
      '<div class="card-b tight"><table class="tbl"><thead><tr>' +
      '<th>话术</th><th>内容</th><th style="width:220px">操作</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="mt8 row-wrap">' + (canEdit ? '<button class="btn sm" data-tnew>+ 新增话术</button>' : '') +
      '<span class="tiny muted">占位符：<b>{name}</b> 被催人 · <b>{date}</b> 日期 · <b>{deadline}</b> 截止时点 · <b>{count}</b> 人数</span>' +
      '</div></div></div>';
  }

  function openTplModal(id, root) {
    const t = id ? Store.remindTpl(id) : null;
    UI.modal({
      title:(t ? '编辑催办话术' : '新增催办话术'),
      sub:'占位符 {name} {date} {deadline} {count} 在生成时自动替换',
      body:'<div class="field"><label>话术名称</label>' +
          '<input class="inp" id="tpName" value="' + E(t ? t.name : '') + '" placeholder="如：首次提醒（截止前）"></div>' +
        '<div class="field mt12"><label>触发时机</label>' +
          '<input class="inp" id="tpWhen" value="' + E(t ? (t.when || '') : '') + '" placeholder="如：截止前 2 小时"></div>' +
        '<div class="field mt12"><label>话术内容</label>' +
          '<textarea class="inp" id="tpText" rows="3" style="height:auto;min-height:78px;padding-top:8px">' + E(t ? t.text : '') + '</textarea>' +
          '<div class="hint">示例：@{name} 今天的日报还没提交，截止 {deadline}（{date}），方便先写一版？</div></div>',
      footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="tpOk">保存</button>',
      onMount:function (mroot, close) {
        $('#tpOk', mroot).onclick = () => {
          const r = Store.upsertRemindTpl({ id:id || null, name:$('#tpName', mroot).value,
            when:$('#tpWhen', mroot).value, text:$('#tpText', mroot).value });
          if (!r.ok) return UI.toast(r.msg, 'warn');
          close(); renderAdmin(root); UI.toast('已保存话术', 'ok');
        };
      }
    });
  }

  function bindTpl(root) {
    $$('[data-tnew]', root).forEach(b => b.onclick = () => openTplModal('', root));
    $$('[data-ted]', root).forEach(b => b.onclick = () => openTplModal(b.dataset.ted, root));
    $$('[data-tup]', root).forEach(b => b.onclick = () => {
      if (!Store.moveRemindTpl(b.dataset.tup, -1)) return UI.toast('已到边界', 'warn');
      renderAdmin(root);
    });
    $$('[data-tdn]', root).forEach(b => b.onclick = () => {
      if (!Store.moveRemindTpl(b.dataset.tdn, 1)) return UI.toast('已到边界', 'warn');
      renderAdmin(root);
    });
    $$('[data-tdel]', root).forEach(b => b.onclick = () => {
      if (!window.confirm('删除这条催办话术？')) return;
      const r = Store.removeRemindTpl(b.dataset.tdel);
      if (!r.ok) return UI.toast(r.msg, 'warn');
      renderAdmin(root); UI.toast('已删除话术', 'ok');
    });
  }

  function bindDashTab(root) {
    const vis = $('#adVis', root);
    if (vis) vis.onchange = () => {
      Store.setTaskVisibility(vis.value);
      UI.toast('看板可见性已改为「' + Store.taskVisText(vis.value) + '」', 'ok');
      renderAdmin(root);
    };
    const save = $('#adSave', root);
    if (save) save.onclick = () => {
      const c = Store.state.config;
      c.taskDeadline = $('#adTkDl', root).value || '10:45';
      c.taskRemind = [$('#adTkR1', root).value || '10:15', $('#adTkR2', root).value || '10:35'];
      c.taskSkipWeekend = $('#adTkWeekend', root).checked;
      c.taskSkipHoliday = $('#adTkHoliday', root).checked;
      c.taskOtRequired = $('#adTkOt', root).checked;
      const ntf = c.notify || (c.notify = { email:false, wecom:false, feishu:false });
      $$('[data-ntf]', root).forEach(b => { ntf[b.dataset.ntf] = b.checked; });
      Store.save();
      Store.addLog(Store.currentUser().name, '修改每日任务口径',
        '截止 ' + c.taskDeadline + ' · 提醒 ' + c.taskRemind.join('/') + ' · 可见性 ' + Store.taskVisText());
      UI.toast('已保存每日任务口径', 'ok');
    };
    bindDailyCard(root);
    bindTpl(root);
  }

  function peopleTab() {
    const rows = Store.people();
    const internal = rows.filter(p => p.type === 'internal');
    const client = rows.filter(p => p.type === 'client');
    const canEdit = Store.can('personManage');
    const line = p => '<tr><td><b>' + E(p.name) + '</b>' + (p.en ? ' <span class="tiny muted">' + E(p.en) + '</span>' : '') + '</td>' +
      '<td>' + (p.type === 'client' ? '<span class="badge"><span class="dot"></span>客户侧参与人</span>' : '<span class="badge accent"><span class="dot"></span>内部成员</span>') + '</td>' +
      '<td class="tiny">' + E(Store.roleName(p.role)) + '</td>' +
      '<td class="tiny">' + (Store.roleDef(p.role).admin ? '<span class="badge accent">最高权限</span>' : '内部成员') + '</td>' +
      '<td class="tiny">' + E(p.title) + '</td>' +
      '<td class="tiny">' + (p.mainPipe ? E(Store.pipeline(p.mainPipe).short) : '—') + '</td>' +
      '<td class="tiny">' + (p.type === 'client' ? '<span class="muted">不适用</span>'
        : (Store.roleDef(p.role).submitDaily && p.dailySubmit !== false
          ? '<span class="badge ok"><span class="dot"></span>交日报</span>' : '<span class="muted">不交</span>')) + '</td>' +
      '<td class="tiny">' + (p.type === 'client' ? '<span class="badge">无账号</span>'
        : (p.active ? '<span class="badge ok"><span class="dot"></span>在册</span>' : '<span class="badge warn"><span class="dot"></span>停用</span>')) + '</td>' +
      '<td style="white-space:nowrap;text-align:right">' + (canEdit
        ? '<button class="btn sm" data-ped="' + p.id + '">编辑</button>' +
          (p.type === 'client' ? '' : (p.active
            ? '<button class="btn sm" data-poff="' + p.id + '">停用</button>'
            : '<button class="btn sm" data-pon="' + p.id + '">恢复</button>')) +
          (p.id === Store.currentUser().id ? '' : '<button class="btn sm" data-pdel="' + p.id + '">删除</button>')
        : '<span class="tiny muted">—</span>') + '</td></tr>';

    return '<div class="note accent mb16"><span class="n-ico">i</span><div>' +
      '「角色」决定权限级别，「类型」决定是否算「我们的人」：' +
      '<b>只有内部成员</b>进应提交人数、未交名单与催办；' +
      '<b>客户侧参与人</b>（Kelvin / 坤 / Tim）没有账号、不可登录，其数据由 PM 代录。</div></div>' +
      '<div class="row-wrap mb16">' + (canEdit ? '<button class="btn primary sm" data-pnew>+ 添加人员</button>' : '') +
        '<span class="tiny muted">姓名 / 角色 / 组 / 职务 / 主责管线 / 是否交日报 都能改；停用=退出提交率，删除=彻底移除</span></div>' +
      '<div class="card mb16"><div class="card-h"><h3>内部人员</h3><span class="h-sub">共 ' + internal.length + ' 人 · 其中应提交日报 ' +
        Store.submitters().length + ' 人</span></div>' +
      '<div class="card-b tight"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th style="width:120px">姓名</th><th style="width:104px">类型</th><th style="width:96px">角色</th>' +
      '<th style="width:90px">权限级别</th><th style="width:170px">条线 / 职务</th><th style="width:110px">主责管线</th>' +
      '<th style="width:92px">日报</th><th style="width:90px">状态</th>' +
      '<th style="width:190px">操作</th>' +
      '</tr></thead><tbody>' + internal.map(line).join('') + '</tbody></table></div></div></div>' +
      '<div class="card"><div class="card-h"><h3>客户侧参与人</h3><span class="h-sub">不是用户，只是数据来源标注</span></div>' +
      '<div class="card-b tight"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th style="width:120px">姓名</th><th style="width:104px">类型</th><th style="width:96px">角色</th>' +
      '<th style="width:90px">权限级别</th><th style="width:170px">条线 / 职务</th><th style="width:110px">主责管线</th>' +
      '<th style="width:92px">日报</th><th style="width:90px">状态</th>' +
      '<th style="width:190px">操作</th>' +
      '</tr></thead><tbody>' + client.map(line).join('') + '</tbody></table></div></div></div>';
  }

  /* 人员增删改（v1.17）：角色 / 类型 / 组 / 管线 / 单价 / 是否交日报都能改 */
  function bindPeopleTab(root) {
    const byId = id => Store.person(id);
    $$('[data-pnew]', root).forEach(b => b.onclick = () => openPersonModal('', root));
    $$('[data-ped]', root).forEach(b => b.onclick = () => openPersonModal(b.dataset.ped, root));
    $$('[data-poff]', root).forEach(b => b.onclick = () => {
      const r = Store.setPersonActive(b.dataset.poff, false);
      if (!r.ok) return UI.toast(r.msg, 'warn');
      renderAdmin(root); UI.toast('已停用（不再进提交率与未交名单）', 'ok');
    });
    $$('[data-pon]', root).forEach(b => b.onclick = () => {
      const r = Store.setPersonActive(b.dataset.pon, true);
      if (!r.ok) return UI.toast(r.msg, 'warn');
      renderAdmin(root); UI.toast('已恢复在册', 'ok');
    });
    $$('[data-pdel]', root).forEach(b => b.onclick = () => {
      const p = byId(b.dataset.pdel);
      if (!p) return;
      if (!window.confirm('删除「' + p.name + '」？该操作不可撤销（历史日报会保留）。')) return;
      const r = Store.removePerson(b.dataset.pdel);
      if (!r.ok) return UI.toast(r.msg, 'warn');
      renderAdmin(root); UI.toast('已删除 ' + p.name, 'ok');
    });
  }

  function openPersonModal(id, root) {
    const p = id ? Store.person(id) : null;
    const roleOpts = Store.roles().map(r => '<option value="' + r.id + '"' +
      (p && p.role === r.id ? ' selected' : (!p && r.id === 'member' ? ' selected' : '')) + '>' +
      E(r.name) + (r.admin ? '（最高权限）' : '') + '</option>').join('');
    const groupOpts = '<option value="">（不属于任何组）</option>' + Store.groups().map(g =>
      '<option value="' + g.id + '"' + (p && p.group === g.id ? ' selected' : '') + '>' + E(g.name) + '</option>').join('');
    const pipeOpts = '<option value="">（无）</option>' + Store.pipelines().map(x =>
      '<option value="' + x.id + '"' + (p && p.mainPipe === x.id ? ' selected' : '') + '>' + E(x.name) + '</option>').join('');
    UI.modal({
      title:(p ? '编辑人员 · ' + p.name : '添加人员'),
      sub:'角色在「角色与权限」维护 · 组与管线在「下拉项」维护 —— 下拉里的每一项都可由最高权限增删改',
      body:'<div class="grid-2">' +
        '<div class="field"><label>姓名 <span class="req">*</span></label><input class="inp" id="pnName" value="' + E(p ? p.name : '') + '"></div>' +
        '<div class="field"><label>英文名 / 备注名</label><input class="inp" id="pnEn" value="' + E(p ? (p.en || '') : '') + '" placeholder="如 Olivia"></div>' +
        '<div class="field"><label>角色</label><select class="sel" id="pnRole">' + roleOpts + '</select></div>' +
        '<div class="field"><label>所属组</label><select class="sel" id="pnGroup">' + groupOpts + '</select></div>' +
        '<div class="field"><label>条线 / 职务</label><input class="inp" id="pnTitle" value="' + E(p ? p.title : '') + '" placeholder="如 3DGS 组 · 采集与重建"></div>' +
        '<div class="field"><label>主责管线</label><select class="sel" id="pnPipe">' + pipeOpts + '</select></div>' +
        '<div class="field"><label>手机号（登录用）</label><input class="inp" id="pnPhone" value="' + E(p ? (p.phone || '') : '') + '" placeholder="留空自动分配演示号"></div>' +
        '<div class="field"><label>状态</label><select class="sel" id="pnActive">' +
          '<option value="1"' + (!p || p.active !== false ? ' selected' : '') + '>在册</option>' +
          '<option value="0"' + (p && p.active === false ? ' selected' : '') + '>停用</option></select></div>' +
        '<div class="field"><label>日报</label><select class="sel" id="pnDaily">' +
          '<option value="auto"' + (!p || p.dailySubmit !== false ? ' selected' : '') + '>跟随角色</option>' +
          '<option value="no"' + (p && p.dailySubmit === false ? ' selected' : '') + '>强制不交（由他人代表）</option></select></div>' +
        '</div>',
      footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="pnOk">保存</button>',
      onMount:function (mroot, close) {
        $('#pnOk', mroot).onclick = () => {
          const r = Store.upsertPerson({
            id:id || null, name:$('#pnName', mroot).value, en:$('#pnEn', mroot).value,
            role:$('#pnRole', mroot).value, group:$('#pnGroup', mroot).value || null,
            title:$('#pnTitle', mroot).value, mainPipe:$('#pnPipe', mroot).value || null,
            phone:$('#pnPhone', mroot).value,
            active:$('#pnActive', mroot).value === '1',
            dailySubmit:$('#pnDaily', mroot).value === 'no' ? false : true
          });
          if (!r.ok) return UI.toast(r.msg, 'warn');
          close(); renderAdmin(root); UI.toast('已保存 ' + r.person.name, 'ok');
        };
      }
    });
  }

  /* 角色与权限（v1.17 可编辑）：能力矩阵按角色勾选 —— 改的是 roles[].caps，
     页面只问 Store.can(...)，所以勾掉即全站生效；角色本身也能改名 / 增删。 */
  function rolesTab() {
    const list = Store.roles();
    const canEdit = Store.can('roleManage');

    const head = '<tr><th style="width:250px">能力</th>' + list.map(r =>
      '<th style="text-align:center">' + E(r.name) + (r.admin ? '<div class="tiny muted">最高权限</div>' : '') + '</th>').join('') + '</tr>';
    const box = (rid, key, on, kind) => '<td style="text-align:center">' + (canEdit
      ? '<input type="checkbox" data-' + kind + '="' + rid + ':' + key + '"' + (on ? ' checked' : '') + '>'
      : (on ? '<span class="badge ok"><span class="dot"></span>是</span>' : '<span class="muted tiny">—</span>')) + '</td>';
    const capRows = Store.caps().map(c =>
      '<tr><td>' + E(c.t) + '<div class="tiny muted">' + E(c.d) + '</div></td>' +
      list.map(r => box(r.id, c.key, Store.capOf(r.id, c.key), 'rolecap')).join('') + '</tr>').join('');
    const flagRows = [
      ['admin',       '最高权限',   '可进未交名单页与催办；是否交日报看下面这行'],
      ['submitDaily', '交日报',     '进提交率分母、进未交名单'],
      ['taskSubmit',  '交每日任务',  '本人的每日任务填报'],
      ['taskManage',  '每日任务管理', '看全员任务 / 催交 / 放开修改 / 导出']
    ].map(f => '<tr><td>' + E(f[1]) + '<div class="tiny muted">' + E(f[2]) + '</div></td>' +
      list.map(r => box(r.id, f[0], !!r[f[0]], 'roleflag')).join('') + '</tr>').join('');
    const newsRows = [
      ['post', '发内容', '新闻 / 活动 / 分享 / 学习'],
      ['announce', '发公告', '仅管理层能发'],
      ['pin', '置顶', ''],
      ['review', '审核实习生内容', '']
    ].map(f => '<tr><td>' + E(f[1]) + (f[2] ? '<div class="tiny muted">' + E(f[2]) + '</div>' : '') + '</td>' +
      list.map(r => box(r.id, f[0], !!(r.news && r.news[f[0]]), 'rolenews')).join('') + '</tr>').join('');

    const cards = list.map(r => {
      const who = Store.people().filter(p => p.role === r.id);
      return '<div class="card mb16"><div class="card-h"><h3>' + E(r.name) +
        (r.admin ? ' <span class="badge accent">最高权限</span>' : (r.level === 1 ? ' <span class="badge">无账号</span>' : '')) + '</h3>' +
        '<div class="h-right">' + (canEdit
          ? '<button class="btn sm" data-red="' + r.id + '">编辑</button>' +
            (who.length ? '' : '<button class="btn sm" data-rdel="' + r.id + '">删除</button>')
          : '<span class="tiny muted">只读</span>') + '</div></div>' +
        '<div class="card-b">' +
          '<div class="row-wrap mb12">' + who.map(p => UI.personChip(p, true)).join('') +
            (who.length ? '' : '<span class="muted tiny">暂无人员</span>') + '</div>' +
          '<div class="sec-t">说明</div>' +
          '<div class="row-wrap">' + (r.scopes || []).map(s => '<span class="tag">' + E(s) + '</span>').join('') + '</div>' +
        '</div></div>';
    }).join('');

    return '<div class="note accent mb16"><span class="n-ico">i</span><div>' +
      '勾选 / 取消下面矩阵里的方框，<b>立刻改变这类身份的权限</b> —— 页面只问「我能做什么」，不写死角色名。' +
      '客户侧参与人没有账号，所以那一列全空。角色名称、级别与「是否交日报」也能改。</div></div>' +
      '<div class="row-wrap mb16">' + (canEdit ? '<button class="btn primary sm" data-rnew>+ 新增角色</button>' : '') +
        '<span class="tiny muted">目前 ' + list.length + ' 个角色 · 其中最高权限 ' +
        list.filter(r => r.admin).length + ' 个</span></div>' +
      '<div class="card mb16"><div class="card-h"><h3>能力矩阵</h3>' +
      '<span class="h-sub">按角色逐项勾选 · 改动记入操作日志</span></div>' +
      '<div class="card-b tight"><div class="tbl-wrap"><table class="tbl">' +
      '<thead>' + head + '</thead><tbody>' + capRows + flagRows + newsRows + '</tbody></table></div></div></div>' +
      cards;
  }

  function bindRolesTab(root) {
    $$('[data-rolecap]', root).forEach(el => el.onchange = () => {
      const k = String(el.dataset.rolecap).split(':');
      const r = Store.setRoleCap(k[0], k[1], el.checked);
      if (!r.ok) { el.checked = !el.checked; return UI.toast(r.msg, 'warn'); }
      UI.toast('已更新权限（立即生效）', 'ok');
    });
    $$('[data-roleflag]', root).forEach(el => el.onchange = () => {
      const k = String(el.dataset.roleflag).split(':');
      const r = Store.setRoleFlag(k[0], k[1], el.checked);
      if (!r.ok) { el.checked = !el.checked; return UI.toast(r.msg, 'warn'); }
      renderAdmin(root); UI.toast('已更新角色', 'ok');
    });
    $$('[data-rolenews]', root).forEach(el => el.onchange = () => {
      const k = String(el.dataset.rolenews).split(':');
      const r = Store.setRoleNews(k[0], k[1], el.checked);
      if (!r.ok) { el.checked = !el.checked; return UI.toast(r.msg, 'warn'); }
      UI.toast('已更新内容流权限', 'ok');
    });
    $$('[data-rnew]', root).forEach(b => b.onclick = () => openRoleModal('', root));
    $$('[data-red]', root).forEach(b => b.onclick = () => openRoleModal(b.dataset.red, root));
    $$('[data-rdel]', root).forEach(b => b.onclick = () => {
      if (!window.confirm('删除这个角色？（还有人员属于它时会拒绝）')) return;
      const r = Store.removeRole(b.dataset.rdel);
      if (!r.ok) return UI.toast(r.msg, 'warn');
      renderAdmin(root); UI.toast('已删除角色', 'ok');
    });
  }

  function openRoleModal(id, root) {
    const r = id ? Store.roleDef(id) : null;
    UI.modal({
      title:(r ? '编辑角色 · ' + r.name : '新增角色'),
      sub:'名称 / 级别 / 四个开关在这里改；细项能力在矩阵里勾选',
      body:'<div class="grid-2">' +
          '<div class="field"><label>角色名称 <span class="req">*</span></label>' +
            '<input class="inp" id="rName" value="' + E(r ? r.name : '') + '"></div>' +
          '<div class="field"><label>级别</label><select class="sel" id="rLevel">' +
            [['3','最高权限'],['2','内部成员'],['1','无账号（客户侧）']].map(o =>
              '<option value="' + o[0] + '"' + (r && String(r.level) === o[0] ? ' selected' : (!r && o[0] === '2' ? ' selected' : '')) + '>' + o[1] + '</option>').join('') +
          '</select></div></div><div class="mt12">' +
          '<label class="checkline"><input type="checkbox" id="rAdmin"' + (r && r.admin ? ' checked' : '') +
            '><span>最高权限<span class="tiny muted">　可进未交名单页与催办；是否交日报看下面两行</span></span></label>' +
          '<label class="checkline"><input type="checkbox" id="rSubmit"' + (!r || r.submitDaily ? ' checked' : '') +
            '><span>交日报</span></label>' +
          '<label class="checkline"><input type="checkbox" id="rTaskSub"' + (!r || r.taskSubmit ? ' checked' : '') +
            '><span>交每日任务</span></label>' +
          '<label class="checkline"><input type="checkbox" id="rTaskMan"' + (r && r.taskManage ? ' checked' : '') +
            '><span>每日任务管理</span></label>' +
        '</div>',
      footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="rOk">保存</button>',
      onMount:function (mroot, close) {
        $('#rOk', mroot).onclick = () => {
          const res = Store.upsertRole({ id:id || null, name:$('#rName', mroot).value,
            level:$('#rLevel', mroot).value, admin:$('#rAdmin', mroot).checked,
            submitDaily:$('#rSubmit', mroot).checked, taskSubmit:$('#rTaskSub', mroot).checked,
            taskManage:$('#rTaskMan', mroot).checked });
          if (!res.ok) return UI.toast(res.msg, 'warn');
          close(); renderAdmin(root); UI.toast('已保存角色', 'ok');
        };
      }
    });
  }

  /* 下拉项（枚举）管理（v1.16）：关联管线 / 优先级 / 内容流分类。
     最高权限（老板 / PM / TA Leader，can('taskConfig')）都能编辑，改动写日志。 */
  function enumsTab() {
    const canEdit = Store.can('taskConfig');
    const note = '<div class="note ' + (canEdit ? 'accent' : 'warn') + ' mb16"><span class="n-ico">' +
      (canEdit ? 'i' : '!') + '</span><div>' + (canEdit
        ? '下面的下拉项<b>最高权限都可以编辑</b> —— 增删改后立即在日报、周报、每日任务里生效。'
        : '当前身份无编辑权限，只有老板 / PM / TA Leader 能改。') +
      '管线名称会印在<b>日报下拉框、看板和客户版材料</b>上，改动等于全链路改，确定后尽量冻结。</div></div>';

    function ops(type, id, canDel) {
      if (!canEdit) return '<span class="tiny muted">—</span>';
      return '<button class="btn sm" data-enup="' + type + ':' + id + '">↑</button>' +
        '<button class="btn sm" data-endn="' + type + ':' + id + '">↓</button>' +
        '<button class="btn sm" data-ened="' + type + ':' + id + '">编辑</button>' +
        (canDel ? '<button class="btn sm" data-endel="' + type + ':' + id + '">删除</button>' : '');
    }
    const cell = (type, id, canDel) =>
      '<td style="white-space:nowrap;text-align:right">' + ops(type, id, canDel) + '</td>';
    function card(title, sub, rows, addType, addLabel) {
      return '<div class="card mb16"><div class="card-h"><h3>' + title + '</h3>' +
        '<span class="h-sub">' + sub + '</span></div>' +
        '<div class="card-b tight"><table class="tbl">' +
        '<thead><tr><th>当前项</th><th style="width:250px">操作</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        (canEdit ? '<div class="mt8"><button class="btn sm" data-enadd="' + addType + '">+ 新增' + addLabel + '</button></div>' : '') +
        '</div></div>';
    }
    const pipeRows = Store.pipelines().map(p =>
      '<tr><td><b>' + E(p.name) + '</b><div class="tiny muted">' + E(p.short) +
        ((p.metrics || []).length ? ' · ' + p.metrics.length + ' 个产能字段' : ' · 无产能字段（兜底项）') +
      '</div></td>' + cell('pipe', p.id, p.id !== 'other') + '</tr>').join('');
    const priRows = Store.priorities().map(p =>
      '<tr><td><b>' + E(p.t) + '</b><div class="tiny muted">' + E(p.id) + '</div></td>' +
      cell('pri', p.id, Store.priorities().length > 1) + '</tr>').join('');
    const catRows = Store.newsCats().map(c =>
      '<tr><td><b>' + E(c) + '</b></td>' + cell('cat', c, true) + '</tr>').join('');
    const grpRows = Store.groups().map(g =>
      '<tr><td><b>' + E(g.name) + '</b><div class="tiny muted">' + E(g.note || (g.members || []).length + ' 名成员') + '</div></td>' +
      cell('grp', g.id, true) + '</tr>').join('');
    return note +
      card('关联管线', '日报条目 / 今日任务 / 周报目标 的「管线」下拉', pipeRows, 'pipe', '管线') +
      card('优先级', '每日任务行的「优先级」下拉', priRows, 'pri', '优先级') +
      card('内容流分类', '工作台「内容流」发布时可选', catRows, 'cat', '分类') +
      card('分组（所属组）', '人员弹窗「所属组」下拉 · 新分组先建在这里，再去「人员」页把人转过去', grpRows, 'grp', '分组');
  }

  function openEnumModal(type, id, root) {
    const isNew = !id;
    const titles = { pipe:'关联管线', pri:'优先级', cat:'内容流分类', grp:'分组（所属组）' };
    const label = { pipe:'名称（显示在日报 / 任务里）', pri:'优先级名称', cat:'分类名称', grp:'组名' }[type];
    const cur = type === 'pipe' ? (Store.pipelines().find(x => x.id === id) || {})
      : type === 'pri' ? (Store.priorities().find(x => x.id === id) || {})
      : type === 'grp' ? (Store.groups().find(x => x.id === id) || {}) : { name:id };
    const val = type === 'pipe' ? cur.name : type === 'pri' || type === 'grp' ? cur.name : id;
    const isGrp = type === 'grp';
    UI.modal({
      title:(isNew ? '新增' : '编辑') + titles[type],
      body:'<div class="field"><label>' + label + ' <span class="req">*</span></label>' +
        '<input class="inp" id="enName" value="' + E(val || '') + '"></div>' +
        (isGrp ? '<div class="field mt12"><label>备注（可选）</label>' +
          '<input class="inp" id="enNote" value="' + E(cur.note || '') + '" placeholder="如：周会材料按组交给 PM"></div>' : ''),
      footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="enOk">保存</button>',
      onMount:function (mroot, close) {
        $('#enOk', mroot).onclick = () => {
          const v = $('#enName', mroot).value.trim();
          if (!v) return UI.toast('请填写名称', 'warn');
          const ok = type === 'pipe' ? Store.upsertPipeline({ id:id || null, name:v, short:v })
            : type === 'pri' ? Store.upsertPriority({ id:id || null, t:v })
            : type === 'grp' ? Store.upsertGroup({ id:id || null, name:v, note:$('#enNote', mroot).value })
            : Store.upsertNewsCat(v, id || null);
          if (!ok) return UI.toast('保存失败（可能重名或无权）', 'warn');
          Store.addLog(Store.currentUser().name, (isNew ? '新增' : '编辑') + '下拉项', titles[type] + '：' + v);
          close(); renderAdmin(root); UI.toast('已保存', 'ok');
        };
      }
    });
  }

  function moveEnum(k, dir, root) {
    const ok = k.type === 'pipe' ? Store.movePipeline(k.id, dir)
      : k.type === 'pri' ? Store.movePriority(k.id, dir)
      : k.type === 'grp' ? Store.moveGroup(k.id, dir) : Store.moveNewsCat(k.id, dir);
    if (!ok) return UI.toast('已到边界', 'warn');
    renderAdmin(root);
  }

  function bindEnumsTab(root) {
    const parse = k => { const a = String(k).split(':'); return { type:a[0], id:a.slice(1).join(':') }; };
    $$('[data-enadd]', root).forEach(b => b.onclick = () => openEnumModal(b.dataset.enadd, '', root));
    $$('[data-ened]', root).forEach(b => b.onclick = () => { const k = parse(b.dataset.ened); openEnumModal(k.type, k.id, root); });
    $$('[data-enup]', root).forEach(b => b.onclick = () => moveEnum(parse(b.dataset.enup), -1, root));
    $$('[data-endn]', root).forEach(b => b.onclick = () => moveEnum(parse(b.dataset.endn), 1, root));
    $$('[data-endel]', root).forEach(b => b.onclick = () => {
      const k = parse(b.dataset.endel);
      if (!window.confirm('确定删除「' + k.id + '」？已用该值的旧记录会回退到兜底项。')) return;
      const ok = k.type === 'pipe' ? Store.removePipeline(k.id)
        : k.type === 'pri' ? Store.removePriority(k.id)
        : k.type === 'grp' ? Store.removeGroup(k.id) : Store.removeNewsCat(k.id);
      if (!ok) return UI.toast('该项目不可删除（分组内仍有人时需先转移）', 'warn');
      Store.addLog(Store.currentUser().name, '删除下拉项', k.type + ':' + k.id);
      renderAdmin(root); UI.toast('已删除', 'ok');
    });
  }

  function configTab() {
    const c = Store.state.config;
    const f = (key, label, hint, type, opts) => {
      let ctrl;
      if (type === 'select') {
        ctrl = '<select class="sel" data-cfg="' + key + '" style="max-width:280px">' +
          opts.map(o => '<option value="' + o[0] + '"' + (String(c[key]) === String(o[0]) ? ' selected' : '') + '>' + E(o[1]) + '</option>').join('') + '</select>';
      } else if (type === 'bool') {
        ctrl = '<select class="sel" data-cfg="' + key + '" style="max-width:280px">' +
          '<option value="false"' + (!c[key] ? ' selected' : '') + '>否</option>' +
          '<option value="true"' + (c[key] ? ' selected' : '') + '>是</option></select>';
      } else {
        ctrl = '<input class="inp" data-cfg="' + key + '" style="max-width:280px" value="' + E(c[key]) + '">';
      }
      return '<tr><td style="width:220px">' + E(label) + (hint ? '<div class="tiny muted">' + E(hint) + '</div>' : '') + '</td><td>' + ctrl + '</td></tr>';
    };
    return '<div class="card mb16"><div class="card-h"><h3>全局口径</h3>' +
      '<span class="h-sub">修改后全链路生效，禁止各页面各写一套</span></div>' +
      '<div class="card-b tight"><table class="tbl"><tbody>' +
      f('reportTime','约定汇报时点','每天汇报「当日任务 + 明日计划」的时点','time') +
      f('deadline','提交截止时点','准时 / 逾期的唯一分界','time') +
      f('remind1','首次提醒','按截止时点自动推导（前 2 小时）','time') +
      f('remind2','二次提醒','按截止时点自动推导（前 30 分钟）','time') +
      f('weeklyDue','周报截止时点','「每周 weeklyDueDay」前交周报','time') +
      f('weeklyDueDay','周报截止日','0=周日 … 1=周一 … 6=周六','number') +
      f('workdayMode','交日报口径','工作日 / 每天（含周末节假日）','select',
        [['workdays','仅工作日'],['everyday','每天（含周末与节假日）']]) +
      f('effectiveSceneRule','「有效场景」口径','当前未拍板，影响产能链路','select',
        [['pending','待确认'],['collected','采集完成即算有效'],['generated','生成完成才算有效']]) +
      f('publicViewPublished','对外视图发布状态','本期只对内，默认不发布','bool') +
      '</tbody></table></div>' +
      '<div class="card-f"><span class="tiny muted">客户可见字段：' + E(c.clientVisible.join(' / ')) + '　｜　内部屏蔽字段：' + E(c.internalBlocked.join(' / ')) + '</span></div>' +
      '</div>';
  }

  function calTab() {
    const c = Store.state.calendar;
    const today = Store.S(new Date());
    const days = [];
    for (let i = -14; i < 21; i++) days.push(Store.addDays(today, i));
    return '<div class="card"><div class="card-h"><h3>工作日历</h3>' +
      '<span class="h-sub">决定「应提交人数」的分母口径</span></div>' +
      '<div class="card-b"><div class="row-wrap">' + days.map(d => {
        const w = Store.isWorkday(d);
        const isToday = d === today;
        return '<span class="badge ' + (w ? 'accent' : '') + '" style="' + (isToday ? 'outline:1px solid var(--accent);outline-offset:1px;' : '') + '">' +
          Store.fmtShort(d) + ' ' + Store.weekdayCN(d) + '</span>';
      }).join('') + '</div>' +
      '<div class="note accent mt16"><span class="n-ico">i</span><div>' +
        '当前配置：' + (Store.state.config.workdayMode === 'workdays' ? '仅工作日需交日报' : '每天（含周末与节假日）需交日报') + '；' +
        '工作日 = ' + c.workdays.map(w => ['日','一','二','三','四','五','六'][w]).join('、') + '。' +
        '法定节假日与调休出勤在下方维护。</div></div>' +
      '<div class="mt16"><div class="sec-t">法定节假日</div><div class="row-wrap">' +
        (c.holidays || []).map(d => '<span class="badge">' + d + '</span>').join('') + '</div></div>' +
      '<div class="mt16"><div class="sec-t">调休出勤</div><div class="row-wrap">' +
        (c.extraWorkdays || []).map(d => '<span class="badge accent">' + d + '</span>').join('') + '</div></div>' +
      '<div class="hint mt12">' + E(c.note || '') + '</div>' +
      '</div></div>';
  }

  function clientTab() {
    const rows = Store.clientData();
    return '<div class="note accent mb16"><span class="n-ico">i</span><div>' +
      '客户侧数据（可用资产数 / 点位 / 验收结果）<b>由 PM 代录</b>，带「客户侧」标签，不并入内部成本。</div></div>' +
      '<div class="card"><div class="card-h"><h3>客户侧数据</h3>' +
      '<div class="h-right"><button class="btn primary sm" id="cdAdd">代录一条</button></div></div>' +
      '<div class="card-b tight"><table class="tbl"><thead><tr>' +
      '<th style="width:100px">日期</th><th style="width:130px">来源</th><th class="r">可用资产</th>' +
      '<th class="r">规划点位</th><th class="r">确认点位</th><th>验收结果</th><th>备注</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td class="tiny">' + r.date + '</td>' +
        '<td class="tiny">' + E(r.source) + '</td>' +
        '<td class="r">' + (r.usable == null ? '<span class="badge">未回传</span>' : r.usable) + '</td>' +
        '<td class="r">' + (r.planned == null ? '—' : r.planned) + '</td>' +
        '<td class="r">' + (r.confirmed == null ? '—' : r.confirmed) + '</td>' +
        '<td class="tiny">' + E(r.acceptance || '—') + '</td>' +
        '<td class="tiny muted">' + E(r.note || '') + '</td></tr>').join('') +
      '</tbody></table></div></div>';
  }

  function demoTab() {
    return '<div class="card"><div class="card-h"><h3>演示数据</h3></div><div class="card-b">' +
      '<p class="sub">本原型的数据存放在浏览器本地（localStorage），刷新不会丢失。修改内容（提交日报、催办、标记状态）会立即反映到看板与统计。</p>' +
      '<div class="mt16 row">' +
      '<button class="btn" id="demoExport">导出全部数据 JSON</button>' +
      '<button class="btn danger" id="demoReset">重置为初始演示数据</button></div>' +
      '<div class="note warn mt16"><span class="n-ico">!</span><div>' +
      '正式部署时应替换为服务端存储与账号体系：本期原型用演示账号切换身份，登录方式为账号 + 密码（不接第三方扫码）。</div></div>' +
      '</div></div>';
  }

  function bindAdmin(root) {
    $$('[data-cfg]', root).forEach(el => el.onchange = () => {
      const k = el.dataset.cfg;
      let v = el.value;
      if (v === 'true') v = true; else if (v === 'false') v = false;
      Store.state.config[k] = v;
      // 截止时点变更 → 提醒时点同步推导
      if (k === 'deadline' && /^\d{2}:\d{2}$/.test(v)) {
        const t = Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
        const fmt = m => { m = (m + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
        Store.state.config.remind1 = fmt(t - 120);
        Store.state.config.remind2 = fmt(t - 30);
      }
      Store.save(); renderAdmin(root);
      UI.toast('已保存：' + k, 'ok');
    });
    const add = $('#cdAdd', root);
    if (add) add.onclick = () => UI.modal({
      title:'代录客户侧数据', sub:'来源为客户侧人员（坤 / Tim）回传，由 PM 录入',
      body:'<div class="grid g2">' +
        '<div class="field"><label>日期</label><input class="inp" type="date" id="cdDate" value="' + window.SEED.demoDate + '"></div>' +
        '<div class="field"><label>来源</label><input class="inp" id="cdSrc" value="坤（客户侧）"></div>' +
        '<div class="field"><label>可用资产数</label><input class="inp" type="number" id="cdU"></div>' +
        '<div class="field"><label>规划点位</label><input class="inp" type="number" id="cdP"></div>' +
        '<div class="field"><label>确认点位</label><input class="inp" type="number" id="cdC"></div>' +
        '<div class="field"><label>客户验收结果</label><input class="inp" id="cdA"></div>' +
        '</div><div class="field mt12"><label>备注</label><input class="inp" id="cdN"></div>',
      footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="cdOk">保存</button>',
      onMount:(mr, close) => {
        $('#cdOk', mr).onclick = () => {
          const num = id => { const v = $('#' + id, mr).value; return v === '' ? null : Number(v); };
          Store.state.clientData.push({
            id:Store.newId('cd'), date:$('#cdDate', mr).value, source:$('#cdSrc', mr).value,
            by:Store.currentUser().id, usable:num('cdU'), planned:num('cdP'), confirmed:num('cdC'),
            acceptance:$('#cdA', mr).value || null, note:$('#cdN', mr).value
          });
          Store.save(); Store.addLog(Store.currentUser().id, '代录客户侧数据', $('#cdSrc', mr).value);
          close(); renderAdmin(root); UI.toast('已保存客户侧数据', 'ok');
        };
      }
    });
    const ex = $('#demoExport', root);
    if (ex) ex.onclick = () => {
      const blob = new Blob([JSON.stringify(Store.state, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'alaifu-daily-data.json';
      document.body.appendChild(a); a.click(); a.remove();
      UI.toast('已导出 JSON', 'ok');
    };
    const rs = $('#demoReset', root);
    if (rs) rs.onclick = () => UI.confirmDialog('重置演示数据', '将清除所有本地修改，恢复到初始演示数据。此操作不可撤销。', () => {
      Store.reset(); location.hash = '#/board'; location.reload();
    }, '确认重置');
  }

  /* ---------------- 注册 ---------------- */
  window.Views.capacity = { title:'产能', sub:'四段并行链路，含累计基线与客户侧环节', render: renderCapacity };
  window.Views.stats = { title:'成本与支出', sub:'直接生产支出 · 单位算力成本', render: renderStats };
  window.Views.admin = { title:'设置', sub:'看板与提醒 / 人员 / 下拉项 / 口径 / 日历 / 客户侧数据', render: renderAdmin };
})();
