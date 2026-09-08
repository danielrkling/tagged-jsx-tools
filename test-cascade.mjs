import * as ts from "typescript";
import { createJsxTransformer } from "@tagged-jsx/transform";

const code = `const a = html\`<div>\`
const b = html\`<span>ok</span>\`;`;

// Add JSX types inline so we get proper errors
const jsxCodeWithTypes = `declare namespace JSX {
  interface IntrinsicElements {
    div: { children?: any };
    span: { children?: any };
  }
}
` + code;

const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
const result = toJsxWithMappings(jsxCodeWithTypes);
console.log("=== Output ===");
console.log(result.code);
console.log("");

// Check BOTH syntactic and semantic diagnostics
const host = {
  getScriptFileNames: () => ["test.tsx"],
  getScriptVersion: () => "1",
  getScriptSnapshot: (name) =>
    ts.ScriptSnapshot.fromString(name === "test.tsx" ? result.code : ""),
  getCurrentDirectory: () => "",
  getCompilationSettings: () =>
    ({
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.Preserve,
      jsxImportSource: "solid-js",
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    }),
  getDefaultLibFileName: () => ts.getDefaultLibFilePath({}),
  fileExists: (name) => name === "test.tsx",
  readFile: (name) => (name === "test.tsx" ? result.code : undefined),
};
const ls = ts.createLanguageService(host);
const syntactic = ls.getSyntacticDiagnostics("test.tsx");
const semantic = ls.getSemanticDiagnostics("test.tsx");
console.log("=== Syntactic ===");
syntactic.forEach((d) => console.log("  -", d.messageText, "at", d.start));
console.log("=== Semantic ===");
semantic.forEach((d) => console.log("  -", d.messageText, "at", d.start));
