# Cookie Cleaner Chrome Extension

A lightweight Chrome extension that removes cookies, local storage, and reachable session storage for a selected site or all websites.

## Purpose and scope

The implemented scope is:
1. Select the current site, one of the last 10 distinct sites tracked locally since installation, or all websites.
2. Group sites by registrable domain (including private suffixes), including subdomains for cookie cleanup.
3. Offer all time, last hour, 24 hours, and 7 days using Chrome's browsing-data time filter.
4. Clear local storage only at known origins for site-specific cleanup; clearly report unknown-subdomain limitations.
5. Clear whole session stores in matching loaded HTTP(S) frames, without pretending to age-filter entries or reach unloaded/closed-tab state.
6. Require review and confirmation, report individual errors/limitations, and never automatically reload tabs.
7. See all opens a paginated domain-management tab combining retained browsing history, cookies, open tabs, and recent records. History access is approved for listing only, never deletion.
8. Selected-site batches always use all time and the shared third-party preference; the tab's global action clears all websites for all time independently of selection.

See README.md for the exact browser limitations and permission rationale. Clarify changes to destructive behavior before implementing them.

Keep the interface simple and focused. Do not add config editing, downloads, clipboard features, browsing-history deletion, cache clearing, IndexedDB cleanup, scheduling, or web services unless explicitly requested.

## Stack and implementation

- **Frontend**: Vue 3 with Composition API and `<script setup lang="ts">`
- **Language**: TypeScript for application and browser integration code
- **Build tool**: Vite
- **Current structure**: `src/App.vue`, `src/main.ts`, `src/components/`, `src/style.css`, and `public/`
- The repository contains a working Manifest V3 popup and background worker. Keep background jobs independent of popup lifetime.
- Target Chrome Manifest V3 when adding a manifest. Add a popup, service worker, or content script only as required by the agreed behavior.
- Keep Vue component files under 500 lines; split into smaller focused components if needed
- Use the existing Vite setup and npm scripts; add dependencies only when necessary

## Shared components

- Always use suitable shared UI components from the [Chrome Extension Component Library](https://github.com/larsliin/ChromeExtensionComponentLibrary/blob/main/docs/components/index.md) whenever possible instead of creating duplicate UI components. Check the library documentation before implementing UI components.
- If no suitable shared component exists and a reusable component would make sense, suggest creating it in the shared library and ask the user for approval before implementing a local alternative or changing the library.
- The library is installed. Import its stylesheet once and use its semantic color tokens in both themes.

## Workspace references and boundaries

- You may use the AppConfig and ColorPicker projects in this workspace as read-only references for implementation patterns and UI conventions.
- Never create, modify, move, or delete files in other projects without explicit user permission. Permission to use a project as a reference is not permission to change it.

## Cleaning scope and safety

- Resolve the active tab's URL and validate that it is a supported target before cleaning.
- Keep cleanup limited to the confirmed site/all-sites scope. Site cookies include subdomains; local storage uses known origins; session cleanup reaches matching frames across open HTTP(S) tabs. Do not silently broaden beyond those rules.
- Cookies are domain/path scoped, local storage is origin scoped, and session storage is also tied to a tab's browsing context. Do not treat these as interchangeable scopes; clarify the intended mapping before implementing it.
- Clearing extension `chrome.storage.local` does not clear a website's local storage.
- Handle restricted pages, unavailable permissions, and API errors explicitly.
- Report partial completion accurately if one storage type cannot be cleared.
- Keep cookies and site storage local. Do not log sensitive values or transmit them to external services.
- Catalogue history/cookie metadata stays in tab memory, not a second persistent history archive. No cookies means no enumerated cookies, not no site storage; show unavailable counts and partial-inventory warnings explicitly.

## Popup UI and interaction

- Make the current target and the data being cleared understandable.
- Explain that cleanup can sign users out and remove site preferences or unsaved state.
- Provide clear pending, success, failure, and partial-completion feedback.
- Prevent duplicate cleanup actions while an operation is pending.
- Handle unsupported pages or unavailable targets without offering a misleading successful action.
- Preserve the compact popup's scope selection, review/confirmation flow, and saved background results.

## Browser API usage

- Choose Chrome APIs based on the agreed scope and their actual cookie, origin, and tab behavior.
- Request only necessary permissions and host access in the manifest; do not default to broad access.
- Use typed browser API boundaries and await cleanup results before reporting completion.
- Add background or page-context execution only when required. Do not assume a popup can directly access a website's web storage.
- Do not add downloads or clipboard permissions for the cleaning feature.

## Building and testing

- Current scripts: `npm run dev`, `npm run build`, `npm run build:icons`, `npm run build:extension`, and `npm run preview`.
- `npm run build` runs Vue/TypeScript checks and outputs a web build to `dist/`.
- `npm run build:extension` type-checks, generates PNG icons from `public/favicon.svg`, and bundles a Manifest V3 extension to `dist-extension/` (manifest from `public/manifest.json`, icons, and the Vue app as the popup).
- The manifest declares `browsingData`, `cookies`, `history`, `scripting`, `tabs`, `storage`, `webNavigation`, and HTTP(S) host access for the agreed scope. History is read only for the all-sites catalogue. Incognito is disabled; do not imply profile-wide APIs clear incognito data.
- `npm test` covers scope rules and partial failures. `npm run test:browser` verifies the built extension with local fixtures in a disposable browser profile; never run destructive tests against a user's normal profile.
- For code changes, run `npm run build` and focused existing tests relevant to the change. Documentation-only changes do not require a build.
- Once extension packaging exists, load its actual output in Chrome through `chrome://extensions/` using Developer Mode and "Load unpacked" (select `dist-extension/`).
- Verify all three storage types, target isolation, unsupported pages, and failure/partial-completion feedback. A build alone does not verify browser cleanup.

### Git: never commit or push without permission

If multiple files have been edited, first ask: "Should the files be committed as one commit or in related commits?"

**Never** run `git commit` or `git push` (or any equivalent) on your own — not even when you have permission to execute commands without confirmation. Always ask the user first and wait for an explicit "yes" before committing or pushing. This applies to every branch, every change, and every situation, no exceptions.

Do not ask the user to provide or approve a commit message. Infer a concise, appropriate commit message from the changes.

When asking for permission or gathering additional information needed for the commit:
- Use the `vscode_askQuestions` tool to present options and collect structured user input
- Offer predefined options for commit grouping, target branch, or push destination when applicable
- Clearly describe what will happen and why you need confirmation
- Wait for the user's response before proceeding with the git operation

After a commit is successfully created, the next action must be a `vscode_askQuestions` call asking whether to push the commit(s). Do not end the turn with a status-only message or run `git push` before receiving the user's answer. Use predefined yes/no options to make this as simple as possible, and only push after an explicit yes.

If a push to GitHub over HTTPS is blocked because Git is not authenticated:
- Ask the user to authenticate through Git Credential Manager.
- Run `git credential-manager github login` in an interactive terminal so the user can complete sign-in. If the agent's terminal cannot open interactive authentication, ask the user to run the command in their own terminal.
- Wait for authentication to complete before retrying the authorized push. Authentication does not replace the explicit permission required to push.
- Never ask the user to paste passwords or access tokens into chat or store them in repository files.
