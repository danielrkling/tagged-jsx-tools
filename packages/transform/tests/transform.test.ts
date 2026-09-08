import { describe, it, expect } from "vitest";
import { createJsxTransformer, createTaggedTransformer } from "../src/index";
import { readFileSync } from "fs";
import { join } from "path";

const fixturesDir = join(__dirname, "fixtures");

function readJsx(file: string): string {
  return readFileSync(join(fixturesDir, "jsx", file), "utf-8");
}

function readTagged(file: string): string {
  return readFileSync(join(fixturesDir, "tagged", file), "utf-8");
}

const ts = require("typescript") as typeof import("typescript");
const toJsx = createJsxTransformer(["jsx"], ts);
const toTagged = createTaggedTransformer("jsx", ts);
const taggedTransform = createTaggedTransformer("html", ts);
const taggedJSXTransform = createJsxTransformer(["html"], ts);

describe("transforms", () => {
  describe("tagged to jsx", () => {
    it("basic file", () => {
      const input = readTagged("basic.ts");
      const expected = readJsx("basic.tsx");
      const result = toJsx(input).code;
      expect(result.trim()).toBe(expected.trim());
    });

    it("nested file", () => {
      const input = readTagged("nested.ts");
      const expected = readJsx("nested.tsx");
      const result = toJsx(input).code;
      expect(result).toBe(expected);
    });

    it("todo file (no callbacks)", () => {
      const input = readTagged("todo.ts");
      const expected = readJsx("todo.tsx").replace(/\r\n/g, '\n');
      const result = toJsx(input).code;
      expect(result).toBe(expected);
    });
  });

  describe("jsx to tagged", () => {
    it("basic file", () => {
      const input = readJsx("basic.tsx");
      const expected = readTagged("basic.ts");
      const result = toTagged(input).code;
      expect(result.trim()).toBe(expected.trim());
    });

    it("nested file", () => {
      const input = readJsx("nested.tsx");
      const expected = readTagged("nested.ts");
      const result = toTagged(input).code;
      expect(result).toBe(expected);
    });

    it("todo file (no callbacks)", () => {
      const input = readJsx("todo.tsx").replace(/\r\n/g, '\n');
      const expected = readTagged("todo.ts").replace(/\r\n/g, '\n');
      const result = toTagged(input).code;
      expect(result).toBe(expected);
    });
  });
});

describe("one-way transforms", () => {
  it("child fragments", () => {
    const jsx = "<div><></></div>";
    const expected = "jsx`<div></div>`";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe(expected.trim());
  });

  it("self-closing tags", () => {
    const jsx = "<div><img /></div>";
    const expected = "jsx`<div><img /></div>`";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe(expected.trim());
  });

  it("components", () => {
    const tagged = "jsx`<div><Button /></div>`";
    const expected = "jsx`<div><Button /></div>`";
    const result = toTagged(tagged).code;
    expect(result.trim()).toBe(expected.trim());
  });

  it("components on properties", () => {
    const jsx = "<Form.Field name=\"email\" />";
    const expected = "jsx`<${Form.Field} name=\"email\" />`";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe(expected.trim());
  });

  it("components on properties with children round-trip", () => {
    const jsx = "<Form.Field>\n  <input />\n</Form.Field>";
    const expected = "jsx`<${Form.Field}>\n  <input />\n</${Form.Field}>`";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe(expected.trim());
    expect(toJsx(result).code).toBe(jsx);
  });

  it("namespaced tags stay literal", () => {
    const jsx = "<svg:use href=\"icon.svg\" />";
    const expected = "jsx`<svg:use href=\"icon.svg\" />`";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe(expected.trim());
  });

  it("unicode tag names round-trip", () => {
    const jsx = "<日本語 name=\"テスト\" />";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe("jsx`<日本語 name=\"テスト\" />`");
    expect(toJsx(result).code).toBe(jsx);
  });

  it("namespaced attributes stay literal", () => {
    const jsx = "<svg xlink:href=\"icon.svg\" xlink:required />";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe("jsx`<svg xlink:href=\"icon.svg\" xlink:required />`");
  });

  it("namespaced attributes round-trip", () => {
    const jsx = "<svg xlink:href=\"icon.svg\" />";
    const result = toTagged(jsx).code;
    expect(toJsx(result).code).toBe(jsx);
  });

  it("namespaced expression attributes", () => {
    const jsx = "<svg xlink:href={url} />";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe("jsx`<svg xlink:href=${url} />`");
  });

  it("empty expressions", () => {
    const jsx = "<div>{}</div>";
    const expected = "jsx`<div></div>`";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe(expected.trim());
  });
});

describe("comments", () => {
  it("should convert HTML comment to JSX comment", () => {
    const tagged = "jsx`<div><!-- hello world --></div>`";
    const result = toJsx(tagged).code;
    expect(result).toBe("<div>{/* hello world */}</div>");
  });

  it("should convert JSX comment back to HTML comment", () => {
    const jsx = "<div>{/* hello world */}</div>";
    const result = toTagged(jsx).code;
    expect(result).toBe("jsx`<div><!-- hello world --></div>`");
  });

  it("should round-trip HTML comments", () => {
    const original = "jsx`<div><!-- comment --></div>`";
    const jsx = toJsx(original).code;
    const back = toTagged(jsx).code;
    expect(back).toBe(original);
  });

  it("should preserve line comments as-is in toJsx", () => {
    const tagged = "jsx`<div // line comment\n></div>`";
    const result = toJsx(tagged).code;
    expect(result).toContain("//");
  });

  it("should preserve block comments as-is in toJsx", () => {
    const tagged = "jsx`<div /* block comment */></div>`";
    const result = toJsx(tagged).code;
    expect(result).toContain("/*");
  });
});

describe("different tags", () => {
  it("custom tag", () => {
    const jsx = "<div>Test</div>";
    const expected = "html`<div>Test</div>`";
    const result = taggedTransform(jsx).code;
    expect(result.trim()).toBe(expected.trim());
  });

  it("custom tag to jsx", () => {
    const tagged = "html`<div>Test</div>`";
    const expected = "<div>Test</div>";
    const result = taggedJSXTransform(tagged).code;
    expect(result.trim()).toBe(expected.trim());
  });
});

describe("transform callbacks", () => {
  it("should transform expressions with toTagged callback", () => {
    const jsx = "<div value={v()} />";
    const result = toTagged(jsx, {
      toTagged: ({ expression, sourceCode }) => {
        const text = sourceCode.slice(expression.getStart(), expression.getEnd());
        return `() => ${text}`;
      }
    }).code;
    expect(result).toContain("value=${() => v()}");
  });

  it("should wrap return statement JSX in parens to prevent ASI", () => {
    const tagged = "function render() {\n  return jsx`\n    <p>\n      Hello, ${() => name}!\n    </p>\n  `;\n}";
    const result = toJsx(tagged).code;
    expect(result).toContain("return (");
    expect(result).toContain("<p>");
    expect(result).toContain("</p>");
    expect(result).toContain(")");
    expect(result).not.toContain("return\n");
  });

  it("should wrap throw statement JSX in parens to prevent ASI", () => {
    const tagged = "function fail() {\n  throw jsx`\n    <div>error</div>\n  `;\n}";
    const result = toJsx(tagged).code;
    expect(result).toContain("throw (");
    expect(result).toContain("<div>error</div>");
    expect(result).toContain(")");
  });

  it("should not add parens for non-ASI contexts like arrow function body", () => {
    const tagged = "const fn = () => jsx`<div />`";
    const result = toJsx(tagged).code;
    expect(result).toBe("const fn = () => <div />");
  });

  it("should transform expressions with toJSX callback", () => {
    const customToJsx = createJsxTransformer(["jsx"], ts, {
      toJSX: ({ expression, sourceCode }) => {
        const text = sourceCode.slice(expression.getStart(), expression.getEnd());
        return text.replace(/^\(\)\s*=>\s*/, "");
      }
    });

    const tagged = "jsx`<div value=${() => v()} />`";
    const result = customToJsx(tagged).code;
    expect(result).toContain("value={v()}");
  });

  it("should provide propName in callbacks", () => {
    let capturedPropName = "";
    toTagged("<div value={v()} />", {
      toTagged: ({ expression, propName, sourceCode }) => {
        capturedPropName = propName || "";
        const text = sourceCode.slice(expression.getStart(), expression.getEnd());
        return text;
      }
    });

    expect(capturedPropName).toBe("value");
  });

  it("should provide namespaced propName in callbacks", () => {
    let capturedPropName = "";
    toTagged("<svg xlink:href={v()} />", {
      toTagged: ({ expression, propName, sourceCode }) => {
        capturedPropName = propName || "";
        const text = sourceCode.slice(expression.getStart(), expression.getEnd());
        return text;
      }
    });

    expect(capturedPropName).toBe("xlink:href");
  });
});
