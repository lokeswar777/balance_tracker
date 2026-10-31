# Money Tracker

Balance history is kept in browser storage and can be synced across browsers
through the Vercel API to a Supabase database. The Supabase service-role key
stays in Vercel and is never sent to the browser.

## Set up Supabase sync

1. Create a Supabase project.
2. In the Supabase SQL Editor, run the SQL in [`supabase.sql`](./supabase.sql).
   It creates a single private row for the tracker and restricts direct access
   to the `service_role`.
3. In the project settings, copy the project URL and service-role key.
4. Deploy this project to Vercel and set these environment variables:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | The project's service-role key |
   | `SYNC_PASSWORD` | A strong, unique password for the app's sync control |

5. Redeploy after setting the variables. Open the deployed app, enter the sync
   password, and select **Sync Supabase**. If the cloud history is empty, the
   current browser's history is uploaded. If Supabase already has entries, the
   cloud history replaces this browser's local copy.

After connecting, changes are saved to Supabase automatically while that
browser session remains connected. The sync password is kept in session storage
for that session; connect again on each new device or browser session.

Keep the Supabase project URL public as configured, but never put the
service-role key in the webpage or commit it to the repository. The sync
password protects the API; use a long random value. History is private in
Supabase and is not encrypted by this app.

The app must be opened from its deployed Vercel URL for cloud sync. Opening the
HTML files directly from disk does not provide the `/api/history` endpoint.
