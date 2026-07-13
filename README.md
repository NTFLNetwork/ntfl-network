# NTFL Network — Milestone 5

Milestone 5 adds launch-ready season archiving and backup tools on top of the authenticated admin workflow.

## What this build adds
- Season Archive pages (`/archive` and `/archive/[season]`)
- Archive records editable from the admin dashboard
- Downloadable JSON backup from the authenticated admin panel
- Public page filters for teams, schedule, and game center
- Archive spotlight on the homepage
- Existing secure admin login, edits, and Supabase Storage uploads

## Setup
1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file with:
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ADMIN_CODE=your_secret_admin_code
ADMIN_SESSION_SECRET=your_long_random_secret
```

3. Run the schema in Supabase:
```sql
-- Use the SQL file in supabase/schema.sql
```

4. In Supabase Storage, make sure the `ntfl-assets` bucket exists and is public.

5. Start the site:
```bash
npm run dev
```

## Notes
- Log in on `/admin` with `ADMIN_CODE`.
- Use the Archive section to add past seasons, champions, and season summaries.
- Use the Download backup button to export the full snapshot as JSON.
- Team logo and banner uploads are saved to Supabase Storage.
