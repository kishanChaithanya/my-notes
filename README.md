# My Notes

A local-first notes app (React + TipTap + IndexedDB) that runs in the browser and as a macOS desktop app (Electron).

Team guide (step-by-step, non-technical): [My Notes: Web & Mac App Guide](https://claude.ai/artifact/4GGdPsxJFTJd1jPL6vXGg2), also saved as a PDF in [`docs/My Notes Guide.pdf`](docs/My%20Notes%20Guide.pdf)

## Setup

Requires [Node.js](https://nodejs.org).

```sh
npm install
```

## Run

| Command | What it does |
| --- | --- |
| `npm run dev` | Web app at http://localhost:5173 |
| `npm run electron:dev` | Desktop app with hot reload |
| `npm run electron:start` | Builds the web app, then opens it in Electron (no hot reload) |

## Build

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the web app into `dist/` |
| `npm run preview` | Serves the `dist/` build locally |
| `npm run mac:build` | Builds `release/mac-arm64/My Notes.app` |
| `npm run mac:dmg` | Builds a `.dmg` installer in `release/` |
| `npm run lint` | Lints with Oxlint |

## Desktop app notes

- The desktop app stores notes in its own IndexedDB (`~/Library/Application Support/My Notes`), separate from the browser's.
- Builds are unsigned, so the first launch of a copied app needs right-click → Open.

## Desktop keyboard shortcuts (match macOS Notes)

Grouped in menu order: File, Edit, Format, View.

| Action | Shortcut |
| --- | --- |
| New Note / New Folder | ⌘N / ⇧⌘N |
| Duplicate note / Print | ⌘D / ⌘P |
| Delete note | ⌘⌫ |
| Note list search | ⌥⌘F |
| Title / Heading / Subheading / Body | ⇧⌘T / ⇧⌘H / ⇧⌘J / ⇧⌘B |
| Monostyled / Block quote | ⇧⌘M / ⌘' |
| Bulleted / Numbered list | ⇧⌘7 / ⇧⌘9 |
| Checklist / Mark as checked | ⇧⌘L / ⇧⌘U |
| Bold / Italic / Underline | ⌘B / ⌘I / ⌘U |
| Indent / Outdent | ⌘] / ⌘[ |
| Hide folders / Full screen | ⌃⌘S / ⌃⌘F |
| Zoom in / out / actual size | ⇧⌘. / ⇧⌘, / ⇧⌘0 |

In the web app, New Note is ⌘⌥N and search is ⌘K. Formatting shortcuts are the same as the desktop app.

## Deploying the web app

Run `npm run build`, then drag the `dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop). Notes still stay in each visitor's own browser.

## Installing the Mac app on another Mac

Requires an Apple-chip Mac (M1 or newer) on macOS 13 or newer.

1. Run `npm run mac:dmg` and copy `release/My Notes-0.0.0-arm64.dmg` to the other Mac.
2. Open the `.dmg` and drag **My Notes** into **Applications**.
3. On first launch macOS blocks the unsigned app. Click **Done**, then go to **System Settings → Privacy & Security → Open Anyway**. Or run this once:

   ```sh
   xattr -dr com.apple.quarantine "/Applications/My Notes.app"
   ```

To move notes across, quit the app on both Macs and copy `~/Library/Application Support/My Notes` from the old Mac to the new one. This replaces any notes already on the new Mac.

## How it was built

1. **Web app first** (`src/`): React UI, TipTap editor, Dexie over IndexedDB for storage, MiniSearch for search, built with Vite.
2. **Apple Notes menus, studied with REA.** REA (via the `reverse-engineer-anything` skill) opened `/System/Applications/Notes.app`. Decoding its nib files crashed REA, so menu names came from `MainMenu.loctable` and the menu tree and shortcuts from a small Python decoder for `MainMenu.nib`. Only menu names and shortcuts were used. No Apple code or assets were copied. If REA misbehaves, run `npx -y rea-agents@latest doctor` and restart Claude.
3. **Electron shell** (`electron/`): window, an Apple Notes-style menu bar wired to the web app through `preload.cjs`, plus Duplicate, Export as PDF/Markdown, Sort By and Hide Folders.
4. **Packaging**: electron-builder with ad-hoc signing (`npm run mac:dmg`).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "App could not be verified" on a Mac | Use **Open Anyway** or the `xattr` command above |
| App won't start at all | Intel Mac or macOS older than 13; not supported |
| localhost:5173 can't be reached | Run `npm run dev` |
| `command not found: npm` | Install Node.js, then reopen Terminal |
| Web notes missing | Notes live in one browser profile; private windows and clearing site data lose them |
| Browser notes not in the Mac app | Expected: the two versions store notes separately |

---

## Template notes

This project started from the React + TypeScript + Vite template, which provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Two official React plugins are available for Vite:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs) (used by this project)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

### React Compiler

The React Compiler is not enabled because of its impact on dev and build performance. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

### Expanding the Oxlint configuration

For production use, consider enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
