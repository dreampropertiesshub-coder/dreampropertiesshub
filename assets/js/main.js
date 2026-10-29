/* Homepage: latest blogs, search and "Load More". */
(function () {
  'use strict';
  var PAGE_SIZE = 9;
  var grid = document.getElementById('post-grid');
  var statusEl = document.getElementById('post-status');
  var moreBtn = document.getElementById('load-more');
  var form = document.getElementById('search-form');
  var input = document.getElementById('search-input');
  var offset = 0;
  var query = '';
  var token = 0; // ignore out-of-date responses

  function cleanQuery(q) {
    // Remove characters that have special meaning in the search filter.
    return String(q || '').replace(/[,()*%\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function skeletons() {
    var html = '';
    for (var i = 0; i < 3; i++) html += '<div class="skeleton" aria-hidden="true"></div>';
    return html;
  }

  function load(reset) {
    var my = ++token;
    if (reset) {
      offset = 0;
      grid.innerHTML = skeletons();
      grid.setAttribute('aria-busy', 'true');
      statusEl.textContent = '';
      moreBtn.hidden = true;
    }
    moreBtn.disabled = true;

    var path = 'posts?status=eq.published' +
      '&select=id,title,slug,excerpt,featured_image,featured_image_alt,published_at' +
      '&order=published_at.desc&limit=' + PAGE_SIZE + '&offset=' + offset;
    if (query) {
      var like = '*' + query + '*';
      path += '&or=' + encodeURIComponent('(title.ilike.' + like + ',content.ilike.' + like + ')');
    }

    DPH.api(path, { Prefer: 'count=exact' }).then(function (res) {
      var range = res.headers.get('Content-Range') || '';
      var total = parseInt(range.split('/')[1], 10);
      return res.json().then(function (rows) { return { rows: rows, total: isNaN(total) ? null : total }; });
    }).then(function (r) {
      if (my !== token) return;
      if (reset) grid.innerHTML = '';
      grid.insertAdjacentHTML('beforeend', r.rows.map(DPH.cardHtml).join(''));
      offset += r.rows.length;
      grid.setAttribute('aria-busy', 'false');

      var total = r.total;
      var hasMore = total !== null ? offset < total : r.rows.length === PAGE_SIZE;
      moreBtn.hidden = !hasMore;
      moreBtn.disabled = false;

      if (offset === 0) {
        statusEl.textContent = query ? 'No blogs found for "' + query + '". Try a different word.' : 'No blogs have been published yet. Please check back soon.';
      } else if (query) {
        statusEl.textContent = (total !== null ? total : offset) + ' result' + ((total !== null ? total : offset) === 1 ? '' : 's') + ' for "' + query + '"';
      } else {
        statusEl.textContent = '';
      }
    }).catch(function () {
      if (my !== token) return;
      grid.innerHTML = '';
      grid.setAttribute('aria-busy', 'false');
      moreBtn.disabled = false;
      statusEl.textContent = 'Sorry, blogs could not be loaded right now. Please refresh the page.';
    });
  }

  function search(q, pushUrl) {
    query = cleanQuery(q);
    if (pushUrl) {
      var url = location.pathname + (query ? '?q=' + encodeURIComponent(query) : '') + '#blogs';
      history.replaceState(null, '', url);
    }
    load(true);
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); search(input.value, true); });
  input.addEventListener('input', function () { if (input.value === '' && query) search('', true); });
  moreBtn.addEventListener('click', function () { load(false); });

  var m = location.search.match(/[?&]q=([^&]*)/);
  if (m) { try { input.value = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { /* ignore */ } }
  search(input.value, false);
})();
