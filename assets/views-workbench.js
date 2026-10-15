/* ============================================================
   视图 · 工作台（Dashboard · FR-36 / 信息流 FR-37）
   ------------------------------------------------------------
   定位：登录后第一屏。三栏栅格 ——
     左「我的今天」/ 中「团队在发生什么」（视觉重心）/ 右「团队状态 + 待办」
   同一张页面按角色换卡片形态，不做两套页面。
   口径全部来自 Store（内容流、提交概览、统计、待办），本文件只负责呈现与交互。
   ============================================================ */
window.Views = window.Views || {};
(function () {
  const E = UI.esc, $ = UI.$, $$ = UI.$$;
  const md = src => (UI.mdHTML ? UI.mdHTML(src) : '<p>' + E(src) + '</p>');

  let wbDate = null;                                  // 锚定日：与「日报看板」一致，用演示基准日
  const feed = { filter:'全部', limit:Store.NEWS_PAGE, sort:'最新' };
  const openCmt = {};                                 // 展开评论的条目
  const openBody = {};                                // 展开全文的条目
  const linkRows = {};                                // 发布弹窗里未提交的链接行
  let kbTab = 'recent';

  const me = () => Store.currentUser();
  const date = () => (wbDate || (wbDate = window.SEED.demoDate));

  /* ---------------- 通用小工具 ---------------- */
  function plain(s) {
    return String(s || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\[\[doc:([^\]]+)\]\]/g, '$1')
      .replace(/[*`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function excerpt(s, n) { const t = plain(s); return t.length > (n || 88) ? t.slice(0, n || 88) + '…' : t; }

  /* 相对时间：以「系统当前日」为基准（确定性输出，便于自检断言） */
  function when(iso) {
    if (!iso) return '—';
    const d = iso.slice(0, 10), t = iso.slice(11, 16);
    const today = window.SEED.today || window.SEED.demoDate;
    if (d === today) return '今天 ' + t;
    if (d === Store.prevWorkday(today)) return '昨天 ' + t;
    return Store.fmtShort(d) + ' ' + t;
  }

  const avatar = (p, size) => {
    if (!p) return '';
    const lv = Store.roleDef(p.role).level;
    return '<span class="avatar' + (lv >= 3 ? ' admin' : '') + (p.type === 'client' ? ' client' : '') +
      (size ? ' ' + size : '') + '">' + E(String(p.name).slice(0, 1)) + '</span>';
  };
  const personName = id => (Store.person(id) || { name:'—' }).name;

  /* 身份标签：由 role==='intern' 自动生成，不可手改、不可隐藏（防冒用） */
  function roleTag(authorId) {
    if (Store.isIntern(authorId)) return '<span class="idtag intern">实习生</span>';
    const p = Store.person(authorId);
    if (p && Store.roleDef(p.role).level >= 3) return '<span class="idtag lead">主管</span>';
    return '';
  }

  function avatarStack(list, cls) {
    if (!list.length) return '<span class="muted tiny">无</span>';
    const max = 7, show = list.slice(0, max), rest = list.length - max;
    return '<span class="av-stack' + (cls ? ' ' + cls : '') + '">' +
      show.map(p => '<span class="av-wrap" title="' + E(p.name + ' · ' + (p.title || '')) + '">' +
        avatar(p) + '</span>').join('') +
      (rest > 0 ? '<span class="av-more">+' + rest + '</span>' : '') + '</span>';
  }

  function spark(points, w, h) {
    const n = points.length; if (!n) return '';
    const step = n > 1 ? (w - 10) / (n - 1) : 0;
    const yv = v => h - 5 - Math.max(0, Math.min(1, v == null ? 0 : v)) * (h - 14);
    const bars = points.map((p, i) => {
      const v = Math.max(0, Math.min(1, p.rate == null ? 0 : p.rate));
      const bh = Math.max(2, v * (h - 16));
      return '<rect class="sp-bar" x="' + (5 + i * step - 4).toFixed(1) + '" y="' + (h - 5 - bh).toFixed(1) +
        '" width="8" height="' + bh.toFixed(1) + '" rx="2"><title>' +
        E(Store.fmtShort(p.date) + ' · ' + UI.pct(p.rate) + '（' + p.submittedN + '/' + p.expectedN + '）') +
        '</title></rect>';
    }).join('');
    const line = points.map((p, i) => (5 + i * step).toFixed(1) + ',' + yv(p.rate).toFixed(1)).join(' ');
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" ' +
      'aria-label="近 ' + n + ' 个工作日提交率">' + bars +
      '<polyline class="sp-line" points="' + line + '"/></svg>';
  }

  function bar(pctVal, tone) {
    const v = Math.max(0, Math.min(1, pctVal == null ? 0 : pctVal));
    return '<span class="bar" role="progressbar" aria-valuenow="' + Math.round(v * 100) + '" ' +
      'aria-valuemin="0" aria-valuemax="100"><i class="' + (tone || '') + '" style="width:' +
      (v * 100).toFixed(0) + '%"></i></span>';
  }

  /* ============================================================
     卡片定义（同一套卡片，按角色「有 / 无 / 换形态」）
     ============================================================ */
  const CARDS = [
    { id:'today',   col:'a', title:'今日状态',                       sub:cardTodaySub,   render:cardToday },
    { id:'task',    col:'a', title:'今日任务',                       sub:cardTaskSub,    render:cardTask },
    { id:'quick',   col:'a', title:'快捷操作',                       render:cardQuick },
    { id:'newscard', col:'a', title:'NEWS · AI 资讯',                sub:cardNewsSub,   render:cardNewsList },
    { id:'mine',    col:'a', title:'我的最近日报',  self:true,        sub:() => '最近 5 条', render:cardMine },
    { id:'feed',    col:'b', title:'团队信息流',                     sub:cardFeedSub,    render:cardFeed },
    { id:'intern',  col:'b', title:'实习生动态',                     sub:cardInternSub,  render:cardIntern },
    { id:'team',    col:'c', title:'团队提交概览',                   sub:cardTeamSub,    render:cardTeam },
    { id:'todo',    col:'c', title:'待我处理',                       sub:cardTodoSub,    render:cardTodo },
    { id:'project', col:'c', title:'项目进展',                       render:cardProject },
    { id:'stats',   col:'c', title:'统计',                           render:cardStats },
    { id:'kb',      col:'c', title:'知识库最近更新',                 render:cardKb }
  ];

  function cardEntries() {
    const p = Store.prefsDash();
    let list = CARDS.filter(c => !c.self || Store.can('submit'));
    if (p.order && p.order.length) {
      const at = id => { const i = p.order.indexOf(id); return i < 0 ? 999 : i; };
      list = list.slice().sort((a, b) => at(a.id) - at(b.id));
    }
    return list.map(c => ({ def:c, hidden:p.hidden.indexOf(c.id) >= 0, folded:p.collapsed.indexOf(c.id) >= 0 }));
  }

  function cardShell(entry) {
    const c = entry.def;
    if (entry.hidden) return '';
    const sub = c.sub ? c.sub() : '';
    return '<section class="wb-card' + (entry.folded ? ' folded' : '') + '" data-card="' + c.id + '" data-col="' + c.col + '">' +
      '<header class="wb-head" data-drag="' + c.id + '">' +
        '<h3>' + E(c.title) + '</h3>' +
        (sub ? '<span class="wb-sub">' + sub + '</span>' : '') +
        '<span class="spacer"></span>' +
        '<button class="wb-icon" data-menu="' + c.id + '" aria-label="卡片选项：上移 / 下移 / 折叠 / 隐藏" title="选项">⋮</button>' +
        (entry.folded ? '<button class="wb-icon" data-fold="' + c.id + '" aria-label="展开这张卡片" title="展开">▸</button>' : '') +
      '</header>' +
      '<div class="wb-body"' + (entry.folded ? ' hidden' : '') + '>' + c.render() + '</div>' +
      (entry.folded ? '' : '') +
    '</section>';
  }

  /* ============================================================
     ① 今日状态
     ============================================================ */
  function cardTodaySub() {
    if (!Store.can('submit')) {
      const s = Store.submission(date());
      return '已交 <b>' + s.submittedN + '</b> / ' + s.expectedN;
    }
    const u = me(), d = date();
    const rep = Store.getReport(u.id, d);
    const done = rep && rep.status === 'submitted';
    const draft = rep && rep.status === 'draft';
    return done ? '已提交 ' + (Store.timeOf(rep.submittedAt) || '') : (draft ? '草稿未提交' : '还没交');
  }

  function cardToday() {
    const d = date();
    const u = me();
    if (!Store.can('submit')) {
      const s = Store.submission(d);
      const rate = s.rate == null ? 0 : s.rate;
      return '<div class="wb-today">' +
          '<div class="ring" style="--v:' + Math.round(rate * 100) + '">' +
            '<span><b>' + s.submittedN + '</b><i>/' + s.expectedN + '</i></span></div>' +
          '<div class="wb-today-main">' +
            '<div class="wb-today-t">' + Store.fmtCN(d) + ' 团队提交</div>' +
            '<div class="wb-today-d">' + (s.missingN ? '还差 <b>' + s.missingN + '</b> 人：' + E(s.missing.map(p => p.name).join('、'))
              : '全员已交，无待催办') + '</div>' +
            '<div class="row-wrap mt12">' +
              (s.missingN ? '<button class="btn primary sm" data-act="remind">生成催办话术</button>' : '') +
              '<button class="btn sm" data-go="board">查看今日看板</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
    const rep = Store.getReport(u.id, d);
    const done = rep && rep.status === 'submitted';
    const draft = rep && rep.status === 'draft';
    const streak = Store.myStreak(u.id, d);
    const todo = Store.pendingTodo(u.id, d).length;
    return '<div class="wb-today">' +
        '<div class="ring' + (done ? ' ok' : '') + '" style="--v:' + (done ? 100 : 0) + '">' +
          '<span>' + (done ? '✓' : '—') + '</span></div>' +
        '<div class="wb-today-main">' +
          '<div class="wb-today-t">' + (done ? '今天的日报已交' : (draft ? '草稿已存，只差点「提交」' : '今天的日报还没写')) + '</div>' +
          '<div class="wb-today-d">' + Store.fmtCN(d) + ' · 截止 ' + Store.state.config.deadline +
            (done ? ' · ' + (Store.timeOf(rep.submittedAt) || '') + ' 提交' : '') + '</div>' +
          '<div class="wb-today-meta">' +
            '<span>连续 <b>' + streak + '</b> 天</span><span>待办 <b>' + todo + '</b> 项</span>' +
          '</div>' +
          '<div class="row-wrap mt12">' +
            '<button class="btn primary sm" data-go="fill">' + (done ? '查看 / 补充' : (draft ? '继续填写' : '一键写日报')) + '</button>' +
            (done ? '' : '<button class="btn sm" data-act="reuse">复制昨日</button>') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ============================================================
     ①′ 今日任务（v1.15）：填报者看自己的进度与倒计时，管理员看团队概览
     ============================================================ */
  function cardTaskSub() {
    const d = date();
    if (!Store.can('submit')) {
      const s = Store.taskSubmission(d);
      return '已交 <b>' + s.submittedN + '</b> / ' + s.expectedN;
    }
    const st = Store.taskState(me().id, d);
    return E(st.label) + (st.workday ? ' · ' + Store.taskCountdownText(d) : '');
  }

  function cardTask() {
    const d = date();
    if (!Store.can('submit')) {
      const s = Store.taskSubmission(d);
      const clk = Store.taskClock(d);
      return '<div class="wb-today">' +
          '<div class="ring" style="--v:' + Math.round((s.rate == null ? 0 : s.rate) * 100) + '">' +
            '<span><b>' + s.submittedN + '</b><i>/' + s.expectedN + '</i></span></div>' +
          '<div class="wb-today-main">' +
            '<div class="wb-today-t">' + Store.fmtCN(d) + ' 今日任务提交</div>' +
            '<div class="wb-today-d">截止 ' + clk.deadline +
              (clk.sameDay ? ' · ' + Store.taskCountdownText(d) : '') +
              ' · 未交 <b>' + s.missingN + '</b> 人' + (s.lateN ? ' · 逾期 <b>' + s.lateN + '</b> 人' : '') + '</div>' +
            '<div class="row-wrap mt12">' +
              '<button class="btn primary sm" data-go="taskboard">任务看板</button>' +
              '<button class="btn sm" data-go="taskstats">任务与提交统计</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
    const st = Store.taskState(me().id, d);
    const clk = Store.taskClock(d);
    if (!st.workday) {
      return '<div class="wb-today">' +
          '<div class="ring"><span>休</span></div>' +
          '<div class="wb-today-main">' +
            '<div class="wb-today-t">今天不是工作日</div>' +
            '<div class="wb-today-d">每日任务只在工作日提交，周末与节假日自动跳过</div>' +
          '</div></div>';
    }
    const rec = st.rec;
    const items = (rec && rec.items) || [];
    const hi = items.filter(i => i.priority === 'high').length;
    const cdCls = clk.passed ? ' passed' : (clk.urgent ? ' urgent' : '');
    const doneOK = st.key === 'ontime' || st.key === 'late' || st.key === 'editing';
    const title = st.key === 'ontime' ? '今日任务已按时提交'
      : st.key === 'late' ? '今日任务已提交（超时留痕）'
      : st.key === 'editing' ? '管理员已放开，可重新编辑提交'
      : st.key === 'requested' ? '已申请修改，等管理员放开'
      : st.key === 'draft' ? '草稿已存，还没提交'
      : '今天的今日任务还没写';
    return '<div class="wb-today">' +
        '<div class="ring' + (doneOK ? ' ok' : '') + '" style="--v:' + (doneOK ? 100 : 0) + '">' +
          '<span>' + (doneOK ? '✓' : '—') + '</span></div>' +
        '<div class="wb-today-main">' +
          '<div class="wb-today-t">' + title + '</div>' +
          '<div class="wb-today-d">' + Store.fmtCN(d) + ' · 截止 ' + clk.deadline +
            '<span class="tk-cd' + cdCls + '">' + Store.taskCountdownText(d) + '</span></div>' +
          '<div class="wb-today-meta">' +
            (items.length ? '<span>任务 <b>' + items.length + '</b> 项' + (hi ? ' · 高优 <b>' + hi + '</b>' : '') + '</span>' : '') +
            (rec && rec.submittedAt ? '<span>' + (Store.timeOf(rec.submittedAt) || '') + ' 提交</span>' : '') +
          '</div>' +
          '<div class="row-wrap mt12">' +
            '<button class="btn primary sm" data-go="task">' + (doneOK ? '查看今日任务' : '去填写今日任务') + '</button>' +
            '<button class="btn sm" data-go="taskboard">任务看板</button>' +
          '</div>' +
        '</div></div>';
  }

  /* ============================================================
     ② 快捷操作
     ============================================================ */
  function cardQuick() {
    const d = date();
    const u = me();
    const hasY = !!Store.getReport(u.id, Store.prevWorkday(d));
    const items = Store.can('submit') ? [
      { ico:'✎', t:'写日报',        go:'fill' },
      { ico:'⧉', t:'复制昨日',      act:'reuse', off:!hasY, why:'昨天没有日报可复制' },
      { ico:'▤', t:'查看团队日报',  go:'board' },
      { ico:'＋', t:'新建知识库文档', go:'kb' },
      { ico:'✎', t:'发一条内容',    act:'compose' }
    ] : [
      { ico:'▤', t:'查看团队日报',  go:'board' },
      { ico:'⚑', t:'未交名单与催办', go:'missing' },
      { ico:'＋', t:'发公告',        act:'compose' },
      { ico:'＋', t:'新建知识库文档', go:'kb' },
      { ico:'▦', t:'周报汇总',      go:'weekboard' },
      // 周五任务汇总只对 PM 可见（与侧栏一致）
      ...(Store.currentUser().role === 'pm' ? [{ ico:'▤', t:'周五任务汇总', go:'frisum' }] : [])
    ];
    return '<div class="wb-quick">' + items.map(x =>
      '<button class="qk' + (x.off ? ' off' : '') + '"' +
        (x.go ? ' data-go="' + x.go + '"' : ' data-act="' + x.act + '"') +
        (x.off ? ' disabled title="' + E(x.why) + '"' : '') + '>' +
        '<span class="qk-ico" aria-hidden="true">' + x.ico + '</span>' +
        '<span class="qk-t">' + E(x.t) + '</span></button>').join('') + '</div>';
  }

  /* ============================================================
     ③ 我的最近日报（仅本人填报者）
     ============================================================ */
  function cardMine() {
    const u = me();
    const list = Store.myRecentReports(u.id, 5);
    if (!list.length) return emptyState('你还没有交过日报', '写日报', 'fill');
    return '<ul class="wb-list">' + list.map(r => {
      const es = (r.entries || []).filter(e => (e.task || '').trim());
      const blocked = es.filter(e => e.progress === 'undone').length;
      const st = r.status === 'submitted'
        ? '<span class="badge ok"><span class="dot"></span>已交</span>'
        : '<span class="badge warn"><span class="dot"></span>草稿</span>';
      return '<li class="wb-li" data-gofill="1">' +
        '<div class="wb-li-t"><span class="wb-li-d">' + E(Store.fmtCN(r.date)) + '</span>' +
          '<span class="spacer"></span>' + st + '</div>' +
        '<div class="wb-li-s">' + E(excerpt(es.length ? es[0].task : '（无条目）', 46)) + '</div>' +
        '<div class="wb-li-m"><span>' + es.length + ' 条目</span>' +
          (blocked ? '<span class="danger">' + blocked + ' 卡点</span>' : '') +
          '<span>' + Store.myStreak(u.id, r.date) + ' 天连续</span></div>' +
      '</li>';
    }).join('') + '</ul>';
  }

  /* ============================================================
     ④ 团队提交概览
     ============================================================ */
  function cardTeamSub() {
    const s = Store.submission(date());
    return '已交 <b>' + s.submittedN + '</b> / ' + s.expectedN;
  }

  function cardTeam() {
    const d = date();
    const s = Store.submission(d);
    const trend = Store.submissionTrend(d, 7);
    const canRemind = Store.can('remind');
    return '<div class="wb-team">' +
        '<div class="wb-team-k">' +
          '<div><span class="wb-k-l">今日提交率</span><b class="wb-k-v">' + UI.pct(s.rate) + '</b></div>' +
          '<div><span class="wb-k-l">准时率</span><b class="wb-k-v">' + UI.pct(s.onTimeRate) + '</b></div>' +
        '</div>' +
        '<div class="wb-team-d">' + Store.fmtCN(d) + ' · 截止 ' + Store.state.config.deadline + '</div>' +
        '<div class="wb-block mt12"><div class="wb-block-h"><span>未交 ' + s.missingN + ' 人</span>' +
          (canRemind && s.missingN ? '<button class="btn-link tiny" data-act="remind">生成催办话术</button>' : '') +
        '</div>' + avatarStack(s.missing, 'miss') + '</div>' +
        '<div class="wb-block mt12"><div class="wb-block-h"><span>已交 ' + s.submittedN + ' 人</span>' +
          '<span class="tiny muted">含逾期 ' + s.lateN + '</span></div>' + avatarStack(s.submitted) + '</div>' +
        '<div class="wb-block mt12"><div class="wb-block-h"><span>近 7 个工作日</span>' +
          '<span class="tiny muted">柱高 = 提交率</span></div>' + spark(trend, 260, 54) + '</div>' +
      '</div>';
  }

  /* ============================================================
     ⑤ 团队信息流（主卡 · FR-37）
     ============================================================ */
  function cardFeedSub() {
    const st = Store.newsStats(undefined, 'feed');
    return '本周 <b>' + st.count + '</b> 条';
  }

  function filterChips() {
    const counts = Store.newsFilterCounts('feed');
    const cats = ['全部', '公告', '活动', '我的发布'];
    return '<div class="chips" role="tablist" aria-label="信息流筛选">' + cats.map(c =>
      '<button class="chip' + (feed.filter === c ? ' on' : '') + '" data-filter="' + c + '" role="tab" ' +
      'aria-selected="' + (feed.filter === c) + '">' + E(c) +
      '<span class="chip-n">' + (counts[c] == null ? 0 : counts[c]) + '</span></button>').join('') + '</div>';
  }

  function newsItemHTML(n) {
    const a = Store.newsAuthor(n);
    const mine = n.authorId === me().id;
    const liked = (n.likes || []).indexOf(me().id) >= 0;
    const tone = Store.newsTone(n.category);
    const st = n.status;
    const statusTag = mine && st !== 'published'
      ? '<span class="badge ' + (st === 'draft' ? '' : (st === 'rejected' ? 'danger' : 'warn')) + '"><span class="dot"></span>' +
        (st === 'draft' ? '草稿' : (st === 'pending' ? '审核中' : '未通过')) + '</span>'
      : (Store.can('newsReview') && st === 'pending'
          ? '<span class="badge warn"><span class="dot"></span>待审核</span>' : '');
    const open = !!openBody[n.id];
    const links = (n.links || []).filter(l => l.url || l.title);
    const atts = n.attachments || [];
    return '<article class="ni' + (n.pinned ? ' pinned' : '') + '" data-news="' + n.id + '">' +
      '<header class="ni-h">' + avatar(a) +
        '<span class="ni-name">' + E(a.name) + '</span>' + roleTag(n.authorId) +
        '<span class="ni-at">' + E(when(n.at)) + '</span>' +
        '<span class="spacer"></span>' +
        (n.pinned ? '<span class="pin" title="置顶">📌</span>' : '') +
        '<span class="ctag ' + tone + '">' + E(n.category) + '</span>' +
      '</header>' +
      (statusTag ? '<div class="mt8">' + statusTag + '</div>' : '') +
      '<h4 class="ni-t">' + E(n.title) + '</h4>' +
      '<div class="ni-s">' + (open ? '<div class="md">' + md(n.body) + '</div>' : E(excerpt(n.body, 88))) + '</div>' +
      (atts.length ? '<div class="ni-att">' + atts.map(f => '<span class="att">📎 ' + E(f.name) +
        '</span>').join('') + '</div>' : '') +
      (links.length ? '<div class="ni-links">' + links.map((l, i) =>
        '<a class="ni-link" href="javascript:void 0" data-ext="' + E(l.url || '') + '">🔗 ' +
        E(l.title || l.url) + '</a>').join('') + '</div>' : '') +
      '<footer class="ni-f">' +
        '<button class="ni-a' + (liked ? ' on' : '') + '" data-like="' + n.id + '" ' +
          'aria-pressed="' + liked + '" aria-label="点赞">♡ <b>' + (n.likes || []).length + '</b></button>' +
        '<button class="ni-a" data-cmt="' + n.id + '" aria-expanded="' + (!!openCmt[n.id]) + '">💬 <b>' +
          (n.comments || []).length + '</b></button>' +
        '<button class="ni-a" data-star="' + n.id + '">⭐ 收藏</button>' +
        '<button class="ni-a" data-tokb="' + n.id + '">↗ 分享到知识库</button>' +
        '<button class="ni-a" data-open="' + n.id + '">' + (open ? '收起' : '全文') + '</button>' +
        '<span class="spacer"></span>' +
        (mine || Store.can('newsPin') || Store.can('newsReview') ? '<span class="ni-own">' : '') +
          (Store.can('newsPin') ? '<button class="ni-a" data-pin="' + n.id + '">' + (n.pinned ? '取消置顶' : '置顶') + '</button>' : '') +
          (Store.can('newsReview') && st === 'pending'
            ? '<button class="ni-a ok" data-approve="' + n.id + '">通过</button>' +
              '<button class="ni-a warn" data-reject="' + n.id + '">驳回</button>' : '') +
          (mine ? '<button class="ni-a" data-edit="' + n.id + '">编辑</button>' +
                  '<button class="ni-a danger" data-del="' + n.id + '">删除</button>' : '') +
        (mine || Store.can('newsPin') || Store.can('newsReview') ? '</span>' : '') +
      '</footer>' +
      (openCmt[n.id] ? commentsHTML(n) : '') +
    '</article>';
  }

  function commentsHTML(n) {
    const list = n.comments || [];
    return '<div class="ni-cmt">' +
      (list.length ? '<ul class="cmt-list">' + list.map(c => {
        const a = Store.newsAuthor({ authorId:c.authorId });
        return '<li class="cmt"><span class="cmt-h">' + E(a.name) + roleTag(c.authorId) +
          '<span class="ni-at">' + E(when(c.at)) + '</span></span>' +
          '<div class="cmt-t">' + E(c.text) + '</div></li>';
      }).join('') + '</ul>' : '<div class="muted tiny">还没有评论，说一句？</div>') +
      '<div class="cmt-form">' +
        '<textarea class="txa" data-cmtbox="' + n.id + '" rows="2" placeholder="写评论…（可 @ 同事，对方会收到「待我处理」提醒）"></textarea>' +
        '<div class="row-wrap mt8">' +
          '<select class="sel" data-cmtwho="' + n.id + '" style="width:auto" aria-label="选择要 @ 的同事">' +
            '<option value="">@ 提及同事</option>' +
            Store.people().filter(p => p.type === 'internal').map(p =>
              '<option value="' + p.id + '">' + E(p.name) + '</option>').join('') +
          '</select>' +
          '<span class="spacer"></span>' +
          '<button class="btn xs" data-cmtins="' + n.id + '">插入 @</button>' +
          '<button class="btn primary xs" data-cmtsend="' + n.id + '">发表评论</button>' +
        '</div>' +
      '</div></div>';
  }

  function cardFeed() {
    // v1.22a：信息流不再混入 AI 资讯（source:'news'）—— 那部分归 NEWS 卡与 NEWS 页
    const page = Store.newsPage({ filter:feed.filter, limit:feed.limit, sort:feed.sort, source:'feed' });
    let items = page.items;
    if (feed.sort === '最多点赞') {
      items = items.slice().sort((a, b) => (b.likes || []).length - (a.likes || []).length);
    }
    const canPost = Store.can('newsPost');
    return '<div class="feed-head">' + filterChips() +
        '<span class="spacer"></span>' +
        '<button class="btn ghost xs" data-go="news">NEWS 页 ↗</button>' +
        '<button class="btn xs" data-actsort="1">' + (feed.sort === '最新' ? '最新 ▾' : '最多点赞 ▾') + '</button>' +
        (canPost ? '<button class="btn primary xs" data-act="compose">＋ 发布内容</button>' : '') +
      '</div>' +
      '<div class="feed-list">' +
        (items.length ? items.map(newsItemHTML).join('')
          : emptyState(feed.filter === '我的发布' ? '你还没有发布过内容' : '还没有内容', '发布第一条', 'compose')) +
      '</div>' +
      (items.length ? '<div class="feed-more">' +
        (page.hasMore
          ? '<button class="btn sm" data-act="more">加载更多（还有 ' + (page.total - items.length) + ' 条）</button>'
          : '<span class="muted tiny">— 已经到底了 —</span>') +
        '</div>' : '');
  }

  /* ============================================================
     ⑩ 实习生动态
     ============================================================ */
  function internPosts() {
    return Store.newsFeed().filter(n => Store.isIntern(n.authorId));
  }
  function cardInternSub() {
    const n = internPosts().length;
    return n + ' 条动态';
  }
  function cardIntern() {
    const list = internPosts().slice(0, 3);
    const interns = Store.people().filter(p => p.type === 'internal' && p.role === 'intern');
    return '<div class="row-wrap mb12">' + interns.map(p => '<span class="row" style="gap:6px">' +
        avatar(p) + '<span>' + E(p.name) + '</span>' + roleTag(p.id) + '</span>').join('') + '</div>' +
      (list.length ? '<ul class="wb-list">' + list.map(n =>
        '<li class="wb-li" data-open="' + n.id + '">' +
          '<div class="wb-li-t"><span class="ctag ' + Store.newsTone(n.category) + '">' + E(n.category) + '</span>' +
            '<span class="spacer"></span><span class="ni-at">' + E(when(n.at)) + '</span></div>' +
          '<div class="wb-li-s">' + E(excerpt(n.title, 40)) + '</div>' +
          '<div class="wb-li-m"><span>♡ ' + (n.likes || []).length + '</span><span>💬 ' +
            (n.comments || []).length + '</span></div>' +
        '</li>').join('') + '</ul>'
        : '<div class="muted tiny">本周还没有实习生动态。学习笔记 / 任务进展 / 问题求助都发在这里。</div>') +
      '<div class="hint mt12">主管可直接在信息流里评论反馈；实习生内容恒定带「实习生」标识，不降权。</div>';
  }

  /* ============================================================
     ⑥ 待我处理
     ============================================================ */
  function cardTodoSub() {
    const n = Store.pendingTodo(me().id, date()).length;
    return n ? '<b>' + n + '</b> 项待办' : '已清空';
  }
  function cardTodo() {
    const list = Store.pendingTodo(me().id, date());
    if (!list.length) return emptyState('手上没有待办', '', '');
    return '<ul class="todo-list">' + list.map(x =>
      '<li class="todo" data-todo-go="' + E(x.go) + '"' + (x.newsId ? ' data-todo-news="' + x.newsId + '"' : '') + '>' +
        '<span class="todo-k ' + (x.tone || '') + '">' + E(x.kind) + '</span>' +
        '<span class="todo-t">' + E(x.text) + '</span>' +
        '<span class="todo-arrow">→</span></li>').join('') + '</ul>';
  }

  /* ============================================================
     ⑦ 项目进展
     ============================================================ */
  function cardProject() {
    const pr = Store.projects()[0] || {};
    const pg = Store.projectProgress(me().id, date());
    return '<div class="proj">' +
        '<div class="proj-h"><b>' + E(pr.name || 'MetaHuman 虚拟人项目') + '</b>' +
          '<span class="badge accent"><span class="dot"></span>' + E(pr.status || '进行中') + '</span></div>' +
        '<div class="proj-d">客户：' + E(pr.client || '—') + ' · 本周 ' + Store.fmtCN(pg.week) + ' 起</div>' +
        '<div class="mt12">' + bar(pg.pct) + '</div>' +
        '<div class="proj-m"><span>五条管线本周有产出 <b>' + pg.done + '/' + pg.total + '</b></span>' +
          (pg.blocked ? '<span class="danger">' + pg.blocked + ' 项阻塞</span>' : '<span class="ok-t">无阻塞</span>') + '</div>' +
        '<div class="row-wrap mt12">' +
          '<button class="btn ghost xs" data-go="capacity">产能明细</button>' +
          '<button class="btn ghost xs" data-go="stats">成本与支出</button>' +
        '</div>' +
      '</div>';
  }

  /* ============================================================
     ⑧ 统计小卡
     ============================================================ */
  function cardStats() {
    const u = me();
    const st = Store.dashStats(u.id, date());
    const tile = (label, val, unit, sub) =>
      '<div class="tile"><span class="t-l">' + E(label) + '</span>' +
        '<span class="t-v">' + val + (unit ? '<i>' + unit + '</i>' : '') + '</span>' +
        (sub ? '<span class="t-s">' + E(sub) + '</span>' : '') + '</div>';
    return '<div class="tiles">' +
        tile('我的本周提交', st.mySubmitted + '<span class="t-of">/' + st.myExpected + '</span>', '', '周一 17:00 起算') +
        tile('我的本周产出', st.myEntries, '条', '涉及 ' + st.myPipes + ' 条管线') +
        tile('团队本周提交率', UI.pct(st.teamRate), '', '全队合计') +
        tile('知识库本周新增', st.kbNew, '篇', '含更新') +
      '</div>' +
      '<div class="hint mt12">按你的要求**不做「本周工时」**——日报自 v1.9 起已不采集工时，这里换成四个可算、可核验的数字。</div>';
  }

  /* ============================================================
     ⑧b NEWS · AI 资讯（v1.22a · 左列卡）
     与「团队信息流」区分：只收 source:'news' 的帖子。
     标题是链接 → 点击直达 NEWS 页对应文章（展开全文与评论区）。
     版式对齐「知识库最近更新」卡：列表行 = 标题 + 右侧时间。
     ============================================================ */
  function cardNewsSub() {
    const n = Store.newsFeed({ source:'news' }).length;
    return n ? n + ' 条资讯' : '还没有内容';
  }
  function cardNewsList() {
    const items = Store.newsFeed({ source:'news' }).slice(0, 4);
    const canPost = Store.can('newsPost');
    return (items.length
      ? '<ul class="wb-list tight">' + items.map(n =>
          '<li class="kb-li" data-nopen="' + n.id + '" title="点击到 NEWS 页阅读全文">' +
            '<span class="kb-t nk-t">' + E(n.title) + '</span>' +
            '<span class="kb-d">' + E(when(n.at)) + '</span></li>').join('') + '</ul>'
      : '<div class="muted tiny">还没有 AI 资讯 —— 点「发 AI 资讯」发第一条。</div>') +
      '<div class="row-wrap mt12"><button class="btn ghost xs" data-go="news">去 NEWS 页</button>' +
        (canPost ? '<button class="btn ghost xs" data-act="npcompose">＋ 发 AI 资讯</button>' : '') + '</div>';
  }

  /* ============================================================
     ⑨ 知识库最近更新
     ============================================================ */  function cardKb() {
    const recent = Store.kbRecent(4), starred = Store.kbStarred(), tpl = Store.kbTemplates(3);
    const tabs = [['recent', '最近更新', recent.length], ['star', '我的收藏', starred.length], ['tpl', '常用模板', tpl.length]];
    const list = kbTab === 'star' ? starred : (kbTab === 'tpl' ? tpl : recent);
    return '<div class="chips">' + tabs.map(t =>
        '<button class="chip' + (kbTab === t[0] ? ' on' : '') + '" data-kbtab="' + t[0] + '">' + E(t[1]) +
        '<span class="chip-n">' + t[2] + '</span></button>').join('') + '</div>' +
      (list.length ? '<ul class="wb-list tight">' + list.map(n =>
        '<li class="kb-li" data-kb="' + n.id + '">' +
          '<span class="kb-t">' + E(n.title) + '</span>' +
          '<span class="kb-d">' + E(Store.fmtAt(n.updatedAt)) + (n.starred ? ' · ⭐' : '') + '</span></li>').join('') + '</ul>'
        : '<div class="muted tiny">' + (kbTab === 'star' ? '还没有收藏的文档 —— 在知识库里点 ☆ 收藏' : '暂无内容') + '</div>') +
      '<div class="row-wrap mt12"><button class="btn ghost xs" data-go="kb">去知识库</button></div>';
  }

  function emptyState(text, btn, act) {
    return '<div class="empty"><div class="e-ico" aria-hidden="true">▢</div><div>' + E(text) + '</div>' +
      (btn && act ? '<div class="mt12"><button class="btn sm" data-act="' + act + '">' + E(btn) + '</button></div>' : '') + '</div>';
  }

  /* ============================================================
     页面装配
     ============================================================ */
  function hiddenStrip() {
    const p = Store.prefsDash();
    if (!p.hidden.length) return '';
    return '<div class="wb-hidden">已隐藏 ' + p.hidden.length + ' 张卡片 · ' +
      '<button class="btn-link" data-act="restore">恢复默认布局</button></div>';
  }

  function render(root) {
    const entries = cardEntries();
    const cols = ['a', 'b', 'c'];
    // v1.22：「待分配」账号注册后只能看工作台，顶部给一条明确的状态提示
    const pendingTip = me().role === 'pending'
      ? '<div class="wb-pending">你的账号还在<b>待分配</b>状态 —— 联系管理员在「管理 → 人员」里为你分配角色，' +
        '分配后页面会按角色自动展开。</div>'
      : '';
    root.innerHTML =
      '<div class="wb-wrap">' +
        pendingTip +
        '<div class="wb-tools">' +
          '<span class="tiny muted">工作台锚定 <b>' + E(Store.fmtCN(date())) + '</b>' +
            '（演示基准日，与「日报看板」同源）</span>' +
          '<span class="spacer"></span>' +
          '<button class="btn ghost sm" data-act="custom">自定义工作台</button>' +
        '</div>' +
        '<div class="wb-grid">' +
          cols.map(c => '<div class="wb-col" data-col="' + c + '">' +
            entries.filter(e => e.def.col === c).map(cardShell).join('') + '</div>').join('') +
        '</div>' +
        hiddenStrip() +
      '</div>';
    bind(root);
  }

  /* ---------------- 绑定 ---------------- */
  /* 内容流动作（点赞 / 评论 / 收藏 / 分享 / 置顶 / 审核 / 编辑 / 删除）
     工作台信息流卡与 NEWS 独立页共用这一份，交互口径必须一致。 */
  function bindNewsActions(root, rerender) {
    $$('[data-like]', root).forEach(b => b.onclick = () => {
      Store.newsLike(b.dataset.like);
      const n = Store.newsItem(b.dataset.like);
      UI.toast('已赞 · 现在 ' + (n.likes || []).length + ' 个赞', 'ok');
      rerender();
    });
    $$('[data-cmt]', root).forEach(b => b.onclick = () => {
      const id = b.dataset.cmt; openCmt[id] = !openCmt[id]; rerender();
      const box = $('[data-cmtbox="' + id + '"]', root); if (box) box.focus();
    });
    $$('[data-open]', root).forEach(b => b.onclick = () => {
      const id = b.dataset.open; openBody[id] = !openBody[id]; rerender();
    });
    $$('[data-star]', root).forEach(b => b.onclick = () => {
      UI.toast('已加入「我的收藏」（在知识库卡片里可查看）', 'ok');
    });
    $$('[data-tokb]', root).forEach(b => b.onclick = () => {
      const n = Store.newsItem(b.dataset.tokb);
      Store.newsShareToKb(b.dataset.tokb);
      Store.addLog(me().name, '分享内容到知识库', n.title);
      UI.toast('已归档到知识库「MetaHuman 项目」空间', 'ok');
      rerender();
    });
    $$('[data-pin]', root).forEach(b => b.onclick = () => {
      const n = Store.newsPin(b.dataset.pin);
      UI.toast(n.pinned ? '已置顶' : '已取消置顶', 'ok'); rerender();
    });
    $$('[data-approve]', root).forEach(b => b.onclick = () => {
      const n = Store.newsItem(b.dataset.approve);
      Store.newsApprove(b.dataset.approve);
      Store.addLog(me().name, '审核通过内容', n.title);
      UI.toast('已通过，内容已出现在信息流', 'ok'); rerender();
    });
    $$('[data-reject]', root).forEach(b => b.onclick = () => {
      const n = Store.newsItem(b.dataset.reject);
      UI.modal({
        title:'驳回内容', sub:n.title,
        body:'<div class="field"><label>驳回理由（作者可见）<span class="req">*</span></label>' +
          '<textarea class="txa" id="rjNote" placeholder="例如：涉及未公开的客户信息，改写后再提交"></textarea></div>',
        footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="rjGo">驳回</button>',
        onMount: (mroot, close) => {
          $('#rjGo', mroot).onclick = () => {
            const t = $('#rjNote', mroot).value.trim();
            if (!t) return UI.toast('请填写驳回理由', 'warn');
            Store.newsReject(n.id, t);
            Store.addLog(me().name, '驳回内容', n.title);
            close(); UI.toast('已驳回，理由已记给作者', 'warn'); rerender();
          };
        }
      });
    });
    $$('[data-edit]', root).forEach(b => b.onclick = () => openComposer(b.dataset.edit));
    $$('[data-del]', root).forEach(b => b.onclick = () => {
      const n = Store.newsItem(b.dataset.del);
      UI.confirmDialog('删除这条内容？', '「' + n.title + '」将被删除，点赞与评论一并移除。', () => {
        Store.removeNews(n.id);
        Store.addLog(me().name, '删除内容', n.title);
        UI.toast('已删除', 'ok'); rerender();
      }, '删除');
    });
    // 评论提交
    $$('[data-cmtins]', root).forEach(b => b.onclick = () => {
      const id = b.dataset.cmtins;
      const sel = $('[data-cmtwho="' + id + '"]', root), box = $('[data-cmtbox="' + id + '"]', root);
      if (!sel.value) return UI.toast('先选一位同事', 'warn');
      box.value = (box.value ? box.value + ' ' : '') + '@' + personName(sel.value) + ' ';
      box.dataset.mention = (box.dataset.mention ? box.dataset.mention + ',' : '') + sel.value;
      box.focus();
    });
    $$('[data-cmtsend]', root).forEach(b => b.onclick = () => {
      const id = b.dataset.cmtsend;
      const box = $('[data-cmtbox="' + id + '"]', root);
      const mentions = (box.dataset.mention || '').split(',').filter(Boolean);
      const c = Store.newsComment(id, box.value, mentions);
      if (!c) return UI.toast('评论内容不能为空', 'warn');
      const n = Store.newsItem(id);
      Store.addLog(me().name, '评论内容', n.title);
      box.dataset.mention = '';
      UI.toast('评论已发表' + (mentions.length ? '，已提醒 ' + mentions.map(personName).join('、') : ''), 'ok');
      rerender();
    });
  }

  function bind(root) {
    const rerender = () => render(root);

    // 导航类
    $$('[data-go]', root).forEach(b => b.onclick = () => {
      const to = b.dataset.go;
      if (to === 'kb') UI.toast('已打开知识库 —— 右上角「新建文档」可写新文档', 'ok');
      App.go(to);
    });
    // 信息流条目标题：AI 资讯 → 跳 NEWS 页对应帖子；团队动态 → 就地展开全文（v1.22a 分流后
    // 信息流帖子已不在 NEWS 页，再跳会扑空）
    $$('.ni-t', root).forEach(t => {
      t.onclick = () => {
        const art = t.closest('[data-news]');
        if (!art) return;
        const n = Store.newsItem(art.dataset.news);
        if (n && n.source === 'news' && window.AlefNews) { window.AlefNews.openPost(n.id); return; }
        openBody[art.dataset.news] = !openBody[art.dataset.news];
        rerender();
      };
    });
    // NEWS 卡：标题直达 NEWS 页对应文章（v1.22a）
    $$('[data-nopen]', root).forEach(li => li.onclick = () => {
      if (window.AlefNews) window.AlefNews.openPost(li.dataset.nopen);
    });
    $$('[data-gofill]', root).forEach(b => b.onclick = () => App.go('fill'));
    $$('[data-ext]', root).forEach(a => a.onclick = () => {
      const u = a.dataset.ext;
      if (u) UI.toast('原型不跳外链：' + u, 'ok'); else UI.toast('这条引用没有填链接', 'warn');
    });
    $$('[data-kb]', root).forEach(b => b.onclick = () => { UI.toast('已打开知识库', 'ok'); App.go('kb'); });

    // 动作类
    $$('[data-act]', root).forEach(b => b.onclick = () => doAct(b.dataset.act));
    $$('[data-actsort]', root).forEach(b => b.onclick = () => {
      feed.sort = feed.sort === '最新' ? '最多点赞' : '最新';
      rerender(); UI.toast('排序：' + feed.sort, 'ok');
    });
    $$('[data-act="more"]', root).forEach(b => b.onclick = () => {
      feed.limit += Store.NEWS_PAGE; rerender();
    });

    // 信息流筛选
    $$('[data-filter]', root).forEach(b => b.onclick = () => {
      feed.filter = b.dataset.filter; feed.limit = Store.NEWS_PAGE;
      rerender(); UI.toast('筛选：' + feed.filter, 'ok');
    });
    // 知识库小卡 Tab
    $$('[data-kbtab]', root).forEach(b => b.onclick = () => { kbTab = b.dataset.kbtab; rerender(); });

    // 点赞 / 评论 / 收藏 / 分享 / 置顶 / 审核 / 编辑 / 删除（与 NEWS 页共用 bindNewsActions）
    bindNewsActions(root, rerender);

    // 待办跳转
    $$('[data-todo-go]', root).forEach(li => li.onclick = () => {
      const to = li.dataset.todoGo, nid = li.dataset.todoNews;
      if (nid) {
        const el = $('[data-news="' + nid + '"]', root);
        if (el) { el.scrollIntoView({ block:'center' }); openCmt[nid] = true; rerender(); return; }
      }
      if (to === 'workbench') return;
      App.go(to);
    });

    // 卡片头：菜单 / 折叠
    $$('[data-fold]', root).forEach(b => b.onclick = () => foldCard(b.dataset.fold));
    $$('[data-menu]', root).forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      openCardMenu(b, root);
    });

    bindDrag(root);
  }

  function doAct(act) {
    if (act === 'compose') return openComposer();
    if (act === 'npcompose') return openComposer(null, 'news');
    if (act === 'remind') return remindAll();
    if (act === 'custom') return openCustomizer();
    if (act === 'restore') {
      Store.resetPrefsDash();
      UI.toast('已恢复默认布局', 'ok');
      return render($('#view'));
    }
    if (act === 'reuse') {
      const d = date();
      const u = me();
      const y = Store.getReport(u.id, Store.prevWorkday(d));
      if (!y) return UI.toast('昨天没有日报可复制', 'warn');
      UI.toast('已进入日报填报 —— 在页内点「复用昨日结构」即可', 'ok');
      return App.go('fill');
    }
    // 空状态里的主行动按钮直接给路由（fill / board / kb …）
    if (window.Views[act]) return App.go(act);
  }

  /* 催办：复用「未交名单」的同一套口径（记留痕 + 生成可复制话术，系统不代发） */
  function remindAll() {
    const d = date();
    const miss = Store.submission(d).missing;
    if (!miss.length) return UI.toast('今天全员已交，没有要催的人', 'ok');
    return openRemindText(miss.map(p => p.id), d);
  }
  function openRemindText(ids, d) {
    const text = Store.reminderBulkText(ids, d);
    UI.modal({
      title:'催办话术（复制后自己发微信群 / 私聊）',
      sub:'公司没有企业微信，系统不代发 —— 只出内容，发出由你在微信完成',
      body:'<div class="note accent"><span class="n-ico">i</span><div>点「复制话术」后粘贴到微信群或私聊即可。' +
        '系统会记一条催办留痕（渠道「微信」），催办有没有生效看「对方后来交没交」。</div></div>' +
        '<pre class="copybox mt16" id="rmText" style="white-space:pre-wrap">' + E(text) + '</pre>',
      footer:'<button class="btn" data-close>关闭</button><button class="btn primary" id="rmCopy">复制话术</button>',
      onMount: (mroot, close) => {
        $('#rmCopy', mroot).onclick = () => {
          UI.copy(text);
          ids.forEach(id => {
            Store.addReminder({ date:d, personId:id, by:me().id, at:Store.nowISO(),
              channel:'微信', kind:'manual', note:'PM 复制话术发出' });
            Store.addLog(me().name, '催办', personName(id) + ' · 微信（话术已复制）');
          });
          close(); UI.toast('已记留痕：' + ids.length + ' 人', 'ok');
          render($('#view'));
        };
      }
    });
  }

  /* ============================================================
     卡片自定义：折叠 / 隐藏 / 上下移 / 拖拽
     ============================================================ */
  function foldCard(id) {
    const p = Store.prefsDash();
    const i = p.collapsed.indexOf(id);
    if (i >= 0) p.collapsed.splice(i, 1); else p.collapsed.push(id);
    Store.setPrefsDash({ collapsed:p.collapsed });
    render($('#view'));
  }
  function hideCard(id) {
    const p = Store.prefsDash();
    if (p.hidden.indexOf(id) < 0) p.hidden.push(id);
    Store.setPrefsDash({ hidden:p.hidden });
    UI.toast('已隐藏这张卡片 —— 页面底部可恢复', 'ok');
    render($('#view'));
  }
  function moveCard(id, dir) {
    const p = Store.prefsDash();
    const orderNow = cardEntries().map(e => e.def.id);           // 当前可见顺序
    const col = (CARDS.find(c => c.id === id) || {}).col;
    const sameCol = orderNow.filter(x => (CARDS.find(c => c.id === x) || {}).col === col);
    const k = sameCol.indexOf(id);
    const t = k + dir;
    if (t < 0 || t >= sameCol.length) return UI.toast('已经是这一列的' + (dir < 0 ? '第一' : '最后') + '张了', 'warn');
    const target = sameCol[t];
    const a = orderNow.indexOf(id), b = orderNow.indexOf(target);
    const next = orderNow.slice();
    next[a] = target; next[b] = id;
    Store.setPrefsDash({ order: next });
    render($('#view'));
  }

  function openCardMenu(btn, root) {
    const id = btn.dataset.menu;
    $$('.wb-menu', root).forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'wb-menu';
    m.innerHTML = '<button data-m="up">上移</button><button data-m="down">下移</button>' +
      '<button data-m="fold">折叠 / 展开</button><button data-m="hide">隐藏这张卡片</button>';
    btn.parentElement.appendChild(m);
    $$('[data-m]', m).forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      const a = b.dataset.m;
      m.remove();
      if (a === 'up') moveCard(id, -1);
      else if (a === 'down') moveCard(id, 1);
      else if (a === 'fold') foldCard(id);
      else hideCard(id);
    });
    setTimeout(() => document.addEventListener('click', () => m.remove(), { once:true }), 0);
  }

  /* 拖拽排序：桌面端按住卡片头 200ms 后进入拖拽，仅在同一列内换位。
     键盘 / 触屏用户可以走「⋮ → 上移 / 下移」，功能不锁给鼠标。 */
  function bindDrag(root) {
    let timer = null, src = null, ghost = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    $$('[data-drag]', root).forEach(head => {
      head.addEventListener('pointerdown', ev => {
        if (ev.pointerType !== 'mouse') return;            // 触屏走菜单
        const card = head.closest('.wb-card');
        if (!card) return;
        clear();
        timer = setTimeout(() => {
          src = card; card.classList.add('dragging');
          document.body.classList.add('is-dragging');
        }, 200);
      });
      head.addEventListener('pointerup', () => {
        clear();
        if (!src) return;
        const card = src;
        src = null; card.classList.remove('dragging');
        document.body.classList.remove('is-dragging');
        const under = document.elementFromPoint(lastX, lastY);
        const tgt = under && under.closest ? under.closest('.wb-card') : null;
        if (tgt && tgt !== card && tgt.dataset.col === card.dataset.col) {
          const orderNow = cardEntries().map(e => e.def.id);
          const a = orderNow.indexOf(card.dataset.card), b = orderNow.indexOf(tgt.dataset.card);
          const next = orderNow.slice();
          next.splice(a, 1); next.splice(b, 0, card.dataset.card);
          Store.setPrefsDash({ order: next });
          UI.toast('已调整卡片顺序', 'ok');
          render($('#view'));
        }
      });
    });
    let lastX = 0, lastY = 0;
    root.addEventListener('pointermove', ev => { lastX = ev.clientX; lastY = ev.clientY; });
  }

  function openCustomizer() {
    const all = CARDS.filter(c => !c.self || Store.can('submit'));
    const p = Store.prefsDash();
    UI.modal({
      title:'自定义工作台', wide:true,
      sub:'勾选显示 / 隐藏，用 ↑↓ 调顺序（拖动卡片头也可以，限同一列内）',
      body:'<ul class="cust">' + all.map(c =>
        '<li class="cust-row" data-cust="' + c.id + '">' +
          '<label class="cust-ck"><input type="checkbox" data-custck="' + c.id + '"' +
            (p.hidden.indexOf(c.id) >= 0 ? '' : ' checked') + '> <span>' + E(c.title) + '</span></label>' +
          '<span class="spacer"></span>' +
          '<span class="tiny muted">' + (c.col === 'a' ? '左栏' : (c.col === 'b' ? '中栏' : '右栏')) + '</span>' +
          '<button class="btn xs" data-custup="' + c.id + '" aria-label="上移">↑</button>' +
          '<button class="btn xs" data-custdn="' + c.id + '" aria-label="下移">↓</button>' +
        '</li>').join('') + '</ul>',
      footer:'<button class="btn" data-close>关闭</button><button class="btn" id="custReset">恢复默认</button>',
      onMount: (mroot, close) => {
        $$('[data-custck]', mroot).forEach(ck => ck.onclick = () => {
          const id = ck.dataset.custck, pp = Store.prefsDash();
          const i = pp.hidden.indexOf(id);
          if (ck.checked && i >= 0) pp.hidden.splice(i, 1);
          if (!ck.checked && i < 0) pp.hidden.push(id);
          Store.setPrefsDash({ hidden:pp.hidden });
          render($('#view'));
        });
        $$('[data-custup]', mroot).forEach(b => b.onclick = () => { moveCard(b.dataset.custup, -1); openCustomizer(); });
        $$('[data-custdn]', mroot).forEach(b => b.onclick = () => { moveCard(b.dataset.custdn, 1); openCustomizer(); });
        $('#custReset', mroot).onclick = () => {
          Store.resetPrefsDash(); close(); UI.toast('已恢复默认布局', 'ok'); render($('#view'));
        };
      }
    });
  }

  /* ============================================================
     发布 / 编辑弹窗（Markdown）
     ============================================================ */
  function openComposer(editId, source) {
    /* v1.22a：source='news' 表示从 NEWS 页（或工作台 NEWS 卡）发起 —— 发布的是 AI 资讯，
       只出现在 NEWS 页与 NEWS 卡，不进团队信息流；缺省为团队动态。 */
    const n = editId ? Store.newsItem(editId) : null;
    const cats = Store.newsCats();
    const allowed = Store.myCats();
    let cur = n ? n.category : (allowed[0] || '分享');
    linkRows[editId || 'new'] = n && n.links ? n.links.slice() : [];
    const reviewOn = Store.newsReviewOn() && Store.isIntern(me().id);
    const key = editId || 'new';

    const catBtns = () => cats.map(c => {
      const ok = allowed.indexOf(c) >= 0;
      return '<button class="chip' + (cur === c ? ' on' : '') + (ok ? '' : ' dis') + '" data-cat="' + c + '"' +
        (ok ? '' : ' disabled title="' + E(c === '公告' ? '公告只由管理层发布' : '你的角色暂时不能发这一类') + '"') +
        ' aria-pressed="' + (cur === c) + '">' + c + '</button>';
    }).join('');

    const linksHTML = () => (linkRows[key] || []).map((l, i) =>
      '<div class="link-row mt8"><input class="inp" data-lk-t="' + i + '" value="' + E(l.title || '') + '" placeholder="链接标题">' +
      '<input class="inp" data-lk-u="' + i + '" value="' + E(l.url || '') + '" placeholder="https://…">' +
      '<button class="btn xs" data-lk-del="' + i + '" aria-label="删除这条链接">✕</button></div>').join('');

    UI.modal({
      title: n ? '编辑内容' : '发布内容', wide:true,
      sub:'支持 Markdown（标题 / 列表 / 引用 / 代码块 / 链接）· 图片与附件在原型阶段只记录文件名',
      body:
        '<div class="field"><label>标题<span class="req">*</span></label>' +
          '<input class="inp" id="cpTitle" maxlength="60" value="' + E(n ? n.title : '') + '" placeholder="一句话说清楚这条内容"></div>' +
        '<div class="field mt12"><label>分类<span class="req">*</span></label>' +
          '<div class="chips" id="cpCats">' + catBtns() + '</div>' +
          '<div class="hint" id="cpCatHint">' + E(Store.can('newsAnnounce')
            ? '管理层可以发公告；公告会置顶展示在信息流顶部'
            : (Store.isIntern(me().id) ? '实习生可发「学习 / 分享 / 活动」——公告与新闻由正式成员发布'
              : '你可以发「新闻 / 活动 / 分享 / 学习」')) + '</div></div>' +
        '<div class="field mt12"><label>正文</label>' +
          '<textarea class="txa" id="cpBody" rows="9" placeholder="# 小标题&#10;- 要点一&#10;- 要点二">' +
            E(n ? n.body : '') + '</textarea>' +
          '<div class="row-wrap mt8"><button class="btn xs" id="cpPreview">预览</button>' +
            '<span class="tiny muted">预览用的是知识库同一套渲染</span></div>' +
          '<div class="md-box mt8" id="cpPreviewBox" hidden></div></div>' +
        '<div class="field mt12"><label>图片 / 附件</label>' +
          '<input type="file" id="cpFile" class="inp" multiple>' +
          '<div class="hint" id="cpFileHint">' + E(n && n.attachments && n.attachments.length
            ? '已挂：' + n.attachments.map(f => f.name).join('、') : '未选择（原型只记录文件名与大小，不上传）') + '</div></div>' +
        '<div class="field mt12"><label>引用链接</label><div id="cpLinks">' + linksHTML() + '</div>' +
          '<div class="mt8"><button class="btn xs" id="cpLinkAdd">＋ 添加链接</button></div></div>' +
        '<div class="field mt12"><label>可见范围</label>' +
          '<select class="sel" id="cpVis" disabled><option>内部成员（本期只有这一项）</option></select></div>' +
        (Store.can('newsPin') ? '<label class="checkline mt12"><input type="checkbox" id="cpPin"' +
          (n && n.pinned ? ' checked' : '') + '> 置顶这条内容（仅管理员可见的选项）</label>' : '') +
        (reviewOn ? '<div class="note warn mt16"><span class="n-ico">!</span><div>' +
          '当前开启了「实习生内容需审核」：提交后由 PM 审核，通过后才会出现在信息流。</div></div>' : ''),
      footer:'<button class="btn" data-close>取消</button>' +
        '<button class="btn" id="cpDraft">存草稿</button>' +
        '<button class="btn primary" id="cpGo">' + (reviewOn ? '提交审核' : (n ? '保存' : '发 布')) + '</button>',
      onMount: (mroot, close) => {
        /* 分类只能单选，切换后整块重绘 —— 重绘会丢监听，所以每次重绘后都要重新绑 */
        const rebindCats = () => $$('[data-cat]', mroot).forEach(x => x.onclick = () => {
          if (x.disabled) return;
          cur = x.dataset.cat;
          $('#cpCats', mroot).innerHTML = catBtns();
          rebindCats();
        });
        rebindCats();
        $('#cpPreview', mroot).onclick = () => {
          const box = $('#cpPreviewBox', mroot);
          box.hidden = !box.hidden;
          if (!box.hidden) box.innerHTML = '<div class="md">' + md($('#cpBody', mroot).value) + '</div>';
        };
        const rebindLinks = () => {
          $('#cpLinks', mroot).innerHTML = linksHTML();
          $$('[data-lk-del]', mroot).forEach(b => b.onclick = () => {
            linkRows[key].splice(Number(b.dataset.lkDel), 1); rebindLinks();
          });
        };
        $('#cpLinkAdd', mroot).onclick = () => { linkRows[key].push({ title:'', url:'' }); rebindLinks(); };

        const collect = () => {
          const ls = [];
          $$('[data-lk-t]', mroot).forEach(inp => {
            const i = Number(inp.dataset.lkT);
            ls[i] = ls[i] || { title:'', url:'' };
            ls[i].title = inp.value.trim();
          });
          $$('[data-lk-u]', mroot).forEach(inp => {
            const i = Number(inp.dataset.lkU);
            ls[i] = ls[i] || { title:'', url:'' };
            ls[i].url = inp.value.trim();
          });
          return ls.filter(l => l && (l.title || l.url));
        };
        const files = () => {
          const fi = $('#cpFile', mroot);
          const names = Array.prototype.slice.call(fi.files || []).map(f => ({ name:f.name, size:f.size }));
          if (names.length) return names;
          return (n && n.attachments) || [];
        };
        const save = status => {
          const title = $('#cpTitle', mroot).value.trim();
          if (!title) return UI.toast('请填写标题', 'warn');
          if (allowed.indexOf(cur) < 0) return UI.toast('你没有发布「' + cur + '」的权限', 'danger');
          const body = $('#cpBody', mroot).value;
          if (status === 'published' && !body.trim()) return UI.toast('正文不能为空', 'warn');
          const obj = n ? JSON.parse(JSON.stringify(n)) : {
            id:Store.newId('nw'), authorId:me().id, at:Store.nowISO(),
            likes:[], comments:[], mentions:[]
          };
          obj.source = n ? (n.source || 'feed') : (source || 'feed');
          obj.category = cur;
          obj.title = title;
          obj.body = body;
          obj.links = collect();
          obj.attachments = files();
          obj.cover = (n && n.cover) || '';
          obj.pinned = Store.can('newsPin') ? !!($('#cpPin', mroot) && $('#cpPin', mroot).checked) : !!(n && n.pinned);
          obj.visibility = 'internal';
          obj.status = status;
          if (n) { obj.editedAt = Store.nowISO(); obj.editedBy = me().id; }
          else { obj.at = Store.nowISO(); }
          Store.upsertNews(obj);
          Store.addLog(me().name, n ? '编辑内容' : (status === 'draft' ? '存内容草稿' : '发布内容'), title + ' · ' + cur);
          close();
          // 发布后即时出现在列表顶部：若当前筛选匹配不上，自动切回「全部」
          if (status === 'published' && feed.filter !== '全部' && feed.filter !== cur && feed.filter !== '我的发布') {
            feed.filter = '全部';
          }
          UI.toast(status === 'draft' ? '已存草稿（在「我的发布」里可见）'
            : (status === 'pending' ? '已提交审核，通过后出现在信息流' : '已发布 · 已置顶到顶部'), 'ok');
          render($('#view'));
        };
        $('#cpGo', mroot).onclick = () => save(n ? (n.status === 'pending' ? 'pending' : 'published') : Store.newsPublishStatus());
        $('#cpDraft', mroot).onclick = () => save('draft');
      }
    });
  }

  /* ============================================================
     单条内容弹窗（全局搜索 / 实习生动态跳转用）
     ============================================================ */
  function openNews(id) {
    const n = Store.newsItem(id); if (!n) return;
    const a = Store.newsAuthor(n);
    UI.modal({
      title:n.title, sub:a.name + (Store.isIntern(n.authorId) ? '（实习生）' : '') + ' · ' +
        n.category + ' · ' + when(n.at),
      wide:true,
      body:'<div class="md">' + md(n.body) + '</div>' +
        ((n.links || []).length ? '<div class="ni-links mt16">' + n.links.map(l =>
          '<span class="ni-link">🔗 ' + E(l.title || l.url) + '</span>').join('') + '</div>' : '') +
        ((n.comments || []).length ? '<div class="divider"></div><div class="tiny muted mb8">评论 ' +
          n.comments.length + ' 条</div>' + n.comments.map(c => '<div class="cmt"><span class="cmt-h">' +
          E(personName(c.authorId)) + '</span><div class="cmt-t">' + E(c.text) + '</div></div>').join('') : ''),
      footer:'<button class="btn" data-close>关闭</button>' +
        (n.authorId === me().id ? '<button class="btn primary" id="nwEdit">编辑</button>' : ''),
      onMount: (mroot, close) => {
        const eb = $('#nwEdit', mroot);
        if (eb) eb.onclick = () => { close(); openComposer(n.id); };
      }
    });
  }

  /* ============================================================
     NEWS · AI 资讯（独立页 · v1.19）
     与工作台「团队信息流」卡同源同渲染：复用 newsItemHTML /
     commentsHTML / bindNewsActions —— 不做第二套内容流。
     ============================================================ */
  const np = { filter:'全部', limit:Store.NEWS_PAGE * 2 };
  let npPendingOpen = null;          // 从工作台跳过来要展开的帖子 id

  function npChips() {
    const cats = ['全部', '新闻', '公告', '活动', '分享', '学习', '我的发布'];
    const count = c => Store.newsFeed({ filter:c, source:'news' }).length;
    return '<div class="chips" role="tablist" aria-label="NEWS 筛选">' + cats.map(c =>
      '<button class="chip' + (np.filter === c ? ' on' : '') + '" data-npfilter="' + E(c) + '" role="tab" ' +
      'aria-selected="' + (np.filter === c) + '">' + E(c) +
      '<span class="chip-n">' + count(c) + '</span></button>').join('') + '</div>';
  }

  function renderNews(root) {
    // 从工作台跳进来：先展开目标帖的全文与评论区，渲染后滚动到位
    if (npPendingOpen && Store.newsItem(npPendingOpen)) {
      openBody[npPendingOpen] = true; openCmt[npPendingOpen] = true;
    } else if (npPendingOpen) {
      npPendingOpen = null;          // 帖子已被删除，不定位
    }
    const page = Store.newsPage({ filter:np.filter, limit:np.limit, source:'news' });
    const items = page.items;
    const canPost = Store.can('newsPost');
    root.innerHTML =
      '<div class="wrap">' +
        '<div class="row-wrap mb16">' + npChips() + '<span class="spacer"></span>' +
          (canPost ? '<button class="btn primary sm" data-npcompose>＋ 发 AI 资讯</button>' : '') +
        '</div>' +
        '<div class="feed-list">' +
          (items.length ? items.map(newsItemHTML).join('')
            : '<div class="empty">' + (np.filter === '我的发布'
              ? '你还没有发布过内容' : '还没有内容 —— 点右上角「发 AI 资讯」发第一条') + '</div>') +
        '</div>' +
        (items.length ? '<div class="feed-more">' + (page.hasMore
          ? '<button class="btn sm" data-npmore>加载更多（还有 ' + (page.total - items.length) + ' 条）</button>'
          : '<span class="muted tiny">— 已经到底了 —</span>') + '</div>' : '') +
      '</div>';

    const rerender = () => renderNews(root);
    $$('[data-npfilter]', root).forEach(b => b.onclick = () => {
      np.filter = b.dataset.npfilter; np.limit = Store.NEWS_PAGE * 2; renderNews(root);
    });
    const more = $('[data-npmore]', root);
    if (more) more.onclick = () => { np.limit += Store.NEWS_PAGE * 2; renderNews(root); };
    const comp = $('[data-npcompose]', root);
    if (comp) comp.onclick = () => openComposer(null, 'news');
    bindNewsActions(root, rerender);

    if (npPendingOpen) {
      const el = $('[data-news="' + npPendingOpen + '"]', root);
      npPendingOpen = null;
      if (el) setTimeout(() => el.scrollIntoView({ block:'start' }), 0);
    }
  }

  /* 给工作台跳转用：记下要展开的帖子 → 切到 NEWS 路由 */
  function newsOpenPost(id) {
    if (Store.newsItem(id)) npPendingOpen = id;
    App.go('news');
  }

  window.Views.news = {
    title:'NEWS · AI 资讯', sub:'团队共享的 AI 前沿动态 —— 大家都能发，可点赞评论，好文一键归档到知识库',
    render: renderNews
  };
  window.AlefNews = { openPost: newsOpenPost };

  window.Views.workbench = {
    title:'工作台', sub:'今天要做什么 · 团队在发生什么 · 一眼看清',
    render: render
  };

  // 供顶栏「＋新建」、全局搜索与其它视图调用
  window.AlefWorkbench = {
    openNews: openNews,
    compose: () => openComposer(),
    refresh: () => render($('#view'))
  };
})();
