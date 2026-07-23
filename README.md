# NTFL Public Build

This ZIP is set up for a GitHub Pages-style public site.

## Public update workflow
1. Open the Admin page on the site.
2. Edit scores, team notes, coaches, awards, history, hall of fame, and rankings.
3. Download `site-data.json` from Admin.
4. Replace `data/site-data.json` in your GitHub repo with the downloaded file.
5. Commit the change.

When GitHub Pages refreshes, everyone sees the update on the public site.

## Important
This build is a static site package. If you want edits to appear instantly to everyone without replacing a file in GitHub, you need a backend database or API.
