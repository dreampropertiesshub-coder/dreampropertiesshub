/* Shared helpers for all public pages. */
window.DPH = (function () {
  'use strict';
  var cfg = window.DPH_CONFIG || {};
  var TZ = 'Asia/Kolkata';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
    } catch (e) { return ''; }
  }

  /* Read-only requests to Supabase using the public anon key. */
  function api(pathAndQuery, extraHeaders) {
    var headers = { apikey: cfg.SUPABASE_ANON_KEY };
    if (String(cfg.SUPABASE_ANON_KEY || '').indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + cfg.SUPABASE_ANON_KEY;
    Object.keys(extraHeaders || {}).forEach(function (k) { headers[k] = extraHeaders[k]; });
    return fetch(cfg.SUPABASE_URL + '/rest/v1/' + pathAndQuery, { headers: headers }).then(function (res) {
      if (!res.ok) throw new Error('Request failed (' + res.status + ')');
      return res;
    });
  }

  /* Same markup as the server-rendered cards (netlify/lib/shared.js). */
  function cardHtml(p) {
    var href = '/blog/' + esc(p.slug);
    var media = p.featured_image
      ? '<img src="' + esc(p.featured_image) + '" alt="' + esc(p.featured_image_alt || p.title) + '" width="800" height="500" loading="lazy" decoding="async">'
      : '<div class="card-placeholder" aria-hidden="true"><span>D</span></div>';
    return '<article class="card">' +
      '<a class="card-media" href="' + href + '" tabindex="-1" aria-hidden="true">' + media + '</a>' +
      '<div class="card-body">' +
      '<time class="card-date" datetime="' + esc(p.published_at || '') + '">' + esc(formatDate(p.published_at)) + '</time>' +
      '<h3 class="card-title"><a href="' + href + '">' + esc(p.title) + '</a></h3>' +
      '<p class="card-excerpt">' + esc(p.excerpt || '') + '</p>' +
      '<a class="read-more" href="' + href + '">Read More <span aria-hidden="true">&rarr;</span></a>' +
      '</div></article>';
  }

  /* Allow-list sanitiser for HTML that is rendered in the browser. */
  var ALLOWED = 'P BR H2 H3 H4 STRONG B EM I U S A UL OL LI BLOCKQUOTE IMG HR PRE CODE SPAN DIV FIGURE FIGCAPTION TABLE THEAD TBODY TR TH TD SUB SUP'.split(' ');
  function safeUrl(v, mail) {
    v = String(v || '').trim();
    if (/^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v) || /^#/.test(v)) return v;
    if (mail && /^(mailto|tel):/i.test(v)) return v;
    return '';
  }
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    (function walk(node) {
      Array.prototype.slice.call(node.children).forEach(function (el) {
        var tag = el.tagName;
        if (tag === 'H1') {
          var h2 = doc.createElement('h2');
          while (el.firstChild) h2.appendChild(el.firstChild);
          el.replaceWith(h2); el = h2; tag = 'H2';
        }
        if (ALLOWED.indexOf(tag) === -1) {
          if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|NOSCRIPT|TEMPLATE|SVG|MATH|FORM|TEXTAREA|SELECT)$/.test(tag)) { el.remove(); return; }
          var frag = doc.createDocumentFragment();
          while (el.firstChild) frag.appendChild(el.firstChild);
          el.replaceWith(frag);
          walk(node); return;
        }
        var keep = {};
        if (tag === 'A') { var h = safeUrl(el.getAttribute('href'), true); if (h) keep.href = h; if (/^https?:/i.test(h)) { keep.target = '_blank'; keep.rel = 'noopener noreferrer'; } }
        if (tag === 'IMG') {
          var s = safeUrl(el.getAttribute('src'), false);
          if (!s) { el.remove(); return; }
          keep.src = s; keep.alt = el.getAttribute('alt') || ''; keep.loading = 'lazy'; keep.decoding = 'async';
        }
        var cls = (el.getAttribute('class') || '').split(/\s+/).filter(function (c) { return /^ql-[a-z0-9-]+$/.test(c); }).join(' ');
        if (cls) keep['class'] = cls;
        Array.prototype.slice.call(el.attributes).forEach(function (a) { el.removeAttribute(a.name); });
        Object.keys(keep).forEach(function (k) { el.setAttribute(k, keep[k]); });
        walk(el);
      });
    })(doc.body);
    return doc.body.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Mobile menu
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('site-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
      });
    }
    // Highlight current page in the menu
    var page = document.body.getAttribute('data-page');
    var key = page === 'blog' ? 'blog' : page;
    var link = document.querySelector('.site-nav a[data-nav="' + key + '"]');
    if (link && (page === 'home' || page === 'about' || page === 'contact')) link.setAttribute('aria-current', 'page');
    // Footer year
    var y = document.querySelector('[data-year]');
    if (y) y.textContent = new Date().getFullYear();
  });

  return { cfg: cfg, esc: esc, formatDate: formatDate, api: api, cardHtml: cardHtml, sanitize: sanitize };
})();
