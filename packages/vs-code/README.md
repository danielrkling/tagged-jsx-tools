# Tagged JSX Tools

Syntax highlighting, formatting, and language support for JSX tagged template literals in VS Code.

Write real JSX syntax inside tagged template literals with full editor support — highlighting, formatting, IntelliSense, and type checking. Built for the **SolidJS** ecosystem where libraries like `solid-styled-components` and `@solid-primitives/styled` use the `html` tagged template tag.

Convert freely between tagged template and JSX syntax with a single command.

```typescript
// What you write — SolidJS JSX inside tagged templates:
const Button = styled.button`
  color: ${props => props.color};
`
const el = html`<div class=${active ? "on" : "off"}>
  <h1>${title}</h1>
  <${MyComponent} prop=${value}>${children}</${MyComponent}>
</div>`;
```

## Features

### Syntax highlighting

JSX syntax inside tagged template literals is highlighted with full TextMate grammar support. The extension injects grammars into JavaScript, TypeScript, JSX, TSX, and HTML files to detect tagged templates matching your configured tags.

The grammar is **dynamically generated** from your `customTags` setting and supports:

- JSX elements, fragments, self-closing tags
- Expression interpolations (`${...}`)
- String, expression, boolean, and spread attributes
- Dynamic tag names (`<${Component}>`)
- Template expression substitutions within JSX context

Three grammars work together:

- **`lit-jsx-generated.json`** — The primary injected grammar (regenerated from your tag settings). Detects tagged templates like `` html`...` `` and embeds JSX highlighting.
- **`lit-jsx-string-injection.json`** — Handles string interpolation highlighting inside template expressions.
- **`jsx.json`** — The embedded JSX grammar used for content inside matched templates.

### Formatting

Prettier-based formatting for JSX content inside tagged template literals, using `@tagged-jsx/prettier-plugin`. The formatter:

- Indents nested elements properly
- Breaks long attribute lists across lines
- Preserves expression formatting inline
- Follows your Prettier config (`printWidth`, `tabWidth`, `singleQuote`, etc.)
- Works with `.prettierrc`, `prettier` key in `package.json`, and EditorConfig settings

A custom `DocumentFormattingEditProvider` is registered for JavaScript and TypeScript files, so formatting via `Shift+Alt+F` or `Format Document` works out of the box.

### Convert to/from JSX

Toggle between tagged template and standard JSX syntax. The conversion is powered by `@tagged-jsx/transform` and handles:

- Tagged template → JSX: `` html`<div>...</div>` `` → `<div>...</div>`
- JSX → Tagged template: `<div>...</div>` → `` html`<div>...</div>` ``
- Component names are wrapped in expressions: `<MyComponent />` → `` html`<${MyComponent} />` ``
- JSX fragments: `<></>` → `` html`<></>` ``
- Nested JSX inside template expressions
- Whitespace-preserving conversion

### Expression callbacks (SolidJS reactive expressions)

SolidJS evaluates JSX expressions eagerly (`{value}`), but some tagged template libraries use lazy evaluation where interpolations are treated as thunks. When `tagged-jsx.useCallbacks` is enabled, the converter bridges this gap by wrapping non-primitive expressions with `() =>` when going JSX → tagged template, and unwrapping them on the reverse path:

```
// JSX (SolidJS — eager):
<div class={base()}>
<Show when={loaded()}>

// Tagged template (lazy, with callbacks):
html`<div class=${() => base()}>
html`<${Show} when=${() => loaded()}>
```

**Round-trip example:**

```
// Source JSX:
<button class={base} onClick={handler} disabled={isDisabled()}>
  <Show when={loaded()}>{children}</Show>
</button>

// Converted to tagged (with callbacks):
html`<button class=${() => base} onClick=${handler} disabled=${() => isDisabled()}>
  <${Show} when=${() => loaded()}>${() => children}</${Show}>
</button>`

// Converted back to JSX (with callbacks):
<button class={base} onClick={handler} disabled={isDisabled()}>
  <Show when={loaded()}>{children}</Show>
</button>
```

Notice `onClick` and primitives pass through unchanged — only non-trivial expressions get wrapped for lazy evaluation. **Without callbacks** the conversion is a pure syntax transform with no expression wrapping.

### TypeScript diagnostics

Real-time type checking of JSX inside template literals via `@tagged-jsx/ts-plugin`. The extension declares the plugin in `typescriptServerPlugins`, so TypeScript automatically loads it. See the ts-plugin package documentation for details.

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| `Tagged JSX: Toggle (Smart Convert)` | `Ctrl+Shift+J` / `Cmd+Shift+J` | Auto-detect whether the file contains tagged templates or JSX and convert accordingly |
| `Tagged JSX: Convert to jsx tag` | — | Convert tagged template literals to standard JSX syntax |
| `Tagged JSX: Convert to tagged template` | — | Convert standard JSX to tagged template literal |
| `Tagged JSX: Regenerate Grammar` | — | Regenerate the syntax highlighting grammar from current `customTags`, then reload |

The Smart Toggle command detects tagged templates via regex and decides which direction to convert, making it a single keybinding for both operations.

## Extension settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `tagged-jsx.customTags` | `string[]` | `["html", "jsx"]` | Tags to treat as JSX tagged templates. Affects highlighting, formatting, and conversion. |
| `tagged-jsx.preferredTag` | `string` | `"html"` | Tag to use when converting from JSX to tagged template (choices: `html`, `jsx`). |
| `tagged-jsx.useCallbacks` | `boolean` | `true` | Enable expression transform callbacks. Wraps expressions with `() =>` for SolidJS-style reactive frameworks. |
| `tagged-jsx.registeredComponents` | `string[]` | `[]` | Component names emitted as literal tag names in tagged templates instead of `${}` expressions. The runtime resolves these from its component registry. |

### `customTags`

Controls which tagged template identifiers are recognized as JSX. When you change this setting, the grammar is automatically regenerated and you'll be prompted to reload the window.

**Default:** `["html", "jsx"]`

Example: `["html", "jsx", "css", "styled"]` would also highlight content inside `` styled`...` `` as JSX.

### `useCallbacks`

When enabled (`true`, default), the converter applies the `() =>` wrap/unwrap pattern for SolidJS-style reactive expressions:

- **JSX → Tagged:** Non-primitive expressions (signal calls, variables, ternary operators) are wrapped in `() =>` to convert eager evaluation to lazy thunks. Event handlers (`on*`) and `ref` props are skipped. Arrow functions and primitives pass through verbatim.
- **Tagged → JSX:** Zero-parameter arrow functions with expression bodies are unwrapped by removing `() => `. Arrow functions with parameters or block bodies, event handlers, and primitives pass through verbatim.

This ensures idempotent round-tripping for SolidJS reactive expression semantics.

### `registeredComponents`

Component names that are emitted as **literal tag names** in tagged templates instead of `${...}` expressions. The runtime resolves them from its component registry.

**Default:** `[]` (all components are emitted as `${...}` expressions)

Example: `["Form.Field", "Button"]` converts `<Form.Field name="email" />` to:

```
html`<Form.Field name="email" />`
```

instead of:

```
html`<${Form.Field} name="email" />`
```

Names are matched exactly against the full tag text (`"Form"` does not cover `"Form.Field"`).

## Grammar system

The syntax highlighting grammar is generated at runtime by the `regenerateGrammar` command. It produces a TextMate JSON grammar that:

1. **Matches** tagged templates by tag name: `(?i)\b(html)(\x60)`
2. **Injects** the embedded `text.jsx` scope for JSX content
3. **Handles** template expression substitutions by including `source.ts#template-substitution-element`
4. **Marks** bare `<` characters outside templates as invalid (to prevent false positives in regular TypeScript code)

The grammar is written to `syntaxes/lit-jsx-generated.json` in the extension directory. If the file doesn't exist on activation (first run, or after reinstall), it's generated automatically.

## Requirements

- VS Code `>= 1.70.0`
- Prettier (for formatting) — installed in your workspace or globally

## License

MIT
