/* ============================================================
   阿莱夫日报系统 · 知识库（类飞书：空间 → 目录树 → 文档）
   ============================================================ */
window.Views = window.Views || {};
(function () {
  const E = UI.esc, $ = UI.$, $$ = UI.$$;

  let sel = null;                 // 当前打开的文档 id
  let q = '';                     // 搜索词
  const folded = {};              // 文件夹折叠状态

  /* ---------------- 迷你 Markdown ----------------
     支持级：# 标题 / - 与 1. 列表 / > 引用 / | 表格 |
     **粗体** · `行内代码` · [文本](链接) · [[doc:站内文档]] · --- 分隔线 · ``` 代码块
     先整体转义再逐行替换，杜绝注入。 */
  function inline(s) {
    let h = E(s);
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
    h = h.replace(/\[\[doc:([^\]]+)\]\]/g, (m, t) => {
      const d = Store.kbDocByTitle(t);
      return '<a href="javascript:void 0" data-doc="' + E(t) + '" class="md-link">' + E(t) +
        (d ? '' : '<span class="tiny muted">（未创建）</span>') + '</a>';
    });
    h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');
    return h;
  }

  function mdHTML(src) {
    const lines = String(src || '').split('\n');
    let out = '', i = 0;
    let list = null;                       // 'ul' | 'ol' | null
    const closeList = () => { if (list) { out += '</' + list + '>'; list = null; } };

    while (i < lines.length) {
      const l = lines[i];

      if (/^```/.test(l)) {                // 代码块
        closeList();
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out += '<pre class="md-pre">' + E(buf.join('\n')) + '</pre>';
        continue;
      }
      if (/^\s*$/.test(l)) { closeList(); i++; continue; }
      if (/^---+\s*$/.test(l)) { closeList(); out += '<div class="divider"></div>'; i++; continue; }

      const h = l.match(/^(#{1,3})\s+(.*)$/);
      if (h) { closeList(); const n = h[1].length; out += '<h' + (n + 1) + ' class="md-h' + n + '">' + inline(h[2]) + '</h' + (n + 1) + '>'; i++; continue; }

      if (/^>\s?/.test(l)) {               // 引用 / 提示
        closeList();
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
        out += '<blockquote class="md-quote">' + buf.map(inline).join('<br>') + '</blockquote>';
        continue;
      }
      if (/^\|.*\|\s*$/.test(l)) {         // 表格
        closeList();
        const rows = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
        const cells = r => r.replace(/^\||\|\s*$/g, '').split('|').map(c => c.trim());
        let t = '<div class="tbl-wrap"><table class="tbl md-tbl"><thead><tr>' +
          cells(rows[0]).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
        rows.slice(1).forEach(r => {
          if (/^[\s|:-]+$/.test(r)) return;      // 分隔行
          t += '<tr>' + cells(r).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>';
        });
        out += t + '</tbody></table></div>';
        continue;
      }
      const ul = l.match(/^\s*[-*]\s+(.*)$/);
      if (ul) {
        if (list !== 'ul') { closeList(); out += '<ul class="md-ul">'; list = 'ul'; }
        out += '<li>' + inline(ul[1].replace(/^\[ \]\s*/, '☐ ').replace(/^\[x\]\s*/i, '☑ ')) + '</li>';
        i++; continue;
      }
      const ol = l.match(/^\s*\d+[.、]\s+(.*)$/);
      if (ol) {
        if (list !== 'ol') { closeList(); out += '<ol class="md-ol">'; list = 'ol'; }
        out += '<li>' + inline(ol[1]) + '</li>';
        i++; continue;
      }
      closeList();
      out += '<p class="md-p">' + inline(l) + '</p>';
      i++;
    }
    closeList();
    return out;
  }

  /* ---------------- 左侧目录树 ---------------- */
  function nodeRow(n, depth) {
    const active = sel === n.id ? ' active' : '';
    const star = n.starred ? '<span class="kb-star">★</span>' : '';
    if (n.type === 'folder') {
      const open = !folded[n.id];
      return '<div class="kb-row folder" style="padding-left:' + (8 + depth * 14) + 'px" data-folder="' + n.id + '">' +
        '<span class="kb-caret">' + (open ? '▾' : '▸') + '</span><span class="kb-t">' + E(n.title) + '</span></div>' +
        (open ? Store.kbChildren(n.id).map(c => nodeRow(c, depth + 1)).join('') : '');
    }
    return '<div class="kb-row doc' + active + '" style="padding-left:' + (22 + depth * 14) + 'px" data-open="' + n.id + '">' +
      '<span class="kb-t">' + E(n.title) + '</span>' + star + '</div>';
  }

  function treeHTML() {
    return Store.kbSpaces().map(sp => {
      const tops = Store.kbChildren(null).filter(n => n.spaceId === sp.id);
      return '<div class="kb-space"><div class="kb-space-h"><span class="kb-space-dot"></span>' + E(sp.name) +
        '<span class="kb-cnt">' + Store.kbSpaceCount(sp.id) + '</span></div>' +
        tops.map(n => nodeRow(n, 0)).join('') + '</div>';
    }).join('');
  }

  /* ---------------- 文档页 ---------------- */
  function bodyOf(n) {
    return n.auto === 'weekly' ? Store.kbAutoWeekly() : n.body;
  }

  /* ---------------- v1.20 划词批注（Google Docs 式） ---------------- */

  /* 右侧批注卡片列表：未解决的在前，各按时间正序 */
  function annoCardsHTML(n) {
    const me = Store.currentUser().id;
    const list = Store.kbAnnos(n.id).slice()
      .sort((a, b) => (a.resolved !== b.resolved) ? (a.resolved ? 1 : -1)
        : String(a.at).localeCompare(String(b.at)));
    if (!list.length) {
      return '<div class="kb-anno-empty tiny muted">还没有批注。选中正文任意几个字，点浮出的 💬 就能针对那段话发批注，大家可以在右侧回复。</div>';
    }
    return list.map(a => {
      const p = Store.person(a.author);
      const open = !a.resolved;
      return '<div class="kb-anno-card' + (open ? '' : ' done') + '" data-anno-card="' + a.id + '">' +
          '<div class="kb-anno-q">「' + E(a.quote.slice(0, 48)) + (a.quote.length > 48 ? '…' : '') + '」</div>' +
          '<div class="kb-anno-t">' + E(a.text) + '</div>' +
          '<div class="kb-anno-m">' + E(p ? p.name : '—') + ' · ' + E(Store.fmtAt(a.at)) + '</div>' +
          (a.replies || []).map(r => {
            const rp = Store.person(r.author);
            return '<div class="kb-anno-r"><span class="kb-anno-rn">' + E(rp ? rp.name : '—') + '</span>' +
              E(r.text) + '<span class="tiny muted">' + E(Store.fmtAt(r.at)) + '</span></div>';
          }).join('') +
          '<div class="kb-anno-reply"><input class="inp" placeholder="回复…" data-anno-reply-input="' + a.id + '">' +
            '<button class="btn ghost sm" data-anno-reply-btn="' + a.id + '">回复</button></div>' +
          '<div class="kb-anno-acts">' +
            '<button class="btn ghost sm" data-anno-resolve="' + a.id + '">' + (open ? '✓ 标记已解决' : '重新打开') + '</button>' +
            (a.author === me ? '<button class="btn ghost sm kb-danger-btn" data-anno-del="' + a.id + '">删除</button>' : '') +
          '</div>' +
        '</div>';
    }).join('');
  }

  /* 把批注 quote 重新定位到渲染后的正文并包上高亮 span。
     定位口径：逐块（p/li/h3/h4/blockquote/td/th）拼接纯文本后 indexOf，
     prefix/suffix 用于同文重名消歧；整块都找不到就只显示卡片不高亮。 */
  function wrapAnno(bd, at, a) {
    const end = at + a.quote.length;
    bd.used.push([at, end]);
    let si = 0, ei = 0;
    for (let i = bd.starts.length - 1; i >= 0; i--) if (at >= bd.starts[i]) { si = i; break; }
    for (let i = bd.starts.length - 1; i >= 0; i--) if (end > bd.starts[i]) { ei = i; break; }
    const sOff = at - bd.starts[si], eOff = end - bd.starts[ei];
    for (let i = ei; i >= si; i--) {
      const tn = bd.tns[i];
      const lo = i === si ? sOff : 0;
      const hi = i === ei ? eOff : tn.nodeValue.length;
      if (hi <= lo) continue;
      let node = tn;
      if (lo > 0) node = node.splitText(lo);
      if (hi - lo < node.nodeValue.length) node.splitText(hi - lo);
      const sp = document.createElement('span');
      sp.className = 'kb-hl' + (a.resolved ? ' done' : '');
      sp.setAttribute('data-anno', a.id);
      node.parentNode.insertBefore(sp, node);
      sp.appendChild(node);
    }
  }

  function annotate(root) {
    const body = $('#kbBody', root);
    if (!body) return;
    const annos = Store.kbAnnos(sel);
    if (!annos.length) return;
    const bdata = [];
    body.querySelectorAll('p,li,h3,h4,blockquote,td,th').forEach(blk => {
      const tns = [];
      const w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT, null);
      let t;
      while ((t = w.nextNode())) if (t.nodeValue) tns.push(t);
      if (!tns.length) return;
      let full = '';
      const starts = tns.map(tn => { const s = full.length; full += tn.nodeValue; return s; });
      bdata.push({ tns:tns, starts:starts, full:full, used:[] });
    });
    const placed = new Set();
    annos.forEach(a => {
      if (!a.quote) return;
      let fb = null;
      for (const bd of bdata) {
        if (placed.has(a.id)) break;
        let from = 0, hit = null;
        while ((from = bd.full.indexOf(a.quote, from)) >= 0) {
          const end = from + a.quote.length;
          if (!bd.used.some(u => from < u[1] && end > u[0])) { hit = { bd:bd, at:from }; break; }
          from += 1;
        }
        if (!hit) continue;
        const pre = bd.full.slice(Math.max(0, hit.at - 200), hit.at);
        const suf = bd.full.slice(hit.at + a.quote.length, hit.at + a.quote.length + 200);
        const ctxOk = (!a.prefix || pre.endsWith(a.prefix)) && (!a.suffix || suf.startsWith(a.suffix));
        if (ctxOk) { wrapAnno(hit.bd, hit.at, a); placed.add(a.id); }
        else if (!fb) fb = hit;
      }
      if (!placed.has(a.id) && fb) { wrapAnno(fb.bd, fb.at, a); placed.add(a.id); }
    });
    /* 高亮 span 是此刻才创建的，点击事件必须在这里绑（bind 时它们还不存在） */
    $$('.kb-hl', root).forEach(hl => {
      hl.onclick = () => {
        const card = root.querySelector('[data-anno-card="' + hl.getAttribute('data-anno') + '"]');
        if (!card) return;
        card.scrollIntoView({ behavior:'smooth', block:'center' });
        card.classList.add('active');
        setTimeout(() => card.classList.remove('active'), 1400);
      };
    });
  }

  /* 选中文字 → 捕获 quote 与上下文（prefix/suffix 各取所在块内前后 40 字） */
  function captureSel() {
    const body = document.getElementById('kbBody');
    const s = window.getSelection();
    if (!body || !s || s.rangeCount === 0 || s.isCollapsed) return null;
    const r = s.getRangeAt(0);
    if (!body.contains(r.commonAncestorContainer)) return null;
    const quote = String(s).trim();
    if (!quote) return null;
    let prefix = '', suffix = '';
    const el = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
    const blk = el && el.closest ? el.closest('p,li,h3,h4,blockquote,td,th') : null;
    if (blk) {
      const bt = blk.textContent;
      const i = bt.indexOf(quote);
      if (i >= 0) {
        prefix = bt.slice(Math.max(0, i - 40), i);
        suffix = bt.slice(i + quote.length, i + quote.length + 40);
      }
    }
    return { quote:quote, prefix:prefix, suffix:suffix };
  }

  /* 批注输入卡：插到右侧面板顶部，不弹模态（像 Google Docs 的行内编辑） */
  function openComposer(root, c) {
    const list = document.getElementById('kbAnnoList');
    if (!list) return;
    const old = document.getElementById('kbAnnoComposer');
    if (old) old.remove();
    const div = document.createElement('div');
    div.className = 'kb-anno-card composer';
    div.id = 'kbAnnoComposer';
    div.innerHTML =
      '<div class="kb-anno-q">针对「' + E(c.quote.slice(0, 40)) + (c.quote.length > 40 ? '…' : '') + '」写批注</div>' +
      '<textarea class="txa" id="kbAnnoText" style="min-height:64px" placeholder="说点什么…（⌘/Ctrl + Enter 发送）"></textarea>' +
      '<div class="kb-anno-acts"><button class="btn ghost sm" id="kbAnnoCancel">取消</button>' +
      '<button class="btn primary sm" id="kbAnnoOk">添加批注</button></div>';
    list.insertBefore(div, list.firstChild);
    const ta = $('#kbAnnoText', div);
    ta.focus();
    $('#kbAnnoCancel', div).onclick = () => div.remove();
    const submit = () => {
      const t = ta.value.trim();
      if (!t) return UI.toast('先写点批注内容', 'warn');
      Store.kbAnnoAdd(sel, { quote:c.quote, prefix:c.prefix, suffix:c.suffix, text:t });
      Store.addLog(Store.currentUser().name, '知识库批注',
        (Store.kbNode(sel) || {}).title + '：「' + c.quote.slice(0, 20) + '」');
      render(document.getElementById('view'));
      UI.toast('批注已添加', 'ok');
    };
    $('#kbAnnoOk', div).onclick = submit;
    ta.onkeydown = ev => { if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') submit(); };
  }

  /* 文档级监听只挂一次：selectionchange 收起气泡，点击别处也收起 */
  if (!window.Views.kbAnnoBound) {
    window.Views.kbAnnoBound = true;
    document.addEventListener('selectionchange', () => {
      const b = document.getElementById('kbBubble');
      if (!b) return;
      const s = window.getSelection();
      const body = document.getElementById('kbBody');
      if (!s || s.rangeCount === 0 || s.isCollapsed ||
          !body || !body.contains(s.getRangeAt(0).commonAncestorContainer)) b.hidden = true;
    });
    document.addEventListener('mousedown', ev => {
      const b = document.getElementById('kbBubble');
      if (b && !b.contains(ev.target)) b.hidden = true;
    });
  }

  function docHTML(n) {
    const sp = Store.kbSpace(n.spaceId);
    const parent = n.parentId ? Store.kbNode(n.parentId) : null;
    const author = Store.person(n.author);
    const crumbs = [sp && sp.name, parent && parent.title, n.title].filter(Boolean)
      .map(x => '<span>' + E(x) + '</span>').join('<span class="kb-sep">/</span>');
    const openN = Store.kbAnnos(n.id).filter(a => !a.resolved).length;

    return '<div class="kb-crumb">' + crumbs + '</div>' +
      '<div class="kb-doc-h"><h2>' + E(n.title) + '</h2>' +
        '<div class="kb-doc-meta">' +
          (n.auto ? '<span class="badge accent"><span class="dot"></span>自动生成 · 勿手改</span>' : '') +
          (n.starred ? '<span class="badge warn"><span class="dot"></span>已收藏</span>' : '') +
          '<span class="tiny muted">' + E(author ? author.name : '—') + ' · 更新于 ' + E(Store.fmtAt(n.updatedAt)) + '</span>' +
          '<div class="spacer"></div>' +
          '<button class="btn ghost sm" id="kbStar">' + (n.starred ? '取消收藏' : '收藏') + '</button>' +
          (n.auto ? '' : '<button class="btn sm" id="kbEdit">编辑</button>') +
        '</div></div>' +
      '<div class="kb-docgrid">' +
        '<div class="kb-docmain"><div class="kb-body" id="kbBody">' + mdHTML(bodyOf(n)) + '</div></div>' +
        '<aside class="kb-anno" id="kbAnno">' +
          '<div class="kb-anno-h">批注 <span class="kb-anno-n">' + openN + '</span></div>' +
          '<div class="kb-anno-list" id="kbAnnoList">' + annoCardsHTML(n) + '</div>' +
        '</aside>' +
      '</div>' +
      '<div class="kb-selbubble" id="kbBubble" hidden><span class="ico">💬</span>添加批注</div>';
  }

  function landingHTML() {
    const recent = Store.kbNodes().filter(n => n.type === 'doc')
      .slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6);
    const starred = Store.kbNodes().filter(n => n.type === 'doc' && n.starred);
    return '<div class="grid g4 mb16">' +
        Store.kbSpaces().map(sp => '<div class="card kb-scard" data-space="' + sp.id + '">' +
          '<div class="kb-scard-t">' + E(sp.name) + '</div>' +
          '<div class="kb-scard-n">' + Store.kbSpaceCount(sp.id) + '<span class="u">篇</span></div>' +
          '<div class="tiny muted">' + E(sp.desc || '进入后从目录选择文档') + '</div></div>').join('') +
        (Store.currentUser().type === 'internal'
          ? '<div class="card kb-scard kb-scard-new" data-space-new>' +
            '<div class="kb-scard-t">+ 新建空间</div>' +
            '<div class="tiny muted">给知识库加一个一级分区，例如「客户沟通」「外包与采购」</div></div>' : '') +
      '</div>' +
      '<div class="twocol">' +
        '<div class="card"><div class="card-h"><h3>最近更新</h3><span class="h-sub">全库按时间</span></div>' +
          '<div class="card-b tight">' + (recent.length
            ? '<table class="tbl compact"><tbody>' + recent.map(n =>
                '<tr><td><a href="javascript:void 0" class="md-link" data-doc-id="' + n.id + '">' + E(n.title) + '</a></td>' +
                '<td style="width:120px" class="tiny muted">' + E((Store.kbSpace(n.spaceId) || {}).name || '') + '</td>' +
                '<td style="width:130px" class="tiny muted r">' + E(Store.fmtAt(n.updatedAt)) + '</td></tr>').join('') +
              '</tbody></table>'
            : '<div class="empty">暂无文档</div>') + '</div></div>' +
        '<div class="card"><div class="card-h"><h3>我的收藏</h3><span class="h-sub">★ 标记的文档</span></div>' +
          '<div class="card-b tight">' + (starred.length
            ? '<table class="tbl compact"><tbody>' + starred.map(n =>
                '<tr><td><a href="javascript:void 0" class="md-link" data-doc-id="' + n.id + '">' + E(n.title) + '</a></td>' +
                '<td style="width:120px" class="tiny muted">' + E((Store.kbSpace(n.spaceId) || {}).name || '') + '</td></tr>').join('') +
              '</tbody></table>'
            : '<div class="empty">还没有收藏，打开文档点「收藏」试试</div>') + '</div></div>' +
      '</div>';
  }

  function searchHTML() {
    const r = Store.kbSearch(q);
    if (!r.length) return '<div class="empty"><div class="e-ico">—</div>没有找到与「' + E(q) + '」相关的文档</div>';
    return '<div class="card"><div class="card-h"><h3>搜索结果</h3><span class="h-sub">' + r.length + ' 篇</span></div>' +
      '<div class="card-b tight"><table class="tbl compact"><tbody>' + r.map(x =>
        '<tr><td style="width:190px"><a href="javascript:void 0" class="md-link" data-doc-id="' + x.node.id + '">' + E(x.node.title) + '</a></td>' +
        '<td class="tiny muted">' + (x.inTitle ? '<b>标题命中</b> · ' : '') + E((x.snippet || '').replace(/\n/g, ' ')) + '</td></tr>').join('') +
      '</tbody></table></div></div>';
  }

  /* ---------------- 渲染 ---------------- */
  function render(root) {
    const cur = sel ? Store.kbNode(sel) : null;
    const canCreate = Store.currentUser().type === 'internal';

    root.innerHTML =
      '<div class="kb-layout">' +
        '<aside class="kb-tree">' +
          '<div class="kb-search"><input class="inp" id="kbQ" placeholder="搜索全部文档…" value="' + E(q) + '"></div>' +
          '<div class="kb-tree-scroll" id="kbTree">' + (q ? '' : treeHTML()) + '</div>' +
          (canCreate ? '<div class="kb-tree-f"><button class="btn sm" id="kbNew">+ 新建文档</button>' +
            '<button class="btn ghost sm" id="kbNewSpace">+ 新建空间</button></div>' : '') +
        '</aside>' +
        '<div class="kb-main">' +
          (q ? searchHTML() : (cur ? docHTML(cur) : landingHTML())) +
        '</div>' +
      '</div>';

    bind(root);
    annotate(root);          // 批注高亮要在 DOM 落地后再包 span
  }

  function bind(root) {
    $('#kbQ', root).oninput = ev => { q = ev.target.value; const pos = ev.target.selectionStart; render(root); const nq = $('#kbQ', root); nq.focus(); nq.setSelectionRange(pos, pos); };
    $$('[data-folder]', root).forEach(r => r.onclick = () => { folded[r.dataset.folder] = !folded[r.dataset.folder]; render(root); });
    $$('[data-open]', root).forEach(r => r.onclick = () => { sel = r.dataset.open; q = ''; render(root); });
    $$('[data-space]', root).forEach(c => c.onclick = () => {
      const sid = c.dataset.space;
      const first = Store.kbNodes().filter(n => n.spaceId === sid && n.type === 'doc')[0];
      if (!first) return UI.toast('这个空间还没有文档，点左下角「+ 新建文档」开始', 'warn');
      sel = first.id; q = ''; render(root);
    });
    $$('[data-doc-id]', root).forEach(a => a.onclick = () => { sel = a.dataset.docId; q = ''; render(root); });
    $$('[data-doc]', root).forEach(a => a.onclick = () => {
      const d = Store.kbDocByTitle(a.dataset.doc);
      if (!d) return UI.toast('文档「' + a.dataset.doc + '」还没创建', 'warn');
      sel = d.id; q = ''; render(root);
    });

    const st = $('#kbStar', root);
    if (st) st.onclick = () => { Store.kbStar(sel); render(root); };

    const ed = $('#kbEdit', root);
    if (ed) ed.onclick = () => openEditor(Store.kbNode(sel));

    const nw = $('#kbNew', root);
    if (nw) nw.onclick = () => {
      const spaces = Store.kbSpaces();
      const curDoc = sel ? Store.kbNode(sel) : null;
      const curSpace = (curDoc && curDoc.spaceId) || (spaces[0] || {}).id;
      const folderOpts = sid => '<option value="">（空间顶级）</option>' +
        Store.kbFolders(sid).map(f => '<option value="' + f.id + '">' + E(f.title) + '</option>').join('');
      UI.modal({
        title:'新建文档', sub:'选空间；也可以先挂到某个目录下（目录 = 空间里的文件夹）',
        body:'<div class="field"><label>空间</label><select class="sel" id="neSpace">' +
            spaces.map(s => '<option value="' + s.id + '"' + (s.id === curSpace ? ' selected' : '') + '>' +
              E(s.name) + '</option>').join('') + '</select></div>' +
          '<div class="field mt12"><label>目录<span class="muted">（选填）</span></label>' +
            '<select class="sel" id="neFolder">' + folderOpts(curSpace) + '</select></div>' +
          '<div class="field mt12"><label>标题 <span class="req">*</span></label><input class="inp" id="neTitle" placeholder="例如：渲染 QC 检查清单"></div>' +
          '<div class="field mt12"><label>正文（支持 Markdown：# 标题 / - 列表 / | 表格 | / **粗体** / [[doc:文档名]] 互链）</label>' +
            '<textarea class="txa" id="neBody" style="min-height:170px" placeholder="# 标题&#10;- 要点"></textarea></div>',
        footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="neOk">创建</button>',
        onMount:function (mroot, close) {
          $('#neSpace', mroot).onchange = ev => {
            $('#neFolder', mroot).innerHTML = folderOpts(ev.target.value);
          };
          $('#neOk', mroot).onclick = () => {
            const t = $('#neTitle', mroot).value.trim();
            if (!t) return UI.toast('请填写标题', 'warn');
            const n = Store.kbCreate($('#neSpace', mroot).value, $('#neFolder', mroot).value || null,
              t, $('#neBody', mroot).value, Store.currentUser().id);
            Store.addLog(Store.currentUser().name, '新建知识库文档', t);
            close(); sel = n.id; q = ''; render(root);
            UI.toast('已创建', 'ok');
          };
        }
      });
    };

    /* 新建空间：知识库是一级分区，只有内部同事能加 */
    function openNewSpace() {
      UI.modal({
        title:'新建空间', sub:'空间 = 知识库的一级分区，例如「客户沟通」「外包与采购」',
        body:'<div class="field"><label>空间名称 <span class="req">*</span></label>' +
            '<input class="inp" id="nsName" placeholder="例如：外包与采购"></div>' +
          '<div class="field mt12"><label>说明<span class="muted">（选填，一句话）</span></label>' +
            '<input class="inp" id="nsDesc" placeholder="这个空间放什么文档"></div>',
        footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="nsOk">创建空间</button>',
        onMount:function (mroot, close) {
          $('#nsOk', mroot).onclick = () => {
            const nm = $('#nsName', mroot).value.trim();
            if (!nm) return UI.toast('请填写空间名称', 'warn');
            if (Store.kbSpaces().some(s => s.name === nm)) return UI.toast('已有同名空间', 'warn');
            Store.kbCreateSpace(nm, $('#nsDesc', mroot).value);
            Store.addLog(Store.currentUser().name, '新建知识库空间', nm);
            close(); q = ''; sel = null; render(root);
            UI.toast('空间「' + nm + '」已创建', 'ok');
          };
        }
      });
    }
    const ns = $('#kbNewSpace', root);
    if (ns) ns.onclick = openNewSpace;
    $$('[data-space-new]', root).forEach(c => c.onclick = openNewSpace);

    /* ---- v1.20 划词批注交互 ---- */
    const lay = $('.kb-layout', root);
    if (lay) {
      const pop = () => setTimeout(() => {
        const bubble = $('#kbBubble', root);
        if (!bubble) return;
        const c = captureSel();
        if (!c) { bubble.hidden = true; return; }
        lay._selCapture = c;                       // 先存好选区，点气泡时选区可能已被收起
        const s = window.getSelection();
        const rect = s.getRangeAt(0).getBoundingClientRect();
        bubble.hidden = false;
        bubble.style.left = Math.max(12, Math.min(window.innerWidth - 130, rect.left + rect.width / 2 - 58)) + 'px';
        bubble.style.top = Math.max(8, rect.top - 42) + 'px';
      }, 0);
      lay.onmouseup = pop;
      lay.onkeyup = pop;
    }
    const bubble = $('#kbBubble', root);
    if (bubble) bubble.onclick = ev => {
      ev.stopPropagation();
      bubble.hidden = true;
      const c = lay && lay._selCapture ? lay._selCapture : captureSel();
      if (c) openComposer(root, c);
    };

    /* 卡片 ⇄ 正文高亮 双向定位 */
    $$('[data-anno-card]', root).forEach(card => {
      card.onclick = ev => {
        if (ev.target.closest('button,input,textarea')) return;
        const hl = root.querySelector('.kb-hl[data-anno="' + card.dataset.annoCard + '"]');
        if (hl) { hl.scrollIntoView({ behavior:'smooth', block:'center' }); flashHL(hl); }
      };
    });

    /* 回复 / 解决 / 删除 */
    $$('[data-anno-reply-btn]', root).forEach(btn => {
      const id = btn.getAttribute('data-anno-reply-btn');
      const inp = root.querySelector('[data-anno-reply-input="' + id + '"]');
      const send = () => {
        const t = inp.value.trim();
        if (!t) return UI.toast('先写回复内容', 'warn');
        Store.kbAnnoReply(sel, id, t);
        render(document.getElementById('view'));
        UI.toast('已回复', 'ok');
      };
      btn.onclick = send;
      if (inp) inp.onkeydown = ev => { if (ev.key === 'Enter') send(); };
    });
    $$('[data-anno-resolve]', root).forEach(b => b.onclick = () => {
      Store.kbAnnoResolve(sel, b.getAttribute('data-anno-resolve'));
      render(document.getElementById('view'));
    });
    $$('[data-anno-del]', root).forEach(b => b.onclick = () => {
      if (!Store.kbAnnoDelete(sel, b.getAttribute('data-anno-del'))) return UI.toast('只能删除自己发的批注', 'warn');
      render(document.getElementById('view'));
      UI.toast('批注已删除', 'ok');
    });
  }

  function flashHL(hl) {
    hl.classList.add('flash');
    setTimeout(() => hl.classList.remove('flash'), 1400);
  }

  function openEditor(n) {
    UI.modal({
      title:'编辑文档', sub:n.title + ' · 保存后更新人与时间记为当前用户',
      xwide:true,
      body:'<div class="field"><label>标题</label><input class="inp" id="edTitle" value="' + E(n.title) + '"></div>' +
        '<div class="field mt12"><label>正文（Markdown）</label>' +
        '<textarea class="txa" id="edBody" style="min-height:320px">' + E(bodyOf(n)) + '</textarea></div>',
      footer:'<button class="btn" data-close>取消</button><button class="btn primary" id="edOk">保存</button>',
      onMount:function (mroot, close) {
        $('#edOk', mroot).onclick = () => {
          Store.kbUpsert(n.id, { title:$('#edTitle', mroot).value.trim() || n.title, body:$('#edBody', mroot).value });
          Store.addLog(Store.currentUser().name, '编辑知识库文档', n.title);
          close(); render(document.getElementById('view'));
          UI.toast('已保存', 'ok');
        };
      }
    });
  }

  window.Views.kb = {
    title:'知识库', sub:'规则、口径、会议纪要与管线手册 —— 新人从「日报填写规则」开始看',
    render:render
  };

  /* 迷你 Markdown 渲染器对外暴露：工作台信息流复用同一套，
     不引入第二个 Markdown 实现（两处渲染规则必须一致）。 */
  window.UI.mdHTML = mdHTML;
})();
