/* ============================================================
   视图 · 周报板块（FR-32）
   ① 我的周报     ：周一 17:00 前，各位老师交「上周任务结果 + 本周目标建议 + 风险 / 需支持」
   ② 周报汇总     ：按两个组（场景生成组 / 3DGS 组）汇总；PM 在周二周会后发布「本周工作任务」，全员可见
   周报与日报同源：上周结果里出现的任务，就是那一周各人日报「明日工作任务」收拢后的落点。
   ============================================================ */
window.Views = window.Views || {};
(function () {
  const E = UI.esc, $ = UI.$, $$ = UI.$$;
  const kpi = UI.kpi = UI.kpi || function (label, val, sub, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="k-label">' + label + '</div><div class="k-val">' + val + '</div>' +
      (sub ? '<div class="k-sub">' + sub + '</div>' : '') + '</div>';
  };
  const pct = UI.pct;

  let myWeek = null;      // 「我的周报」当前周期
  let boardWeek = null;   // 「周报汇总」当前周期

  function weeks() {
    const w = Store.allWeeks();
    return w.length ? w : [Store.weekStart(window.SEED.demoDate)];
  }
  function defaultWeek() {
    const cur = Store.weekStart(window.SEED.demoDate);
    return weeks().indexOf(cur) >= 0 ? cur : weeks()[weeks().length - 1];
  }
  function dueText() { return '周一 ' + Store.state.config.weeklyDue; }
  function weekRange(w) { return Store.fmtShort(w) + ' ~ ' + Store.fmtShort(Store.addDays(w, 6)); }

  function weekSelect(id, value) {
    return '<select class="sel" style="max-width:250px" id="' + id + '">' +
      weeks().map(w => '<option value="' + w + '"' + (w === value ? ' selected' : '') + '>周期 ' + w + ' 起（' + weekRange(w) + '）</option>').join('') +
      '</select>';
  }

  /* ---------------- 「我的周报」草稿 ---------------- */
  let wr = null, wrKey = '';

  function loadWr(personId, week) {
    const k = personId + '@' + week;
    if (wrKey === k && wr) return wr;
    const ex = Store.getWeekReport(personId, week);
    if (ex) {
      wr = JSON.parse(JSON.stringify(ex));
    } else {
      const p = Store.person(personId) || {};
      wr = { id:'wr-' + personId + '-' + week, week:week, personId:personId,
             groupId:p.group || null, status:'draft', submittedAt:null,
             lastResult:'', suggest:[], risks:'' };
    }
    wr.suggest = wr.suggest || [];
    wrKey = k;
    return wr;
  }
  function emptySuggest() { return { pipeline:(Store.pipelines()[0] || {}).id, task:'' }; }

  function wrErrs() {
    const out = [];
    if ((wr.lastResult || '').trim().length < 10) out.push('「上周任务结果」至少填写 10 个字（写清做完了什么、数字结果）');
    const sg = (wr.suggest || []).filter(x => (x.task || '').trim());
    if (!sg.length) out.push('「本周目标建议」至少填写 1 条（供 PM 汇总成本周工作任务）');
    return out;
  }
  function wrNormalize() {
    const o = JSON.parse(JSON.stringify(wr));
    o.lastResult = (o.lastResult || '').trim();
    o.risks = (o.risks || '').trim();
    o.suggest = (o.suggest || []).filter(x => (x.task || '').trim())
      .map(x => ({ pipeline:x.pipeline, task:x.task.trim() }));
    return o;
  }
  function persistWr(status) {
    const next = wrNormalize();
    next.status = status;
    next.submittedAt = status === 'submitted' ? (wr.submittedAt || Store.nowISO()) : null;
    next.groupId = next.groupId || (Store.person(next.personId) || {}).group || null;
    Store.upsertWeekReport(next);
    wr = JSON.parse(JSON.stringify(next));
    wrKey = next.personId + '@' + next.week;
  }

  /* 周报文本（老师自己发给 PM 的版本） */
  function wrText(rep) {
    const p = Store.person(rep.personId) || { name:'—' };
    const L = ['【周报 · ' + weekRange(rep.week) + ' · ' + p.name + '】', ''];
    L.push('一、上周任务结果');
    L.push(rep.lastResult || '（未填写）');
    L.push('');
    L.push('二、本周目标建议');
    if ((rep.suggest || []).length) rep.suggest.forEach((t, i) => L.push('  ' + (i + 1) + '. ' + Store.pipeline(t.pipeline).name + '｜' + t.task));
    else L.push('  （未填写）');
    L.push('');
    L.push('三、风险 / 需支持');
    L.push((rep.risks || '').trim() || '（无）');
    return L.join('\n');
  }

  /* 上周结果汇总（PM 拿去上 PPT 的那一版，不含工时成本） */
  function weekResultText(week) {
    const st = Store.weekReportStatus(week);
    const L = ['【上周任务结果汇总 · ' + weekRange(week) + '】',
      '已交 ' + st.submittedN + '/' + st.expectedN + ' · 截止 ' + dueText(), ''];
    Store.weekReportSummary(week).forEach(g => {
      L.push('▍' + g.group.name);
      g.rows.forEach(x => {
        const rep = x.rep;
        const ok = rep && rep.status === 'submitted';
        L.push('· ' + x.person.name + (ok ? '' : '（未交）'));
        if (ok) {
          L.push('  上周结果：' + rep.lastResult);
          if ((rep.suggest || []).length) L.push('  本周目标建议：' + rep.suggest.map(t => Store.pipeline(t.pipeline).short + '｜' + t.task).join('；'));
          if ((rep.risks || '').trim()) L.push('  风险：' + rep.risks);
        }
      });
      L.push('');
    });
    const plan = Store.weekPlan(week);
    L.push('▍本周工作任务（' + (plan ? 'PM 已发布' : 'PM 未发布') + '）');
    if (plan) String(plan.text || '').split('\n').forEach(x => L.push(x));
    else L.push('（等待 PM 在周二周会后发布）');
    return L.join('\n');
  }

  /* ============================================================
     一、我的周报
     ============================================================ */
  function renderMyWeek(root) {
    if (!myWeek) myWeek = defaultWeek();
    if (weeks().indexOf(myWeek) < 0) myWeek = defaultWeek();

    const me = Store.currentUser();
    const canSubmit = Store.can('submit');
    const st = Store.weekReportStatus(myWeek);
    const plan = Store.weekPlan(myWeek);
    const mine = Store.getWeekReport(me.id, myWeek);
    const myGroup = Store.groupOf(me.group);

    if (canSubmit) loadWr(me.id, myWeek);

    const errs = canSubmit ? wrErrs() : [];
    const submitted = mine && mine.status === 'submitted';
    const myState = canSubmit
      ? (submitted ? '<span class="badge ok"><span class="dot"></span>已提交 ' + (mine.submittedAt || '').slice(11, 16) + '</span>'
                   : '<span class="badge warn"><span class="dot"></span>未提交（草稿）</span>')
      : '<span class="badge line"><span class="dot"></span>管理角色 · 不交周报</span>';

    /* 组内提交状态 */
    const groupCards = Store.groups().map(g => {
      const rows = Store.submitters().filter(p => p.group === g.id).map(p => {
        const r = Store.getWeekReport(p.id, myWeek);
        const ok = r && r.status === 'submitted';
        const isMe = p.id === me.id;
        return '<div class="row-wrap wr-line' + (isMe ? ' me' : '') + '">' +
          '<span class="avatar' + (ok ? '' : '') + '" style="width:22px;height:22px;font-size:10.5px">' + E(p.name.slice(0, 1)) + '</span>' +
          '<span' + (isMe ? ' style="font-weight:600"' : '') + '>' + E(p.name) + '</span>' +
          (isMe ? '<span class="tag">我</span>' : '') +
          '<div class="spacer"></div>' +
          (ok ? '<span class="badge ok"><span class="dot"></span>已交</span>'
              : (r && r.status === 'draft' ? '<span class="badge warn"><span class="dot"></span>草稿未提交</span>'
                                           : '<span class="badge danger"><span class="dot"></span>未交</span>')) +
          '</div>';
      }).join('');
      return '<div class="card"><div class="card-h"><h3>' + E(g.name) + '</h3>' +
        '<span class="h-sub">负责人 ' + E((Store.person(g.lead) || {}).name || '—') + '</span></div>' +
        '<div class="card-b tight">' + (rows || '<div class="muted tiny">暂无成员</div>') + '</div></div>';
    }).join('');

    /* 我的填写区 */
    const sgRows = canSubmit ? (wr.suggest || []).map((s, i) =>
      '<div class="row-wrap sg-row">' +
        '<select class="sel" style="max-width:190px" data-sg-pipe="' + i + '">' +
          Store.pipelines().map(pl => '<option value="' + pl.id + '"' + (pl.id === s.pipeline ? ' selected' : '') + '>' + E(pl.name) + '</option>').join('') +
        '</select>' +
        '<input class="inp" style="flex:1;min-width:220px" data-sg-task="' + i + '" value="' + E(s.task || '') + '" placeholder="下周打算在这个管线上推进什么（一句话、可量化）">' +
        '<button class="btn ghost xs" data-sg-del="' + i + '">删除</button>' +
      '</div>').join('') : '';

    const formCard = canSubmit
      ? '<div class="card">' +
          '<div class="card-h"><h3>我的周报 · ' + Store.fmtCN(myWeek) + ' 起</h3>' +
            '<span class="h-sub">截止 ' + dueText() + '</span>' +
            '<div class="h-right">' + myState + '</div></div>' +
          '<div class="card-b">' +
            '<div class="note accent mb16"><span class="n-ico">i</span><div>' +
              '周一 <b>' + Store.state.config.weeklyDue + '</b> 前交这份周报：<b>上周任务结果</b>（做完什么、数字结果）、' +
              '<b>本周目标建议</b>（给 PM 汇总成本周工作任务用）、<b>风险 / 需支持</b>。' +
              'PM 在周二周会后发布「本周工作任务」，所有人可见。</div></div>' +
            '<div class="field"><label>一、上周任务结果 <span class="req">*</span></label>' +
              '<textarea class="txa" id="wrLast" rows="5" placeholder="例如：Codex 提示词模板 v2→v3 迭代完成，批量生成成功率 68% → 78%；整理失败样本 40 例并分类。">' + E(wr.lastResult || '') + '</textarea>' +
              '<div class="hint">写清「做完了什么 + 数字结果」，这栏会被 PM 收进周会材料。</div></div>' +
            '<div class="field mt16"><label>二、本周目标建议</label>' +
              '<div class="hint mb8">1–3 条，按管线写；这是给 PM 的输入，最终以 PM 发布的「本周工作任务」为准。</div>' +
              '<div id="sgList">' + (sgRows || '<div class="muted tiny mb8">还没有目标建议，点下面按钮添加</div>') + '</div>' +
              '<button class="btn ghost sm" id="btnAddSg"' + ((wr.suggest || []).length >= 3 ? ' disabled' : '') + '>+ 添加一条目标建议</button></div>' +
            '<div class="field mt16"><label>三、风险 / 需支持</label>' +
              '<textarea class="txa" id="wrRisks" rows="3" placeholder="例如：失败集中在尺度错乱，需要 3DGS 侧的尺度基准做对照。">' + E(wr.risks || '') + '</textarea></div>' +
            '<div id="wrValid">' + validNote(errs) + '</div>' +
          '</div>' +
          '<div class="card-f">' +
            '<span class="tiny muted">周一 ' + Store.state.config.weeklyDue + ' 前提交；提交后仍可修改，会记录更新人与时间</span>' +
            '<div class="spacer"></div>' +
            '<button class="btn" id="wrCopy">复制周报文本</button>' +
            '<button class="btn" id="wrDraft">存草稿</button>' +
            '<button class="btn primary" id="wrSubmit"' + (errs.length ? ' disabled' : '') + '>提交周报</button>' +
          '</div>' +
        '</div>'
      : '<div class="card"><div class="card-h"><h3>我的周报</h3><div class="h-right">' + myState + '</div></div>' +
          '<div class="card-b">' +
            '<div class="note warn"><span class="n-ico">i</span><div>' +
              '你是<b>最高权限</b>（' + E(Store.roleName(me.role)) + '），本身不交周报 —— 周报由各组老师与实习生提交，' +
              '你在「<b>周报汇总 · 本周任务</b>」页查看并发布本周工作任务。</div></div>' +
            '<div class="mt16"><button class="btn primary" id="wrGoBoard">打开周报汇总 · 本周任务</button></div>' +
          '</div></div>';

    /* 本周工作任务（全员可见） */
    const planCard = '<div class="card"><div class="card-h"><h3>本周工作任务</h3>' +
      '<span class="h-sub">PM 发布 · 所有人可见</span>' +
      '<div class="h-right">' + (plan ? '<span class="badge ok"><span class="dot"></span>已发布</span>'
                                     : '<span class="badge warn"><span class="dot"></span>未发布</span>') + '</div></div>' +
      '<div class="card-b">' +
      (plan
        ? '<div class="tiny muted mb8">发布人 ' + E((Store.person(plan.by) || {}).name || plan.by) + ' · ' + E(Store.fmtAt(plan.updatedAt)) + '</div>' +
          '<div class="copybox" style="max-height:260px">' + E(plan.text) + '</div>'
        : '<div class="muted tiny">等待 PM 在周二周会后发布。</div>') +
      '</div></div>';

    root.innerHTML =
      '<div class="wrap">' +
        '<div class="row-wrap mb16">' +
          weekSelect('wrWeek', myWeek) +
          '<span class="tiny muted">周报截止 <b>周一 ' + Store.state.config.weeklyDue + '</b> · 每周一收料</span>' +
          '<div class="spacer"></div>' +
          (canSubmit ? '<span class="tiny muted">本周期提交 ' + st.submittedN + ' / ' + st.expectedN + '</span>' : '') +
        '</div>' +

        '<div class="grid g4 mb16">' +
          kpi('周报截止', '周一 ' + Store.state.config.weeklyDue, '周一 14:00 起收料', '') +
          kpi('本周期已交', st.submittedN + '<span class="u">/ ' + st.expectedN + '</span>', '应提交 ' + st.expectedN + ' 人', st.submittedN === st.expectedN ? 'ok' : '') +
          kpi('未交', '<span style="color:var(--danger)">' + st.missingN + '</span>', st.draftsN ? '其中 ' + st.draftsN + ' 人有草稿' : '可在未交名单页催办', st.missingN ? 'warn' : 'ok') +
          kpi('本周工作任务', plan ? '已发布' : '未发布', plan ? (Store.person(plan.by) || {}).name + ' · ' + (plan.updatedAt || '').slice(5, 10) : '周二周会后由 PM 发布', plan ? 'ok' : 'warn') +
        '</div>' +

        formCard +
        '<div class="sec-t">本周工作任务（全员可见）</div>' + planCard +
        '<div class="sec-t">本周期周报提交状态</div>' +
        '<div class="grid g2">' + groupCards + '</div>' +
      '</div>';

    const sel = $('#wrWeek', root);
    sel.onchange = e => { myWeek = e.target.value; wr = null; wrKey = ''; renderMyWeek(root); };

    if (!canSubmit) {
      const gb = $('#wrGoBoard', root);
      if (gb) gb.onclick = () => App.go('weekboard');
      return;
    }

    $('#wrLast', root).oninput = e => { wr.lastResult = e.target.value; refreshWrState(root); };
    $('#wrRisks', root).oninput = e => { wr.risks = e.target.value; };

    const btnSg = $('#btnAddSg', root);
    if (btnSg && !btnSg.disabled) btnSg.onclick = () => {
      wr.suggest.push(emptySuggest());
      renderMyWeek(root);
    };
    $$('[data-sg-pipe]', root).forEach(s => s.onchange = () => { wr.suggest[+s.dataset.sgPipe].pipeline = s.value; });
    $$('[data-sg-task]', root).forEach(t => t.oninput = () => { wr.suggest[+t.dataset.sgTask].task = t.value; refreshWrState(root); });
    $$('[data-sg-del]', root).forEach(b => b.onclick = () => {
      wr.suggest.splice(+b.dataset.sgDel, 1);
      renderMyWeek(root);
    });

    $('#wrDraft', root).onclick = () => {
      persistWr('draft');
      Store.addLog(me.id, '保存周报草稿', weekRange(myWeek));
      renderMyWeek(root);
      UI.toast('周报草稿已保存', 'ok');
    };
    $('#wrSubmit', root).onclick = () => {
      const e2 = wrErrs();
      if (e2.length) return UI.toast('还有 ' + e2.length + ' 项需要修正', 'danger');
      persistWr('submitted');
      Store.addLog(me.id, '提交周报', weekRange(myWeek) + ' · ' + (Store.groupOf(me.group) || {}).name);
      renderMyWeek(root);
      UI.toast('周报已提交', 'ok');
    };
    $('#wrCopy', root).onclick = () => UI.copy(wrText(wrNormalize()));
  }

  /* 校验提示：只替换 #wrValid 这一块，别去动页面上其他 note（比如规则说明） */
  function validNote(errs) {
    return '<div class="note ' + (errs.length ? 'danger' : 'accent') + ' mt16">' +
      '<span class="n-ico">' + (errs.length ? '!' : '✓') + '</span><div>' +
      (errs.length
        ? '<b>还有 ' + errs.length + ' 项需要修正</b><div class="mt8">' + errs.map(x => '· ' + E(x)).join('<br>') + '</div>'
        : '校验通过，可以提交。') +
      '</div></div>';
  }

  /* 只刷新校验提示与提交按钮状态，避免重渲染丢焦点 */
  function refreshWrState(root) {
    const errs = wrErrs();
    const box = $('#wrValid', root);
    if (box) box.innerHTML = validNote(errs);
    const btn = $('#wrSubmit', root);
    if (btn) btn.disabled = errs.length > 0;
  }

  /* ============================================================
     二、周报汇总 · 本周任务
     ============================================================ */
  function renderWeekBoard(root) {
    if (!boardWeek) boardWeek = defaultWeek();
    if (weeks().indexOf(boardWeek) < 0) boardWeek = defaultWeek();

    const me = Store.currentUser();
    const st = Store.weekReportStatus(boardWeek);
    const plan = Store.weekPlan(boardWeek);
    const canPublish = Store.can('manageConfig');
    const summ = Store.weekReportSummary(boardWeek);

    const groupCards = summ.map(g => {
      const rows = g.rows.map(x => {
        const rep = x.rep;
        const ok = rep && rep.status === 'submitted';
        return '<tr>' +
          '<td class="nowrap"><b>' + E(x.person.name) + '</b></td>' +
          '<td class="nowrap">' + (ok ? '<span class="badge ok"><span class="dot"></span>已交</span>'
            : (rep && rep.status === 'draft' ? '<span class="badge warn"><span class="dot"></span>草稿</span>'
                                             : '<span class="badge danger"><span class="dot"></span>未交</span>')) + '</td>' +
          '<td>' + (ok ? E(rep.lastResult) : '<span class="muted tiny">—</span>') + '</td>' +
          '<td>' + (ok && (rep.suggest || []).length
            ? rep.suggest.map(t => '<span class="tag">' + E(Store.pipeline(t.pipeline).short) + '</span> ' + E(t.task)).join('<br>')
            : '<span class="muted tiny">—</span>') + '</td>' +
          '<td>' + (ok && (rep.risks || '').trim() ? E(rep.risks) : '<span class="muted tiny">—</span>') + '</td>' +
          '</tr>';
      }).join('');
      const okN = g.rows.filter(x => x.rep && x.rep.status === 'submitted').length;
      return '<div class="card"><div class="card-h"><h3>' + E(g.group.name) + '</h3>' +
        '<span class="h-sub">已交 ' + okN + ' / ' + g.rows.length + ' · 负责人 ' + E((Store.person(g.group.lead) || {}).name || '—') + '</span></div>' +
        '<div class="card-b tight"><table class="tbl compact"><thead><tr>' +
          '<th>成员</th><th>状态</th><th>上周任务结果</th><th>本周目标建议</th><th>风险 / 需支持</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }).join('');

    const planCard =
      '<div class="card"><div class="card-h"><h3>本周工作任务</h3>' +
        '<span class="h-sub">周二周会后由 PM 发布 · 所有人可见</span>' +
        '<div class="h-right">' +
          (plan ? '<span class="badge ok"><span class="dot"></span>已发布</span>' : '<span class="badge warn"><span class="dot"></span>未发布</span>') +
          (canPublish ? '<button class="btn xs" id="wbGather">收拢建议</button>' : '') +
          (canPublish ? '<button class="btn xs" id="wbCopyPlan">复制</button>' : '') +
        '</div></div>' +
        '<div class="card-b">' +
        (plan ? '<div class="tiny muted mb8">发布人 ' + E((Store.person(plan.by) || {}).name || plan.by) + ' · ' + E(Store.fmtAt(plan.updatedAt)) + '</div>' : '') +
        (canPublish
          ? '<div class="hint mb8">' + (plan ? '已发布，可继续修订（修订会记入日志）' : '把各组老师交的「本周目标建议」收拢成本周工作任务后发布') + '</div>' +
            '<textarea class="txa" id="wbPlanText" rows="9" placeholder="例如：&#10;1. 3DGS 组：重建 B-071~B-092 批次收口，目标本周 40 个场景。&#10;2. 场景生成组：Codex 模板 v3 固化进 Harness，批量扩到 200 场景/天。">' +
              E(plan ? plan.text : '') + '</textarea>'
          : (plan ? '<div class="copybox" style="max-height:280px">' + E(plan.text) + '</div>'
                  : '<div class="muted tiny">等待 PM 发布。</div>')) +
        '</div>' +
        (canPublish
          ? '<div class="card-f"><span class="tiny muted">发布后全员在「我的周报」「工作台」都能看到</span>' +
            '<div class="spacer"></div>' +
            '<button class="btn primary" id="wbPublish">' + (plan ? '保存并更新发布' : '发布本周工作任务') + '</button></div>' : '') +
      '</div>';

    root.innerHTML =
      '<div class="wrap-wide">' +
        '<div class="row-wrap mb16">' +
          weekSelect('wbWeek', boardWeek) +
          '<span class="tiny muted">上周结果截止 <b>周一 ' + Store.state.config.weeklyDue + '</b> · 本周任务由 PM 周二发布</span>' +
          '<div class="spacer"></div>' +
          '<button class="btn sm" id="wbCopyAll">复制周报汇总</button>' +
        '</div>' +

        '<div class="grid g4 mb16">' +
          kpi('应提交周报', st.expectedN, '老师 + 实习生（管理角色不交）') +
          kpi('已交', st.submittedN + '<span class="u">/ ' + st.expectedN + '</span>', '提交率 ' + pct(st.rate), st.submittedN === st.expectedN ? 'ok' : '') +
          kpi('未交', '<span style="color:var(--danger)">' + st.missingN + '</span>', st.draftsN ? st.draftsN + ' 人有草稿' : '需提醒', st.missingN ? 'warn' : 'ok') +
          kpi('本周工作任务', plan ? '已发布' : '未发布', plan ? '更新于 ' + E(Store.fmtAt(plan.updatedAt)) : '周二周会后发布', plan ? 'ok' : 'warn') +
        '</div>' +

        '<div class="sec-t">PM 发布区</div>' + planCard +
        '<div class="sec-t">分组汇总 · ' + weekRange(boardWeek) + '</div>' +
        '<div class="grid g2">' + groupCards + '</div>' +
        '<div class="tiny muted mt16">上周结果来自各组老师周一 17:00 前提交的周报；「本周目标建议」是输入，最终以 PM 发布的「本周工作任务」为准。</div>' +
      '</div>';

    $('#wbWeek', root).onchange = e => { boardWeek = e.target.value; renderWeekBoard(root); };
    $('#wbCopyAll', root).onclick = () => UI.copy(weekResultText(boardWeek));
    const cp = $('#wbCopyPlan', root);
    if (cp) cp.onclick = () => {
      const pl = Store.weekPlan(boardWeek);
      if (pl) UI.copy(pl.text);
      else UI.toast('本周工作任务还没发布', 'warn');
    };
    /* v1.23：一键收拢全员「本周目标建议」→ 填进编辑框，PM 调整后发布 */
    const gb = $('#wbGather', root);
    if (gb) gb.onclick = () => {
      const ta = $('#wbPlanText', root);
      if (!ta) return;
      const lines = [];
      summ.forEach(g => g.rows.forEach(x => {
        if (x.rep && x.rep.status === 'submitted' && (x.rep.suggest || []).length)
          x.rep.suggest.forEach(t2 => lines.push(E(g.group.name) + ' · ' + E(x.person.name) + '：' + E(t2.task)));
      }));
      const block = lines.length ? lines.join('\n') : '（本周还没有收到任何「本周目标建议」，可先按各组情况起草）';
      ta.value = ta.value.trim() ? ta.value.trimEnd() + '\n' + block : block;
      UI.toast(lines.length ? '已收拢 ' + lines.length + ' 条建议，调整后发布' : '暂无建议可收拢', lines.length ? 'ok' : 'warn');
    };
    const pub = $('#wbPublish', root);
    if (pub) pub.onclick = () => {
      const text = ($('#wbPlanText', root).value || '').trim();
      if (text.length < 8) return UI.toast('本周工作任务内容太短，先写清楚再发布', 'danger');
      Store.saveWeekPlan(boardWeek, text, me.id);
      Store.addLog(me.id, (plan ? '更新发布本周工作任务' : '发布本周工作任务'), weekRange(boardWeek));
      renderWeekBoard(root);
      UI.toast('已发布，所有人可见', 'ok');
    };
  }

  /* ---------------- v1.21 周五任务汇总 ----------------
     PM 收拢材料：按人整理本周周二 → 周五的日报内容。
     每人一个卡片，文本可选中可复制；全部人一键导出 Word（.doc，Word/WPS 直接打开）。 */
  function digestText(d, row) {
    const L = ['【' + row.person.name + ' · ' + Store.fmtShort(d.from) + ' ~ ' + Store.fmtShort(d.to) + ' 任务汇总】'];
    row.days.forEach(day => {
      L.push('');
      L.push('▍' + Store.fmtCN(day.date));
      if (!day.report) { L.push(day.draft ? '（草稿未提交）' : '（未提交）'); return; }
      const es = (day.report.entries || []).filter(e => (e.task || '').trim());
      if (!es.length) { L.push('（当日无条目）'); return; }
      es.forEach((e, i) => {
        L.push((i + 1) + '. ' + Store.pipeline(e.pipeline).name + '｜' + (Store.PROG_TEXT[e.progress] || e.progress));
        L.push('   ' + e.task);
        if (e.progress === 'undone' && (e.reason || e.note)) L.push('   ⚠ 未完成原因：' + (e.reason || e.note));
        (e.links || []).forEach(l => L.push('   成果：' + l.url));
      });
    });
    return L.join('\n');
  }

  /* 全员拼成一份：复制全部与导出 Word 共用同一个人肉可读口径 */
  function digestAllText(d) {
    return ['【周五任务汇总 · ' + Store.fmtShort(d.from) + ' ~ ' + Store.fmtShort(d.to) + ' · 共 ' + d.rows.length + ' 人】', '']
      .concat(d.rows.map(row => digestText(d, row))).join('\n');
  }

  /* 导出 Word：HTML 打上 Office 命名空间存成 .doc，Word / WPS 直接打开，标题层级清晰 */
  function digestWordHTML(d) {
    const secs = d.rows.map(row => {
      const daysHtml = row.days.map(day => {
        let inner;
        if (!day.report) {
          inner = '<p class="miss">（' + (day.draft ? '草稿未提交' : '未提交') + '）</p>';
        } else {
          const es = (day.report.entries || []).filter(e => (e.task || '').trim());
          inner = es.length
            ? '<ol>' + es.map(e =>
                '<li><b>' + E(Store.pipeline(e.pipeline).name) + '</b>｜' + E(Store.PROG_TEXT[e.progress] || e.progress) +
                '<br>' + E(e.task) +
                (e.progress === 'undone' && (e.reason || e.note)
                  ? '<br><span class="wn">⚠ 未完成原因：' + E(e.reason || e.note) + '</span>' : '') +
                ((e.links || []).length
                  ? '<br>' + e.links.map(l => '成果：<a href="' + E(l.url) + '">' + E(l.url) + '</a>').join('<br>') : '') +
                '</li>').join('') + '</ol>'
            : '<p class="miss">（当日无条目）</p>';
        }
        return '<h3>' + E(Store.fmtCN(day.date)) + '</h3>' + inner;
      }).join('');
      return '<h2>' + E(row.person.name) + (row.person.title ? '<span class="pt">　' + E(row.person.title) + '</span>' : '') + '</h2>' + daysHtml;
    }).join('');
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>周五任务汇总</title>' +
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' +
      '<style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:11pt;color:#1F2329;line-height:1.6}' +
      'h1{font-size:16pt;margin:0 0 4pt}h2{font-size:14pt;border-bottom:1px solid #D0D3D9;padding-bottom:4pt;margin:18pt 0 6pt}' +
      'h3{font-size:11.5pt;color:#646A73;margin:10pt 0 4pt;font-weight:600}.pt{font-size:10pt;color:#8F959E;font-weight:400}' +
      '.miss{color:#8F959E}.wn{color:#C96A00}a{color:#245BDB}ol{margin:4pt 0 4pt 18pt;padding:0}li{margin:4pt 0}</style></head><body>' +
      '<h1>周五任务汇总（' + E(Store.fmtShort(d.from) + ' ~ ' + Store.fmtShort(d.to)) + '）</h1>' +
      '<p class="miss">共 ' + d.rows.length + ' 人 · 周二至周五 · 由日报系统自动收拢</p>' +
      secs + '</body></html>';
  }

  function renderFriSum(root) {
    if (!boardWeek) boardWeek = defaultWeek();
    const d = Store.weekDigest(boardWeek);
    const daySubmitted = d.rows.reduce((a, row) => a + row.days.filter(x => x.report).length, 0);
    const totalCells = d.rows.length * d.days.length;

    root.innerHTML =
      '<div class="wrap-wide">' +
        '<div class="row-wrap mb16">' +
          weekSelect('fsWeek', boardWeek) +
          '<span class="tiny muted">按人收拢 <b>' + E(Store.fmtShort(d.from)) + '（周二）~ ' + E(Store.fmtShort(d.to)) + '（周五）</b> 的日报内容 · 已提交 ' +
            daySubmitted + '/' + totalCells + ' 人·天</span>' +
          '<div class="spacer"></div>' +
          '<button class="btn sm" id="fsCopyAll">复制全部</button>' +
          '<button class="btn primary sm" id="fsWord">导出 Word</button>' +
        '</div>' +
        '<div class="grid g2">' +
          d.rows.map(row => {
            const got = row.days.filter(x => x.report).length;
            return '<div class="card fs-card">' +
              '<div class="card-h"><h3>' + E(row.person.name) + '</h3>' +
                '<span class="h-sub">' + E(row.person.title || '') + '</span>' +
                '<div class="spacer"></div>' +
                '<span class="tiny muted">' + got + '/' + d.days.length + ' 天</span>' +
                '<button class="btn ghost sm" data-fscopy="' + row.person.id + '">复制</button></div>' +
              '<div class="card-b"><div class="copybox" style="max-height:340px">' + E(digestText(d, row)) + '</div></div>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="tiny muted mt16">口径：只收已提交的日报；草稿 / 未交如实标出，不虚构。导出的 Word 按人分节、每天一节，可直接改写进周会 PPT 材料。</div>' +
      '</div>';

    $('#fsWeek', root).onchange = e => { boardWeek = e.target.value; renderFriSum(root); };
    $('#fsCopyAll', root).onclick = () => { UI.copy(digestAllText(d)); UI.toast('全部汇总已复制，可直接粘贴', 'ok'); };
    $('#fsWord', root).onclick = () => {
      UI.download('周五任务汇总-' + d.from + '~' + d.to + '.doc', digestWordHTML(d), 'application/msword');
      Store.addLog(Store.currentUser().name, '导出周五任务汇总', Store.fmtShort(d.from) + ' ~ ' + Store.fmtShort(d.to));
    };
    $$('[data-fscopy]', root).forEach(b => b.onclick = () => {
      const row = d.rows.find(x => x.person.id === b.getAttribute('data-fscopy'));
      UI.copy(digestText(d, row));
      UI.toast(row.person.name + ' 的汇总已复制', 'ok');
    });
  }

  /* ---------------- 注册 ---------------- */
  window.Views.weekly = {
    title:'我的周报', sub:'周一 17:00 前交「上周任务结果 + 本周目标建议 + 风险」', render: renderMyWeek
  };
  window.Views.weekboard = {
    title:'周报汇总 · 本周任务', sub:'按场景生成组 / 3DGS 组汇总上周结果；PM 周二周会后发布本周工作任务', render: renderWeekBoard
  };
  window.Views.frisum = {
    title:'周五任务汇总', sub:'按人整理本周周二 → 周五的日报内容：逐人可复制，全员一键导出 Word，供周会 PPT 收拢材料', render: renderFriSum
  };
})();
