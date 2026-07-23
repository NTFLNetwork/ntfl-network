
# NTFL Rebuild

Static NTFL league hub with:
- Team pages
- Schedule page
- Standings
- Rankings
- Awards
- History
- Admin dashboard with JSON editor

## How to use
1. Open `index.html` in a browser or upload the folder to GitHub Pages.
2. Use the Admin page to edit data.
3. Save locally for testing, then export JSON and replace `data/site-data.json` so other visitors see the update.

## Logo
The site will try to load `assets/IMG_5900.png` first, then fall back to `assets/logo.svg`.


## Admin login
- Credentials are set in the admin auth config and are not displayed on the public page.

## Editing flow
- Use the Admin page to change scores, statuses, teams, notes, awards, history, and more.
- Save to browser for testing, then export JSON and replace data/site-data.json to publish changes.
