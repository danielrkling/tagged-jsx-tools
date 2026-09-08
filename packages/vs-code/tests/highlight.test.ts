import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { Registry, type IGrammar, type IToken } from "vscode-textmate";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma";

const syntaxesDir = path.join(__dirname, "..", "syntaxes");

let jsxGrammar: IGrammar;

beforeAll(async () => {
  const wasmPath = require.resolve("vscode-oniguruma/release/onig.wasm");
  const wasm = fs.readFileSync(wasmPath).buffer;
  await loadWASM(wasm as ArrayBuffer);

  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (s) => new OnigScanner(s),
      createOnigString: (s) => new OnigString(s),
    }),
    loadGrammar: async (scopeName) => {
      const files: Record<string, string> = {
        "text.jsx": "jsx.json",
        "text.lit-jsx": "lit-jsx-generated.json",
        "text.lit-jsx.string.injection": "lit-jsx-string-injection.json",
      };
      const file = files[scopeName];
      if (!file) return null;
      return JSON.parse(fs.readFileSync(path.join(syntaxesDir, file), "utf-8"));
    },
  });

  jsxGrammar = await registry.loadGrammar("text.jsx");
  expect(jsxGrammar).toBeDefined();
});

function scopesAt(tokens: IToken[], offset: number): string[] {
  const token = tokens.find((t) => t.startIndex <= offset && offset < t.endIndex);
  return token ? token.scopes : [];
}

function hasScope(tokens: IToken[], offset: number, scope: string): boolean {
  return scopesAt(tokens, offset).some((s) => s === scope || s.startsWith(scope + "."));
}

describe("jsx grammar tokenization", () => {
  it("highlights jsx comments ({/* */}) as comments", () => {
    const line = "<div>{/* hello */}</div>";
    const { tokens } = jsxGrammar.tokenizeLine(line);

    const open = line.indexOf("{/*");
    const content = line.indexOf("hello");
    const close = line.indexOf("*/}");

    expect(hasScope(tokens, open, "comment.block.jsx")).toBe(true);
    expect(hasScope(tokens, open, "punctuation.definition.comment.jsx")).toBe(true);
    expect(hasScope(tokens, content, "comment.block.jsx")).toBe(true);
    expect(hasScope(tokens, close, "punctuation.definition.comment.jsx")).toBe(true);
    // The closing brace must be part of the comment punctuation, not stray text.
    expect(hasScope(tokens, close + 2, "comment.block.jsx")).toBe(true);
  });

  it("does not treat jsx-comment braces as tags", () => {
    const line = "<div>{/* hello */}</div>";
    const { tokens } = jsxGrammar.tokenizeLine(line);
    const open = line.indexOf("{/*");
    const scopes = scopesAt(tokens, open);
    expect(scopes.some((s) => s.includes("punctuation.definition.tag"))).toBe(false);
  });

  it("still highlights legacy html comments", () => {
    const line = "<div><!-- hello --></div>";
    const { tokens } = jsxGrammar.tokenizeLine(line);
    const open = line.indexOf("<!--");
    expect(hasScope(tokens, open, "comment.block.jsx")).toBe(true);
    expect(hasScope(tokens, open, "punctuation.definition.comment.jsx")).toBe(true);
  });

  it("does not highlight expression content as a comment", () => {
    const line = "<div>${value}</div>";
    const { tokens } = jsxGrammar.tokenizeLine(line);
    const expr = line.indexOf("${");
    expect(hasScope(tokens, expr, "comment.block.jsx")).toBe(false);
  });

  it("highlights jsx comments between elements", () => {
    const line = "<a/>{/* note */}<b/>";
    const { tokens } = jsxGrammar.tokenizeLine(line);
    const open = line.indexOf("{/*");
    expect(hasScope(tokens, open, "comment.block.jsx")).toBe(true);
  });
});
