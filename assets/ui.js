/* ============================================================
   阿莱夫日报系统 · UI 基础组件
   ============================================================ */
window.UI = (function () {

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, type) {
    const wrap = document.getElementById('toast');
    const n = el('<div class="toast ' + (type || '') + '"><span class="t-dot"></span><span>' + esc(msg) + '</span></div>');
    wrap.appendChild(n);
    setTimeout(() => { n.style.opacity = '0'; n.style.transition = 'opacity .25s'; setTimeout(() => n.remove(), 260); }, 2200);
  }

  /* ---------- Modal ---------- */
  function modal(opt) {
    const root = document.getElementById('modal');
    const wide = opt.xwide ? ' xwide' : (opt.wide ? ' wide' : '');
    root.innerHTML =
      '<div class="modal-mask"></div>' +
      '<div class="modal' + wide + '">' +
        '<div class="modal-h"><div><h3>' + esc(opt.title) + '</h3>' +
          (opt.sub ? '<div class="m-sub">' + esc(opt.sub) + '</div>' : '') + '</div>' +
          '<div class="spacer"></div><button class="btn ghost sm" data-close>关闭</button></div>' +
        '<div class="modal-b">' + (opt.body || '') + '</div>' +
        (opt.footer ? '<div class="modal-f">' + opt.footer + '</div>' : '') +
      '</div>';
    root.hidden = false;
    const close = () => { root.hidden = true; root.innerHTML = ''; if (opt.onClose) opt.onClose(); };
    $$('[data-close]', root).forEach(b => b.onclick = close);
    $('.modal-mask', root).onclick = close;
    if (opt.onMount) opt.onMount(root, close);
    return { close: close, root: root };
  }

  function confirmDialog(title, text, onOk, okText) {
    modal({
      title: title,
      body: '<div class="note accent"><span class="n-ico">i</span><div>' + esc(text) + '</div></div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn primary" data-ok>' + esc(okText || '确认') + '</button>',
      onMount: (root, close) => {
        $('[data-ok]', root).onclick = () => { close(); onOk && onOk(); };
      }
    });
  }

  /* ---------- 复制（file:// 兼容） ---------- */
  function copy(text) {
    const done = () => toast('已复制到剪贴板', 'ok');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { toast('复制失败，请手动选择文本', 'danger'); }
      ta.remove();
    }
  }

  /* ---------- CSV 下载 ---------- */
  function csv(filename, rows) {
    const body = rows.map(r => r.map(c => {
      const s = c == null ? '' : String(c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + body], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('已导出 ' + filename, 'ok');
  }

  /* ---------- 文本下载 ---------- */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type:(mime || 'text/markdown') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('已导出 ' + filename, 'ok');
  }

  /* ---------- 徽章 ---------- */
  /* 条目状态三选一（v1.15）：当日必须收口 —— 已完成 / 未完成 / 需加班完成。
     刻意不做进度百分比，也不做「进行中」。 */
  const PROGRESS = {
    done:     { t:'已完成',     c:'ok' },
    undone:   { t:'未完成',     c:'danger' },
    overtime: { t:'需加班完成', c:'warn' }
  };
  function progressBadge(v) {
    const m = PROGRESS[v] || { t:v, c:'' };
    return '<span class="badge ' + m.c + '"><span class="dot"></span>' + esc(m.t) + '</span>';
  }
  function pct(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }

  function personChip(p, small) {
    if (!p) return '';
    return '<span class="row" style="gap:6px"><span class="avatar ' + (p.type === 'client' ? 'client' : '') + '"' +
      (small ? ' style="width:20px;height:20px;font-size:10.5px"' : '') + '>' + esc(p.name.slice(0, 1)) + '</span>' +
      '<span>' + esc(p.name) + '</span>' +
      (p.type === 'client' ? '<span class="tag">客户侧</span>' : '') + '</span>';
  }

  /* ---------- 品牌标 ----------
     公司 logo：把图片存为 assets/logo.png 即自动生效（侧栏 + 登录页 + 标签页图标）。
     启动时只探测一次 —— 有图就给 <html> 打 has-logo，CSS 接管显示；
     没图就保持「AL」字标，不出现破图，也不会每次渲染都刷 404。 */
  function brandMark(opt) {
    const o = opt || {};
    const cls = 'brand-mark' + (o.light ? ' light' : '') + (o.size ? ' ' + o.size : '');
    const st = o.style ? ' style="' + o.style + '"' : '';
    return '<span class="' + cls + '"' + st + '><span class="bm-fallback">AL</span></span>';
  }
  let logoProbed = false;
  function logoProbe() {
    if (logoProbed) return;
    logoProbed = true;
    const im = new Image();
    im.onload = () => {
      document.documentElement.classList.add('has-logo');
      const l = document.createElement('link');
      l.rel = 'icon';
      l.href = 'assets/logo.png';
      document.head.appendChild(l);
    };
    im.onerror = () => document.documentElement.classList.remove('has-logo');
    im.src = 'assets/logo.png';
  }

  return { esc, el, $, $$, toast, modal, confirmDialog, copy, csv, download, brandMark, logoProbe,
           progressBadge, pct, personChip, PROGRESS };
})();
