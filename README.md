# Cookie Cleaner

A lightweight Chrome extension for removing cookies, local storage, and session
storage from the current domain.

## Purpose and scope

The extension will let the user clean the following data for the current domain:

- Cookies
- Local storage (`localStorage`)
- Session storage (`sessionStorage`)

Keep the experience simple and focused on clearing this data. Additional
interaction details and domain-matching rules will be defined later. Do not
assume that cleaning includes other domains, browsing history, cache, IndexedDB,
or other browser data.

Clearing cookies and web storage can sign users out and remove site preferences
or unsaved state. The interface should clearly identify the target and explain
the operation's result, including failures or partial completion.

## Current status

The repository currently contains a Vue 3 + TypeScript + Vite starter.
The Chrome extension manifest (Manifest V3) and the extension build are in
place: `npm run build:extension` produces a loadable extension in
`dist-extension/`, using the current Vue app as the popup. Browser integration
and the actual cleaning behavior are not implemented yet, so the popup currently
shows the starter UI.

## Development

### Prerequisites

- A Node.js version supported by the installed Vite release
- npm
- Chrome for extension testing once browser integration is implemented

### Getting started

```bash
npm ci
npm run dev
```

Use the development URL printed by Vite.

### Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check with `vue-tsc` and create a production web build in `dist/` |
| `npm run build:icons` | Generate the PNG extension icons (16, 48, 128px) from `public/favicon.svg` |
| `npm run build:extension` | Type-check, build icons, and bundle a loadable extension into `dist-extension/` |
| `npm run preview` | Preview the production web build locally |

`npm run build` outputs a web app build to `dist/`. `npm run build:extension`
outputs a Manifest V3 extension to `dist-extension/` (manifest, icons, and the
bundled popup). Load it in Chrome via `chrome://extensions` → "Load unpacked" →
select the `dist-extension/` folder.

## Project structure

```text
CookieCleaner/
├── .github/
│   ├── agents/                 # Copilot agent definitions
│   ├── skills/                 # Project skill guidance
│   └── copilot-instructions.md # Project instructions
├── public/                     # Static assets (favicon, manifest, generated icons)
│   └── manifest.json           # Chrome Manifest V3 definition
├── scripts/
│   └── convert-icons.js        # Generates PNG extension icons from favicon.svg
├── src/
│   ├── assets/                 # Bundled assets
│   ├── components/             # Vue components
│   ├── App.vue                 # Root Vue component
│   ├── main.ts                 # Application entry point
│   └── style.css               # Global styles
├── index.html                  # Vite HTML entry point
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript project references
└── vite.config.ts              # Vite configuration
```

## Implementation guidelines

- Use Vue 3 Composition API with `<script setup lang="ts">` and TypeScript.
- Target Chrome Manifest V3 when adding extension integration.
- Request only the browser permissions required by the agreed cleaning scope.
- Keep cleanup limited to the agreed current-domain target; do not silently
  broaden it to parent domains, subdomains, other tabs, or all sites.
- Handle unsupported pages, unavailable permissions, and browser API errors
  explicitly. Never report success when cleanup fails or only partially completes.
- Keep operations local; do not transmit cookies or site storage to external services.
- Always use suitable shared components from the
  [Chrome Extension Component Library](https://github.com/larsliin/ChromeExtensionComponentLibrary/blob/main/docs/components/index.md)
  whenever possible instead of creating duplicate UI components. Check the
  library documentation before implementing UI components.
- If no suitable shared component exists and a reusable component would make
  sense, suggest creating it in the shared library and ask for approval before
  implementing a local alternative or changing the library.
- The library is not currently installed; add it when a concrete UI requirement
  needs it.
- Add dependencies and tooling only when needed for an agreed requirement.

### Workspace references and boundaries

- You may use the AppConfig and ColorPicker projects in this workspace as
  read-only references for implementation patterns and UI conventions.
- Never create, modify, move, or delete files in other projects without explicit
  user permission. Permission to use a project as a reference is not permission
  to change it.

## Verification

For code changes, run `npm run build` and any relevant tests added with the
implementation. Once the extension is implemented, also verify in Chrome that
cookies, local storage, and session storage are cleared for the intended target
without affecting unrelated sites, and that failures are reported accurately.
