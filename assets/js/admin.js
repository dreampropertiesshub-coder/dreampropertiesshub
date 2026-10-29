/* Admin dashboard + blog editor.
   Talks to Supabase with the logged-in admin's session. Row Level Security
   in the database decides what is allowed, so nothing secret lives in this file. */
(function () {
  'use strict';

  var cfg = window.DPH_CONFIG || {};
  var BUCKET = 'blog-images';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var views = { login: $('#view-login'), dash: $('#view-dash'), editor: $('#view-editor') };
  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    window.scrollTo(0, 0);
  }

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    $('#fatal').hidden = false;
    return;
  }
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  /* ---------- state ---------- */
  var posts = [];
  var current = null;      // post being edited (null = new)
  var quill = null;
  var dirty = false;
  var slugTouched = false;
  var uploading = 0;
  var imageUrl = '';
  var saving = false;

  /* ---------- helpers ---------- */
  var toastTimer;
  function toast(msg, isError) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isError ? 6000 : 3500);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function slugify(text) {
    var s = String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '');
    return s;
  }

  function makeExcerpt(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= 180) return t;
    var cut = t.slice(0, 180);
    var i = cut.lastIndexOf(' ');
    return (i > 100 ? cut.slice(0, i) : cut).trim() + '…';
  }

  function siteBase() { return (cfg.SITE_URL && cfg.SITE_URL.indexOf('localhost') === -1) ? cfg.SITE_URL : location.origin; }

  /* ---------- auth ---------- */
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#login-error');
    err.textContent = '';
    var email = $('#login-email').value.trim();
    var password = $('#login-password').value;
    if (!email || !password) { err.textContent = 'Please enter your email and password.'; return; }
    var btn = $('#login-btn');
    btn.disabled = true; btn.textContent = 'Logging in…';
    sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      btn.disabled = false; btn.textContent = 'Log In';
      if (res.error) { err.textContent = 'Login failed: ' + res.error.message; return; }
      $('#login-password').value = '';
      openDashboard();
    }, function () {
      btn.disabled = false; btn.textContent = 'Log In';
      err.textContent = 'Could not reach the server. Check your internet connection.';
    });
  });

  function logout() {
    if (!views.editor.hidden && dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
    dirty = false;
    sb.auth.signOut().then(function () { posts = []; show('login'); });
  }
  $('#logout-btn').addEventListener('click', logout);
  $('#logout-btn-2').addEventListener('click', logout);

  sb.auth.onAuthStateChange(function (evt, session) {
    if (evt === 'SIGNED_OUT' || (!session && evt !== 'INITIAL_SESSION')) show('login');
  });

  /* ---------- dashboard ---------- */
  function openDashboard(bannerHtml) {
    show('dash');
    var banner = $('#banner');
    if (bannerHtml) { banner.innerHTML = bannerHtml; banner.hidden = false; } else { banner.hidden = true; }
    $('#post-list').innerHTML = '<div class="empty">Loading your blogs…</div>';
    return sb.from('posts')
      .select('id,title,slug,status,published_at,updated_at,created_at')
      .order('updated_at', { ascending: false })
      .then(function (res) {
        if (res.error) {
          $('#post-list').innerHTML = '<div class="empty">Could not load blogs: ' + esc(res.error.message) + '</div>';
          return;
        }
        posts = res.data || [];
        renderList();
      });
  }

  function renderList() {
    var q = $('#dash-search').value.trim().toLowerCase();
    var list = posts.filter(function (p) { return !q || p.title.toLowerCase().indexOf(q) !== -1; });
    var box = $('#post-list');
    if (!posts.length) {
      box.innerHTML = '<div class="empty"><p>You have not written any blogs yet.</p><p>Click <strong>+ Write New Blog</strong> to start.</p></div>';
      return;
    }
    if (!list.length) { box.innerHTML = '<div class="empty">No blogs match your search.</div>'; return; }
    box.innerHTML = list.map(function (p) {
      var pub = p.status === 'published';
      var when = pub ? 'Published ' + fmtDate(p.published_at) : 'Last saved ' + fmtDate(p.updated_at);
      return '<div class="post-row" data-id="' + esc(p.id) + '">' +
        '<div><h2><a href="#" data-act="edit">' + esc(p.title) + '</a></h2>' +
        '<div class="post-meta"><span class="badge badge-' + (pub ? 'published' : 'draft') + '">' + (pub ? 'Published' : 'Draft') + '</span><span>' + esc(when) + '</span></div></div>' +
        '<div class="row-actions">' +
        '<button class="btn btn-outline btn-small" type="button" data-act="edit">Edit</button>' +
        (pub ? '<a class="btn btn-ghost btn-small" href="/blog/' + esc(p.slug) + '" target="_blank" rel="noopener">View</a>' : '') +
        '<button class="btn btn-danger btn-small" type="button" data-act="delete">Delete</button>' +
        '</div></div>';
    }).join('');
  }

  $('#dash-search').addEventListener('input', renderList);
  $('#new-btn').addEventListener('click', function () { openEditor(null); });

  $('#post-list').addEventListener('click', function (e) {
    var actEl = e.target.closest('[data-act]');
    if (!actEl) return;
    e.preventDefault();
    var id = actEl.closest('.post-row').getAttribute('data-id');
    var post = posts.filter(function (p) { return p.id === id; })[0];
    if (!post) return;
    if (actEl.getAttribute('data-act') === 'edit') openEditor(id);
    if (actEl.getAttribute('data-act') === 'delete') deletePost(post);
  });

  function deletePost(post) {
    if (!confirm('Delete "' + post.title + '"?\n\nThis permanently removes the blog and cannot be undone.')) return;
    sb.from('posts').delete().eq('id', post.id).then(function (res) {
      if (res.error) { toast('Could not delete: ' + res.error.message, true); return; }
      posts = posts.filter(function (p) { return p.id !== post.id; });
      renderList();
      toast('Blog deleted.');
    });
  }

  /* ---------- images ---------- */
  function extFor(type) { return { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }[type] || 'jpg'; }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }

  /* Resize big photos and convert to WebP so pages load fast. */
  function optimise(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    var MAX = 1600;
    return createImageBitmap(file).then(function (bmp) {
      var w = bmp.width, h = bmp.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return toBlob(canvas, 'image/webp', 0.85).then(function (blob) {
        if (!blob || blob.type !== 'image/webp') return toBlob(canvas, 'image/jpeg', 0.86);
        return blob;
      });
    }).then(function (blob) {
      return (blob && (blob.size < file.size || file.size > 1.5 * 1024 * 1024)) ? blob : file;
    }).catch(function () { return file; });
  }

  function uploadImage(file) {
    uploading++;
    updateBusy();
    return optimise(file).then(function (blob) {
      var d = new Date();
      var path = d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' +
        Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + extFor(blob.type);
      return sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false })
        .then(function (res) {
          if (res.error) throw res.error;
          return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        });
    }).then(function (url) { uploading--; updateBusy(); return url; },
      function (err) { uploading--; updateBusy(); throw err; });
  }

  function dataUriToFile(uri) {
    var m = uri.match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!m) return null;
    var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], 'pasted.' + extFor(m[1]), { type: m[1] });
  }

  /* Images pasted from Word arrive embedded in the text; store them properly. */
  function uploadEmbeddedImages(html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    var imgs = Array.prototype.slice.call(doc.body.querySelectorAll('img[src^="data:"]'));
    if (!imgs.length) return Promise.resolve(html);
    $('#busy-text').textContent = 'Uploading ' + imgs.length + ' pasted image' + (imgs.length > 1 ? 's' : '') + '…';
    return imgs.reduce(function (chain, img) {
      return chain.then(function () {
        var file = dataUriToFile(img.getAttribute('src'));
        if (!file) { img.remove(); return null; }
        return uploadImage(file).then(function (url) { img.setAttribute('src', url); });
      });
    }, Promise.resolve()).then(function () { return doc.body.innerHTML; });
  }

  function setImage(url) {
    imageUrl = url || '';
    var box = $('#image-preview');
    if (imageUrl) {
      box.innerHTML = '<img src="' + esc(imageUrl) + '" alt="Featured image preview">';
      $('#image-remove').hidden = false;
      $('#image-btn').textContent = 'Replace Image';
    } else {
      box.textContent = 'No image yet';
      $('#image-remove').hidden = true;
      $('#image-btn').textContent = 'Upload Image';
    }
  }

  $('#image-btn').addEventListener('click', function () { $('#image-input').click(); });
  $('#image-remove').addEventListener('click', function () { setImage(''); dirty = true; });
  $('#image-input').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    $('#image-preview').textContent = 'Uploading…';
    uploadImage(file).then(function (url) { setImage(url); dirty = true; toast('Image uploaded.'); },
      function (err) { setImage(imageUrl); toast('Image upload failed: ' + (err.message || err), true); });
  });

  /* ---------- editor ---------- */
  function ensureQuill() {
    if (quill) return;
    quill = new Quill('#editor', {
      theme: 'snow',
      placeholder: 'Write or paste your blog here…',
      modules: {
        toolbar: {
          container: [
            [{ header: [2, 3, false] }],
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'link', 'image'],
            ['clean'],
          ],
          handlers: {
            image: function () { $('#content-image-input').click(); },
          },
        },
      },
    });
    quill.on('text-change', function (delta, old, source) { if (source === 'user') dirty = true; });

    $('#content-image-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      var range = quill.getSelection(true);
      toast('Uploading image…');
      uploadImage(file).then(function (url) {
        quill.insertEmbed(range.index, 'image', url, 'user');
        quill.setSelection(range.index + 1, 0);
      }, function (err) { toast('Image upload failed: ' + (err.message || err), true); });
    });
  }

  function setContent(html) {
    if (html) quill.setContents(quill.clipboard.convert(html), 'silent');
    else quill.setContents([], 'silent');
  }
  function hasContent() { return quill.getText().trim().length > 0 || !!quill.root.querySelector('img'); }
  function getHtml() { return hasContent() ? quill.root.innerHTML : ''; }

  function updateButtons() {
    var published = current && current.status === 'published';
    $('#publish-btn').textContent = published ? 'Update Post' : 'Publish';
    $('#draft-btn').textContent = published ? 'Move to Draft' : 'Save Draft';
    $('#editor-heading').textContent = current ? 'Edit Blog' : 'Write New Blog';
    $('#editor-status').textContent = current ? (published ? 'Status: Published' : 'Status: Draft') : 'New blog';
  }

  function updateSlugPrefix() { $('#slug-prefix').textContent = siteBase().replace(/^https?:\/\//, '') + '/blog/'; }

  function updateBusy() {
    var busy = saving || uploading > 0;
    $('#publish-btn').disabled = busy;
    $('#draft-btn').disabled = busy;
    if (!saving) $('#busy-text').textContent = uploading > 0 ? 'Uploading image…' : '';
  }

  function resetForm() {
    $('#f-title').value = '';
    $('#f-slug').value = '';
    $('#f-seo-title').value = '';
    $('#f-meta').value = '';
    $('#f-alt').value = '';
    document.querySelector('details.seo').open = false;
    setImage('');
    setContent('');
    slugTouched = false;
    dirty = false;
  }

  function openEditor(id) {
    ensureQuill();
    updateSlugPrefix();
    resetForm();
    current = null;
    updateButtons();
    updateBusy();
    show('editor');
    if (!id) { $('#f-title').focus(); return; }

    $('#editor-heading').textContent = 'Loading…';
    sb.from('posts').select('*').eq('id', id).single().then(function (res) {
      if (res.error || !res.data) { toast('Could not open this blog: ' + ((res.error && res.error.message) || 'not found'), true); openDashboard(); return; }
      var p = res.data;
      current = p;
      $('#f-title').value = p.title || '';
      $('#f-slug').value = p.slug || '';
      $('#f-seo-title').value = p.seo_title || '';
      $('#f-meta').value = p.meta_description || '';
      $('#f-alt').value = p.featured_image_alt || '';
      if (p.seo_title || p.meta_description || p.featured_image_alt) document.querySelector('details.seo').open = true;
      setImage(p.featured_image || '');
      setContent(p.content || '');
      slugTouched = true; // never rename an existing post's address automatically
      dirty = false;
      updateButtons();
    });
  }

  $('#f-title').addEventListener('input', function () {
    dirty = true;
    if (!slugTouched && !current) $('#f-slug').value = slugify($('#f-title').value);
  });
  $('#f-slug').addEventListener('input', function () { slugTouched = true; dirty = true; });
  $('#f-slug').addEventListener('blur', function () { var v = slugify(this.value); if (this.value && v) this.value = v; });
  ['#f-seo-title', '#f-meta', '#f-alt'].forEach(function (s) { $(s).addEventListener('input', function () { dirty = true; }); });

  $('#back-btn').addEventListener('click', function () {
    if (dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
    dirty = false;
    openDashboard();
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty && !views.editor.hidden) { e.preventDefault(); e.returnValue = ''; }
  });

  /* Find a free slug: my-post, my-post-2, my-post-3 ... */
  function uniqueSlug(base, ownId) {
    var n = 1;
    function attempt() {
      var candidate = n === 1 ? base : base + '-' + n;
      return sb.from('posts').select('id').eq('slug', candidate).limit(1).then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.length && res.data[0].id !== ownId) {
          if (++n > 50) throw new Error('Could not find a free web address. Please change the title or address.');
          return attempt();
        }
        return candidate;
      });
    }
    return attempt();
  }

  function save(status) {
    if (saving || uploading) return;
    var title = $('#f-title').value.trim();
    if (!title) { toast('Please enter a blog title.', true); $('#f-title').focus(); return; }
    if (status === 'published' && !hasContent()) { toast('Please add some content before publishing.', true); quill.focus(); return; }
    if (status === 'draft' && current && current.status === 'published' &&
      !confirm('This hides the blog from your website until you publish it again. Continue?')) return;

    saving = true;
    updateBusy();
    $('#busy-text').textContent = status === 'published' ? 'Publishing…' : 'Saving…';

    var wasPublished = !!(current && current.status === 'published');
    var finalSlug;

    uploadEmbeddedImages(getHtml()).then(function (html) {
      if (html !== getHtml()) setContent(html);
      var wanted = slugify($('#f-slug').value) || slugify(title) || ('post-' + Date.now());
      return uniqueSlug(wanted, current && current.id).then(function (slug) {
        finalSlug = slug;
        if (slug !== wanted) toast('That web address was taken, so "' + slug + '" was used.');
        $('#f-slug').value = slug;
        var payload = {
          title: title,
          slug: slug,
          content: html,
          excerpt: makeExcerpt(quill.getText()),
          featured_image: imageUrl || null,
          featured_image_alt: $('#f-alt').value.trim() || null,
          seo_title: $('#f-seo-title').value.trim() || null,
          meta_description: $('#f-meta').value.trim() || null,
          status: status,
        };
        var q = current && current.id
          ? sb.from('posts').update(payload).eq('id', current.id)
          : sb.from('posts').insert(payload);
        return q.select('id,slug,status').single();
      });
    }).then(function (res) {
      if (res.error) throw res.error;
      saving = false;
      dirty = false;
      updateBusy();
      var link = '/blog/' + res.data.slug;
      var banner;
      if (status === 'published') {
        banner = '<span><strong>' + (wasPublished ? 'Changes saved.' : 'Your blog is published!') + '</strong> ' +
          (wasPublished ? 'Visitors may need up to a minute to see the update.' : 'It now appears on your homepage.') +
          '</span><a href="' + esc(link) + '" target="_blank" rel="noopener">View blog &rarr;</a>';
      } else {
        banner = '<span><strong>Draft saved.</strong> It is hidden from visitors.</span>';
      }
      return openDashboard(banner);
    }).catch(function (err) {
      saving = false;
      updateBusy();
      var msg = (err && err.message) || String(err);
      if (/JWT|expired|not authenticated/i.test(msg)) msg = 'Your login has expired. Please log in again (your text is still here until you refresh).';
      toast('Could not save: ' + msg, true);
    });
  }

  $('#publish-btn').addEventListener('click', function () { save('published'); });
  $('#draft-btn').addEventListener('click', function () { save('draft'); });

  /* ---------- start ---------- */
  sb.auth.getSession().then(function (res) {
    if (res.data && res.data.session) openDashboard(); else show('login');
  }, function () { show('login'); });
})();
