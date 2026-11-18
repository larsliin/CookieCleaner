# Cookie Cleaner

A local-only Chrome Manifest V3 extension built with Vue 3 and TypeScript.
Uses the shared Chrome Extension Component Library's controls, icons, and color
tokens. Light/dark mode follows system preferences live, using the same pattern
as the workspace's ColorPicker project.

## Features

- **All websites**: a time-range selector and **Clear cookies & site data** hero action
  remove cookies and web storage across the browser, including third-party cookies.
- **Individual websites**: a compact **Clean this site** action and Recent sites
  always remove all-time cookies, local storage, and reachable session storage.
- A **Recent sites** list of your last 10 distinct sites, each with its own
  open-in-new-tab button, clean button and cookie count that updates as cookies change, including after
  cleanup. Counts include subdomains but exclude third-party cookies and web
  storage; zero cookies does not mean all site data is gone. Failed counts are
  shown as unavailable, never zero.
- **See all** opens a responsive Chrome extension tab with discoverable domains,
  cookie counts, last visits, 25 sites per page, Date/Name sorting, and
  multi-selection across pages.
- **Clean selected sites** performs all-time cleanup of the checked domains.
  **Clear all site data** clears all websites for all time, independently of
  selected rows. Both require confirmation.
- The time range (all time, last hour, 24 hours, or 7 days) applies only to
  **All websites**. It never limits individual-site cleanup.
- An optional, remembered **Also remove third-party cookies** switch for
  current, recent, and selected-site cleanups, synchronized between popup and tab.
  Every time you turn it on, a dismissible reminder explains in plain
  language that the website being cleaned must stay open to find other companies'
  cookies, and removing those cookies can affect other websites. The reminder
  appears beside the switch you used; reopening a view or synchronizing its
  setting does not trigger it.
- Clear session storage in matching loaded HTTP(S) frames.
- A centered confirmation dialog shows the scope before anything is deleted. No
  automatic reloads.
- Cleanup runs in the background. Results, including partial failures and
  limitations, appear when cleanup finishes with the popup open. Completed
  results are not shown when reopening the popup, even if cleanup finished
  while it was closed. Running jobs still show progress when reopening.
- 420px wide popup with a fixed height (480–600px) that follows its content.

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
their ports). Selected-site batches also include origins discovered in the
all-sites catalogue. Unobserved subdomains and ports can retain local storage. This is
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

### Third-party cookies

When **Also remove third-party cookies** is on, a single-site cleanup also:

- Finds third-party domains loaded by open tabs of that site. It reads every
  frame's URL and resource-timing entries, then reduces them to registrable
  domains.
- Removes those domains' cookies for all time. Unpartitioned
  cookies are shared across sites, so a tracker's cookies are removed for
  **every** website, not only the cleaned one.
- Also removes partitioned (CHIPS) cookies stored under the
  site. This works even when no tab is open. Chrome does not expose cookie
  creation times; individual-site cleanup always uses all time.

Trackers not loaded in an open tab cannot be identified. The switch state is
stored in `chrome.storage.local`. All-websites cleanup already includes all
third-party cookies.

### Recent sites and privacy

Top-level HTTP(S) visits are tracked from installation onward, deduplicated by
site, and limited to the last 10 sites. The list stores only site domains,
visited origins, and last-visit times in `chrome.storage.local`, never URL paths
or cookie/storage values. Revisited sites move to the front. Origins are retained
while their site remains in the list. Cleanup does not erase the recent-site list.

### All-sites tab

The **See all** tab combines Chrome's retained browsing history (including any
history Chrome exposes from sync), current cookie domains, open HTTP(S) tabs,
and the ten locally tracked sites. It groups subdomains using the same public
and private suffix rules as cleanup. History is queried across its retained
date range in chunks, not just Chrome's default 24 hours/100 results.

**No cookies** means no cookies were found for that domain, not that there is
no other storage. Cookie enumeration failures show **Count unavailable** and a
warning, never a misleading zero. Dates are actual last-visit times where
available; cookie-only/open-only domains show **Visit date unknown**. Date sorts
newest first with unknown dates last; Name sorts A-Z. API failures or saturated
history queries produce explicit incomplete-inventory warnings.

Chrome cannot list every domain with only local/session storage. Deleted or
expired history is unavailable, so this is not a complete historical storage
inventory. The tab reads history locally but does not delete it or save a second
history archive. URL paths, titles, and cookie values are not persisted by the
catalogue; only aggregated domain/origin metadata is held in tab memory.

Checkbox selections survive page changes and sorting. **Select page** affects
only that page, and the total selected count remains visible. Refresh updates
cookie counts and history metadata; vanished selected domains are pruned only
after a successful inventory refresh, with a notice. Cleaned history sites stay
listed with **No cookies**. Open sites may immediately recreate cookies.

Batch cleanup uses the same background job lock as popup actions, runs selected
domains sequentially, and reports per-site progress, failures, and limitations.
Closing the tab does not cancel it. A running job can be observed after reopening;
completed results are shown live rather than restored on a new view.
The third-party toggle is shared with the popup and applies to selected-site
cleanup only; global cleanup already includes all cookie domains.

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
The all-sites catalogue adds the **history** permission; Chrome may ask you to
approve the new permission or re-enable the updated extension.

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
width, 480–600px height, and no horizontal overflow; a normal extension tab does not reproduce
Chrome's popup autosizing. It also verifies the centered confirmation dialog
(Escape/Cancel), site isolation, cookies, subdomains, embedded frames,
local/session storage, third-party tracker cookies and the persisted switch,
all four time-range selections, live and dismissed results, hidden completed
results after reopening, running-job recovery, live themes, and
the last-ten-sites list with per-row cleanup. It also checks See all navigation,
55 history fixtures, cookie-free rows, both sorts, page-only/cross-page selection,
preference synchronization, selected-domain isolation for all three storage types,
concurrent-job rejection, responsive tab themes, and global cleanup without
history deletion. Historical age thresholds
are unit-tested; fixture data is freshly created.

## Permissions

| Permission | Reason |
|------------|--------|
| `browsingData` | Remove cookies/local storage with Chrome's origin/time filters |
| `cookies` | Count domain cookies and remove third-party cookies partitioned under the cleaned site |
| `history` | Read retained visits to populate domains and last-visit dates in the all-sites tab; never delete history |
| `scripting` | Clear session storage and discover third-party domains in loaded website frames |
| `tabs` | Discover open website tabs for cleanup and identify the current site |
| `webNavigation` | Track recent top-level sites and enumerate loaded frames |
| `storage` | Persist recent sites, the third-party switch, and background job results locally |
| HTTP(S) host access | Required to clear session storage on selected or all websites |

No `downloads`, clipboard, debugger, or network-request permissions are
requested. Broad HTTP(S) access is necessary for the explicitly supported
all-websites session cleanup.

## Structure

- `src/cleaner/`: typed scope rules and browser cleanup engine
- `src/cleaner/catalogue.ts`: history/cookie/tab inventory and deterministic sorting
- `src/cleaner/batch.ts`: selected-domain batch cleanup with incremental progress
- `src/background.ts`: recent-site tracking and persisted background jobs
- `src/composables/`: popup state, popup height sync, and system-theme integration
- `src/components/cleaner/`: hero actions, options, recent-sites list, confirmation dialog, and results UI
- `src/components/sites/`: responsive domain manager, toolbar, and selectable list
- `public/manifest.json`: Manifest V3 definition
- `tests/`: focused cleanup regression tests
- `scripts/test-browser.mjs`: isolated packaged-extension browser verification

Other projects in this workspace are read-only references. No shared-library
changes or additional generic UI components are needed for this implementation.
