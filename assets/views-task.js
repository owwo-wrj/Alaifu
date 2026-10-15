/* ============================================================
   视图 · 每日任务（FR-38）：今日任务填报 / 任务看板
   ------------------------------------------------------------
   一人一天一条；10:45 前提交为「按时」，之后为「逾期」，没交为「未交」。
   条目字段：任务内容 + 优先级（高/中/低）+ 关联管线 + 备注（选填）。
   刻意不做「预计工时」；提交后不可编辑，管理员可一键放开（原因必填）。
   ============================================================ */
window.Views = window.Views || {};
(function () {
  const E = UI.esc, $ = UI.$, $$ = UI.$$;
  const TODAY = () => Store.today();

  /* ---------------- 小工具 ---------------- */
  let currentRoot = null;                              // 弹窗回调里重渲染用
  function avatar(p, cls) {
    if (!p) return '';
    const lv = Store.roleDef(p.role).level;
    return '<span class="avatar' + (lv >= 3 ? ' admin' : '') + (cls ? ' ' + cls : '') + '">' +
      E(p.name.slice(0, 1)) + '</span>';
  }
  function stateBadge(st) {
    return '<span class="badge ' + (st.tone || 'line') + '"><span class="dot"></span>' + E(st.label) + '</span>';
  }
  function initials(p) { return p && p.name ? p.name.slice(0, 1) : '—'; }
  void initials;
  /* 纯 SVG 趋势图（不引图表库）：柱 = 提交率，折线 = 按时率。
     上色一律走 CSS 类（presentation attribute 不解析 var()）。 */
  function trendSVG(trend) {
    if (!trend || !trend.length) return '<div class="hint">暂无数据</div>';
    const w = 560, h = 112, pad = 18, base = h - 22;
    const n = trend.length;
    const bw = Math.max(6, Math.min(24, (w - pad * 2) / n - 6));
    const step = n > 1 ? (w - pad * 2 - bw) / (n - 1) : 0;
    const bars = [], line = [];
    trend.forEach((t, i) => {
      const x = pad + i * step;
      const rate = t.rate == null ? 0 : t.rate;
      const otr = t.onTimeRate == null ? 0 : t.onTimeRate;
      const bh = Math.max(2, Math.round(rate * (base - pad)));
      bars.push('<rect class="tb-bar" x="' + x.toFixed(1) + '" y="' + (base - bh) + '" width="' + bw.toFixed(1) +
        '" height="' + bh + '" rx="2" opacity="' + (0.3 + rate * 0.45).toFixed(2) + '">' +
        '<title>' + Store.fmtShort(t.date) + '　提交率 ' + Math.round(rate * 100) + '%　按时率 ' +
        Math.round(otr * 100) + '%（提交 ' + t.submittedN + '/' + t.expectedN + '）</title></rect>');
      line.push((x + bw / 2).toFixed(1) + ',' + (base - Math.round(otr * (base - pad))));
    });
    return '<svg class="tb-svg" viewBox="0 0 ' + w + ' ' + h + '" role="img" ' +
        'aria-label="近 ' + n + ' 个工作日提交率与按时率趋势">' +
      '<line class="tb-axis" x1="' + pad + '" y1="' + base + '" x2="' + (w - pad) + '" y2="' + base + '"/>' +
      bars.join('') +
      '<polyline class="tb-line" points="' + line.join(' ') + '"/>' +
      '<text class="tb-tick" x="' + pad + '" y="' + (h - 6) + '">' + Store.fmtShort(trend[0].date) + '</text>' +
      '<text class="tb-tick" x="' + (w - pad) + '" y="' + (h - 6) + '" text-anchor="end">' +
      Store.fmtShort(trend[n - 1].date) + '</text>' +
      '</svg>' +
      '<div class="tb-legend"><span><i class="lg-bar"></i>提交率</span><span><i class="lg-line"></i>按时率</span></div>';
  }

  /* ============================================================
     一、今日任务（填报页）
     ============================================================ */
  let ctx = null, draft = null, draftKey = null;

  function ensureDraft() {
    const u = Store.currentUser();
    const date = TODAY();
    const pid = Store.can('submit') ? u.id : ((Store.submitters()[0] || {}).id);
    const key = pid + '@' + date;
    if (draftKey === key && draft) return;
    ctx = { personId:pid, date:date };
    const rec = Store.taskOf(pid, date);
    draft = rec ? JSON.parse(JSON.stringify(rec)) : Store.newTask(pid, date, 'manual');
    draftKey = key;
  }
  const readOnly = () => draft.status === 'submitted' && !(draft.editRequest && draft.editRequest.granted);
  const emptyTask = () => ({ id:Store.newId('ti'), task:'', priority:'mid', pipeline:(Store.pipelines()[0] || {}).id, note:'' });

  function taskRowHTML(it, i) {
    /* 关联管线选「其他」时，备注从选填变必填 —— 否则统计里一堆「其他」没法归因 */
    const isOther = it.pipeline === 'other';
    const needNote = isOther && !(it.note || '').trim();
    const pipes = Store.pipelines().map(p => '<option value="' + p.id + '"' +
      (p.id === it.pipeline ? ' selected' : '') + '>' + E(p.short) + '</option>').join('');
    const pris = Store.TASK_PRIORITY.map(p => '<option value="' + p.id + '"' +
      (p.id === it.priority ? ' selected' : '') + '>' + E(p.t) + '</option>').join('');
    return '<div class="task-row" data-row="' + i + '">' +
      '<span class="tr-idx">' + (i + 1) + '</span>' +
      '<div class="tr-main">' +
        '<textarea class="txa" data-tt="' + i + '" rows="2" maxlength="200" placeholder="今天要做什么 —— 一句话说清（≤200 字）">' +
          E(it.task) + '</textarea>' +
        '<div class="tr-meta">' +
          '<span class="tiny muted">优先级</span><select class="sel" data-tpri="' + i + '">' + pris + '</select>' +
          '<span class="tiny muted">关联管线</span><select class="sel" data-tpline="' + i + '">' + pipes + '</select>' +
          '<input class="inp tr-note' + (needNote ? ' err' : '') + '" data-tn="' + i + '" value="' + E(it.note || '') +
            '" placeholder="' + (isOther ? '选了「其他」，请说明是什么（必填）' : '备注（选填）') + '">' +
        '</div>' +
        (isOther ? '<div class="hint' + (needNote ? ' err' : '') + '">关联管线选了「其他」，请在备注里说明具体是什么</div>' : '') +
      '</div>' +
      '<div class="tr-act">' +
        '<button type="button" class="btn ghost sm" data-tup="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="上移">↑</button>' +
        '<button type="button" class="btn ghost sm" data-tdn="' + i + '"' + (i === draft.items.length - 1 ? ' disabled' : '') + ' aria-label="下移">↓</button>' +
        '<button type="button" class="btn ghost sm danger" data-tdel="' + i + '" aria-label="删除">×</button>' +
      '</div></div>';
  }

  function errors() {
    const errs = [];
    if (readOnly()) return errs;
    if (!(draft.items || []).length) errs.push('至少需要 1 条任务');
    (draft.items || []).forEach((it, i) => {
      if (!(it.task || '').trim()) errs.push('任务 ' + (i + 1) + '：内容不能为空');
      if (it.pipeline === 'other' && !(it.note || '').trim())
        errs.push('任务 ' + (i + 1) + '：关联管线选了「其他」，请填写备注说明');
    });
    return errs;
  }

  function remindHTML(clock, st) {
    if (clock.passed && (st.key === 'missing' || st.key === 'draft'))
      return '<div class="tk-remind danger"><b>今日任务已截止（' + clock.deadline + '）</b>，你还没提交 —— ' +
        '尽快补交，逾期提交会留痕。</div>';
    if (clock.urgent && (st.key === 'missing' || st.key === 'draft'))
      return '<div class="tk-remind warn"><b>还有 ' + clock.left + ' 分钟</b>到截止时间（' + clock.deadline + '），别忘啦。</div>';
    if (clock.reminding && (st.key === 'missing' || st.key === 'draft'))
      return '<div class="tk-remind warn">距离今日任务截止还有 ' + clock.left + ' 分钟，记得提交。</div>';
    return '';
  }

  function renderFill(root) {
    ensureDraft();
    if (!Store.can('submit')) {
      root.innerHTML = '<div class="wrap"><div class="card"><div class="card-b">' +
        '<div class="sec-t">每日任务由填报人本人提交</div>' +
        '<p class="muted" style="margin:6px 0 12px;line-height:1.7">当前身份是管理员，不参与填报。' +
        '到「任务看板」可以看到团队今天的提交情况、未交与逾期名单。</p>' +
        '<button class="btn primary" id="tkGoBoard">去任务看板</button>' +
        '</div></div></div>';
      const b = $('#tkGoBoard', root);
      if (b) b.onclick = () => App.go('taskboard');
      return;
    }

    const person = Store.person(ctx.personId);
    const st = Store.taskState(ctx.personId, ctx.date);
    const clock = Store.taskClock(ctx.date);
    const ro = readOnly();
    const errs = errors();
    const req = draft.editRequest;
    /* 已提交后的状态条：按时 / 逾期 / 修改中（已放开）三种语气分开 */
    const noteCls = st.key === 'late' ? 'warn' : (st.key === 'editing' ? 'accent' : 'ok');
    const noteIco = st.key === 'late' ? '!' : (st.key === 'editing' ? '✎' : '✓');

    const headBadge = st.tone
      ? '<span class="badge ' + st.tone + '"><span class="dot"></span>' + E(st.label) + '</span>'
      : '<span class="badge line">' + E(st.label) + '</span>';
    const cdCls = clock.passed ? ' passed' : (clock.urgent ? ' urgent' : '');

    root.innerHTML =
      '<div class="wrap">' +
        '<div class="card tk-head">' +
          '<div class="tk-head-l"><h3>今日任务</h3>' +
            '<span class="h-sub">' + E(Store.fmtCN(ctx.date)) + ' · 截止 ' + clock.deadline + ' · 一天一条，当天收口</span></div>' +
          '<div class="tk-head-r">' +
            (clock.sameDay ? '<span class="tk-cd' + cdCls + '">' + Store.taskCountdownText(ctx.date) + '</span>' : '') +
            headBadge +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-h"><h3>任务清单</h3>' +
            '<span class="h-sub">' + (ro ? '已提交，如需调整请申请修改' : '至少 1 条 · 优先级与关联管线用于统计') + '</span>' +
            '<div class="h-right">' +
              '<span class="badge line">' + E(person ? person.name : '—') + '</span>' +
              (ro ? '' : '<button class="btn ghost sm" id="tkCopy">从昨日复制</button>' +
                '<button class="btn ghost sm" id="tkTpl">从模板导入</button>' +
                '<button class="btn ghost sm" id="tkPlan">带入日报明日计划</button>' +
                '<button class="btn ghost sm" id="tkAddEntry">+ 添加任务</button>') +
            '</div></div>' +
          '<div class="card-b">' +
            /* 已提交（含「修改中」）都有这条状态说明；未提交时不出现 */
            (draft.status === 'submitted'
              ? '<div class="note ' + noteCls + ' mb16"><span class="n-ico">' + noteIco + '</span><div><b>' + E(st.label) +
                '</b> · ' + Store.timeOf(draft.submittedAt) + ' 提交' +
                (st.key === 'late' ? '（超过 ' + clock.deadline + '，已留痕）' : '') +
                (req && req.granted
                  ? '　管理员已放开修改，可重新编辑提交。'
                  : '　提交后不可编辑，如需调整请点「申请修改」。') +
                '</div></div>' : '') +
            (req && !req.granted ? '<div class="note warn mb16"><span class="n-ico">!</span><div><b>已申请修改</b> · ' +
                Store.timeOf(req.at) + '　原因：' + E(req.reason || '—') + '　等管理员放开</div></div>' : '') +
            remindHTML(clock, st) +
            '<div id="tkList">' + ((draft.items || []).length
              ? draft.items.map((it, i) => taskRowHTML(it, i)).join('')
              : '<div class="hint">还没有任务 —— 可以从「昨日复制 / 模板导入」开始，或点「+ 添加任务」。</div>') + '</div>' +
            '<div class="field mt16"><label>备注<span class="muted">（选填，整单说明）</span></label>' +
              '<input class="inp" id="tkNote" value="' + E(draft.note || '') + '"' + (ro ? ' disabled' : '') +
              ' placeholder="今天整体情况、交接事项…"></div>' +
            (errs.length
              ? '<div class="note danger mt16"><span class="n-ico">!</span><div><b>还有 ' + errs.length + ' 项需要修正</b><div class="mt8">' +
                errs.map(x => '· ' + E(x)).join('<br>') + '</div></div></div>'
              : (ro ? '' : '<div class="note accent mt16"><span class="n-ico">✓</span><div>校验通过，可以提交。</div></div>')) +
          '</div>' +
          '<div class="card-f">' +
            '<span class="tiny muted">来源：' + E(Store.taskSourceText(draft.source)) +
              ' · ' + (ro ? '已提交' : '草稿自动保留') + '</span>' +
            '<div class="spacer"></div>' +
            (ro
              ? '<button class="btn" id="tkReqEdit">申请修改</button>'
              : '<button class="btn" id="tkSaveDraft">存草稿</button>' +
                '<button class="btn primary" id="tkSubmit"' + (errs.length ? ' disabled' : '') + '>提交今日任务</button>') +
          '</div>' +
        '</div>' +
      '</div>';

    bindFill(root);
  }

  function bindFill(root) {
    // 结构化变更 → 重渲染；文本变更 → 只改模型（不丢焦点）
    const add = $('#tkAddEntry', root);
    if (add) add.onclick = () => {
      if (draft.items.length >= 8) return UI.toast('一天最多 8 条任务', 'warn');
      draft.items.push(emptyTask()); renderFill(root);
    };
    const cp = $('#tkCopy', root);
    if (cp) cp.onclick = () => {
      const y = Store.taskCopyPrev(draft);
      if (!y) return UI.toast('往前 20 个工作日都没有可复制的任务', 'warn');
      UI.toast('已复制 ' + Store.fmtShort(y.date) + ' 的 ' + y.items.length + ' 条任务（可改可删）', 'ok');
      renderFill(root);
    };
    const tp = $('#tkTpl', root);
    if (tp) tp.onclick = () => openTemplatePicker();
    const pl = $('#tkPlan', root);
    if (pl) pl.onclick = () => {
      const items = Store.taskFromDailyPlan(ctx.personId, ctx.date);
      if (!items.length) return UI.toast('前一天日报没有填「明日工作任务」', 'warn');
      draft.items = draft.items.concat(items);
      draft.source = 'daily';
      UI.toast('已带入日报里的 ' + items.length + ' 条明日计划', 'ok');
      renderFill(root);
    };
    $$('[data-tdel]', root).forEach(b => b.onclick = () => {
      draft.items.splice(+b.dataset.tdel, 1); renderFill(root);
    });
    $$('[data-tup]', root).forEach(b => b.onclick = () => {
      const i = +b.dataset.tup; if (i <= 0) return;
      const x = draft.items.splice(i, 1)[0]; draft.items.splice(i - 1, 0, x); renderFill(root);
    });
    $$('[data-tdn]', root).forEach(b => b.onclick = () => {
      const i = +b.dataset.tdn; if (i >= draft.items.length - 1) return;
      const x = draft.items.splice(i, 1)[0]; draft.items.splice(i + 1, 0, x); renderFill(root);
    });
    $$('[data-tpri]', root).forEach(s => s.onchange = () => {
      draft.items[+s.dataset.tpri].priority = s.value;
    });
    $$('[data-tpline]', root).forEach(s => s.onchange = () => {
      draft.items[+s.dataset.tpline].pipeline = s.value;
      renderFill(root);                                   // 备注的必填态要跟着管线变
    });
    $$('[data-tt]', root).forEach(t => t.oninput = () => { draft.items[+t.dataset.tt].task = t.value; });
    $$('[data-tn]', root).forEach(t => t.oninput = () => { draft.items[+t.dataset.tn].note = t.value; });
    const nt = $('#tkNote', root);
    if (nt) nt.oninput = () => { draft.note = nt.value; };

    const sv = $('#tkSaveDraft', root);
    if (sv) sv.onclick = () => {
      draft.status = 'draft';
      Store.upsertTask(draft);
      UI.toast('草稿已保存', 'ok');
    };
    const sb = $('#tkSubmit', root);
    if (sb && !sb.disabled) sb.onclick = () => {
      const errs = errors();
      if (errs.length) return UI.toast(errs[0], 'warn');
      UI.confirmDialog('提交今日任务', '提交后不可编辑，如需调整要走「申请修改」（会留痕）。确认提交？', () => {
        const r = Store.submitTask(draft);
        UI.toast(r.late ? '已提交（逾期，已留痕）' : '已提交，按时完成', r.late ? 'warn' : 'ok');
        renderFill(root);
      }, '确认提交');
    };
    const rq = $('#tkReqEdit', root);
    if (rq) rq.onclick = () => openEditRequest();
  }

  function openTemplatePicker() {
    UI.modal({
      title:'从模板导入', sub:'模板按条线预置，导入后可自由修改',
      body:Store.TASK_TEMPLATES.map(t => '<button class="gs-row" data-tpl="' + t.id + '">' +
        '<span class="gs-t">' + E(t.name) + '</span>' +
        '<span class="gs-s">' + t.items.map(i => E(i.task)).join(' · ') + '</span></button>').join(''),
      onMount:(root, close) => {
        $$('[data-tpl]', root).forEach(b => b.onclick = () => {
          const tpl = b.dataset.tpl;
          close();
          const t = Store.taskApplyTemplate(draft, tpl);
          if (t) { UI.toast('已导入「' + t.name + '」的 ' + t.items.length + ' 条任务', 'ok'); currentRoot && renderFill(currentRoot); }
        });
      }
    });
  }

  function openEditRequest() {
    UI.modal({
      title:'申请修改', sub:'提交后不可编辑；管理员放开后即可重新编辑提交',
      body:'<div class="field"><label>修改原因 <span class="req">*</span></label>' +
        '<input class="inp" id="reqReason" placeholder="例如：任务描述有误，需补充场景编号"></div>',
      footer:'<button class="btn" data-close>取消</button><button class="btn primary" data-ok>提交申请</button>',
      onMount:(root, close) => {
        const inp = $('#reqReason', root);
        setTimeout(() => inp.focus(), 30);
        $('[data-ok]', root).onclick = () => {
          if (!(inp.value || '').trim()) { inp.classList.add('err'); return UI.toast('请填写修改原因', 'warn'); }
          close();
          Store.requestTaskEdit(draft, inp.value.trim());
          UI.toast('已提交修改申请，等管理员放开', 'ok');
          currentRoot && renderFill(currentRoot);
        };
      }
    });
  }

  function renderTask(root) {
    currentRoot = root;
    renderFill(root);
  }

  /* ============================================================
     二、任务看板
     ============================================================ */
  let bwDate = null, bwOpen = null;

  function statTiles(sub, clock) {
    const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
    return '<div class="tiles">' +
      '<div class="tile"><span class="t-l">今日提交率</span><b class="t-v">' + pct(sub.rate) + '</b>' +
        '<span class="t-s">' + sub.submittedN + '/' + sub.expectedN + ' 人已交</span></div>' +
      '<div class="tile"><span class="t-l">按时率</span><b class="t-v">' + pct(sub.onTimeRate) + '</b>' +
        '<span class="t-s">截止 ' + clock.deadline + ' 前提交</span></div>' +
      '<div class="tile"><span class="t-l">未交</span><b class="t-v ' + (sub.missingN ? 'danger' : '') + '">' +
        sub.missingN + '</b><span class="t-s">含草稿未提交</span></div>' +
      '<div class="tile"><span class="t-l">逾期</span><b class="t-v ' + (sub.lateN ? 'warn' : '') + '">' +
        sub.lateN + '</b><span class="t-s">超过 ' + clock.deadline + ' 提交</span></div>' +
      '</div>';
  }

  function peopleChips(list, kind) {
    if (!list.length) return '<span class="tiny muted">—</span>';
    return list.map(p => '<button class="chp" data-tbperson="' + p.id + '">' + avatar(p, 'sm') +
      '<span>' + E(p.name) + '</span></button>').join('');
  }

  function rowHTML(r, canManage) {
    const p = r.person, st = r.state, rec = st.rec;
    const items = (rec && rec.items) || [];
    const prio = { high:0, mid:0, low:0 };
    items.forEach(it => { prio[it.priority] = (prio[it.priority] || 0) + 1; });
    const prioBar = items.length
      ? Store.TASK_PRIORITY.filter(x => prio[x.id]).map(x =>
          '<span class="tb-prio ' + x.c + '">' + E(x.t) + ' ' + prio[x.id] + '</span>').join('')
      : '<span class="tiny muted">—</span>';
    const open = bwOpen === p.id;
    const detail = open ? '<div class="tb-detail">' +
      (items.length ? '<ol class="tb-ol">' + items.map(it =>
          '<li><span class="badge ' + (Store.taskPriority(it.priority).c || 'line') + '">' + E(Store.taskPriorityText(it.priority)) + '</span>' +
          '<span class="tb-it">' + E(it.task) + '</span>' +
          '<span class="tiny muted">' + E(Store.pipeline(it.pipeline).short) + (it.note ? ' · ' + E(it.note) : '') + '</span></li>').join('') + '</ol>'
        : '<div class="hint">该日没有任务记录</div>') +
      (rec && rec.note ? '<div class="hint">整单备注：' + E(rec.note) + '</div>' : '') +
      (rec && rec.editRequest ? '<div class="hint' + (rec.editRequest.granted ? '' : ' err') + '">修改申请：' +
        E(rec.editRequest.reason || '—') + '（' + (rec.editRequest.granted ? '已放开' : '待处理') + '）</div>' : '') +
      (canManage && rec && rec.editRequest && !rec.editRequest.granted
        ? '<div class="mt8"><button class="btn sm primary" data-tbgrant="' + p.id + '">放开修改</button></div>' : '') +
      '</div>' : '';
    return '<div class="tb-row' + (open ? ' open' : '') + '" data-tbrow="' + p.id + '">' +
      '<span class="tb-n">' + avatar(p) + '<span class="tb-name">' + E(p.name) + '</span>' +
        '<span class="tiny muted">' + E(Store.roleName(p.role)) + '</span></span>' +
      '<span class="tb-s">' + stateBadge(st) + '</span>' +
      '<span class="tb-t">' + (rec && rec.submittedAt ? Store.timeOf(rec.submittedAt) : '—') + '</span>' +
      '<span class="tb-c">' + items.length + ' 条</span>' +
      '<span class="tb-p">' + prioBar + '</span>' +
      '<span class="tb-x"><button class="btn ghost sm" data-tbopen="' + p.id + '">' + (open ? '收起' : '明细') + '</button></span>' +
      '</div>' + detail;
  }

  function renderBoard(root) {
    if (!bwDate) bwDate = TODAY();
    const canManage = Store.can('taskManage');
    const sub = Store.taskSubmission(bwDate);
    const clock = Store.taskClock(bwDate);
    const rows = Store.taskBoardRows(bwDate);
    const trend = Store.taskTrend(14);
    const vis = Store.taskVisibility();
    const isToday = bwDate === TODAY();
    const pending = rows.filter(r => r.state.key === 'requested');

    root.innerHTML =
      '<div class="wrap">' +
        '<div class="card">' +
          '<div class="card-h"><h3>任务看板</h3>' +
            '<span class="h-sub">' + E(Store.fmtCN(bwDate)) +
              (Store.isWorkday(bwDate) ? '' : ' · 非工作日') + ' · 截止 ' + clock.deadline + '</span>' +
            '<div class="h-right">' +
              '<button class="btn ghost sm" id="tbPrev">← 前一天</button>' +
              '<input class="inp" type="date" style="width:150px" id="tbDate" value="' + bwDate + '">' +
              '<button class="btn ghost sm" id="tbNext">后一天 →</button>' +
              (canManage ? '<button class="btn ghost sm" id="tbExport">导出 CSV</button>' : '') +
            '</div></div>' +
          '<div class="card-b">' +
            statTiles(sub, clock) +
            '<div class="tb-cols">' +
              '<div class="tb-sec"><div class="sec-t">未交名单' + (sub.missingN ? '（' + sub.missingN + '）' : '') + '</div>' +
                '<div class="chps">' + peopleChips(sub.missing, 'miss') + '</div>' +
                (canManage && sub.missingN ? '<button class="btn sm mt12" id="tbRemind">一键生成催交话术</button>' : '') +
              '</div>' +
              '<div class="tb-sec"><div class="sec-t">逾期名单' + (sub.lateN ? '（' + sub.lateN + '）' : '') + '</div>' +
                '<div class="chps">' + peopleChips(sub.late, 'late') + '</div>' +
                (pending.length ? '<div class="hint mt8">待放开修改 ' + pending.length + ' 人：' +
                  pending.map(r => E(r.person.name)).join('、') + '</div>' : '') +
              '</div>' +
              '<div class="tb-sec tb-sec-wide"><div class="sec-t">近 14 个工作日趋势</div>' + trendSVG(trend) + '</div>' +
            '</div>' +
            '<div class="hint" id="tbVis">看板可见性：<b>' + E(Store.taskVisText(vis)) + '</b>' +
              (canManage ? '（到「设置」可改，改动写操作日志）' : '（由管理员配置）') + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-h"><h3>' + (isToday ? '今日明细' : '当日明细') + '</h3>' +
            '<span class="h-sub">' + rows.length + ' 人 · 点「明细」看每条任务</span></div>' +
          '<div class="card-b tb-list">' +
            (rows.length ? rows.map(r => rowHTML(r, canManage)).join('')
              : '<div class="hint">按当前可见性设置，这里没有可显示的人。</div>') +
          '</div>' +
        '</div>' +
      '</div>';

    bindBoard(root);
  }

  function bindBoard(root) {
    const dp = $('#tbPrev', root);
    if (dp) dp.onclick = () => { bwDate = Store.prevWorkday(bwDate); bwOpen = null; renderBoard(root); };
    const dn = $('#tbNext', root);
    if (dn) dn.onclick = () => { bwDate = Store.nextWorkday(bwDate); bwOpen = null; renderBoard(root); };
    const dd = $('#tbDate', root);
    if (dd) dd.onchange = () => { bwDate = dd.value; bwOpen = null; renderBoard(root); };
    $$('[data-tbopen]', root).forEach(b => b.onclick = () => {
      bwOpen = bwOpen === b.dataset.tbopen ? null : b.dataset.tbopen;
      renderBoard(root);
    });
    $$('[data-tbgrant]', root).forEach(b => b.onclick = () => {
      const rec = Store.taskOf(b.dataset.tbgrant, bwDate);
      if (!rec) return;
      UI.confirmDialog('放开修改', '放开后 ' + Store.person(b.dataset.tbgrant).name +
        ' 可以重新编辑并提交这一天（' + Store.fmtShort(bwDate) + '）的任务，操作会记入日志。', () => {
        Store.grantTaskEdit(rec);
        UI.toast('已放开修改', 'ok');
        renderBoard(root);
      }, '放开');
    });
    const rb = $('#tbRemind', root);
    if (rb) rb.onclick = () => {
      const people = Store.taskMissingPeople(bwDate);
      const text = '【今日任务 · 催交】' + Store.fmtCN(bwDate) + '\n' +
        people.map(p => '· ' + p.name).join('\n') + '\n还没提交今天的任务，截止时间是 ' +
        Store.taskDeadline() + '，麻烦尽快补交。';
      UI.copy(text);
      Store.addLog(Store.currentUser().name, '催交每日任务',
        people.map(p => p.name).join('、') + ' · ' + Store.fmtShort(bwDate));
    };
    const ex = $('#tbExport', root);
    if (ex) ex.onclick = () => exportCSV();
  }

  function exportCSV() {
    const rows = [['日期', '姓名', '身份', '状态', '提交时间', '任务数', '高', '中', '低', '整单备注']];
    Store.taskBoardRows(bwDate).forEach(r => {
      const rec = r.state.rec, items = (rec && rec.items) || [];
      const c = k => items.filter(x => x.priority === k).length;
      rows.push([bwDate, r.person.name, Store.roleName(r.person.role), r.state.label,
        rec && rec.submittedAt ? Store.timeOf(rec.submittedAt) : '', items.length,
        c('high'), c('mid'), c('low'), (rec && rec.note) || '']);
    });
    UI.csv('每日任务_' + bwDate + '.csv', rows);
  }

  /* ============================================================
     三、统计（FR-41）：按时率 / 逾期率 / 加班分布 / 排行 / 任务分布
     权限两条独立的轴 —— 看板明细按可见性设置，统计聚合则：员工只看自己，
     管理员看全部。所以员工这一页看不到团队排行。
     ============================================================ */
  let stDays = 14;
  function pct(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
  function tile(l, v, s) {
    return '<div class="tile"><span class="t-l">' + E(l) + '</span><b class="t-v">' + v + '</b>' +
      '<span class="t-s">' + E(s) + '</span></div>';
  }

  function renderStats(root) {
    const mine = Store.taskStatsScope() === 'self';
    const me = Store.currentUser();
    const st = Store.taskStats(stDays);
    const rows = mine ? st.byPerson.filter(x => x.person.id === me.id) : st.byPerson;
    const my = rows[0] || { submitted:0, ontime:0, late:0, missing:0, items:0, expected:st.days,
      rate:null, onTimeRate:null, streak:0 };
    const totalItems = st.byPerson.reduce((a, x) => a + x.items, 0);
    const avgItems = st.submitted ? (totalItems / st.submitted).toFixed(1) : '—';

    const kpi = mine
      ? tile('我的按时率', pct(my.onTimeRate), my.ontime + '/' + my.expected + ' 天') +
        tile('我的提交率', pct(my.rate), '提交 ' + my.submitted + ' 天') +
        tile('我的逾期', my.late + ' 次', '未交 ' + my.missing + ' 天') +
        tile('连续按时', my.streak + ' 天', '从今天往前数')
      : tile('按时率', pct(st.onTimeRate), '近 ' + st.days + ' 个工作日') +
        tile('逾期率', pct(st.lateRate), '逾期 ' + st.late + ' 人次') +
        tile('未交率', pct(st.missingRate), '未交 ' + st.missing + ' 人次') +
        tile('平均任务数', avgItems, '条 / 人');

    const rank = mine
      ? '<div class="hint">团队排行与分布只对管理员开放。下面是你的数据。</div>' +
        '<div class="tiles">' + tile('我提交天数', my.submitted, '共 ' + st.days + ' 个工作日') +
        tile('我按时天数', my.ontime, '') + tile('我逾期天数', my.late, '') +
        tile('我记录任务', my.items + ' 条', '') + '</div>'
      : '<table class="tbl"><thead><tr><th>#</th><th>成员</th><th>按时率</th><th>提交</th><th>逾期</th>' +
        '<th>未交</th><th>连续按时</th><th>任务数</th></tr></thead><tbody>' +
        rows.map((x, i) => '<tr><td>' + (i + 1) + '</td>' +
          '<td>' + avatar(x.person) + ' ' + E(x.person.name) + '</td>' +
          '<td>' + pct(x.onTimeRate) + '</td><td>' + x.submitted + '</td><td>' + x.late + '</td>' +
          '<td>' + x.missing + '</td><td>' + x.streak + ' 天</td><td>' + x.items + '</td></tr>').join('') +
        '</tbody></table>';

    const maxP = Math.max.apply(null, st.byPipeline.map(x => x.n).concat([1]));
    const pipeHTML = st.byPipeline.length
      ? st.byPipeline.map(x => '<div class="dist-row"><span class="dist-l">' + E(x.pipeline.short) + '</span>' +
          '<span class="dist-bar"><i style="width:' + Math.round(x.n / maxP * 100) + '%"></i></span>' +
          '<span class="dist-n">' + x.n + '</span></div>').join('')
      : '<div class="hint">该区间没有任务记录</div>';
    const pr = st.priority;
    const prioHTML = ['high', 'mid', 'low'].map(k =>
      '<span class="tb-prio ' + (Store.taskPriority(k).c || '') + '">' + E(Store.taskPriorityText(k)) +
      ' ' + (pr[k] || 0) + '</span>').join(' ');

    const ot = st.overtime;
    const otMine = mine ? {
      n: ot.byPerson.filter(x => x.person.id === me.id).reduce((a, x) => a + x.n, 0),
      hours: ot.byPerson.filter(x => x.person.id === me.id).reduce((a, x) => a + x.hours, 0)
    } : null;
    const otHTML = '<div class="tiles">' +
      tile('加班频次', (mine ? otMine.n : ot.n) + ' 人次', '近 ' + st.days + ' 个工作日') +
      tile('加班总时长', (mine ? otMine.hours : ot.hours) + ' h', '预计值，不进成本') +
      (mine ? '' : tile('加班占比', pct(ot.rate), '占已提交日报')) +
      (mine ? '' : tile('加班人数', ot.byPerson.length + ' 人', '')) +
      '</div>' +
      (mine ? '' : '<div class="mt12">' + ot.buckets.map(b =>
        '<span class="tag">' + E(b.label) + ' · ' + b.n + '</span>').join(' ') + '</div>');

    const reasons = mine ? st.undoneReasons.filter(r => r.person.id === me.id) : st.undoneReasons;
    const reasonHTML = reasons.length
      ? '<ul class="tb-ol">' + reasons.slice(0, 8).map(r =>
          '<li><span class="tiny muted">' + E(r.person.name) + ' · ' + Store.fmtShort(r.date) + '</span>' +
          '<span class="tb-it">' + E(r.text) + '</span></li>').join('') + '</ul>'
      : '<div class="hint">该区间没有「未完成」记录</div>';

    root.innerHTML =
      '<div class="wrap">' +
        '<div class="card"><div class="card-h"><h3>任务与提交统计</h3>' +
          '<span class="h-sub">' + E(Store.fmtShort(st.from)) + ' – ' + E(Store.fmtShort(st.to)) +
            ' · ' + (mine ? '仅本人' : '全部 ' + st.byPerson.length + ' 人') + '</span>' +
          '<div class="h-right">' +
            '<button class="btn ghost sm" id="stRange">近 ' + stDays + ' 个工作日 ▾</button>' +
            '<button class="btn ghost sm" id="stExport">导出 CSV</button>' +
          '</div></div>' +
          '<div class="card-b">' +
            '<div class="tiles">' + kpi + '</div>' +
            '<div class="sec-t mt24">按时提交率趋势（柱：提交率 · 线：按时率）</div>' +
            trendSVG(st.trend) +
            '<div class="hint">柱高 = 当日提交率，折线 = 当日按时率。悬停看每天的具体数字。</div>' +
          '</div>' +
        '</div>' +

        '<div class="card"><div class="card-h"><h3>' + (mine ? '我的数据' : '成员提交排行') + '</h3>' +
          '<span class="h-sub">' + (mine ? '' : '按按时率排序') + '</span></div>' +
          '<div class="card-b">' + rank + '</div></div>' +

        '<div class="grid-2">' +
          '<div class="card"><div class="card-h"><h3>任务数量分布</h3><span class="h-sub">按关联管线</span></div>' +
            '<div class="card-b">' + pipeHTML +
              '<div class="mt16"><span class="tiny muted">优先级分布　</span>' + prioHTML + '</div></div></div>' +
          '<div class="card"><div class="card-h"><h3>加班频次与时长分布</h3>' +
            '<span class="h-sub">来自日报「今日是否加班」</span></div>' +
            '<div class="card-b">' + otHTML + '</div></div>' +
        '</div>' +

        '<div class="card"><div class="card-h"><h3>未完成原因</h3>' +
          '<span class="h-sub">来自日报条目「未完成」的原因填写</span></div>' +
          '<div class="card-b">' + reasonHTML + '</div></div>' +
      '</div>';

    const rg = $('#stRange', root);
    if (rg) rg.onclick = () => { stDays = stDays === 14 ? 5 : (stDays === 5 ? 30 : 14); renderStats(root); };
    const ex = $('#stExport', root);
    if (ex) ex.onclick = () => {
      const out = [['日期', '提交率', '按时率', '提交人数', '应提交', '逾期', '未交']];
      st.trend.forEach(t => out.push([t.date, pct(t.rate), pct(t.onTimeRate), t.submittedN, t.expectedN, t.lateN, t.missingN]));
      out.push([]);
      out.push(['成员', '按时率', '提交', '逾期', '未交', '连续按时', '任务数']);
      rows.forEach(x => out.push([x.person.name, pct(x.onTimeRate), x.submitted, x.late, x.missing, x.streak, x.items]));
      UI.csv('任务统计_' + st.from + '_' + st.to + '.csv', out);
    };
  }

  /* ============================================================
     注册
     ============================================================ */
  window.Views.task = {
    title:'今日任务', sub:'每天 10:45 前提交当日任务，当天收口',
    render: renderTask
  };
  window.Views.taskboard = {
    title:'任务看板', sub:'提交率 / 未交 / 逾期 / 趋势 —— 谁交了、谁还没交',
    render: renderBoard
  };
  window.Views.taskstats = {
    title:'任务与提交统计', sub:'按时率趋势 · 逾期与未交 · 加班分布 · 成员排行',
    render: renderStats
  };
})();
