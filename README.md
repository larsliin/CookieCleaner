# Cookie Cleaner

A local-only Chrome Manifest V3 extension built with Vue 3 and TypeScript.
Uses the shared Chrome Extension Component Library's controls, icons, and color
tokens. Light/dark mode follows system preferences live, using the same pattern
as the workspace's ColorPicker project.

## Features

- A prominent **Clean all websites** hero action prepares an all-time cleanup
  independently of the custom filters below it.
- Choose the current site, one of your last 10 distinct sites, or all websites.
- Use the compact **Review cleanup** action for the selected website/time range.
- Remove cookies and local storage for all time, the last hour, 24 hours, or 7 days.
- Clear session storage in matching loaded HTTP(S) frames.
- Review the scope and confirm before deleting anything. No automatic reloads.
- Cleanup runs in the background. Reopen the popup to see its saved result,
  including partial failures and limitations.

Clearing data is irreversible and can sign you out, remove preferences, and
discard unsaved state.

## Important scope and browser limits

**Sites:** A site is its registrable domain, including subdomains. Public suffix
rules are used, including private suffixes, so `shop.example.co.uk` belongs to
`example.co.uk`, while separate `github.io` tenants are not grouped together.
Localhost and IP addresses are supported.

**Cookies:** Chrome's browsing-data API clears the selected site's cookies for
the whole registrable domain, including subdomains, or all websites when chosen.
Time ranges use Chrome's cookie modification-time filter.

**Local storage:** Chrome can target specific origins, not wildcard subdomains.
Site cleanup includes HTTP and HTTPS base-site origins, origins recorded for that
site in the recent list, and matching currently loaded frame origins (including
their ports). Unobserved subdomains and ports can retain local storage. This is
always reported as limited, not a complete site-wide wipe.

**Time ranges:** Individual local/session-storage entries have no accessible
creation timestamps. Chrome selects local-storage origin stores for the requested
range and deletes them as a whole; this is not per-entry age filtering.
Session storage in matching loaded frames is always cleared in full, regardless
of age. These limitations are shown before confirmation.

**Session storage:** There is no Chrome browsing-data API for clearing every tab's
session storage. The extension injects a clear operation into matching loaded
HTTP(S) frames across open website tabs, including matching embedded frames.
Discarded/unloaded pages, closed-tab restore data, opaque/non-HTTP(S) frames,
and inaccessible pages cannot be guaranteed cleared. Navigation or injection
errors are reported explicitly. Sites left open may immediately recreate data.

All-websites cookie/local cleanup includes installed web apps, but excludes other
extensions. Browsing history, passwords, cache, IndexedDB, and service workers
are not removed. Only the regular browser profile is affected; incognito use is
disabled to avoid implying that Chrome's profile-wide API clears incognito data.

### Product ads and retargeting

Advertising networks often store their own third-party cookies or use logged-in,
server-side profiles. Clearing the shop's data cannot reliably identify or erase
those networks' data. All-websites cleanup is broader, but cannot guarantee the
ads stop. This extension is not an ad blocker or a server-side data-erasure tool.

### Recent sites and privacy

Top-level HTTP(S) visits are tracked from installation onward, deduplicated by
site, and limited to the last 10 sites. The list stores only site domains,
visited origins, and last-visit times in `chrome.storage.local`, never URL paths
or cookie/storage values. Revisited sites move to the front. Origins are retained
while their site remains in the list. Existing browsing history is not read.
Cleanup does not erase the recent-site list.

Job scopes and results are stored in `chrome.storage.session`, surviving popup
closure but not browser restart. Interrupted workers produce an explicit warning
instead of claiming success. No data is sent to external services.

## Development

Use a Node.js release supported by Vite (Node 22.18+ also supports the TypeScript
test runner used here).

```powershell
npm ci
npm run dev
npm test
npm run build
npm run build:extension
```

The development server shows the real interface but explicitly disables cleanup
outside an installed extension. There are no fake successful cleanup responses.

Load `dist-extension` from `chrome://extensions` using **Developer mode > Load
unpacked**. Reload the extension after rebuilding. Chrome 119 or later is required.

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite UI development |
| `npm test` | Focused site-scope, time-range, recent-site, and failure tests |
| `npm run build` | Vue/TypeScript checks and web build in `dist` |
| `npm run build:icons` | Generate extension PNG icons |
| `npm run build:extension` | Type-check and build popup, icons, manifest, and background worker |
| `npm run test:browser` | Test the built extension in a disposable browser profile |
| `npm run preview` | Preview the production web build |

The browser test uses `playwright-core` with an installed extension-capable browser
(defaults to Edge on Windows). Set `CHROME_PATH` to an alternative executable,
such as Chrome for Testing, if necessary. Branded Chrome releases may disable
command-line extension loading. The test serves local fixtures and never uses your
normal browser profile. It opens the actual toolbar popup to verify its 420px
width without horizontal overflow; a normal extension tab does not reproduce
Chrome's popup autosizing. It also verifies site isolation, cookies, subdomains, embedded
frames, local/session storage, cancellation, all four time-range selections,
saved results, live themes, and the last-ten-sites list. Historical age thresholds
are unit-tested; fixture data is freshly created.

## Permissions

| Permission | Reason |
|------------|--------|
| `browsingData` | Remove cookies/local storage with Chrome's origin/time filters |
| `scripting` | Clear session storage in loaded website frames |
| `tabs` | Discover open website tabs for cleanup and identify the current site |
| `webNavigation` | Track recent top-level sites and enumerate loaded frames |
| `storage` | Persist recent sites and background job results locally |
| HTTP(S) host access | Required to clear session storage on selected or all websites |

No `history`, `downloads`, clipboard, debugger, or network-request permissions are
requested. Broad HTTP(S) access is necessary for the explicitly supported
all-websites session cleanup.

## Structure

- `src/cleaner/`: typed scope rules and browser cleanup engine
- `src/background.ts`: recent-site tracking and persisted background jobs
- `src/composables/`: popup state and system-theme integration
- `src/components/cleaner/`: shared-library scope, review, and results UI
- `public/manifest.json`: Manifest V3 definition
- `tests/`: focused cleanup regression tests
- `scripts/test-browser.mjs`: isolated packaged-extension browser verification

Other projects in this workspace are read-only references. No shared-library
changes or additional generic UI components are needed for this implementation.
