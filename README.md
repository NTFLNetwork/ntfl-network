# NTFL Public Rebuild

This site is built to be a clean public league hub with:
- team pages
- standings
- rankings
- awards
- history
- Hall of Fame
- admin editing
- public publishing support

## Public publish workflow

The site can publish to a shared Supabase table so everyone sees updates on refresh.

### Table setup
Create a table like this:

- `site_state`
- columns:
  - `id` text primary key
  - `payload` jsonb not null
  - `updated_at` timestamptz default now()

Insert one row with:
- `id = ntfl`

### In the Admin panel
Open **Admin** and fill in:
- Backend URL
- Anon key
- Table name
- Row ID

Then:
1. Edit the site
2. Click **Publish Public**

That saves the current data into the shared row, and the public site reads from that same row.

### Fallback
If the backend is not connected yet, use:
- **Download site-data.json**
- upload it to `data/site-data.json`
- commit the change in GitHub

## Notes
- Team badges use uppercase abbreviations.
- Team colors are built into the site data.
- The page is mobile-friendly and designed for public sharing.
