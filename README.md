# Paris Trip Journal

A living version of the Paris guide: the original 20 pins, plus a live map,
photo journal entries, and a way to add new places while out and about.

## One-time setup

### 1. Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor → New query**, paste the contents of `supabase-setup.sql`,
   and run it. This creates:
   - `paris_pins` — places added during the trip
   - `paris_comments` — journal entries / photos attached to any pin
   - a public `paris-photos` storage bucket
   - Row Level Security policies allowing read + insert with the anon key
   - realtime enabled on both tables
3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon / public** key (not `service_role`)
4. Paste both into `config.js`:
   ```js
   const SUPABASE_URL = "https://xxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJ...";
   ```
   The anon key is safe to commit — RLS policies (not the key) control access.

### 2. Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Paris trip journal"
gh repo create <repo-name> --public --source=. --push
gh repo edit <repo-name> --enable-pages... # or via Settings → Pages → Deploy from branch
```

The page will be at `https://<username>.github.io/<repo-name>/`.

## Using it on your phones

- First visit: pick **Francesca** or **Dad** (or type a name) — this is
  remembered per device and used as the author on journal entries.
- Tap **Journal & photos** under any pin to read or add notes/photos.
- Photos are resized in the browser before upload to keep things fast on
  mobile data.
- **Add a place**: paste a Google Maps link, or just type a place/landmark
  name (it's geocoded against central Paris). New pins show up on the map
  for everyone (live, via Supabase realtime) and get their own card under
  "Found along the way" at the bottom of the page.

## Known limitations

- **Short Google Maps links** (`maps.app.goo.gl/...`) can't be read directly
  from the browser — paste the full link (Share → Copy Link from desktop
  Google Maps usually includes `@lat,lng`), or just type the place name.
- Entries are append-only (no edit/delete) by design — keeps the journal
  simple and avoids needing accounts.
- The repo is **public** with an unguessable name (security through
  obscurity) since GitHub Pages on a free plan can't be private. Don't link
  to it from anywhere public.

## Later: enriching new pins

Each entry in `paris_pins` has `name`, `lat`, `lng`, `notes`, `source_url`,
and `added_by`/`created_at`. After the trip, pull this table (Supabase
Table Editor → export, or SQL `select * from paris_pins`) and feed it back
to Claude to write up the same kind of history/easter-egg entries as the
original 20 pins.
