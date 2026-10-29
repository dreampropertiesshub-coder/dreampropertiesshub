-- ============================================================
-- Dream Properties Hub - Supabase setup
-- Run this ONCE in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- It is safe to run again; it will not duplicate anything.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Blog posts table
-- ------------------------------------------------------------
create table if not exists public.posts (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  slug               text not null unique,
  excerpt            text,
  content            text not null default '',
  featured_image     text,
  featured_image_alt text,
  status             text not null default 'draft'
                       check (status in ('draft', 'published')),
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  seo_title          text,
  meta_description   text,
  constraint posts_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index if not exists posts_status_published_idx
  on public.posts (status, published_at desc);

-- ------------------------------------------------------------
-- 2. Automatic timestamps
--    - updated_at changes on every save
--    - published_at is set the first time a post becomes published
--      and is kept afterwards (so editing never changes the date)
-- ------------------------------------------------------------
create or replace function public.posts_set_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_timestamps on public.posts;
create trigger posts_timestamps
  before insert or update on public.posts
  for each row execute function public.posts_set_timestamps();

-- ------------------------------------------------------------
-- 3. Row Level Security
--    Visitors (anon)  -> can only READ published posts
--    Admin (logged in) -> can read/create/edit/delete everything
-- ------------------------------------------------------------
alter table public.posts enable row level security;

drop policy if exists "Public can read published posts" on public.posts;
create policy "Public can read published posts"
  on public.posts for select
  to anon
  using (status = 'published');

drop policy if exists "Admin full access" on public.posts;
create policy "Admin full access"
  on public.posts for all
  to authenticated
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- 4. Image storage bucket
--    Public can VIEW images (needed for the website).
--    Only logged-in admin can upload / replace / delete.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-images',
  'blog-images',
  true,
  5242880, -- 5 MB per image
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "Admin can upload blog images" on storage.objects;
create policy "Admin can upload blog images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'blog-images');

drop policy if exists "Admin can update blog images" on storage.objects;
create policy "Admin can update blog images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'blog-images')
  with check (bucket_id = 'blog-images');

drop policy if exists "Admin can delete blog images" on storage.objects;
create policy "Admin can delete blog images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'blog-images');

-- ------------------------------------------------------------
-- 5. Sample post (delete it from the admin dashboard any time)
-- ------------------------------------------------------------
insert into public.posts (title, slug, excerpt, content, status, published_at, seo_title, meta_description)
values (
  'Welcome to Dream Properties Hub (Sample Post)',
  'welcome-to-dream-properties-hub',
  'This is a sample blog post created during setup so you can see how published articles look. Delete it from the admin dashboard whenever you like.',
  $content$<p>This is a <strong>sample post</strong> created during setup so you can check that everything works. You can delete it from the admin dashboard at any time.</p>
<h2>What to check before buying a property</h2>
<p>Whether you are buying your first home or adding to an investment portfolio, a short checklist keeps the decision grounded. These are the basics most buyers review before signing anything.</p>
<h3>1. Title and documents</h3>
<p>Confirm that the seller has a clear, marketable title and that every approval and document is in order. Ask a qualified property lawyer to verify them.</p>
<h3>2. Location and connectivity</h3>
<p>Visit the area at different times of day. Look at commute times, nearby schools and hospitals, and planned infrastructure projects.</p>
<h3>3. Total cost of ownership</h3>
<ul>
<li>Registration and stamp duty</li>
<li>Maintenance and society charges</li>
<li>Property tax and insurance</li>
<li>Interest on any home loan</li>
</ul>
<h2>How publishing works on this site</h2>
<ol>
<li>Log in at <a href="/admin.html">/admin.html</a>.</li>
<li>Click <strong>Write New Blog</strong>.</li>
<li>Enter a title, upload an image and write or paste your content.</li>
<li>Click <strong>Publish</strong>.</li>
</ol>
<p>That is all. Your post appears on the homepage straight away and gets its own shareable link.</p>$content$,
  'published',
  now(),
  'Welcome to Dream Properties Hub (Sample Post)',
  'A sample post showing how articles look on Dream Properties Hub. Safe to delete from the admin dashboard.'
)
on conflict (slug) do nothing;
