/* Blog detail page.
   On the live site the article is already rendered on the server (data-ssr="1"),
   so this file only wires the "Copy link" button. If the server function is not
   available (plain local preview) it falls back to rendering in the browser. */
(function () {
  'use strict';
  var root = document.getElementById('post-root');

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-copy-link]') : null;
    if (!btn) return;
    var link = btn.getAttribute('data-copy-link') || location.href;
    var done = function () { var t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = t; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { window.prompt('Copy this link:', link); });
    else window.prompt('Copy this link:', link);
  });

  if (!root || root.getAttribute('data-ssr') === '1') return;

  /* ---------- browser-side fallback ---------- */
  var esc = DPH.esc;
  var slug = (new URLSearchParams(location.search).get('slug') || '').toLowerCase();
  if (!slug) { var m = location.pathname.match(/\/blog\/([^/]+)/); slug = m ? decodeURIComponent(m[1]).toLowerCase() : ''; }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { location.replace('/'); return; }

  function notFound() {
    document.title = 'Post not found | Dream Properties Hub';
    root.innerHTML = '<section class="page-hero"><div class="container"><p class="eyebrow">Error 404</p><h1>We could not find that post</h1><a class="btn" href="/">Back to Home</a></div></section>';
  }

  root.innerHTML = '<div class="container-narrow article"><div class="skeleton"></div></div>';

  Promise.all([
    DPH.api('posts?slug=eq.' + encodeURIComponent(slug) + '&status=eq.published&select=*&limit=1').then(function (r) { return r.json(); }),
  ]).then(function (res) {
    var post = res[0][0];
    if (!post) return notFound();
    var url = location.origin + '/blog/' + post.slug;
    document.title = post.seo_title || (post.title + ' | Dream Properties Hub');
    var published = post.published_at || post.created_at;
    var hero = post.featured_image
      ? '<figure class="article-hero"><img src="' + esc(post.featured_image) + '" alt="' + esc(post.featured_image_alt || post.title) + '" width="1200" height="675"></figure>' : '';
    var enc = encodeURIComponent(url), t = encodeURIComponent(post.title);
    root.innerHTML = '<article class="article container-narrow">' +
      '<a class="back-link" href="/#blogs"><span aria-hidden="true">&larr;</span> Back to Blogs</a>' +
      '<header class="article-header"><h1>' + esc(post.title) + '</h1><p class="article-meta"><time datetime="' + esc(published) + '">' + esc(DPH.formatDate(published)) + '</time></p></header>' +
      hero + '<div class="article-content">' + DPH.sanitize(post.content) + '</div>' +
      '<div class="share"><span class="share-label">Share</span>' +
      '<a href="https://www.facebook.com/sharer/sharer.php?u=' + enc + '" target="_blank" rel="noopener noreferrer">Facebook</a>' +
      '<a href="https://twitter.com/intent/tweet?url=' + enc + '&amp;text=' + t + '" target="_blank" rel="noopener noreferrer">X</a>' +
      '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + enc + '" target="_blank" rel="noopener noreferrer">LinkedIn</a>' +
      '<a href="https://wa.me/?text=' + t + '%20' + enc + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' +
      '<button type="button" class="share-copy" data-copy-link="' + esc(url) + '">Copy link</button></div></article>';

    return DPH.api('posts?status=eq.published&id=neq.' + encodeURIComponent(post.id) +
      '&select=id,title,slug,excerpt,featured_image,featured_image_alt,published_at&order=published_at.desc&limit=3')
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!rows.length) return;
        root.insertAdjacentHTML('beforeend', '<section class="related"><div class="container"><h2 class="section-title">Latest Posts</h2><div class="grid">' + rows.map(DPH.cardHtml).join('') + '</div></div></section>');
      });
  }).catch(function () {
    root.innerHTML = '<div class="container-narrow article"><p class="notice notice-error">This post could not be loaded right now. Please refresh the page.</p></div>';
  });
})();
