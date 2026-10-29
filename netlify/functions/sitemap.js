'use strict';
/**
 * GET /sitemap.xml  ->  always up to date. Lists the static pages and every
 * published blog post. Draft posts are never included.
 */
const { siteUrl, getAllPublishedForSitemap, esc } = require('../lib/shared');

function dateOnly(iso) {
  return iso ? String(iso).slice(0, 10) : '';
}

exports.handler = async (event) => {
  try {
    const site = siteUrl(event);
    const posts = await getAllPublishedForSitemap();

    const newest = posts.reduce((max, p) => {
      const d = dateOnly(p.updated_at || p.published_at);
      return d > max ? d : max;
    }, '');

    const urls = [
      { loc: `${site}/`, lastmod: newest, changefreq: 'daily', priority: '1.0' },
      { loc: `${site}/about`, changefreq: 'yearly', priority: '0.4' },
      { loc: `${site}/contact`, changefreq: 'yearly', priority: '0.4' },
      ...posts.map((p) => ({
        loc: `${site}/blog/${p.slug}`,
        lastmod: dateOnly(p.updated_at || p.published_at),
        changefreq: 'monthly',
        priority: '0.8',
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
      body: xml,
    };
  } catch (err) {
    console.error('sitemap function error:', err);
    return { statusCode: 502, headers: { 'Content-Type': 'text/plain' }, body: 'Sitemap temporarily unavailable' };
  }
};
