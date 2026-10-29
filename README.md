# Dream Properties Hub

A simple real estate blog. You log in, write a blog, upload an image and click **Publish**. No code, no categories, no database editing.

- **Frontend:** plain HTML, CSS and JavaScript (no frameworks)
- **Backend:** [Supabase](https://supabase.com) (login, database, image storage). The free plan is enough to start.
- **Hosting:** [Netlify](https://netlify.com). The free plan is enough to start.

---

## How it works (in short)

| Piece | What it does |
|---|---|
| `index.html` | Homepage with the latest blogs, search and Load More |
| `/blog/your-post-title` | One page per blog. Built **on the server** by `netlify/functions/post.js`, so Google receives the full article, title, description, canonical link, Open Graph tags and Article structured data without running JavaScript |
| `admin.html` | Login, blog list, editor |
| `/sitemap.xml` | Built automatically by `netlify/functions/sitemap.js` from your published blogs. Always up to date |
| `robots.txt` | Created during the build, points to the sitemap |
| Supabase | Stores blogs and images. Database rules let visitors read **published** blogs only; only the logged-in admin can write |

Nothing is "pretend published". When you click Publish, the blog is saved in the Supabase database and is immediately live.

---

## Setup (about 20 minutes, once)

### Step 1. Create a Supabase project
1. Go to <https://supabase.com> and sign up, then click **New project**.
2. Choose a name, set a database password (save it somewhere safe) and pick the region closest to your readers.
3. Wait until the project finishes starting.

### Step 2. Create the database and image storage
1. In Supabase open **SQL Editor** and click **New query**.
2. Open `supabase/schema.sql` from this project, copy everything, paste it in and click **Run**.
3. You should see "Success". This creates the blog table, the security rules, the `blog-images` storage bucket and one **sample blog**.

### Step 3. Create your admin login
1. In Supabase go to **Authentication → Users → Add user → Create new user**.
2. Enter your email and a strong password. Tick **Auto Confirm User**.
3. **Important:** go to **Authentication → Sign In / Providers** (older dashboards: *Settings*) and turn **OFF** "Allow new users to sign up". This makes sure nobody else can create an account. Only the user you just created can log in.

### Step 4. Copy your two public connection values
In Supabase go to **Project Settings → API** and copy:
- **Project URL** (looks like `https://abcdxyz.supabase.co`)
- **anon / public key** (also shown as the *publishable* key)

> **Never use the `service_role` or "secret" key anywhere in this project.** The build stops with an error if it detects one. The anon key is designed to be public; the database security rules (Row Level Security) protect your data.

### Step 5. Deploy to Netlify
1. Put this folder on GitHub (create a new repository and upload the files). Netlify's **Add new site → Import an existing project** can then connect to it.
   *(Alternative without GitHub: install the Netlify CLI and run `netlify deploy --build --prod` in this folder.)*
2. Netlify reads `netlify.toml`, so build settings are already correct. Do not change them.
3. Before the first deploy open **Site configuration → Environment variables** and add:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_ANON_KEY` | your anon/public key |
   | `SITE_URL` | your final address, e.g. `https://www.yourdomain.com` (leave out the trailing slash). Optional at first: Netlify's own address is used if you skip it, but **set it once your custom domain is connected** so canonical links and the sitemap use your domain |

4. Deploy. When it finishes, open your site.

> Netlify Drop (dragging a folder) does **not** work for this project because the server functions and the build step are required.

### Step 6. Connect your domain (optional)
In Netlify: **Domain management → Add a domain**. After it works, update `SITE_URL` to the new address and trigger **Deploys → Trigger deploy → Deploy site**.

### Step 7. Submit your sitemap to Google
In [Google Search Console](https://search.google.com/search-console) add your site, then under **Sitemaps** submit `sitemap.xml`. You only do this once; the sitemap updates itself.

---

## Writing a blog (every day)

1. Open `https://yourdomain.com/admin.html` and log in.
2. Click **+ Write New Blog**.
3. Type the **title**. The web address is created for you.
4. Click **Upload Image** for the featured image. Large photos are resized automatically.
5. Type or paste the content (from ChatGPT or Word). Use the toolbar for headings, bold, lists, links and images.
6. Click **Publish**.

Your blog is live straight away, shown first on the homepage, with its own link. A green message gives you a **View blog** link.

Other things you can do:
- **Save Draft**: keeps the blog hidden from visitors. Find it later in the list marked *Draft*.
- **Edit**: updates the same blog (no duplicates). The web address and original publish date stay the same.
- **Move to Draft**: hides a published blog.
- **Delete**: asks for confirmation first.
- **SEO Settings** (optional, collapsed): SEO title, meta description and image alt text. Leave them empty and sensible automatic values are used.

Edits to a published blog can take up to a minute to show for visitors (pages are cached for 60 seconds for speed).

### Delete the sample blog
Log in, find **Welcome to Dream Properties Hub (Sample Post)** and click **Delete**.

---

## SEO: what is built in
- Clean, automatic slugs, for example `/blog/5-things-to-check-before-buying-a-flat`
- One canonical URL per post (uppercase variants redirect to the lowercase address)
- Unique title, description, canonical, Open Graph and Twitter tags, generated on the server
- `Article` structured data (JSON-LD) on every post
- Semantic HTML with a single H1 per page (any H1 pasted into a blog is turned into an H2)
- Lazy-loaded images, automatic WebP resizing on upload
- `sitemap.xml` generated live and listed in `robots.txt`. Drafts are never included
- The admin page is blocked in `robots.txt` and marked `noindex`

---

## Security notes
- No password or secret key is stored in the code. Login is handled by Supabase Auth.
- Visitors can read **only published** blogs (`status = 'published'`), enforced by the database.
- Only the logged-in admin can create, edit, publish or delete blogs and upload images.
- Blog HTML is cleaned (scripts and unsafe attributes removed) before it is shown to visitors.
- Keep signups **disabled** (Step 3) and use a strong, unique admin password.
- Forgot your password? In Supabase go to **Authentication → Users**, open your user and choose **Send password recovery**, or delete the user and create it again.

---

## Contact form
The Contact page uses **Netlify Forms**. After the first deploy, messages appear in Netlify under **Forms**. In **Forms → Form notifications** you can have them emailed to you.

## Change the text on About and Contact
Open `about.html` in any text editor, change the paragraphs, and commit the change to GitHub. This is the only content that lives in a file. Blogs never need code edits.

## Change colours or the logo
Colours are at the top of `assets/css/style.css` (the `:root` block). The text logo is in `partials/header.html` and `partials/footer.html`. The header and footer are shared by every page.

## Project layout
```
index.html  blog.html  admin.html  about.html  contact.html  404.html
partials/        shared header and footer
assets/css/      style.css
assets/js/       common.js  main.js  blog.js  admin.js  (config.js is created during the build)
netlify/functions/   post.js (server-rendered blogs)  sitemap.js
netlify/lib/     shared.js
supabase/        schema.sql
build.js  netlify.toml  package.json
```

## Run it on your own computer (optional)
```
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
npx netlify-cli dev --dir dist     # after running: node build.js
```
`netlify dev` runs the server functions locally so `/blog/...` pages and the sitemap work.

## Troubleshooting
| Problem | Fix |
|---|---|
| Build fails with "missing environment variables" | Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Netlify (Step 5), then redeploy |
| Login says "Invalid login credentials" | Check the email/password in Supabase → Authentication → Users, and that the user is confirmed |
| "Could not save … row-level security" | You are not logged in, or `schema.sql` did not run completely. Run it again (it is safe to re-run) |
| Image upload fails | Confirm the `blog-images` bucket exists (Supabase → Storage) and `schema.sql` ran successfully. Images must be under 5 MB |
| Homepage says "blogs could not be loaded" | Check that `SUPABASE_URL` and the key are correct and redeploy |
| Blog link shows "Temporarily unavailable" | Usually a wrong environment variable. Check Netlify → Logs → Functions |
| A new blog does not appear | Make sure its status says *Published*, not *Draft* |

## Limits to be aware of
- Supabase's free plan pauses projects that receive no activity for a week; visiting the admin page or the site once wakes it. Paid plans do not pause.
- Deleting a blog does not delete its uploaded images from storage (they use very little space). You can remove them in Supabase → Storage.
