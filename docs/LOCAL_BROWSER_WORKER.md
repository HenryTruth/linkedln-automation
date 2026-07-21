# Local Browser Worker

Use this mode for LinkedIn search pagination when cookie export/import is too
fragile. It keeps a real Chromium profile on the machine running the worker, so
LinkedIn sees the same browser profile across login, checkpoint resolution,
search qualification, and scraping.

## Why

Hosted Playwright with transplanted cookies can load some LinkedIn pages while
still being treated as logged out or challenged on people search. A persistent
profile preserves browser storage and device state instead of replaying only a
cookie jar.

## Login And Qualify

Build the browser package first:

```sh
pnpm --filter @linkedin-automation/browser build
```

Open the persistent profile for an account:

```sh
HEADLESS=false \
LINKEDIN_PERSISTENT_PROFILE=true \
LINKEDIN_BROWSER_PROFILE_ROOT="$HOME/.linkedin-automation/profiles" \
pnpm exec tsx scripts/local-linkedin-profile.ts <accountId> \
  "https://www.linkedin.com/search/results/people/?keywords=Psychiatry&origin=SWITCH_SEARCH_VERTICAL"
```

If LinkedIn asks for login or a checkpoint, resolve it in the opened browser,
then press Enter in the terminal. The script verifies:

- browser exit IP
- feed auth state
- exact search URL auth state
- visible profile links
- visible Next control

## Two-Page Test

After the search qualifies, run a small scrape from the same profile:

```sh
HEADLESS=false \
LINKEDIN_PERSISTENT_PROFILE=true \
LINKEDIN_BROWSER_PROFILE_ROOT="$HOME/.linkedin-automation/profiles" \
pnpm exec tsx scripts/local-linkedin-profile.ts <accountId> \
  "https://www.linkedin.com/search/results/people/?keywords=Psychiatry&origin=SWITCH_SEARCH_VERTICAL" \
  --scrape --leadLimit=20
```

By default, persistent profile mode does not inject the stored DB cookie jar.
To seed a brand-new profile with stored cookies once, add:

```sh
LINKEDIN_SEED_PROFILE_COOKIES=true
```

Remove that variable after seeding so stale cookies cannot overwrite a healthy
profile session on future launches.
