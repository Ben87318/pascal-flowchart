# Pascal → Flowchart (Блок-схема) v0.0.7

Electron desktop app + web fallback. Converts Pascal ABC code to flowcharts on canvas, with cloud sync via Supabase.

## Architecture

Pipeline: `code → PascalLexer → PascalParser → AST → FlowchartGenerator → {nodes, edges} → FlowchartRenderer`

- `pascal-lexer.js` — tokenizer (ES module)
- `pascal-parser.js` — parser → AST (ES module)
- `flowchart-generator.js` — AST → flowchart graph (nodes + edges with row/col positions) (ES module)
- `flowchart-renderer.js` — canvas renderer with pan, zoom, PNG export (ES module)
- `app.js` — wires CodeMirror editor to the pipeline; `Ctrl+Enter` re-renders; imports `./db.js` as `cloud` (ES module)
- `db.js` — Supabase client over `fetch`: Auth (signUp/signIn/signOut/refresh) + REST CRUD, session in `localStorage` (`pascalflow.session.v1`) (ES module)
- `supabase-config.js` — `SUPABASE_URL` + `SUPABASE_ANON_KEY` (ES module)
- `main.cjs` — Electron main: window, tray, menus, IPC, file I/O (`.pas`/`.png`), `last-file.txt` in `userData`
- `preload.cjs` — secure bridge: `window.electronAPI`
- `index.html` — loads local CodeMirror from `lib/codemirror/`; CSP allows `https://*.supabase.co` + local `http://127.0.0.1:54321`

## Database (Supabase, cloud — no local sqlite)

Tables: `profiles`, `profile_roles → roles`, `pascal_projects (id, title, code, owner_id)`, `groups`, `group_members`, `assignments`.

- `db.js: listProjects / getProject / createProject / updateProject / deleteProject / getProfile / getMyRoles / listGroups / createGroup / joinGroup / listAssignments / createAssignment`
- `app.js:5` — `import * as cloud from './db.js'`; calls at `listProjects`, `signIn`, `signUp`, `createProject`
- Local Supabase fallback (`supabase start`): `http://127.0.0.1:54321` (see comment in `supabase-config.js`)
- Never commit `sb_secret_*` keys; anon key only.

## Running

```bash
cd "C:\Users\123\Desktop\члок-схема (2)_unpacked\члок-схема"

npm install              # first time; if electron postinstall blocked: npm install-scripts approve electron@33.4.11
npm start                # Electron dev run
```

Web-only fallback: open `index.html` in browser (flowchart works; file menu needs Electron).

## Build (NSIS installer)

```bash
npx electron-builder --win nsis --config.win.signAndEditExecutable=false
# Output: dist/Pascal Блок-схема Setup 0.0.7.exe
```

`package.json:build.files` already includes `db.js` + `supabase-config.js` — keep them there.

## Testing (Node.js)

```bash
node test-unit.cjs           # 121 unit tests: lexer, parser, generator
node test-flow.cjs           # smoke test: prints nodes, edges, start/end checks
node test-debug.cjs          # prints coordinates for debugging arrow overlap
node test-user-code.cjs      # array example test
```

Tests use ES module dynamic imports via `pathToFileURL`. No DB tests — cloud is manual (`npm start`, login, create project).

## Flowchart conventions

- Ovals: start (`Н`) / end (`К`)
- Parallelograms: I/O (`read`, `write`)
- Diamonds: conditions (`if`/`while`/`repeat`/`case`)
- Hexagons: `for` loops
- Rectangles: assignments
- Double-line rectangles: sub-process (function/procedure calls, var declarations)
- Back arrows: loop returns (nested loops offset by `backDepth * 30` px)

## Known gotchas

- Canvas size is computed dynamically — increasing `HGAP` or nesting depth may require widening `farMinX`/`farMaxX` margins in `flowchart-renderer.js:_layout`.
- Back-arrow x-position: `farLeft + backDepth * 30` where `farLeft = _minX - HGAP`.
- `FunctionCall` in an `if`-condition splits into a separate `sub-process` node before the `decision` node (see `flowchart-generator.js:genIf`).
- Empty junction nodes (`process ''`) are filtered in `_drawEdges` — do not add them back.
- UI language is Russian; error messages have a Russian→English fallback map in `app.js`.
