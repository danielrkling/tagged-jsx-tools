import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { createJsxTransformer, getTaggedPosition, getJsxPosition } from "@tagged-jsx/transform";

describe("ts-plugin diagnostics", () => {
  describe("transformer creation", () => {
    it("should create transformer with jsx tag", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      expect(toJsxWithMappings).toBeDefined();
    });

    it("should accept custom tags", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "custom"], ts });
      const result = toJsxWithMappings("const x = html`<div></div>`");
      expect(result.code).toContain("<div></div>");
    });
  });

  describe("basic transformation", () => {
    it("should convert basic template to JSX", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const result = toJsxWithMappings("const x = jsx`<div>hello</div>`");
      expect(result.code).toContain("<div>hello</div>");
    });

    it("should return mappings structure", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const result = toJsxWithMappings("const x = jsx`<div></div>`");
      expect(result.mappings).toBeDefined();
      expect(result.mappings.mappings).toBeDefined();
      expect(result.mappings.reverseMappings).toBeDefined();
    });

    it("should handle nested elements", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const result = toJsxWithMappings("const x = jsx`<div><span>hi</span></div>`");
      expect(result.code).toContain("<span>hi</span>");
    });

    it("should handle self-closing tags", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const result = toJsxWithMappings("const x = jsx`<img />");
      expect(result.code).toContain("<img />");
    });

    it("should handle attributes", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const result = toJsxWithMappings('const x = jsx`<div class="foo"></div>`');
      expect(result.code).toContain('class="foo"');
    });

    it("should handle expression attributes", () => {
      const name = "test";
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const result = toJsxWithMappings(`const x = jsx\`<div class=\${name}></div>\``);
      expect(result.code).toContain("class={name}");
    });
  });

  describe("position mapping", () => {
    it("should provide getTaggedPosition function", () => {
      expect(getTaggedPosition).toBeDefined();
      expect(typeof getTaggedPosition).toBe("function");
    });

    it("should map positions when given valid inputs", () => {
      const code = "const x = jsx`<div>hello</div>`;";
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const { mappings } = toJsxWithMappings(code);
      
      const pos = getTaggedPosition(5, mappings.reverseMappings, code.length);
      expect(typeof pos).toBe("number");
    });

    it("should return undefined for out of bounds position", () => {
      const code = "const x = jsx`<div></div>`;";
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const { mappings } = toJsxWithMappings(code);
      
      const pos = getTaggedPosition(10000, mappings.reverseMappings, code.length);
      expect(pos).toBeUndefined();
    });

    it("should return undefined for negative position", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const { code, mappings } = toJsxWithMappings("const x = jsx`<div></div>`");
      
      const pos = getTaggedPosition(-1, mappings.reverseMappings, code.length);
      expect(pos).toBeUndefined();
    });
  });

  describe("non-template code", () => {
    it("should pass through non-template code unchanged", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const result = toJsxWithMappings("const x = 1;");
      expect(result.code).toBe("const x = 1;");
      expect(result.mappings.mappings.length).toBeGreaterThan(0);
    });

    it("should handle tagged call without jsx tag", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const result = toJsxWithMappings("const x = notjsx`<div></div>`");
      expect(result.code).toBe("const x = notjsx`<div></div>`");
    });
  });

  describe("multiple templates in one file", () => {
    it("should handle multiple templates", () => {
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const result = toJsxWithMappings("const a = jsx`<div></div>`; const b = jsx`<span></span>`");
      expect(result.code).toContain("<div></div>");
      expect(result.code).toContain("<span></span>");
    });
  });

  describe("synthetic language service", () => {
    function createTestHost(jsxCode: string): ts.LanguageServiceHost {
      return {
        getScriptFileNames: () => ["test.tsx"],
        getScriptVersion: () => "1",
        getScriptSnapshot: (name) => ts.ScriptSnapshot.fromString(name === "test.tsx" ? jsxCode : ""),
        getCurrentDirectory: () => "",
        getCompilationSettings: () => ({ target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.Preserve, jsxImportSource: "solid-js" } as ts.CompilerOptions),
        getDefaultLibFileName: () => ts.getDefaultLibFilePath({} as ts.CompilerOptions),
        fileExists: (name) => name === "test.tsx",
        readFile: (name) => name === "test.tsx" ? jsxCode : undefined,
      };
    }

    it("should create a working synthetic LS for template files", () => {
      const code = `import { Show } from "solid-js";
const a = jsx\`<div>hello</div>\`;`;

      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      expect(jsxCode).not.toBe(code);
      expect(jsxCode).toContain("<div>hello</div>");
      expect(mappings.mappings.length).toBeGreaterThan(0);
      expect(mappings.reverseMappings.length).toBeGreaterThan(0);
    });

    it("should correctly round-trip positions through mappings", () => {
      const code = "const x = jsx`<div>hello</div>`;";
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const originalDivPos = code.indexOf("<div>");
      const jsxDivPos = getJsxPosition(originalDivPos, mappings.mappings, jsxCode.length);
      expect(jsxDivPos).toBeDefined();

      const backToOriginal = getTaggedPosition(jsxDivPos!, mappings.reverseMappings, code.length);
      expect(backToOriginal).toBe(originalDivPos);
    });

    it("should remap JSX diagnostic positions back to original positions", () => {
      const code = "const x = jsx`<div></div>`;";
      const toJsxWithMappings = createJsxTransformer({ tags: ["jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const diagnostics = ls.getSemanticDiagnostics("test.tsx");

      for (const diag of diagnostics) {
        const taggedStart = getTaggedPosition(diag.start!, mappings.reverseMappings, code.length);
        if (taggedStart !== undefined) {
          expect(taggedStart).toBeGreaterThanOrEqual(0);
          expect(taggedStart).toBeLessThanOrEqual(code.length);
        }
      }
    });

    it("should return completions at attribute value inside template", () => {
      const code = `const x = html\`<div class="hello"></div>\`;`;

      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const classPos = code.indexOf(`"hello"`);
      const jsxPos = getJsxPosition(classPos, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const completions = ls.getCompletionsAtPosition("test.tsx", jsxPos!, {});
      expect(completions).toBeDefined();
    });

    it("should return completions at element name inside template", () => {
      const code = "const x = html`<div></div>`;";
      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const pos = code.indexOf("<div") + 1;
      const jsxPos = getJsxPosition(pos, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const completions = ls.getCompletionsAtPosition("test.tsx", jsxPos!, {});
      expect(completions).toBeDefined();
    });

    it("should map positions correctly with template expressions", () => {
      const code = `const x = html\`<div class=\${name}>\${value}</div>\`;`;
      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const namePos = code.indexOf("name");
      const jsxNamePos = getJsxPosition(namePos, mappings.mappings, jsxCode.length);
      expect(jsxNamePos).toBeDefined();

      const backToOriginal = getTaggedPosition(jsxNamePos!, mappings.reverseMappings, code.length);
      expect(backToOriginal).toBe(namePos);

      const valuePos = code.indexOf("value");
      const jsxValuePos = getJsxPosition(valuePos, mappings.mappings, jsxCode.length);
      expect(jsxValuePos).toBeDefined();

      const valueBackToOriginal = getTaggedPosition(jsxValuePos!, mappings.reverseMappings, code.length);
      expect(valueBackToOriginal).toBe(valuePos);
    });

    it("should return rename info for lowercase div (canRename: false)", () => {
      const code = "const x = html`<div>hello</div>`;";
      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const divPos = code.indexOf("<div>") + 1;
      const jsxPos = getJsxPosition(divPos, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const renameInfo = ls.getRenameInfo("test.tsx", jsxPos!);
      expect(renameInfo).toBeDefined();
      if (renameInfo) {
        expect(renameInfo.canRename).toBe(false);
      }
    });

    it("should return rename info for a component (canRename: true)", () => {
      const code = `import { Show } from "solid-js";
const x = html\`<Show when=\${true}>hello</Show>\`;`;
      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const showPos = code.indexOf("<Show") + 1;
      const jsxPos = getJsxPosition(showPos, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const renameInfo = ls.getRenameInfo("test.tsx", jsxPos!);
      expect(renameInfo).toBeDefined();
      if (renameInfo) {
        expect(renameInfo.canRename).toBe(true);
      }
    });

    it("should provide JSX attribute completions with proper intrinsic elements type", () => {
      const jsxCode = `declare namespace JSX {
  interface IntrinsicElements {
    button: { onClick?: () => void; type?: "button" | "submit"; class?: string; id?: string; disabled?: boolean; o?: boolean };
  }
}
const x = <button o type="button" />;`;

      const spaceAfterButton = jsxCode.indexOf("button ") + "button ".length;
      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const completions = ls.getCompletionsAtPosition("test.tsx", spaceAfterButton, {});
      expect(completions).toBeDefined();
      if (completions) {
        const attrNames = completions.entries.map(e => e.name);
        expect(attrNames).toContain("onClick");
        expect(attrNames).toContain("class");
        expect(attrNames).toContain("disabled");
        // 'type' is already used so not in completions
        expect(attrNames).not.toContain("type");
      }
    });

    it("should provide JSX attribute completions filtered by prefix", () => {
      const jsxCode = `declare namespace JSX {
  interface IntrinsicElements {
    button: { onClick?: () => void; onFocus?: () => void; type?: "button"; o?: boolean };
  }
}
const x = <button o type="button" />;`;

      // Position right after 'o' (prefix "o")
      const afterOPos = jsxCode.indexOf("button ") + "button ".length + 1;  // end of 'o'
      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const completions = ls.getCompletionsAtPosition("test.tsx", afterOPos, {});
      expect(completions).toBeDefined();
      if (completions) {
        const attrNames = completions.entries.map(e => e.name);
        expect(attrNames).toContain("onClick");
        expect(attrNames).toContain("onFocus");
      }
    });

    it("should provide attribute completions via plugin proxy pipeline (with synthetic LS)", () => {
      const originalCode = `declare namespace JSX {
  interface IntrinsicElements {
    button: { onClick?: () => void; onFocus?: () => void; type?: "button" };
  }
}
const x = html\`<button type="button"></button>\`;`;

      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(originalCode);

      const typePrefixPos = originalCode.indexOf("button ") + "button ".length;
      const jsxPos = getJsxPosition(typePrefixPos, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const completions = ls.getCompletionsAtPosition("test.tsx", jsxPos!, {});
      expect(completions).toBeDefined();
      if (completions) {
        const attrNames = completions.entries.map(e => e.name);
        expect(attrNames).toContain("onClick");
        expect(attrNames).toContain("onFocus");
      }
    });

    it("should provide completions through the full proxy pipeline with attribute names", () => {
      const originalCode = `declare namespace JSX {
  interface IntrinsicElements {
    button: { onClick?: () => void; onFocus?: () => void; type?: "button" };
  }
}
const x = html\`<button type="button"></button>\`;`;

      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(originalCode);

      const position = originalCode.indexOf("button ") + "button ".length;
      const jsxPos = getJsxPosition(position, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const completions = ls.getCompletionsAtPosition("test.tsx", jsxPos!, {});

      expect(completions).toBeDefined();
    });

    it("should resolve solid-js types for synthetic LS (realistic host)", () => {
      // Create a realistic test host that can read from filesystem
      const fileSystem = new Map<string, string>();
      const projectDir = process.cwd();
      const targetFile = "test.tsx";

      // Read required type files from disk
      const loadFile = (p: string) => {
        try {
          const fs = require("fs");
          const path = require("path");
          const absPath = path.isAbsolute(p) ? p : path.join(projectDir, p);
          const content = fs.readFileSync(absPath, "utf-8");
          fileSystem.set(absPath, content);
          return absPath;
        } catch { return undefined; }
      };

      // Add the target file with JSX code that imports from solid-js
      const jsxCode = `import { Component } from "solid-js";
const x = <button o type="button" />;`;
      fileSystem.set(targetFile, jsxCode);

      // Load critical type files
      const libPath = ts.getDefaultLibFilePath({} as ts.CompilerOptions);
      loadFile(libPath);
      loadFile("node_modules/solid-js/types/jsx.d.ts");
      loadFile("node_modules/solid-js/types/index.d.ts");
      loadFile("node_modules/solid-js/package.json");

      // Find csstype dependency
      const csstypePath = "node_modules/csstype/index.d.ts";
      loadFile(csstypePath);

      // Also try to load all solid-js type files
      const fs = require("fs");
      const path = require("path");
      const solidTypesDir = path.join(projectDir, "node_modules/solid-js/types");
      if (fs.existsSync(solidTypesDir)) {
        for (const f of fs.readdirSync(solidTypesDir)) {
          if (f.endsWith(".d.ts")) {
            loadFile(path.join(solidTypesDir, f));
          }
        }
      }

      const host: ts.LanguageServiceHost = {
        getScriptFileNames: () => [targetFile, ...Array.from(fileSystem.keys()).filter(k => k !== targetFile)],
        getScriptVersion: () => "1",
        getScriptKind: (name) => name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        getScriptSnapshot: (name) => {
          const content = fileSystem.get(name) || fileSystem.get(path.resolve(name));
          if (content) return ts.ScriptSnapshot.fromString(content);
          // Try reading from disk
          try {
            const absPath = path.resolve(name);
            const diskContent = fs.readFileSync(absPath, "utf-8");
            fileSystem.set(absPath, diskContent);
            return ts.ScriptSnapshot.fromString(diskContent);
          } catch { return undefined; }
        },
        getCurrentDirectory: () => projectDir,
        getCompilationSettings: () => ({
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.Preserve,
          jsxImportSource: "solid-js",
          moduleResolution: ts.ModuleResolutionKind.NodeJs,
          module: ts.ModuleKind.ES2020,
        } as ts.CompilerOptions),
        getDefaultLibFileName: () => libPath,
        fileExists: (name) => {
          if (fileSystem.has(name)) return true;
          if (fileSystem.has(path.resolve(name))) return true;
          try { return fs.existsSync(path.resolve(name)); } catch { return false; }
        },
        readFile: (name) => {
          const content = fileSystem.get(name) || fileSystem.get(path.resolve(name));
          if (content) return content;
          try { return fs.readFileSync(path.resolve(name), "utf-8"); } catch { return undefined; }
        },
        readDirectory: (dirPath, extensions, exclude, include, depth) => {
          try {
            const results: string[] = [];
            const walk = (dir: string, currentDepth: number) => {
              if (depth !== undefined && currentDepth > depth) return;
              let entries: string[];
              try { entries = fs.readdirSync(dir); } catch { return; }
              for (const entry of entries) {
                const fullPath = path.join(dir, entry);
                let stat: any;
                try { stat = fs.statSync(fullPath); } catch { continue; }
                if (stat.isDirectory()) {
                  if (!exclude?.some((e: string) => entry.match(e))) {
                    walk(fullPath, currentDepth + 1);
                  }
                } else if (stat.isFile()) {
                  const ext = path.extname(entry);
                  if (!extensions || extensions.includes(ext)) {
                    if (!exclude?.some((e: string) => entry.match(e))) {
                      if (!include || include.some((i: string) => entry.match(i))) {
                        results.push(fullPath);
                      }
                    }
                  }
                }
              }
            };
            walk(dirPath, 0);
            return results;
          } catch { return []; }
        },
        directoryExists: (name) => {
          try { return fs.existsSync(name) && fs.statSync(name).isDirectory(); } catch { return false; }
        },
      };

      const ls = ts.createLanguageService(host);

      // Try to get completions at attribute name position
      const spacePos = jsxCode.indexOf("button ") + "button ".length;
      const completions = ls.getCompletionsAtPosition(targetFile, spacePos, {});

      expect(completions).toBeDefined();
      if (completions) {
        const attrNames = completions.entries.map(e => e.name);
        expect(attrNames.length).toBeGreaterThan(100);
        expect(attrNames).toContain("onClick");
        expect(attrNames).toContain("class");
        // 'type' is already used in the element, so excluded from completions
        expect(attrNames).not.toContain("type");
      }
    });

    it("should NOT return completions in original template (TypeScript limitation)", () => {
      const code = "const x = html`<div class=\"hello\"></div>`;";

      const host: ts.LanguageServiceHost = {
        getScriptFileNames: () => ["test.ts"],
        getScriptVersion: () => "1",
        getScriptSnapshot: (name) => ts.ScriptSnapshot.fromString(name === "test.ts" ? code : ""),
        getCurrentDirectory: () => "",
        getCompilationSettings: () => ({ target: ts.ScriptTarget.ES2020 } as ts.CompilerOptions),
        getDefaultLibFileName: () => ts.getDefaultLibFilePath({} as ts.CompilerOptions),
        fileExists: (name) => name === "test.ts",
        readFile: (name) => name === "test.ts" ? code : undefined,
      };
      const ls = ts.createLanguageService(host);

      const classPos = code.indexOf(`"hello"`);
      const completions = ls.getCompletionsAtPosition("test.ts", classPos, {});
      expect(completions).toBeUndefined();
    });

    it("should find first template position in code", () => {
      const code = "const x = html`<div></div>`;";
      const sourceFile = ts.createSourceFile("", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

      let found: boolean = false;
      function visit(node: ts.Node) {
        if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === "html") {
          found = true;
          expect(node.getStart()).toBe(code.indexOf("html"));
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
      expect(found).toBe(true);
    });

    it("should find template position even with syntax error in template", () => {
      const code = "const x = html`<`;";
      const sourceFile = ts.createSourceFile("", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

      let found: boolean = false;
      function visit(node: ts.Node) {
        if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === "html") {
          found = true;
          expect(node.getStart()).toBe(code.indexOf("html"));
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
      expect(found).toBe(true);
    });

    it("should provide completions through the full proxy pipeline (simulated)", () => {
      const code = `const x = html\`<div class="hello"></div>\`;`;
      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const attributePos = code.indexOf(`"hello"`);
      const jsxPos = getJsxPosition(attributePos, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const completions = ls.getCompletionsAtPosition("test.tsx", jsxPos!, {});
      expect(completions).toBeDefined();

      if (completions) {
        completions.entries.forEach((entry) => {
          if (entry.replacementSpan) {
            const mappedStart = getTaggedPosition(entry.replacementSpan.start, mappings.reverseMappings, code.length);
            const mappedEnd = getTaggedPosition(entry.replacementSpan.start + entry.replacementSpan.length, mappings.reverseMappings, code.length);
            expect(mappedStart).toBeDefined();
            expect(mappedEnd).toBeDefined();
            if (mappedStart !== undefined && mappedEnd !== undefined) {
              expect(mappedStart).toBeGreaterThanOrEqual(0);
              expect(mappedEnd).toBeLessThanOrEqual(code.length);
            }
          }
        });
      }
    });

    it("should provide quick info through the full proxy pipeline (simulated)", () => {
      const code = `import { Show } from "solid-js";
const x = html\`<Show when=\${true}>hello</Show>\`;`;
      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const showPos = code.indexOf("<Show") + 1;
      const jsxPos = getJsxPosition(showPos, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const quickInfo = ls.getQuickInfoAtPosition("test.tsx", jsxPos!);
      expect(quickInfo).toBeDefined();
    });

    it("should provide definition through the full proxy pipeline (simulated)", () => {
      const code = `import { Show } from "solid-js";
const x = html\`<Show when=\${true}>hello</Show>\`;`;
      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const showPos = code.indexOf("<Show") + 1;
      const jsxPos = getJsxPosition(showPos, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const defs = ls.getDefinitionAtPosition("test.tsx", jsxPos!);
      // May be undefined if solid-js types aren't available, but shouldn't crash
      expect(Array.isArray(defs)).toBe(true);
    });

    it("should return rename locations for a component inside template", () => {
      const code = `import { Show } from "solid-js";
const x = html\`<Show when=\${true}>hello</Show>\`;`;
      const toJsxWithMappings = createJsxTransformer({ tags: ["html", "jsx"], ts });
      const { code: jsxCode, mappings } = toJsxWithMappings(code);

      const showPos = code.indexOf("<Show") + 1;
      const jsxPos = getJsxPosition(showPos, mappings.mappings, jsxCode.length);
      expect(jsxPos).toBeDefined();

      const host = createTestHost(jsxCode);
      const ls = ts.createLanguageService(host);
      const locations = ls.findRenameLocations("test.tsx", jsxPos!, false, false);
      expect(locations).toBeDefined();
      if (locations) {
        expect(locations.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});