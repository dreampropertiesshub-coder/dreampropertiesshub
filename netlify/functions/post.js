'use strict';
/**
 * GET /blog/:slug  ->  fully server-rendered HTML for one published post.
 * Search engines receive complete content, meta tags, canonical URL,
 * Open Graph tags and Article structured data without running any JavaScript.
 */
const {
  SLUG_RE, siteUrl, getPostBySlug, getLatestPosts, loadTemplate, renderPostPage, htmlResponse,
} = require('../lib/shared');

async function notFound(event) {
  let page = '<!doctype html><meta charset="utf-8"><title>Page not found</title><h1>Page not found</h1><p><a href="/">Back to home</a></p>';
  try { page = await loadTemplate('404.html', event); } catch (e) { /* use minimal page */ }
  return htmlResponse(404, page, false);
}

exports.handler = async (event) => {
  try {
    let rawSlug = (event.queryStringParameters || {}).slug || '';
    if (!rawSlug) {
      const m = (event.path || '').match(/\/blog\/([^/?#]+)/);
      rawSlug = m ? decodeURIComponent(m[1]) : '';
    }

    const slug = rawSlug.toLowerCase();
    if (!SLUG_RE.test(slug)) return await notFound(event);

    // One canonical URL per post: redirect /blog/My-Post to /blog/my-post
    if (slug !== rawSlug) {
      return { statusCode: 301, headers: { Location: `/blog/${slug}` }, body: '' };
    }

    const post = await getPostBySlug(slug);
    if (!post) return await notFound(event);

    const [related, template] = await Promise.all([
      getLatestPosts(3, post.id).catch(() => []),
      loadTemplate('blog.html', event),
    ]);

    return htmlResponse(200, renderPostPage(template, post, related, siteUrl(event)), true);
  } catch (err) {
    console.error('post function error:', err);
    return htmlResponse(
      502,
      '<!doctype html><meta charset="utf-8"><title>Temporarily unavailable</title><h1>Temporarily unavailable</h1><p>Please try again in a minute. <a href="/">Back to home</a></p>',
      false,
    );
  }
};
