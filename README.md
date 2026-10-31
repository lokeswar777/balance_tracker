# Money Tracker

The app stores a local copy of balance history in browser storage. To keep the
history in GitHub and sync it between devices, deploy this project to Vercel and
configure the API environment variables below. The GitHub access token stays in
Vercel; it is never sent to the browser.

## Configure GitHub sync

1. Push this project to a **private** GitHub repository with an initialized
   default branch. The configured repository must not be empty. Balance history
   is stored as readable JSON; it is not encrypted, so anyone with repository
   access can view it.
2. Create a GitHub fine-grained personal access token for that repository with
   **Contents: Read and write** permission.
3. Import the repository into Vercel and add these environment variables:

   | Variable | Value |
   | --- | --- |
   | `GITHUB_TOKEN` | The fine-grained token from step 2 |
   | `GITHUB_OWNER` | `lokeswar777` |
   | `GITHUB_REPO` | `balance_tracker` |
   | `GITHUB_BRANCH` | The repository's default branch (for example, `main`) |
   | `GITHUB_FILE_PATH` | `data/balance-history.json` |
   | `SYNC_PASSWORD` | A strong, unique password used by the app's sync control |

4. Redeploy after setting the variables. Open the deployed app, enter the sync
   password, and select **Sync GitHub**. On the first connection, local history
   is uploaded only if the GitHub history file is empty. If GitHub already has
   entries, GitHub is treated as the source of truth and replaces this browser's
   local copy.

After connecting, changes are saved to GitHub automatically while that browser
session remains connected. The password is kept in session storage for that
session. Open the app and connect again on another device or browser.

The API writes the data file as a GitHub commit. The sync password protects the
API but does not encrypt the file; use a long random value and keep the GitHub
token only in Vercel's encrypted environment variables.
