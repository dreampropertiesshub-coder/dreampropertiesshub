#!/usr/bin/env node
'use strict';
/**
 * Build script (runs automatically on Netlify, no dependencies).
 *  1. Copies the site into ./dist (so SQL, README and functions are never published)
 *  2. Inserts the shared header/footer into every page
 *  3. Writes assets/js/config.js from environment variables
 *  4. Writes robots.txt with the correct sitemap address
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const SITE_URL = (process.env.SITE_URL || process.env.URL || 'http://localhost:8888').trim().replace(/\/+$/, '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('\nBUILD STOPPED: missing environment variables.');
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (Netlify: Site configuration -> Environment variables).');
  console.error('See README.md, step 5.\n');
  process.exit(1);
}
if (/service_role/i.test(SUPABASE_ANON_KEY) || /^sb_secret_/.test(SUPABASE_ANON_KEY)) {
  console.error('\nBUILD STOPPED: SUPABASE_ANON_KEY looks like a SECRET key. Use the public "anon" / "publishable" key only.\n');
  process.exit(1);
}
try {
  const payload = JSON.parse(Buffer.from(SUPABASE_ANON_KEY.split('.')[1] || '', 'base64').toString('utf8'));
  if (payload && payload.role === 'service_role') {
    console.error('\nBUILD STOPPED: that key has the service_role role. Use the public "anon" key instead.\n');
    process.exit(1);
  }
} catch (e) { /* not a JWT (new-style publishable key) - fine */ }

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// 1. Copy public files
const pages = ['index.html', 'blog.html', 'admin.html', 'about.html', 'contact.html', '404.html'];
for (const page of pages) fs.copyFileSync(path.join(root, page), path.join(dist, page));
fs.cpSync(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'favicon.svg'), path.join(dist, 'favicon.svg'));

// 2. Partials + placeholders
const header = fs.readFileSync(path.join(root, 'partials', 'header.html'), 'utf8');
const footer = fs.readFileSync(path.join(root, 'partials', 'footer.html'), 'utf8');
for (const page of pages) {
  const file = path.join(dist, page);
  const html = fs.readFileSync(file, 'utf8')
    .replace('<!--include:header-->', () => header)
    .replace('<!--include:footer-->', () => footer)
    .split('%SITE_URL%').join(SITE_URL);
  fs.writeFileSync(file, html);
}

// 3. Public configuration (the anon key is designed to be public; Row Level Security protects data)
const config = `window.DPH_CONFIG = ${JSON.stringify({ SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL }, null, 2)};\n`;
fs.writeFileSync(path.join(dist, 'assets', 'js', 'config.js'), config);

// 4. robots.txt
fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /admin

Sitemap: ${SITE_URL}/sitemap.xml
`);

console.log(`Build complete -> dist/  (site URL: ${SITE_URL})`);
