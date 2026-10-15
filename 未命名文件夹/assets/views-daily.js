/* ============================================================
   视图 · 每日：日报填报 / 我的日报
   ============================================================ */
window.Views = window.Views || {};
(function () {
  const E = UI.esc, $ = UI.$, $$ = UI.$$;

  /* ---------------- 公共 ---------------- */
  /* 与「每日任务」共用同一个「今天」（Store.today()）：两边的闭环才对得上。 */
  function defaultDate() { return Store.today(); }
  /* 条目状态三选一（v1.15）：done 已完成 / undone 未完成 / overtime 需加班完成 */
  function emptyEntry(o) {
    return Object.assign({ pipeline:'other', task:'', progress:'done', reason:'', otHours:null,
      links:[], note:'', metrics:{} }, o || {});
  }

  /* ============================================================
     填报页
     ============================================================ */
  let ctx = null;      // { personId, date }
  let draft = null;    // 当前正在编辑的日报（深拷贝）

  function loadDraft() {
    const existing = Store.getReport(ctx.personId, ctx.date);
    if (existing) {
      draft = JSON.parse(JSON.stringify(existing));
    } else {
      /* 单向预填（v1.15）：早 10:45 定的「今日任务」→ 晚 18:30 写日报时自动带入，
         逐条标状态即可，不用写两遍。日报里临时补的条目不回写今日任务。 */
      const fromTask = Store.taskToDailyEntries(ctx.personId, ctx.date);
      draft = { id:Store.newId('r'), personId:ctx.personId, date:ctx.date, projectId:'metahuman',
        status:'draft', submittedAt:null, updatedAt:null, overtimeNote:'',
        entries: fromTask.length ? fromTask : [emptyEntry()], tomorrow:[],
        overtime:{ on:false, hours:null, reason:'' }, fromTask: fromTask.length > 0 };
    }
    if (!draft.entries || !draft.entries.length) draft.entries = [emptyEntry()];
    if (!draft.tomorrow) draft.tomorrow = [];
    if (draft.blocker == null) draft.blocker = '';
    if (!draft.overtime) draft.overtime = { on:false, hours:null, reason:'' };
    draft.entries.forEach(e => {
      e.links = e.links || []; e.metrics = e.metrics || {};
      if (e.reason == null) e.reason = '';
      if (e.otHours == null) e.otHours = null;
    });
  }

  /* 当日卡点（FR-35）：日报级字段。两条口径写在界面上，避免老师们猜：
     ① 选填；② 只进内部版，对外版完全没有这一栏。 */
  function blockerHTML() {
    const val = draft.blocker || '';
    return '<div class="blk-box">' +
      '<div class="m-t"><span>当日卡点</span>' +
        '<span class="muted">选填 · 只进内部版</span></div>' +
      '<textarea class="txa" id="dfBlocker" maxlength="200" placeholder="今天卡在哪：等谁、等什么数据、缺什么权限。（≤200 字）">' + E(val) + '</textarea>' +
      '<div class="hint">这一栏<b>不会出现在对外版</b>里 —— 卡点天然是内部协调事项（等谁 / 等什么数据 / 缺什么权限），' +
      '客户材料里没有这一栏。写清楚卡在哪、需要谁支持，PM 会在内会材料里置顶。</div>' +
      '</div>';
  }

  /* 今日是否加班（FR-39）：口径是「加班预测」—— 不进成本核算、不参与提交率，
     与 v1.9 下线的「工时」不是一回事，所以放在日报级而不是条目级。 */
  function overtimeHTML() {
    const o = draft.overtime || (draft.overtime = { on:false, hours:null, reason:'' });
    return '<div class="ot-box">' +
      '<div class="m-t"><span>今日是否加班</span><span class="muted">选填 · 只进内部版统计</span></div>' +
      '<div class="ot-row"><span class="tseg" data-otseg="1">' +
        '<button type="button" class="tp' + (o.on ? ' on' : '') + '" data-ot="on">是</button>' +
        '<button type="button" class="tp' + (!o.on ? ' on' : '') + '" data-ot="off">否</button></span>' +
        (o.on ? '<input class="inp" type="number" min="0" step="0.5" id="otHours" style="max-width:160px" value="' +
            (o.hours == null ? '' : o.hours) + '" placeholder="预计加班时长（小时）">' +
          '<input class="inp" id="otReason" value="' + E(o.reason || '') + '" placeholder="加班原因（选填）">' : '') +
      '</div>' +
      '<div class="hint">「预计加班时长」是预测值：不进成本、不参与提交率，只用于团队节奏观察。</div>' +
      '</div>';
  }

  function metricFieldsHTML(idx, e) {
    const pl = Store.pipeline(e.pipeline);
    const fields = (pl.metrics || []).filter(m => m.key !== 'usable');
    if (!fields.length) return '';
    const boxes = fields.map(m => {
      let val = e.metrics[m.key];
      if (m.type === 'money') val = (val == null ? '' : val / 100);
      return '<div class="field"><label>' + E(m.label) + '<span class="muted">（' + E(m.unit || '') + '）</span></label>' +
        '<input class="inp" type="number" step="' + (m.type === 'int' ? '1' : '0.01') + '" min="0" ' +
        'data-metric="' + m.key + '" data-idx="' + idx + '" value="' + (val == null ? '' : val) + '" placeholder="—"></div>';
    }).join('');
    const hint = pl.id === 'asset'
      ? '<div class="hint" style="grid-column:1/-1">「可用资产数」属客户侧数据（坤筛选后回传），不在老师表单内，由 PM 代录。</div>'
      : '';
    return '<div class="metric-box"><div class="m-t"><span>产能数字 · ' + E(pl.short) + '</span>' +
      '<span class="muted">选填，用于产能链路统计</span></div>' +
      '<div class="metric-grid">' + boxes + hint + '</div></div>';
  }

  function entryFormHTML(e, idx) {
    const pipes = Store.pipelines().map(p =>
      '<option value="' + p.id + '"' + (p.id === e.pipeline ? ' selected' : '') + '>' + E(p.name) +
      (p.namingPending ? '（命名待定）' : '') + '</option>').join('');
    /* 三态分段控件：不做进度百分比、不做「进行中」—— 当天必须收口 */
    const progs = ['done','undone','overtime'].map(v =>
      '<button type="button" class="tp' + (e.progress === v ? ' on' : '') + '" data-prog="' + idx + ':' + v + '">' +
      E(UI.PROGRESS[v].t) + '</button>').join('');
    const links = (e.links || []).map((l, i) =>
      '<div class="link-row"><input class="inp" data-link-url="' + i + '" data-idx="' + idx + '" value="' + E(l.url) + '" placeholder="https://…（截图 / 文档 / 提交记录）">' +
      '<input class="inp" style="max-width:150px" data-link-label="' + i + '" data-idx="' + idx + '" value="' + E(l.label || '') + '" placeholder="说明">' +
      '<button class="btn ghost sm" data-del-link="' + i + '" data-idx="' + idx + '">×</button></div>').join('');

    const needReason = e.progress === 'undone' && !(e.reason || '').trim();
    const needOtherNote = e.pipeline === 'other' && !(e.note || '').trim();

    return '<div class="entry-form" data-entry="' + idx + '">' +
      '<div class="ef-h"><span class="entry-idx">条目 ' + (idx + 1) + '</span>' +
        '<span class="ef-t">' + E(Store.pipeline(e.pipeline).short) + '</span>' +
        '<div class="spacer"></div>' +
        '<button class="btn-link danger" data-del-entry="' + idx + '">删除条目</button></div>' +
      '<div class="ef-grid">' +
        '<div class="field"><label>管线 <span class="req">*</span></label><select class="sel" data-pipe="' + idx + '">' + pipes + '</select></div>' +
        '<div class="field"><label>状态 <span class="req">*</span></label><div class="tseg" data-tseg="' + idx + '">' + progs + '</div></div>' +
        '<div class="field ef-full"><label>工作事项 <span class="req">*</span></label>' +
          '<textarea class="txa" data-task="' + idx + '" placeholder="今天具体做了什么、做到哪一步">' + E(e.task) + '</textarea></div>' +
        metricFieldsHTML(idx, e) +
        (e.progress === 'undone'
          ? '<div class="field ef-full"><label>未完成原因 <span class="req">*</span></label>' +
            '<input class="inp ' + (needReason ? 'err' : '') + '" data-reason="' + idx + '" value="' + E(e.reason || '') +
            '" placeholder="卡在哪：等谁 / 等什么数据 / 缺什么权限">' +
            (needReason ? '<div class="hint err">选「未完成」必须填写原因，否则无法提交</div>' : '') + '</div>'
          : '') +
        (e.progress === 'overtime'
          ? '<div class="field"><label>预计加班时长<span class="muted">（小时，选填）</span></label>' +
            '<input class="inp" type="number" min="0" step="0.5" data-oth="' + idx + '" value="' +
            (e.otHours == null ? '' : e.otHours) + '" placeholder="—"></div>'
          : '') +
        '<div class="field ef-full"><label>产出物链接<span class="muted">（选填）</span></label>' +
          '<div class="field" style="gap:6px">' + (links || '<div class="hint">暂无链接</div>') + '</div>' +
          '<div class="mt8"><button class="btn ghost sm" data-add-link="' + idx + '">+ 添加链接</button></div>' + '</div>' +
        '<div class="field" style="grid-column:span 2"><label>备注' +
          (e.pipeline === 'other' ? ' <span class="req">*</span>' : '<span class="muted">（选填）</span>') + '</label>' +
          '<input class="inp ' + (needOtherNote ? 'err' : '') + '" data-note="' + idx + '" value="' + E(e.note) +
          '" placeholder="' + (e.pipeline === 'other' ? '管线选了「其他」，请说明具体是什么' : '补充说明，≤100 字') + '">' +
          (needOtherNote ? '<div class="hint err">管线选了「其他」必须填写备注，否则无法提交</div>' : '') +
          '</div>' +
      '</div></div>';
  }

  function validate() {
    const errs = [];
    draft.entries.forEach((e, i) => {
      if (!(e.task || '').trim()) errs.push('条目 ' + (i + 1) + '：工作事项不能为空');
      if (e.progress === 'undone' && !(e.reason || '').trim()) errs.push('条目 ' + (i + 1) + '：未完成必须填写原因');
      if (e.pipeline === 'other' && !(e.note || '').trim())
        errs.push('条目 ' + (i + 1) + '：管线选了「其他」，必须填写备注说明');
    });
    if (!draft.entries.length) errs.push('至少需要 1 条工作条目');
    return errs;
  }

  function renderFill(root) {
    const u = Store.currentUser();
    if (!ctx) ctx = { personId: (Store.can('submit') ? u.id : (Store.submitters()[0] || {}).id), date: defaultDate() };
    if (!draft) loadDraft();

    const person = Store.person(ctx.personId);
    const workday = Store.isWorkday(ctx.date);
    const cfg = Store.state.config;
    const errs = validate();
    const submitted = draft.status === 'submitted' && draft.submittedAt;
    const isLate = submitted && Store.timeOf(draft.submittedAt) > cfg.deadline;

    const personSel = Store.isPrivileged()
      ? '<select class="sel" style="max-width:170px" id="fillPerson">' +
        Store.members().map(p => '<option value="' + p.id + '"' + (p.id === ctx.personId ? ' selected' : '') + '>' + E(p.name) + '</option>').join('') +
        '</select>'
      : '<span class="badge line">' + E(person.name) + '</span>';

    const yesterday = Store.prevWorkday(ctx.date);
    const yRep = Store.getReport(ctx.personId, yesterday);

    root.innerHTML =
      '<div class="wrap">' +
        '<div class="card">' +
          '<div class="card-h">' +
            '<h3>日报填报</h3>' +
            '<span class="h-sub">一人一天一条 · 下挂 1–10 条工作条目</span>' +
            '<div class="h-right">' + personSel +
              '<input class="inp" type="date" style="width:150px" id="fillDate" value="' + ctx.date + '">' +
              (submitted
                ? '<span class="badge ' + (isLate ? 'warn' : 'ok') + '"><span class="dot"></span>' +
                  (isLate ? '逾期提交' : '已提交') + ' ' + Store.timeOf(draft.submittedAt) + '</span>'
                : '<span class="badge warn"><span class="dot"></span>草稿未提交</span>') +
            '</div>' +
          '</div>' +
          '<div class="card-b">' +
            /* 单向预填提示（v1.15）：仅新建未提交时出现，提交后收起 */
            (draft.fromTask && !submitted
              ? '<div class="note accent mb16"><span class="n-ico">i</span><div><b>已自动带入今天的「今日任务」</b>' +
                '（' + (draft.entries || []).length + ' 条）—— 逐条标状态即可，不用再写一遍。' +
                '下午临时接的活可以直接加条目，不会回写到今日任务。</div></div>' : '') +
            (workday ? '' :
              '<div class="note warn mb16"><span class="n-ico">!</span><div><b>' + Store.fmtCN(ctx.date) +
              ' 为非工作日</b>（按当前工作日历配置）。提交仍可保存，但该日不计入应提交人数。最近工作日为 ' +
              '<a href="javascript:;" data-jump-workday="' + Store.prevWorkday(Store.S(new Date())) + '">' +
              Store.fmtCN(Store.prevWorkday(Store.S(new Date()))) + '</a>。</div></div>') +
            '<div class="row-wrap mb16">' +
              '<span class="tiny muted">提交截止 <b class="num">' + cfg.deadline + '</b>（系统时间 ' + Store.nowISO().slice(11) + '）</span>' +
              '<span class="tiny muted">· 提醒 ' + cfg.remind1 + ' / ' + cfg.remind2 + '</span>' +
              '<div class="spacer"></div>' +
              '<button class="btn ghost sm" id="btnReuse"' + (yRep ? '' : ' disabled') + '>复用昨日结构</button>' +
              '<button class="btn ghost sm" id="btnAddEntry">+ 添加条目</button>' +
            '</div>' +
            '<div id="entryList">' + draft.entries.map((e, i) => entryFormHTML(e, i)).join('') + '</div>' +
            blockerHTML() +
            overtimeHTML() +
            (errs.length
              ? '<div class="note danger mt16"><span class="n-ico">!</span><div><b>还有 ' + errs.length + ' 项需要修正</b><div class="mt8">' +
                errs.map(x => '· ' + E(x)).join('<br>') + '</div></div></div>'
              : '<div class="note accent mt16"><span class="n-ico">✓</span><div>校验通过，可以提交。</div></div>') +
          '</div>' +
          '<div class="card-f">' +
            '<span class="tiny muted">' + (submitted ? '已提交，可继续编辑（跨日编辑将记为新版本）' : '草稿会自动保留，22:00 前提交计入准时率') + '</span>' +
            '<div class="spacer"></div>' +
            '<button class="btn" id="btnCopyGroup"' + (draft.entries.some(e => e.task) ? '' : ' disabled') + '>汇报文本 · 两版</button>' +
            '<button class="btn" id="btnCopyClient" title="除当日卡点外的全部内容；金额 / 成本 / 内部链接会在复制前审查，通过才能复制"' +
              (draft.entries.some(e => e.task) ? '' : ' disabled') + '>复制对外版发群</button>' +
            '<button class="btn" id="btnSaveDraft">存草稿</button>' +
            '<button class="btn primary" id="btnSubmit"' + (errs.length ? ' disabled' : '') + '>提交日报</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindFill(root);
  }

  function bindFill(root) {
    const el = $('#fillPerson', root);
    if (el) el.onchange = () => { ctx.personId = el.value; loadDraft(); renderFill(root); };
    $('#fillDate', root).onchange = ev => { ctx.date = ev.target.value; loadDraft(); renderFill(root); };
    const jw = $('[data-jump-workday]', root);
    if (jw) jw.onclick = ev => { ev.preventDefault(); ctx.date = jw.getAttribute('data-jump-workday'); loadDraft(); renderFill(root); };

    $('#btnAddEntry', root).onclick = () => {
      if (draft.entries.length >= 10) return UI.toast('单个日报最多 10 条条目', 'warn');
      draft.entries.push(emptyEntry()); renderFill(root);
    };
    const btnReuse = $('#btnReuse', root);
    if (btnReuse && !btnReuse.disabled) btnReuse.onclick = () => {
      const y = Store.getReport(ctx.personId, Store.prevWorkday(ctx.date));
      if (!y) return UI.toast('昨日无日报可复用', 'warn');
      draft.entries = y.entries.map(x => Object.assign(emptyEntry(), { pipeline:x.pipeline }));
      UI.toast('已带出昨日管线结构，事项为空白', 'ok');
      renderFill(root);
    };

    // 结构化变更 → 重渲染
    $$('[data-del-entry]', root).forEach(b => b.onclick = () => {
      const i = +b.dataset.delEntry;
      draft.entries.splice(i, 1);
      if (!draft.entries.length) draft.entries.push(emptyEntry());
      renderFill(root);
    });
    $$('[data-pipe]', root).forEach(s => s.onchange = () => {
      draft.entries[+s.dataset.pipe].pipeline = s.value;
      renderFill(root);
    });
    $$('[data-prog]', root).forEach(b => b.onclick = () => {
      const a = b.dataset.prog.split(':');
      const e = draft.entries[+a[0]];
      e.progress = a[1];
      if (a[1] !== 'undone') e.reason = '';
      if (a[1] !== 'overtime') e.otHours = null;
      renderFill(root);
    });
    $$('[data-reason]', root).forEach(t => t.oninput = () => { draft.entries[+t.dataset.reason].reason = t.value; });
    $$('[data-oth]', root).forEach(t => t.oninput = () => {
      draft.entries[+t.dataset.oth].otHours = t.value === '' ? null : Number(t.value);
    });
    $$('[data-ot]', root).forEach(b => b.onclick = () => {
      draft.overtime = draft.overtime || { on:false, hours:null, reason:'' };
      draft.overtime.on = b.dataset.ot === 'on';
      if (!draft.overtime.on) { draft.overtime.hours = null; draft.overtime.reason = ''; }
      renderFill(root);
    });
    const oh = $('#otHours', root);
    if (oh) oh.oninput = () => { draft.overtime.hours = oh.value === '' ? null : Number(oh.value); };
    const orr = $('#otReason', root);
    if (orr) orr.oninput = () => { draft.overtime.reason = orr.value; };
    $$('[data-add-link]', root).forEach(b => b.onclick = () => {
      draft.entries[+b.dataset.addLink].links.push({ url:'', label:'' }); renderFill(root);
    });
    $$('[data-del-link]', root).forEach(b => b.onclick = () => {
      draft.entries[+b.dataset.delLink].links.splice(+b.dataset.idx, 1); renderFill(root);
    });

    // 当日卡点（FR-35）：自由文本，只更新模型不重渲染（避免丢焦点）
    const blk = $('#dfBlocker', root);
    if (blk) blk.oninput = () => { draft.blocker = blk.value; };

    // 文本/数值 → 只更新模型，不重渲染（避免丢焦点）
    $$('[data-task]', root).forEach(t => t.oninput = () => { draft.entries[+t.dataset.task].task = t.value; });
    $$('[data-note]', root).forEach(t => t.oninput = () => { draft.entries[+t.dataset.note].note = t.value; });
    $$('[data-metric]', root).forEach(t => t.oninput = () => {
      const i = +t.dataset.idx, k = t.dataset.metric;
      const pl = Store.pipeline(draft.entries[i].pipeline);
      const def = (pl.metrics || []).find(m => m.key === k) || {};
      let v = t.value === '' ? null : Number(t.value);
      if (v != null && def.type === 'money') v = Math.round(v * 100);
      draft.entries[i].metrics[k] = v;
    });
    $$('[data-link-url]', root).forEach(t => t.oninput = () => {
      draft.entries[+t.dataset.idx].links[+t.dataset.linkUrl].url = t.value;
    });
    $$('[data-link-label]', root).forEach(t => t.oninput = () => {
      draft.entries[+t.dataset.idx].links[+t.dataset.linkLabel].label = t.value;
    });
    $('#btnSaveDraft', root).onclick = () => { draft.status = 'draft'; persist(); renderFill(root); UI.toast('草稿已保存', 'ok'); };

    $('#btnCopyGroup', root).onclick = () => openReportText(reportFor(ctx.personId, ctx.date), () => renderFill(root));

    const btnCC = $('#btnCopyClient', root);
    if (btnCC && !btnCC.disabled) btnCC.onclick = () => copyClient(reportFor(ctx.personId, ctx.date), () => renderFill(root));

    $('#btnSubmit', root).onclick = () => {
      const errs = validate();
      if (errs.length) return UI.toast('还有 ' + errs.length + ' 项需要修正', 'danger');
      const doSubmit = () => {
        const today = Store.S(new Date());
        const keepOld = draft.submittedAt && draft.date !== today;
        const next = normalize();
        next.status = 'submitted';
        next.submittedAt = keepOld ? draft.submittedAt : Store.nowISO();
        draft = next;
        persist();
        const t = Store.timeOf(draft.submittedAt);
        Store.addLog(Store.currentUser().id, '提交日报', personLabel() + ' · ' + draft.date + ' · ' + t);
        renderFill(root);
        UI.toast(t > Store.state.config.deadline ? '已提交（' + t + '，记为逾期提交）' : '已提交（' + t + '，准时）',
                 t > Store.state.config.deadline ? 'warn' : 'ok');
      };
      doSubmit();
    };
  }

  function personLabel() { const p = Store.person(ctx.personId); return p ? p.name : ''; }
  function normalize() {
    const copy = JSON.parse(JSON.stringify(draft));
    copy.personId = ctx.personId; copy.date = ctx.date;
    copy.entries = copy.entries.map(e => Object.assign({
      pipeline:e.pipeline, task:(e.task || '').trim(),
      progress:e.progress || 'done', note:(e.note || '').trim(),
      /* 未完成原因必填（校验层保证）；加班时长选填、为空时存 null */
      reason:(e.reason || '').trim(),
      otHours:(e.progress === 'overtime' && e.otHours != null && e.otHours !== '') ? Number(e.otHours) : null,
      links:(e.links || []).filter(l => (l.url || '').trim()),
      metrics:e.metrics || {}
    }, e.fromTask ? { fromTask:true } : {}));
    copy.tomorrow = (copy.tomorrow || [])
      .filter(t => (t.task || '').trim())
      .map(t => ({ pipeline:t.pipeline || 'other', task:(t.task || '').trim() }));
    // 当日卡点：只是文本，不是工作条目 —— 存档时截断到 200 字
    copy.blocker = (copy.blocker || '').trim().slice(0, 200);
    /* 加班（日报级）：不进成本、不参与提交率 */
    const ot = copy.overtime || { on:false, hours:null, reason:'' };
    copy.overtime = { on:!!ot.on,
      hours: ot.on && ot.hours != null && ot.hours !== '' ? Number(ot.hours) : null,
      reason: ot.on ? (ot.reason || '').trim() : '' };
    if (copy.fromTask == null) copy.fromTask = false;
    return copy;
  }
  function persist() { const n = normalize(); Store.upsertReport(n); draft = n; }

  /* ============================================================
     我的日报
     ============================================================ */
  let mineCtx = null;

  function renderMine(root) {
    const u = Store.currentUser();
    // 同填报页：切身份后「我的日报」也要跟着换人，不能沿用上一个人的记录
    if (!mineCtx || mineCtx.personId !== u.id) {
      mineCtx = { personId: Store.can('submit') ? u.id : (Store.submitters()[0] || {}).id };
    }
    const p = Store.person(mineCtx.personId);
    const reps = Store.state.reports.filter(r => r.personId === mineCtx.personId)
      .sort((a, b) => b.date.localeCompare(a.date));
    const from = Store.addDays(Store.S(new Date()), -29);

    const sub = Store.sum(reps.filter(r => r.date >= from && r.status === 'submitted'), r => 1);
    const expected = Store.workdaysInRange(from, Store.S(new Date())).length;
    const picker = Store.isPrivileged()
      ? '<select class="sel" style="max-width:170px" id="minePerson">' +
        Store.members().map(x => '<option value="' + x.id + '"' + (x.id === mineCtx.personId ? ' selected' : '') + '>' + E(x.name) + '</option>').join('') +
        '</select>'
      : '<span class="badge line">' + E(p.name) + '</span>';

    root.innerHTML =
      '<div class="wrap">' +
        '<div class="grid g2 mb16">' +
          kpi('近 30 天提交', sub + '<span class="u">/ ' + expected + ' 天</span>', '应提交日按工作日历计算') +
          kpi('主责管线', E(Store.pipeline(p.mainPipe).short), E(p.title)) +
        '</div>' +
        '<div class="card">' +
          '<div class="card-h"><h3>我的日报</h3><span class="h-sub">共 ' + reps.length + ' 条记录</span>' +
            '<div class="h-right">' + picker + '<button class="btn sm" id="mineExport">导出 CSV</button></div></div>' +
          '<div class="card-b tight">' +
            (reps.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
              '<th style="width:104px">日期</th><th style="width:92px">状态</th><th>工作条目</th>' +
              '<th style="width:180px">当日卡点</th>' +
              '<th style="width:130px">进度分布</th><th style="width:130px">汇报文本</th>' +
              '</tr></thead><tbody>' +
              reps.map(r => {
                const t = Store.timeOf(r.submittedAt);
                const late = r.status === 'submitted' && t > Store.state.config.deadline;
                return '<tr>' +
                  '<td class="nowrap">' + Store.fmtShort(r.date) + ' <span class="muted tiny">' + Store.weekdayCN(r.date) + '</span></td>' +
                  '<td>' + (r.status === 'submitted'
                    ? '<span class="badge ' + (late ? 'warn' : 'ok') + '"><span class="dot"></span>' + (late ? '逾期提交' : '已提交') + '</span><div class="tiny muted mt8">' + t + '</div>'
                    : '<span class="badge warn"><span class="dot"></span>草稿</span><div class="tiny muted mt8">' + (Store.fmtAt(r.updatedAt) || '') + '</div>') + '</td>' +
                  '<td>' + (r.entries || []).map(e =>
                    '<div style="margin-bottom:4px"><span class="tag">' + E(Store.pipeline(e.pipeline).short) + '</span> ' +
                    E(e.task.length > 62 ? e.task.slice(0, 62) + '…' : e.task) +
                    (e.progress === 'undone' ? ' <span class="badge danger"><span class="dot"></span>未完成</span>' : '') +
                    (e.progress === 'overtime' ? ' <span class="badge warn"><span class="dot"></span>需加班</span>' : '') + '</div>').join('') + '</td>' +
                  '<td>' + ((r.blocker || '').trim()
                    ? '<div class="tiny"><span class="badge warn tiny"><span class="dot"></span>卡点</span> ' +
                      E(r.blocker.trim().length > 46 ? r.blocker.trim().slice(0, 46) + '…' : r.blocker.trim()) + '</div>' +
                      '<div class="tiny muted mt8">只进内部版</div>'
                    : '<span class="muted tiny">—</span>') + '</td>' +
                  '<td>' + seg(r) + '</td>' +
                  '<td class="nowrap"><button class="btn ghost xs" data-text="' + r.personId + '|' + r.date + '">汇报文本</button>' +
                    '<button class="btn ghost xs" style="margin-left:4px" data-copyclient="' + r.personId + '|' + r.date + '">复制对外版</button></td>' +
                  '</tr>';
              }).join('') + '</tbody></table></div>'
              : '<div class="empty"><div class="e-ico">—</div>暂无日报记录</div>') +
          '</div>' +
        '</div>' +
      '</div>';

    const mp = $('#minePerson', root);
    if (mp) mp.onchange = () => { mineCtx.personId = mp.value; renderMine(root); };
    UI.$$('[data-text]', root).forEach(b => b.onclick = () => {
      const parts = b.dataset.text.split('|');
      const rep = Store.getReport(parts[0], parts[1]);
      if (rep) openReportText(rep, () => renderMine(root));
    });
    UI.$$('[data-copyclient]', root).forEach(b => b.onclick = () => {
      const parts = b.dataset.copyclient.split('|');
      const rep = Store.getReport(parts[0], parts[1]);
      if (rep) copyClient(rep, () => renderMine(root));
    });
    $('#mineExport', root).onclick = () => {
      const rows = [['日期','状态','提交时间','管线','工作事项','状态','未完成原因','产出链接']];
      reps.forEach(r => {
        (r.entries || []).forEach((e, i) => rows.push([
          r.date, r.status === 'submitted' ? '已提交' : '草稿', Store.timeOf(r.submittedAt) || '',
          Store.pipeline(e.pipeline).name, e.task, UI.PROGRESS[e.progress].t, e.reason || e.note || '',
          (e.links || []).map(l => l.url).join(' '),
        ]));
      });
      UI.csv('日报-' + p.name + '.csv', rows);
    };
  }

  function kpi(label, val, sub) {
    return '<div class="kpi"><div class="k-label">' + E(label) + '</div><div class="k-val">' + val + '</div>' +
      (sub ? '<div class="k-sub">' + E(sub) + '</div>' : '') + '</div>';
  }
  function seg(r) {
    const map = { done:'var(--ok)', undone:'var(--danger)', overtime:'var(--warn-fill)' };
    const counts = { done:0, undone:0, overtime:0 };
    (r.entries || []).forEach(e => { counts[e.progress] = (counts[e.progress] || 0) + 1; });
    const total = (r.entries || []).length || 1;
    const bars = Object.keys(counts).filter(k => counts[k]).map(k =>
      '<i style="width:' + (counts[k] / total * 100) + '%;background:' + map[k] + '"></i>').join('');
    return '<span class="seg">' + bars + '</span> <span class="tiny muted">' + (r.entries || []).length + ' 条</span>';
  }

  /* ============================================================
     汇报文本 · 内部版 / 对外版（FR-27）
     两版同源，只差字段可见范围。网站只对内部开放，所以**两版在站内都可见**；
     区别不在「谁能看」，而在「哪一版能发出去」——对外版在复制前必须过外发审查。
     ============================================================ */
  // 取一份「活对象」：正在编辑的草稿直接引用 draft.entries；历史日报走库里的对象。
  function reportFor(personId, date) {
    if (draft && draft.personId === personId && draft.date === date) {
      return { id:draft.id, personId:personId, date:date, status:draft.status, entries:draft.entries, tomorrow:draft.tomorrow, blocker:draft.blocker };
    }
    return Store.getReport(personId, date) || { personId:personId, date:date, entries:[], tomorrow:[], blocker:'' };
  }

  function markLeak(text) {
    let h = E(text);
    Store.LEAK_RULES.forEach(r => {
      h = h.replace(new RegExp(r.re.source, 'g'), m => '<mark class="leak">' + m + '</mark>');
    });
    return h;
  }

  function reportTextBody(report, v) {
    const leak = v.leaks.length
      ? '<div class="note danger mb16"><span class="n-ico">!</span><div>' +
        '<b>对外版未通过外发审查：扫到 ' + v.leaks.length + ' 类内部信息</b>' +
        '<div class="mt8">' + v.leaks.map(l => '· <b>' + E(l.kind) + '</b>：' + E(l.hits.join('、'))).join('<br>') + '</div>' +
        '<div class="mt8 tiny">修法：回填报页把描述里的金额 / 成本 / 内部链接改写掉。' +
        '对外版是唯一能直接发出公司的那一份，撤回代价高，所以这里默认拦住不给复制。</div></div></div>'
      : '<div class="note ok mb16"><span class="n-ico">✓</span><div>' +
        '<b>对外版已通过外发审查</b>：不含成本、金额、内部链接与内部命名，可以发群。</div></div>';

    const both = '<div class="note accent mb16"><span class="n-ico">i</span><div>' +
      '本系统<b>只对内部开放</b>（客户侧无账号），所以两版在站内<b>都可见</b>；' +
      '区别是：<b>内部版</b>发给内部（内会 / 周会 / 内部群），<b>对外版</b>是唯一可以直接发出去的那一版。</div></div>';

    // 当日卡点（FR-35）：写了就在两版说明里点明「只进内部版」，没写不占版面
    const bl = (v.blocker || '').trim();
    const blNote = bl
      ? '<div class="note warn mb16"><span class="n-ico">i</span><div>当日卡点 <b>只出现在内部版</b>：' +
        E(bl.length > 60 ? bl.slice(0, 60) + '…' : bl) +
        '<div class="mt8 tiny">卡点是内部协调事项（等谁 / 等什么数据 / 缺什么权限），对外版根本没有这一栏，它不会漏出去。</div></div></div>'
      : '';

    return leak + both + blNote +
      '<div class="twocol">' +
        '<div class="tcol">' +
          '<div class="tcol-h"><span class="badge line">内部版</span><span class="tiny muted">含当日卡点 · 发给内部</span></div>' +
          '<div class="copybox">' + E(v.internalText) + '</div>' +
        '</div>' +
        '<div class="tcol">' +
          '<div class="tcol-h"><span class="badge accent">对外版</span><span class="tiny muted">除当日卡点外全部内容 · 成本 / 金额 / 内部链接不出现</span></div>' +
          '<div class="copybox">' + (v.leaks.length ? markLeak(v.clientText) : E(v.clientText)) + '</div>' +
        '</div>' +
      '</div>';
  }

  /* 一键复制「对外版」——发给 Kelvin / 微信群的那一份。
     外发审查没过就拦住（只白名单挡不住人在事项描述里随手写金额），
     并直接把「汇报文本 · 两版」弹窗打开，让人就地改。 */
  function copyClient(report, onChange) {
    const v = Store.reportVersions(report);
    if (v.leaks.length) {
      UI.toast('对外版扫到内部信息（' + v.leaks.map(l => l.kind).join('、') + '），先修正再复制', 'danger');
      openReportText(report, onChange);
      return false;
    }
    UI.copy(v.clientText);
    return true;
  }

  function openReportText(report, onChange) {
    const build = () => {
      const v = Store.reportVersions(report);
      return { v:v, html:reportTextBody(report, v) };
    };

    UI.modal({
      title:'每日汇报文本 · 两个版本',
      sub:'同一份日报派生：对外版 = 除当日卡点外的全部内容，成本 / 金额 / 内部链接会在复制前审查；两版站内都可见，但只有对外版能发出去',
      xwide:true,
      body:build().html,
      footer:'<button class="btn" data-close>关闭</button>' +
        '<button class="btn" data-copy="internal">复制内部版</button>' +
        '<button class="btn primary" data-copy="client"></button>',
      onMount:function (root, close) {
        const bind = () => {
          UI.$$('[data-vt]', root).forEach(c => c.onchange = () => {
            report.entries[+c.dataset.vt].clientVisible = c.checked;
            Store.save();
            refresh();
            if (onChange) onChange();
          });
        };
        const refresh = () => {
          const b = build();
          $('.modal-b', root).innerHTML = b.html;
          bind();
          const cb = $('[data-copy="client"]', root);
          cb.disabled = b.v.leaks.length > 0;
          cb.textContent = b.v.leaks.length ? '对外版未通过审查（先修正）' : '复制对外版发群';
        };
        bind();
        $('[data-copy="internal"]', root).onclick = () => UI.copy(build().v.internalText);
        refresh();
      }
    });
  }

  /* ---------------- 注册 ---------------- */
  window.Views.fill = {
    title:'日报填报', sub:'一人一天一条 · 下挂 1–10 条工作条目',
    render: root => {
      // 填报上下文始终跟随当前登录人：切身份后不能沿用上一个人的 ctx / 草稿
      // （v1.12 起最高权限没有填报入口，这里恒为「本人填自己」）
      const me = Store.currentUser();
      const mine = Store.can('submit') ? me.id : (Store.submitters()[0] || {}).id;
      if (!ctx || ctx.personId !== mine) { ctx = { personId: mine, date: defaultDate() }; draft = null; }
      if (!draft) loadDraft();
      renderFill(root);
    }
  };
  window.Views.mine = {
    title:'我的日报', sub:'个人历史记录与统计',
    render: renderMine
  };
})();
