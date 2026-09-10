# Pascal → Flowchart (Блок-схема)

Single-page web app that converts Pascal ABC code to flowcharts rendered on a canvas.

## Architecture

Pipeline: `code → PascalLexer → PascalParser → AST → FlowchartGenerator → {nodes, edges} → FlowchartRenderer`

- `pascal-lexer.js` — tokenizer (ES module)
- `pascal-parser.js` — parser → AST (ES module)
- `flowchart-generator.js` — AST → flowchart graph (nodes + edges with row/col positions) (ES module)
- `flowchart-renderer.js` — canvas renderer with pan, zoom, PNG export (ES module)
- `app.js` — wires CodeMirror editor to the pipeline; `Ctrl+Enter` re-renders (ES module)

## Running

Open `index.html` in a browser. No build step, no npm.

## Testing (Node.js)

```bash
node test-unit.cjs           # 121 unit tests: lexer, parser, generator
node test-flow.cjs           # smoke test: prints nodes, edges, start/end checks
node test-debug.cjs          # prints coordinates for debugging arrow overlap
node test-user-code.cjs      # array example test
```

Tests use ES module dynamic imports via `pathToFileURL`.

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
