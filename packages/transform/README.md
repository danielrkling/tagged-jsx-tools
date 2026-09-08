# @tagged-jsx/transform

Bidirectional conversion between tagged template literals and JSX syntax, with character-level source mapping for diagnostic translation.

Designed for **SolidJS**-ecosystem libraries that use the `html` tagged template tag (e.g., `solid-styled-components`, `@solid-primitives/styled`). Convert tagged template syntax to standard JSX and back, while preserving SolidJS's reactive expression semantics.

Convert this:

```tsx
const el = html`<div class=${active ? "on" : "off"}>
  <span>${content}</span>
</div>`;
```

To this:

```tsx
const el = <div class={active ? "on" : "off"}>
  <span>{content}</span>
</div>;
```

And back again. Used by the VS Code extension, TypeScript plugin, and formatter to provide seamless editing across both syntaxes.

## Installation

```bash
npm install @tagged-jsx/transform
```

## Usage

### Basic conversion

```typescript
import { createJsxTransformer, createTaggedTransformer } from "@tagged-jsx/transform";
import ts from "typescript";

// Tagged template -> JSX
const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
const jsxResult = toJsxWithMappings(`
  const el = html\`<div class=\${active}>hello</div>\`;
`);
// Result: { code: `const el = <div class={active}>hello</div>`, mappings: {...}, errors: [] }

// JSX -> Tagged template
const toTaggedWithMappings = createTaggedTransformer({ tag: "html", ts });
const taggedResult = toTaggedWithMappings(`
  const el = <div class={active}>hello</div>;
`);
// Result: { code: `const el = html\`<div class=${active}>hello</div>\``, mappings: {...}, errors: [] }

// SolidJS components are wrapped in expressions:
const taggedResult2 = toTaggedWithMappings(`
  const el = <MyComponent prop={value}>{children}</MyComponent>;
`);
// Result: { code: `const el = html\`<\${MyComponent} prop=\${value}>\${children}</\${MyComponent}>\``, mappings: {...}, errors: [] }
```

### With expression callbacks (SolidJS reactive expressions)

SolidJS evaluates interpolations eagerly in JSX but some template libraries use lazy evaluation. Callbacks bridge this gap by wrapping expressions with `() =>` when converting to tagged templates, and unwrapping on the reverse path.

```typescript
import {
  createJsxTransformer,
  createTaggedTransformer,
  createExpressionTransformCallbacks,
} from "@tagged-jsx/transform";
import ts from "typescript";

const callbacks = createExpressionTransformCallbacks(ts);

const toJSX = createJsxTransformer({ tags: ["html", "jsx"], ts, callbacks });
const toTagged = createTaggedTransformer({ tag: "html", ts, callbacks });

// JSX (eager):
//   <div class={signal()}>
//   <Show when={condition}>

// Tagged template (lazy, with callbacks):
//   html`<div class=${() => signal()}>
//   html`<${Show} when=${() => condition}>`

// The callbacks ensure non-primitive expressions get () => wrapped
// for lazy evaluation, while primitives, arrow functions, and
// event handlers (on*) pass through unchanged.
```

### With source mappings (for diagnostic translation)

```typescript
const toJsxWithMappings = createJsxTransformer({ tags: ["jsx", "html"], ts });
const { code, mappings } = toJsxWithMappings(sourceCode);

// Map a position in the tagged source to the equivalent position in JSX
const jsxPos = getJsxPosition(taggedPos, mappings.mappings, code.length);

// Map a JSX diagnostic position back to the original tagged source
const taggedPos = getTaggedPosition(jsxPos, mappings.reverseMappings, sourceCode.length);
```

## API

### `createJsxTransformer(options)`

Creates a transformer that converts tagged template literals to JSX syntax.

**Options:**
- `tags` — Array of tag names to recognize (e.g., `["jsx", "html"]`)
- `ts` — A TypeScript module instance
- `callbacks?` — Optional `TransformerCallbacks` for custom expression handling

**Returns:** `(code: string) => { code: string; mappings: MappingResult; errors: TransformError[] }`

A single function that accepts source code and returns an object with:
- `code` — The transformed code with all matching tagged templates converted to JSX
- `mappings` — Character-level offset mappings between original and transformed code
- `errors` — Array of transform errors (e.g., parse failures in template content)

Processing is iterative (up to 100 passes per file), handling nested templates.

### `createTaggedTransformer(options)`

Creates a transformer that converts JSX syntax to tagged template literals.

**Options:**
- `tag` — The tag name to use in output templates (e.g., `"html"`)
- `ts` — A TypeScript module instance
- `callbacks?` — Optional `TransformerCallbacks` for custom expression handling
- `registeredComponents?` — Component names emitted as literal tag names instead of `${...}` expressions (matched exactly, e.g. `["Form.Field", "Button"]`); the runtime resolves these from its component registry

**Returns:** `(code: string, callbacks?: TransformerCallbacks) => { code: string; mappings: MappingResult; errors: TransformError[] }`

A single function that accepts source code (and optional per-call callbacks override) and returns an object with:
- `code` — The transformed code with all JSX elements converted to tagged template literals
- `mappings` — Character-level offset mappings
- `errors` — Array of transform errors

Component tag names follow TypeScript's JSX semantics: intrinsic elements (starting with a lowercase ASCII letter, or containing a dash) stay literal, everything else is wrapped as an expression — `<MyComponent />` → `` html`<${MyComponent} />` ``, unless the name is listed in `registeredComponents`. Namespaced tags (`<svg:use />`) always stay literal.

### `getJsxPosition(taggedPosition, mappings, jsxCodeLength)`

Given a character position in the original tagged template source, find the corresponding position in the JSX output using the diff-based mapping.

### `getTaggedPosition(jsxPosition, reverseMappings, taggedCodeLength)`

The inverse of `getJsxPosition`. Given a JSX position, find the corresponding tagged template position. Used by the TypeScript plugin to map diagnostic locations back to the original source.

### `computeMappings(oldCode, newCode)`

Computes forward and reverse character-level mappings between two strings using `diff`.

---

## Transformer internals

### `createJsxTransformer` algorithm

1. **Find** the first `TaggedTemplateExpression` in the source whose tag matches the configured tags (depth-first traversal)
2. **Extract** the template strings array and expression nodes from the TypeScript AST
3. **Tokenize** the strings using `@tagged-jsx/parse`'s `tokenize()`
4. **Parse** the tokens into an AST using `parse()`
5. **Attach whitespace metadata** from template string segments to the AST via WeakMaps (preserves original spacing around attributes)
6. **Render** the AST back to JSX text, calling `callbacks.toJSX()` for each expression encountered
7. **Wrap in parens** if the template is a direct child of `return`, `throw`, or `yield` to prevent automatic semicolon insertion (ASI)
8. **Replace** the original tagged template text in the source
9. **Repeat** until no more tagged templates remain

### `createTaggedTransformer` algorithm

1. **Find** the first JSX element or fragment (`JsxElement`, `JsxSelfClosingElement`, `JsxFragment`; depth-first traversal)
2. **Convert attributes** preserving whitespace between tag name and attributes, and between attributes:
   - `JSXAttribute` with string initializer: `class="foo"`
   - `JSXAttribute` with expression initializer: `class=${expr}` (with optional callback transformation)
   - `JSXAttribute` without initializer (boolean): `disabled`
   - `JSXSpreadAttribute`: `...${obj}`
3. **Convert children** recursively, preserving whitespace between opening tags/first children, between children, and between last children/closing tags
4. **Wrap** the result in the configured tag: `` tag`...` ``
5. **Replace** the JSX text in the source
6. **Repeat** until no more JSX elements remain

---

## Callback system

The `TransformerCallbacks` interface allows custom handling of expressions during conversion. This is essential for frameworks like SolidJS that use different evaluation models for tagged templates vs. JSX.

```typescript
interface TransformerCallbacks {
  toTagged?: (opts: ToTaggedCallbackOptions) => string;
  toJSX?: (opts: ToJsxCallbackOptions) => string;
}
```

### `ToTaggedCallbackOptions` (JSX → Tagged direction)

| Field | Type | Description |
|-------|------|-------------|
| `expression` | `ts.Expression` | The TypeScript expression AST node |
| `propName?` | `string` | The attribute name (only set for attributes, not children) |
| `propType` | `"attribute" | "child"` | Whether this is an attribute value or a child expression |
| `sourceCode` | `string` | The full source code of the file being transformed |

### `ToJsxCallbackOptions` (Tagged → JSX direction)

| Field | Type | Description |
|-------|------|-------------|
| `expression` | `ts.Expression` | The TypeScript expression AST node |
| `propName?` | `string` | The attribute name (only set for attributes) |
| `propType` | `"attribute" | "child"` | Whether attribute value or child expression |
| `templateNode` | `ExpressionProp \| ExpressionNode` | The parsed template AST node (from `@tagged-jsx/parse`) with token-level metadata |
| `sourceCode` | `string` | The full source code of the file being transformed |

### Default callbacks: `createExpressionTransformCallbacks(ts)`

The built-in callbacks handle the `() =>` wrap/unwrap pattern for **idempotent round-tripping** between JSX and tagged templates.

**`toTagged` callback logic:**
1. **Skip props:** `ref` and `on*` (event handlers) are returned verbatim
2. **Primitives:** String/number literals, `true`, `false`, `null`, `undefined` are returned verbatim
3. **Arrow functions:** Returned verbatim (already carry parameter context)
4. **Everything else:** Wrapped in `() => <expr>` to convert eager evaluation to lazy thunks. Object literals are additionally parenthesized — `() => ({a: 1})` — since a bare `{` would parse as the arrow's block body.

**`toJSX` callback logic:**
1. **Skip props:** Same `ref`/`on*` skip logic
2. **Primitives:** Returned verbatim
3. **Arrow functions with parameters or block body:** Returned verbatim (cannot safely unwrap)
4. **Parenthesized object literal bodies:** `() => ({a: 1})` unwraps to the bare `{a: 1}`
5. **Zero-parameter arrow functions with expression body:** `() => ` prefix is stripped (reversing the wrapping)

This produces a clean round-trip suitable for SolidJS reactive expressions:
```
signal()  --toTagged--> () => signal()  --toJSX--> signal()
```

**Real-world SolidJS example:**

```tsx
// Source (JSX):
<button class={baseClass} onClick={handler} disabled={isDisabled()}>
  <Show when={loaded()}><span>{text()}</span></Show>
</button>

// After toTagged with callbacks:
html`<button class=${() => baseClass} onClick=${handler} disabled=${() => isDisabled()}>
  <${Show} when=${() => loaded()}><span>${() => text()}</span></${Show}>
</button>`

// Going back through toJSX with callbacks:
<button class={baseClass} onClick={handler} disabled={isDisabled()}>
  <Show when={loaded()}><span>{text()}</span></Show>
</button>
```

Note how `onClick` and primitives pass through untouched — only non-trivial expressions get wrapped.
```

---

## Source mapping system

The mapping module provides character-level offset tracking between tagged template and JSX representations, enabling tools to translate positions for error reporting, completions, and cursor synchronization.

```
Tagged source:        html`<div>${name}</div>`
                           ^-- position 14
                           |
                           v (mapped position)
JSX output:           <div>{name}</div>
                           ^-- position 6
```

This is used by the TypeScript plugin to map diagnostic positions from the JSX output back to the original tagged template source, so error squiggles appear at the correct locations in your `html` template literals.

The diff-based approach uses `diffChars` to compute fine-grained character differences, building both forward (tagged→JSX) and reverse (JSX→tagged) mappings.

---

## Comment handling

JSX-style comments (`{/* */}`) are the canonical comment syntax in tagged templates and pass through verbatim in both directions. Legacy HTML-style comments (`<!-- -->`) are still recognized and converted to `{/* */}` when going tagged → JSX:

```
Tagged (canonical):  html`<div>{/* comment */}</div>`
Tagged (legacy):     html`<div><!-- comment --></div>`
JSX:                 <div>{/* comment */}</div>
```

Line comments (`//`) and block comments (`/* */`) within template content pass through verbatim in both directions — no wrapping is applied.

This ensures that editor comments survive round-trip conversion without corruption.

---

## Whitespace model

The JSX-to-tagged direction preserves whitespace by extracting source text between known positions (e.g., between tag name and first attribute, between children). The tagged-to-JSX direction attaches whitespace metadata from the template string segments to the parsed AST using WeakMaps, separate from the parse package's interfaces.

This ensures that formatting like spacing around attributes, blank lines between elements, and indentation inside fragments is preserved through conversions.

## License

MIT
