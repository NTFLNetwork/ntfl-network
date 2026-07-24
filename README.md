# NTFL Network — Supabase Edition

This starter uses Supabase as the main database for:
- Teams
- Coaches
- Schedule
- Standings
- Rankings
- News
- Awards
- History
- Rules
- Commissioner dashboard

## Files
- `sql/schema.sql` — database schema + RLS
- `sql/seed.sql` — seed data from the uploaded NTFL workbooks
- `data/teams.seed.json` — extracted teams/coaches
- `data/schedule.seed.json` — flattened season schedule
- `index.html` etc. — frontend pages
- `js/app.js` — all page rendering + Supabase CRUD

## Setup
1. Paste `sql/schema.sql` into the Supabase SQL editor.
2. Run `sql/seed.sql` to load the team list and schedule.
3. Create a Supabase auth user for the commissioner.
4. Add that user to `public.profiles` with role `commissioner` or `moderator`.
5. Deploy the folder as a static site.

## Notes
- The frontend is already pointed at:
  - `https://zggrwyxtakqpqyrxskiq.supabase.co`
  - the provided publishable key
- Team logos are editable as URLs. Upload them to Supabase Storage and paste the public URL.
- Rankings, awards, history, rules, and news are editable from the admin page.
