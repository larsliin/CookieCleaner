# Cookie Cleaner Chrome Extension

A lightweight Chrome extension that removes cookies, local storage, and session storage from the current domain.

## Purpose and scope

Build a lightweight Chrome extension that:
1. Identifies the current domain from the active tab
2. Removes cookies for the agreed current-domain scope
3. Clears local storage (`localStorage`) and session storage (`sessionStorage`) for the agreed target
4. Provides clear feedback about success, failure, or partial completion

More detailed requirements will follow. Do not invent cleanup triggers, popup dimensions, confirmation flows, automatic reloads, or domain-matching rules. Clarify material ambiguity before implementing behavior.

Keep the interface simple and focused. Do not add config editing, downloads, clipboard features, browsing-history deletion, cache clearing, IndexedDB cleanup, scheduling, or web services unless explicitly requested.

## Stack and implementation

- **Frontend**: Vue 3 with Composition API and `<script setup lang="ts">`
- **Language**: TypeScript for application and browser integration code
- **Build tool**: Vite
- **Current structure**: `src/App.vue`, `src/main.ts`, `src/components/`, `src/style.css`, and `public/`
- The repository is currently a Vite starter, not a working extension. Do not describe planned files or features as already implemented.
- Target Chrome Manifest V3 when adding a manifest. Add a popup, service worker, or content script only as required by the agreed behavior.
- Keep Vue component files under 500 lines; split into smaller focused components if needed
- Use the existing Vite setup and npm scripts; add dependencies only when necessary

## Shared components

- Always use suitable shared UI components from the [Chrome Extension Component Library](https://github.com/larsliin/ChromeExtensionComponentLibrary/blob/main/docs/components/index.md) whenever possible instead of creating duplicate UI components. Check the library documentation before implementing UI components.
- If no suitable shared component exists and a reusable component would make sense, suggest creating it in the shared library and ask the user for approval before implementing a local alternative or changing the library.
- The library is not currently installed. Do not claim it is available or add it without a concrete UI requirement.

## Workspace references and boundaries

- You may use the AppConfig and ColorPicker projects in this workspace as read-only references for implementation patterns and UI conventions.
- Never create, modify, move, or delete files in other projects without explicit user permission. Permission to use a project as a reference is not permission to change it.

## Cleaning scope and safety

- Resolve the active tab's URL and validate that it is a supported target before cleaning.
- Keep cleanup limited to the agreed current-domain scope. Do not silently include parent domains, subdomains, unrelated origins, other tabs, or all browsing data.
- Cookies are domain/path scoped, local storage is origin scoped, and session storage is also tied to a tab's browsing context. Do not treat these as interchangeable scopes; clarify the intended mapping before implementing it.
- Clearing extension `chrome.storage.local` does not clear a website's local storage.
- Handle restricted pages, unavailable permissions, and API errors explicitly.
- Report partial completion accurately if one storage type cannot be cleared.
- Keep cookies and site storage local. Do not log sensitive values or transmit them to external services.

## Popup UI and interaction

- Make the current target and the data being cleared understandable.
- Explain that cleanup can sign users out and remove site preferences or unsaved state.
- Provide clear pending, success, failure, and partial-completion feedback.
- Prevent duplicate cleanup actions while an operation is pending.
- Handle unsupported pages or unavailable targets without offering a misleading successful action.
- Popup layout, dimensions, and detailed interaction flow remain to be defined.

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
- The manifest currently declares the `cookies`, `scripting`, and `activeTab` permissions for the documented cleaning scope; refine these when the cleaning behavior is implemented.
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
