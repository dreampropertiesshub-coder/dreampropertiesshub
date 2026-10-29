'use strict';
/**
 * Shared helpers for the Netlify functions (server-side rendering + sitemap).
 * Only the PUBLIC anon key is used here. Public visitors can only read
 * published posts, because Supabase Row Level Security enforces it.
 */
const fs = require('fs');
const path = require('path');

const SITE_NAME = 'Dream Properties Hub';
const TZ = 'Asia/Kolkata';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/* ---------- small utilities ---------- */

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
    });
  } catch (e) {
    return '';
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function excerptFrom(html, max) {
  const text = stripHtml(html);
  const limit = max || 160;
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return cut.slice(0, cut.lastIndexOf(' ') > 80 ? cut.lastIndexOf(' ') : limit).trim() + '…';
}

/* ---------- HTML sanitiser (allow-list, defence in depth) ---------- */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
  'blockquote', 'img', 'hr', 'pre', 'code', 'span', 'div', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sub', 'sup',
]);
const VOID_TAGS = new Set(['br', 'img', 'hr']);

function safeUrl(value, allowMailto) {
  const v = String(value || '').trim();
  if (/^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v) || /^#/.test(v)) return v;
  if (allowMailto && /^(mailto|tel):/i.test(v)) return v;
  return '';
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] || ''));
    if (!(name in attrs)) attrs[name] = val;
  }
  return attrs;
}

function sanitizeHtml(html) {
  let out = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math|form|textarea|select)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math|form|textarea|select)\b[^>]*>/gi, '');

  out = out.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, slash, rawTag, rawAttrs) => {
    let tag = rawTag.toLowerCase();
    if (tag === 'h1') tag = 'h2'; // keep exactly one H1 per page (the post title)
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (slash) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;

    const attrs = parseAttrs(rawAttrs);
    let extra = '';
    if (attrs.class) {
      const cls = attrs.class.split(/\s+/).filter((c) => /^ql-[a-z0-9-]+$/.test(c)).join(' ');
      if (cls) extra += ` class="${esc(cls)}"`;
    }
    if (tag === 'a') {
      const href = safeUrl(attrs.href, true);
      if (href) extra += ` href="${esc(href)}"`;
      if (/^https?:\/\//i.test(href)) extra += ' target="_blank" rel="noopener noreferrer"';
    } else if (tag === 'img') {
      const src = safeUrl(attrs.src, false);
      if (!src) return '';
      extra += ` src="${esc(src)}" alt="${esc(attrs.alt || '')}" loading="lazy" decoding="async"`;
    } else if ((tag === 'td' || tag === 'th') && /^\d{1,2}$/.test(attrs.colspan || '')) {
      extra += ` colspan="${attrs.colspan}"`;
    }
    return `<${tag}${extra}${VOID_TAGS.has(tag) ? ' /' : ''}>`;
  });
  return out;
}

/* ---------- Supabase (read-only, public key) ---------- */

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in Netlify environment variables.');
  return { url: url.replace(/\/+$/, ''), key };
}

async function sbGet(pathAndQuery) {
  const { url, key } = config();
  const headers = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // legacy JWT-style anon key
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { headers });
  if (!res.ok) throw new Error(`Supabase request failed (${res.status})`);
  return res.json();
}

async function getPostBySlug(slug) {
  if (!SLUG_RE.test(slug)) return null;
  const rows = await sbGet(`posts?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*&limit=1`);
  return rows[0] || null;
}

async function getLatestPosts(limit, excludeId) {
  let q = `posts?status=eq.published&select=id,title,slug,excerpt,featured_image,featured_image_alt,published_at&order=published_at.desc&limit=${Number(limit) || 3}`;
  if (excludeId) q += `&id=neq.${encodeURIComponent(excludeId)}`;
  return sbGet(q);
}

async function getAllPublishedForSitemap() {
  return sbGet('posts?status=eq.published&select=slug,updated_at,published_at&order=published_at.desc&limit=1000');
}

/* ---------- site helpers ---------- */

function siteUrl(event) {
  let u = process.env.SITE_URL || process.env.URL || '';
  if (!u && event && event.headers && event.headers.host) u = `https://${event.headers.host}`;
  return u.replace(/\/+$/, '');
}

async function loadTemplate(name, event) {
  const candidates = [
    path.join(process.env.LAMBDA_TASK_ROOT || '', 'dist', name),
    path.join(__dirname, '..', '..', 'dist', name),
    path.join(process.cwd(), 'dist', name),
    path.join(__dirname, 'dist', name),
  ];
  for (const file of candidates) {
    try { return fs.readFileSync(file, 'utf8'); } catch (e) { /* try next */ }
  }
  // Fallback: fetch the static copy from the live site.
  const res = await fetch(`${siteUrl(event)}/${name}`);
  if (!res.ok) throw new Error(`Template ${name} not found`);
  return res.text();
}

function cardHtml(p) {
  const href = `/blog/${esc(p.slug)}`;
  const media = p.featured_image
    ? `<img src="${esc(p.featured_image)}" alt="${esc(p.featured_image_alt || p.title)}" width="800" height="500" loading="lazy" decoding="async">`
    : '<div class="card-placeholder" aria-hidden="true"><span>D</span></div>';
  const excerpt = p.excerpt || '';
  return `<article class="card">
  <a class="card-media" href="${href}" tabindex="-1" aria-hidden="true">${media}</a>
  <div class="card-body">
    <time class="card-date" datetime="${esc(p.published_at || '')}">${esc(formatDate(p.published_at))}</time>
    <h3 class="card-title"><a href="${href}">${esc(p.title)}</a></h3>
    <p class="card-excerpt">${esc(excerpt)}</p>
    <a class="read-more" href="${href}">Read More <span aria-hidden="true">&rarr;</span></a>
  </div>
</article>`;
}

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function renderPostPage(template, post, related, site) {
  const url = `${site}/blog/${post.slug}`;
  const title = post.seo_title || `${post.title} | ${SITE_NAME}`;
  const description = post.meta_description || post.excerpt || excerptFrom(post.content, 160);
  const image = post.featured_image || '';
  const published = post.published_at || post.created_at;
  const modified = post.updated_at || published;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title.slice(0, 110),
    description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: published,
    dateModified: modified,
    author: { '@type': 'Organization', name: SITE_NAME, url: site },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: site },
  };
  if (image) ld.image = [image];

  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    '<meta name="robots" content="index, follow, max-image-preview:large">',
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta property="article:published_time" content="${esc(published)}">`,
    `<meta property="article:modified_time" content="${esc(modified)}">`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : '',
    `<script type="application/ld+json">${jsonLd(ld)}</script>`,
  ].filter(Boolean).join('\n  ');

  const enc = encodeURIComponent(url);
  const encTitle = encodeURIComponent(post.title);
  const share = `<div class="share" aria-label="Share this post">
      <span class="share-label">Share</span>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${enc}" target="_blank" rel="noopener noreferrer">Facebook</a>
      <a href="https://twitter.com/intent/tweet?url=${enc}&amp;text=${encTitle}" target="_blank" rel="noopener noreferrer">X</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${enc}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
      <a href="https://wa.me/?text=${encTitle}%20${enc}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <button type="button" class="share-copy" data-copy-link="${esc(url)}">Copy link</button>
    </div>`;

  const hero = image
    ? `<figure class="article-hero"><img src="${esc(image)}" alt="${esc(post.featured_image_alt || post.title)}" width="1200" height="675" fetchpriority="high" decoding="async"></figure>`
    : '';

  const relatedHtml = related && related.length
    ? `<section class="related" aria-labelledby="related-title">
    <div class="container">
      <h2 id="related-title" class="section-title">Latest Posts</h2>
      <div class="grid">${related.map(cardHtml).join('\n')}</div>
    </div>
  </section>`
    : '';

  const body = `<article class="article container-narrow">
    <a class="back-link" href="/#blogs"><span aria-hidden="true">&larr;</span> Back to Blogs</a>
    <header class="article-header">
      <h1>${esc(post.title)}</h1>
      <p class="article-meta"><time datetime="${esc(published)}">${esc(formatDate(published))}</time></p>
    </header>
    ${hero}
    <div class="article-content">${sanitizeHtml(post.content)}</div>
    ${share}
  </article>
  ${relatedHtml}`;

  return template
    .replace(/<!--SEO_HEAD-->[\s\S]*?<!--\/SEO_HEAD-->/, () => head)
    .replace('<main id="post-root">', () => '<main id="post-root" data-ssr="1">')
    .replace('<!--POST_HTML-->', () => body);
}

function htmlResponse(statusCode, body, cache) {
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  if (cache) {
    headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
    headers['Netlify-CDN-Cache-Control'] = 'public, s-maxage=60, stale-while-revalidate=300';
  } else {
    headers['Cache-Control'] = 'no-store';
  }
  return { statusCode, headers, body };
}

module.exports = {
  SITE_NAME, SLUG_RE, esc, formatDate, stripHtml, excerptFrom, sanitizeHtml,
  getPostBySlug, getLatestPosts, getAllPublishedForSitemap,
  siteUrl, loadTemplate, cardHtml, renderPostPage, htmlResponse,
};
