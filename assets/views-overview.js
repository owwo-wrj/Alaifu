/* ============================================================
   视图 · 总览：日报看板 / 未交名单与催办
   ============================================================ */
window.Views = window.Views || {};
(function () {
  const E = UI.esc, $ = UI.$, $$ = UI.$$;
  const kpi = UI.kpi = UI.kpi || function (label, val, sub, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="k-label">' + label + '</div><div class="k-val">' + val + '</div>' +
      (sub ? '<div class="k-sub">' + sub + '</div>' : '') + '</div>';
  };
  const pct = UI.pct;

  /* ============================================================
     一、日报看板
     ============================================================ */
  let boardDate = null;

  function statusBadgeOf(rep, date) {
    if (!rep) return '<span class="badge danger"><span class="dot"></span>未交</span>';
    if (rep.status !== 'submitted') return '<span class="badge warn"><span class="dot"></span>有草稿未提交</span>';
    const t = Store.timeOf(rep.submittedAt);
    if (t > Store.state.config.deadline) return '<span class="badge warn"><span class="dot"></span>逾期提交 ' + t + '</span>';
    return '<span class="badge ok"><span class="dot"></span>已提交 ' + t + '</span>';
  }

  /* ---- 看板主体：日期条 + 阻塞事项 + 人员工作情况 ----
     v1.11 起回到独立入口（侧栏「日报看板」），不再被其他页面复用 */
  function boardMainHTML(date) {
    const s = Store.submission(date);

    // 阻塞事项（跨当日全部提交记录）
    const blocked = [];
    Store.reportsOn(date).forEach(r => (r.entries || []).forEach(e => {
      if (e.progress === 'undone') blocked.push({ r:r, e:e, p:Store.person(r.personId) });
    }));

    const cards = s.expected.map(p => {
      const rep = Store.getReport(p.id, date);
      const entries = rep ? (rep.entries || []) : [];
      const blockedN = entries.filter(e => e.progress === 'undone').length;
      const cls = blockedN ? 'has-block' : (!rep || rep.status !== 'submitted' ? 'miss' : '');
      const tags = entries.length
        ? entries.map(e => '<span class="tag">' + E(Store.pipeline(e.pipeline).short) + '</span>').join('') +
          (blockedN ? '<span class="badge danger"><span class="dot"></span>' + blockedN + ' 项未完成</span>' : '')
        : '<span class="muted tiny">无记录</span>';
      return '<div class="pcard ' + cls + '" data-person="' + p.id + '">' +
        '<div class="p-top"><span class="p-name">' + E(p.name) + '</span>' +
          '<span class="p-pipe">' + E(Store.pipeline(p.mainPipe).short) + '</span></div>' +
        '<div class="mt8">' + statusBadgeOf(rep, date) + '</div>' +
        '<div class="p-meta"><span><b>' + entries.length + '</b>条目</span>' +
          (blockedN ? '<span><b>' + blockedN + '</b>未完成</span>' : '') + '</div>' +
        '<div class="p-tags">' + tags + '</div>' +
        (rep && rep.status === 'submitted' && entries.length
          ? '<div class="p-act mt8"><button class="btn ghost xs" data-copyclient="' + p.id + '|' + date + '">复制对外版发群</button></div>' : '') +
        '</div>';
    }).join('');

    return '<div class="row-wrap mb16">' +
        '<input class="inp" type="date" style="width:158px" id="bdDate" value="' + date + '">' +
        '<span class="tiny muted">' + Store.fmtCN(date) + (Store.isWorkday(date) ? '' : ' · 非工作日') + '</span>' +
        '<div class="spacer"></div>' +
        '<button class="btn ghost sm" id="bdPrev">← 上一工作日</button>' +
        '<button class="btn ghost sm" id="bdNext">下一工作日 →</button>' +
        '<button class="btn sm" id="bdCopy">复制站会文本</button>' +
      '</div>' +

      (blocked.length ? '<div class="card mb16" style="border-color:#eed9d7">' +
        '<div class="card-h" style="background:var(--danger-soft)"><h3 style="color:var(--danger)">阻塞事项 · ' + blocked.length + ' 项</h3>' +
        '<span class="h-sub">需要老板 / PM 当场拍板，勿静默</span></div>' +
        '<div class="card-b tight"><table class="tbl compact"><tbody>' +
        blocked.map(b => '<tr>' +
          '<td style="width:110px">' + E(b.p.name) + '</td>' +
          '<td style="width:130px"><span class="tag">' + E(Store.pipeline(b.e.pipeline).short) + '</span></td>' +
          '<td>' + E(b.e.task) + '</td>' +
          '<td style="width:38%"><span class="badge danger"><span class="dot"></span>卡点</span> ' + E(b.e.note || '未填写原因') + '</td>' +
          '</tr>').join('') + '</tbody></table></div></div>' : '') +

      '<div class="sec-t">人员工作情况 · ' + Store.fmtCN(date) + '</div>' +
      '<div class="grid g3">' + cards + '</div>';
  }

  function bindBoardMain(root, rerender) {
    $('#bdDate', root).onchange = e => { boardDate = e.target.value; rerender(); };
    $('#bdPrev', root).onclick = () => { boardDate = Store.prevWorkday(boardDate); rerender(); };
    $('#bdNext', root).onclick = () => { boardDate = Store.nextWorkday(boardDate); rerender(); };
    $('#bdCopy', root).onclick = () => UI.copy(standupText(boardDate, Store.submission(boardDate)));
    $$('[data-person]', root).forEach(c => c.onclick = () => openPersonModal(c.dataset.person, boardDate));
    // 一键复制对外版：过了外发审查才给复制，否则拦住并指路去修正
    $$('[data-copyclient]', root).forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      const parts = b.dataset.copyclient.split('|');
      const r = Store.getReport(parts[0], parts[1]);
      if (!r) return;
      const v = Store.reportVersions(r);
      if (v.leaks.length) {
        return UI.toast('对外版扫到内部信息（' + v.leaks.map(l => l.kind).join('、') + '），先修正再复制', 'danger');
      }
      UI.copy(v.clientText);
    });
  }

  function renderBoard(root) {
    if (!boardDate) boardDate = window.SEED.demoDate;
    const s = Store.submission(boardDate);
    const missing = s.missing;
    root.innerHTML =
      '<div class="wrap-wide">' +
        '<div class="grid g5 mb16">' +
          kpi('应提交', s.expectedN) +
          kpi('已提交', s.submittedN, '含逾期提交 ' + s.lateN) +
          kpi('提交率', pct(s.rate), Store.state.config.deadline + ' 前为准时', s.rate >= 0.95 ? 'ok' : (s.rate < 0.8 ? 'danger' : '')) +
          kpi('准时率', pct(s.onTimeRate), '准时 ' + s.onTimeN + ' / ' + s.expectedN) +
          kpi('未交', '<span style="color:var(--danger)">' + s.missingN + '</span>', s.draftsN ? '其中 ' + s.draftsN + ' 人有草稿' : '') +
        '</div>' +

        (missing.length ? '<div class="card mb16" style="border-color:#f0e4cb">' +
          '<div class="card-h" style="background:var(--warn-soft)"><h3 style="color:var(--warn)">未交 · ' + missing.length + ' 人</h3>' +
          '<span class="h-sub">可在「未交名单」页生成催办话术</span></div>' +
          '<div class="card-b"><div class="row-wrap">' +
          missing.map(p => {
            const r = Store.getReport(p.id, boardDate);
            return '<span class="badge warn"><span class="dot"></span>' + E(p.name) +
              (r && r.status === 'draft' ? '（有草稿）' : '') + '</span>';
          }).join('') + '</div></div></div>' : '') +

        boardMainHTML(boardDate) +
      '</div>';
    bindBoardMain(root, () => renderBoard(root));
  }

  function standupText(date, s) {
    const L = ['【MetaHuman 项目 · 日报速览】' + Store.fmtCN(date)];
    L.push('应提交 ' + s.expectedN + ' · 已提交 ' + s.submittedN + ' · 准时率 ' + pct(s.onTimeRate) + ' · 未交 ' + s.missingN + ' 人');
    L.push('');
    s.expected.forEach(p => {
      const rep = Store.getReport(p.id, date);
      if (!rep || rep.status !== 'submitted') {
        L.push('▍' + p.name + '（' + Store.pipeline(p.mainPipe).short + '）：未交');
        return;
      }
      L.push('▍' + p.name + '（' + Store.pipeline(p.mainPipe).short + '）');
      (rep.entries || []).forEach(e => {
        L.push('  · ' + Store.pipeline(e.pipeline).short + '｜' + e.task +
          (e.progress === 'undone' ? '【未完成：' + (e.reason || e.note || '') + '】' : ''));
      });
    });
    return L.join('\n');
  }

  function openPersonModal(personId, date) {
    const p = Store.person(personId);
    const rep = Store.getReport(personId, date);
    UI.modal({
      title: p.name + ' · ' + Store.fmtCN(date),
      sub: Store.pipeline(p.mainPipe).short + (rep ? ' · ' + (rep.entries || []).length + ' 条目' : ''),
      wide: true,
      body: !rep ? '<div class="empty">当日无日报记录</div>'
        : '<div class="mb16">' + statusBadgeOf(rep, date) + '</div>' +
          ((rep.blocker || '').trim()
            ? '<div class="note warn mb16"><span class="n-ico">!</span><div><b>当日卡点</b> ' +
              '<span class="tiny muted">（只进内部版，对外版不出现）</span>' +
              '<div class="mt8">' + E(rep.blocker.trim()) + '</div></div></div>' : '') +
          (rep.entries || []).map((e, i) =>
            '<div class="entry ' + (e.progress === 'undone' ? 'blocked' : (e.progress === 'done' ? 'done' : '')) + '">' +
              '<div class="entry-h"><span class="entry-idx">#' + (i + 1) + '</span>' +
                '<span class="tag">' + E(Store.pipeline(e.pipeline).name) + '</span>' +
                UI.progressBadge(e.progress) +
                '</div>' +
              '<div class="e-task">' + E(e.task) + '</div>' +
              ((e.reason || e.note) ? '<div class="note ' + (e.progress === 'undone' ? 'danger' : '') + ' mt8"><span class="n-ico">' +
                (e.progress === 'undone' ? '!' : 'i') + '</span><div>' + E(e.reason || e.note) + '</div></div>' : '') +
              ((e.links || []).length ? '<div class="e-links mt8">' + e.links.map(l =>
                '<div class="e-link">↗ <a href="' + E(l.url) + '" target="_blank" rel="noopener">' +
                E(l.label || l.url) + '</a></div>').join('') + '</div>' : '') +
              (Object.keys(e.metrics || {}).length ? '<div class="mt8 row-wrap">' +
                Object.keys(e.metrics).filter(k => e.metrics[k] != null).map(k => {
                  const def = (Store.pipeline(e.pipeline).metrics || []).find(m => m.key === k) || { label:k };
                  const v = def.type === 'money' ? Store.money(e.metrics[k]) : e.metrics[k];
                  return '<span class="badge line">' + E(def.label) + ' ' + E(v) + '</span>';
                }).join('') + '</div>' : '') +
            '</div>').join(''),
      footer: !rep ? '<button class="btn" data-close>关闭</button>'
        : '<span class="tiny muted">对外版 = 除当日卡点外全部内容；成本 / 金额 / 内部链接会在复制前审查</span><div class="spacer"></div>' +
          '<button class="btn" data-close>关闭</button>' +
          '<button class="btn" data-copy-internal>复制内部版</button>' +
          '<button class="btn primary" data-copy-client>复制对外版</button>',
      onMount: function (mroot) {
        if (!rep) return;
        const build = () => Store.reportVersions(rep);
        $('[data-copy-internal]', mroot).onclick = () => UI.copy(build().internalText);
        const cb = $('[data-copy-client]', mroot);
        if (build().leaks.length) {
          cb.disabled = true;
          cb.textContent = '对外版未通过审查（含内部信息）';
        } else {
          cb.onclick = () => UI.copy(build().clientText);
        }
      }
    });
  }

  /* ============================================================
     二、未交名单与催办
     ============================================================ */
  let missDate = null, missRange = false, missFrom = null, missTo = null, missSel = {};

  function renderMissing(root) {
    if (!missDate) { missDate = window.SEED.demoDate; missFrom = Store.weekStart(missDate); missTo = Store.addDays(missFrom, 6); }
    if (!Store.can('remind')) {
      root.innerHTML = '<div class="wrap"><div class="note warn"><span class="n-ico">!</span><div>' +
        '未交名单与催办需要「催办」能力（默认所有内部身份都开着，可在「设置 → 角色与权限」里按角色勾选）。' +
        '你当前的权限是「' + E(Store.roleName(Store.currentUser().role)) + '」。</div></div></div>';
      return;
    }
    const s = Store.submission(missDate);
    const rems = Store.remindersOn(missDate);
    const week = Store.weekSubmission(Store.weekStart(missDate));

    const rows = s.expected.map(p => {
      const rep = Store.getReport(p.id, missDate);
      const submitted = rep && rep.status === 'submitted';
      const rms = rems.filter(r => r.personId === p.id);
      const last = rms.length ? rms[rms.length - 1] : null;
      return { p:p, rep:rep, submitted:submitted, rms:rms, last:last };
    });
    // 催办「结果」：被催人当日到底交没交 —— 这是唯一可核验的结果口径
    const hasSubmitted = (pid, d) => { const rp = Store.getReport(pid, d); return !!(rp && rp.status === 'submitted'); };

    root.innerHTML =
      '<div class="wrap">' +
        '<div class="row-wrap mb16">' +
          '<div class="switch">' +
            '<button class="' + (!missRange ? 'on' : '') + '" data-mode="day">单日</button>' +
            '<button class="' + (missRange ? 'on' : '') + '" data-mode="range">区间（回看整周）</button>' +
          '</div>' +
          (missRange
            ? '<input class="inp" type="date" style="width:150px" id="mrFrom" value="' + missFrom + '">' +
              '<span class="muted tiny">至</span>' +
              '<input class="inp" type="date" style="width:150px" id="mrTo" value="' + missTo + '">'
            : '<input class="inp" type="date" style="width:158px" id="mrDate" value="' + missDate + '">') +
          '<div class="spacer"></div>' +
          '<span class="tiny muted">提交截止 <b>' + Store.state.config.deadline + '</b></span>' +
        '</div>' +

        (missRange ? rangeBlock(missFrom, missTo) :
          '<div class="grid g5 mb16">' +
            kpi('应提交', s.expectedN, Store.fmtCN(missDate)) +
            kpi('已提交', s.submittedN, '准时 ' + s.onTimeN + ' / 逾期 ' + s.lateN) +
            kpi('未提交', '<span style="color:var(--danger)">' + s.missingN + '</span>', '需催办') +
            kpi('其中已有草稿', s.draftsN, '只差一次「提交」', s.draftsN ? 'warn' : '') +
            kpi('提交率', pct(s.rate), Store.state.config.deadline + ' 前为准时') +
          '</div>') +

        (!missRange && s.missingN
          ? '<div class="card mb16">' +
            '<div class="card-h"><h3>待催办 · ' + s.missingN + ' 人</h3>' +
              '<span class="h-sub">勾选后批量催办：系统生成话术 → 你复制发到微信群 / 私聊（系统不代发）</span>' +
              '<div class="h-right"><button class="btn sm" id="msSelAll">全选</button>' +
              '<button class="btn primary sm" id="msPush">一键催办</button></div></div>' +
            '<div class="card-b tight"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
              '<th style="width:36px"></th><th style="width:120px">姓名</th><th style="width:140px">主责管线</th>' +
              '<th style="width:130px">当前状态</th><th>最后提醒</th><th style="width:110px">操作</th></tr></thead><tbody>' +
              rows.filter(r => !r.submitted).map(r =>
                '<tr><td><input type="checkbox" data-sel="' + r.p.id + '"' + (missSel[r.p.id] ? ' checked' : '') + ' style="accent-color:var(--accent)"></td>' +
                '<td><b>' + E(r.p.name) + '</b></td>' +
                '<td><span class="tag">' + E(Store.pipeline(r.p.mainPipe).short) + '</span></td>' +
                '<td>' + (r.rep && r.rep.status === 'draft'
                  ? '<span class="badge warn"><span class="dot"></span>有草稿未提交</span>'
                  : '<span class="badge danger"><span class="dot"></span>完全未交</span>') + '</td>' +
                '<td class="tiny">' + (r.last ? Store.fmtAt(r.last.at) + ' · ' + E(r.last.channel) +
                  ' · ' + (r.last.kind === 'auto' ? '系统' : 'PM') : '—') + '</td>' +
                '<td><button class="btn xs" data-push="' + r.p.id + '">催办</button></td></tr>').join('') +
            '</tbody></table></div></div></div>' : '') +

        (!missRange && !s.missingN
          ? '<div class="card mb16"><div class="empty"><div class="e-ico">✓</div>' +
            (s.expectedN ? '当日全员已提交，无需催办' : '当日无应提交人员') + '</div></div>' : '') +

        (missRange ? '' : '<div class="card mb16">' +
          '<div class="card-h"><h3>已提交 · ' + s.submittedN + ' 人</h3>' +
            '<span class="h-sub">' + (s.lateN ? '含 ' + s.lateN + ' 人逾期提交（' + Store.state.config.deadline + ' 后）' : '全部准时') + '</span></div>' +
          '<div class="card-b tight"><table class="tbl compact"><tbody>' +
            rows.filter(r => r.submitted).map(r =>
              '<tr><td style="width:120px">' + E(r.p.name) + '</td>' +
              '<td style="width:130px"><span class="tag">' + E(Store.pipeline(r.p.mainPipe).short) + '</span></td>' +
              '<td>' + statusBadgeOf(r.rep, missDate) + '</td></tr>').join('') +
          '</tbody></table></div></div>') +

        '<div class="card mb16">' +
          '<div class="card-h"><h3>周提交率概览</h3>' +
            '<span class="h-sub">' + week.days[0] + ' ~ ' + week.days[week.days.length - 1] + ' · 供内会公示</span>' +
            '<div class="h-right"><button class="btn sm" id="wkCopy">复制公示文本</button></div></div>' +
          '<div class="card-b tight"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
            '<th style="width:120px">姓名</th>' +
            week.days.map(d => '<th class="c">' + Store.fmtShort(d) + '<div class="tiny muted" style="font-weight:400">' + Store.weekdayCN(d) + '</div></th>').join('') +
            '<th class="r" style="width:110px">提交 / 应提交</th></tr></thead><tbody>' +
            week.rows.map(r => '<tr><td>' + E(r.person.name) + '</td>' +
              r.cells.map(c => '<td class="c">' + cellMark(c.state) + '</td>').join('') +
              '<td class="r">' + r.submitted + ' / ' + r.expected + '</td></tr>').join('') +
          '</tbody></table></div>' +
          '<div class="card-f"><span class="tiny muted">✓ 准时 · <span class="badge warn" style="height:16px">逾期</span> · <span class="badge danger" style="height:16px">未交</span> · <span class="badge" style="height:16px">草稿</span></span>' +
          '<div class="spacer"></div><span class="tiny">本周合计 ' + week.totalSubmitted + ' / ' + week.totalExpected + '</span></div></div></div>' +

        '<div class="card">' +
          '<div class="card-h"><h3>催办记录</h3><span class="h-sub">谁催的、催谁、何时、渠道、结果 —— 「结果」= 被催人当日交没交；系统拿不到「已读」回执，不假装有</span></div>' +
          '<div class="card-b tight">' + (rems.length
            ? '<table class="tbl compact"><thead><tr><th style="width:150px">时间</th><th style="width:110px">被催人</th>' +
              '<th style="width:110px">催办人</th><th style="width:100px">渠道</th><th style="width:110px">结果</th><th>备注</th></tr></thead><tbody>' +
              rems.map(r => '<tr><td class="tiny">' + Store.fmtAt(r.at) + '</td>' +
                '<td>' + E(Store.person(r.personId).name) + '</td>' +
                '<td>' + (r.by === 'system' ? '<span class="tag">系统</span>' : E(Store.person(r.by) ? Store.person(r.by).name : r.by)) + '</td>' +
                '<td class="tiny">' + E(r.channel) + '</td>' +
                '<td>' + (hasSubmitted(r.personId, r.date)
                  ? '<span class="badge ok"><span class="dot"></span>已补交</span>'
                  : '<span class="badge danger"><span class="dot"></span>仍未交</span>') + '</td>' +
                '<td class="tiny muted">' + E(r.note || '') + '</td></tr>').join('') +
              '</tbody></table>'
            : '<div class="empty">暂无催办记录</div>') + '</div></div>' +
      '</div>';

    bindMissing(root, rows, week, s);
  }

  function cellMark(state) {
    if (state === 'ontime') return '<span style="color:var(--ok)">✓</span>';
    if (state === 'late') return '<span class="badge warn">逾期</span>';
    if (state === 'draft') return '<span class="badge">草稿</span>';
    return '<span class="badge danger">未交</span>';
  }

  function rangeBlock(from, to) {
    const days = Store.workdaysInRange(from, to);
    const rows = Store.members().map(p => {
      const miss = days.filter(d => { const r = Store.getReport(p.id, d); return !r || r.status !== 'submitted'; });
      return { p:p, miss:miss, ok:days.length - miss.length };
    });
    return '<div class="card mb16"><div class="card-h"><h3>区间未交明细</h3>' +
      '<span class="h-sub">' + from + ' ~ ' + to + ' · 共 ' + days.length + ' 个工作日</span></div>' +
      '<div class="card-b tight"><table class="tbl"><thead><tr>' +
      '<th style="width:120px">姓名</th><th style="width:150px">已交 / 应交</th><th>未交日期</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + E(r.p.name) + '</td><td class="num">' + r.ok + ' / ' + days.length + '</td>' +
        '<td>' + (r.miss.length ? r.miss.map(d => '<span class="badge danger" style="margin-right:4px">' + Store.fmtShort(d) + '</span>').join('') : '<span class="muted tiny">全部已交</span>') + '</td></tr>').join('') +
      '</tbody></table></div></div>';
  }

  function bindMissing(root, rows, week, s) {
    $$('[data-mode]', root).forEach(b => b.onclick = () => { missRange = b.dataset.mode === 'range'; renderMissing(root); });
    const d = $('#mrDate', root); if (d) d.onchange = e => { missDate = e.target.value; missSel = {}; renderMissing(root); };
    const f = $('#mrFrom', root); if (f) f.onchange = e => { missFrom = e.target.value; renderMissing(root); };
    const t = $('#mrTo', root); if (t) t.onchange = e => { missTo = e.target.value; renderMissing(root); };
    $$('[data-sel]', root).forEach(c => c.onchange = () => { missSel[c.dataset.sel] = c.checked; });
    const all = $('#msSelAll', root);
    if (all) all.onclick = () => {
      const target = rows.filter(x => !x.submitted).map(x => x.p.id);
      const on = !target.every(id => missSel[id]);
      target.forEach(id => missSel[id] = on);
      renderMissing(root);
    };
    $$('[data-push]', root).forEach(b => b.onclick = () => push([b.dataset.push], root));
    const pushBtn = $('#msPush', root);
    if (pushBtn) pushBtn.onclick = () => {
      const ids = Object.keys(missSel).filter(k => missSel[k]);
      if (!ids.length) return UI.toast('请先勾选要催办的人', 'warn');
      push(ids, root);
    };
    const wkCopy = $('#wkCopy', root);
    if (wkCopy) wkCopy.onclick = () => UI.copy(weekText(week));
  }

  function weekText(week) {
    const L = ['【日报提交率 · ' + week.days[0] + ' ~ ' + week.days[week.days.length - 1] + '】'];
    week.rows.forEach(r => L.push(r.person.name + '：' + r.submitted + ' / ' + r.expected));
    L.push('合计：' + week.totalSubmitted + ' / ' + week.totalExpected);
    return L.join('\n');
  }

  /* 催办（v1.12）：公司**没有企业微信**，也不接第三方消息平台 ——
     所以「催办」不代发，只做两件事：① 生成可直接粘贴的话术；② 记一条催办留痕。
     话术由口径层生成（Store.reminderBulkText），视图只负责展示与复制。
     和「复制对外版发群」同一原则：系统出内容，人发出。 */
  function push(ids, root) {
    const now = Store.nowISO();
    ids.forEach(id => {
      Store.addReminder({ date:missDate, personId:id, by:Store.currentUser().id, at:now,
        channel:'微信', kind:'manual', note:'PM 催办 · 话术已生成' });
      const r = Store.getReport(id, missDate);
      Store.addLog(Store.currentUser().id, '催办', Store.person(id).name +
        (r && r.status === 'draft' ? '（有草稿未提交）' : ''));
    });
    Store.save();
    renderMissing(root);
    openRemindText(ids);
  }

  /* 催办话术弹窗：复制这一段 → 自己发微信群 / 挨个私聊。
     话术来自「设置 → 看板与提醒 → 催办话术模板」（可编辑），这里能现场切换用哪一条。 */
  function openRemindText(ids) {
    const names = ids.map(id => (Store.person(id) || {}).name).join('、');
    const tpls = Store.remindTemplates();
    let tplId = '';
    const opts = '<option value="">按时间自动选</option>' + tpls.map(t =>
      '<option value="' + t.id + '">' + E(t.name) + '</option>').join('');
    UI.modal({
      title:'催办话术 · ' + ids.length + ' 人',
      sub:'系统不代发：复制下面这段，粘到微信群或挨个私聊发出。已记入 ' +
          Store.fmtCN(missDate) + ' 的催办记录（结果看对方后来交没交）。',
      wide:true,
      body:'<div class="note accent mb12"><span class="n-ico">i</span><div>' +
             '本次催办：<b>' + E(names) + '</b>　' +
             '截止 <b>' + E(Store.state.config.deadline) + '</b>' +
           '</div></div>' +
           '<div class="field mb12"><label>用哪套话术</label>' +
             '<div class="row-wrap"><select class="sel" id="rmTpl" style="max-width:280px">' + opts + '</select>' +
             '<span class="tiny muted">模板可在「设置 → 看板与提醒」增删改</span></div></div>' +
           '<div class="copybox" id="rmText">' + E(Store.reminderBulkText(ids, missDate, tplId)) + '</div>',
      footer:'<button class="btn" data-close>关闭</button>' +
             '<button class="btn primary" data-copy-remind>复制催办话术</button>',
      onMount:function (root) {
        const box = $('#rmText', root), sel = $('#rmTpl', root);
        sel.onchange = () => { tplId = sel.value; box.textContent = Store.reminderBulkText(ids, missDate, tplId); };
        $('[data-copy-remind]', root).onclick = () => UI.copy(box.textContent);
      }
    });
  }

  /* ---------------- 注册 ---------------- */
  window.Views.board = { title:'日报看板', sub:'谁今天做了什么、卡在哪、走到哪一步', render: renderBoard };
  window.Views.missing = { title:'未交名单与催办', sub:'一屏看到谁没交，一键生成催办话术，复制发微信群', render: renderMissing };
})();
