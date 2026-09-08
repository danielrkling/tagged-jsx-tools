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

  it("unicode tag names: literal round-trip (lexer)", () => {
    // Hand-written templates with literal unicode tag names still work.
    const tagged = "jsx`<日本語 name=\"テスト\" />`";
    expect(toJsx(tagged).code).toBe("<日本語 name=\"テスト\" />");
  });

  it("unicode tag names: component per TS isIntrinsicJsxName", () => {
    // TS resolves unicode tag names from scope (not lowercase ASCII, no dash),
    // so they must be emitted as component references.
    const jsx = "<日本語 name=\"テスト\" />";
    const result = toTagged(jsx).code;
    expect(result.trim()).toBe("jsx`<${日本語} name=\"テスト\" />`");
    expect(toJsx(result).code).toBe(jsx);
  });

  it("underscore and dollar-prefixed tags are components", () => {
    expect(toTagged("<_Foo />").code.trim()).toBe("jsx`<${_Foo} />`");
    expect(toTagged("<$Foo />").code.trim()).toBe("jsx`<${$Foo} />`");
  });

  it("dash-containing tags stay intrinsic like TS", () => {
    expect(toTagged("<My-Comp />").code.trim()).toBe("jsx`<My-Comp />`");
  });

  it("escapes attribute values that would break the template", () => {
    expect(toTagged("<div title=\"a`b\" />").code.trim())
      .toBe("jsx`<div title=\"a\\`b\" />`");
    expect(toTagged("<div title=\"cost ${x}\" />").code.trim())
      .toBe("jsx`<div title=\"cost \\${x}\" />`");
    expect(toTagged("<div title=\"a\\nb\" />").code.trim())
      .toBe("jsx`<div title=\"a\\\\nb\" />`");
  });

  it("picks the attribute quote absent from the value", () => {
    const result = toTagged("<img alt='say \"hi\"' />").code;
    expect(result.trim()).toBe("jsx`<img alt='say \"hi\"' />`");
    expect(toJsx(result).code).toBe("<img alt='say \"hi\"' />");
  });

  it("escapes text children that would break the template", () => {
    expect(toTagged("<div>a`b</div>").code.trim()).toBe("jsx`<div>a\\`b</div>`");
    expect(toTagged("<div>a\\nb</div>").code.trim()).toBe("jsx`<div>a\\\\nb</div>`");
  });

  it("round-trips escaped template-breaking characters", () => {
    const cases = [
      "<div title=\"a`b\" />",
      "<div title=\"cost ${x}\" />",
      "<div title=\"a\\nb\" />",
      "<div>a`b</div>",
      "<div>a\\nb</div>",
      "<img alt='say \"hi\"' />",
      "<img alt=\"John's car\" />",
    ];
    for (const jsx of cases) {
      const tagged = toTagged(jsx).code;
      expect(toJsx(tagged).code, `round trip of ${jsx}`).toBe(jsx);
    }
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

  it("empty expression attributes are dropped (intentional normalization)", () => {
    // attr={} is a placeholder/stub idiom; dropping it matches the {} children
    // normalization and is semantically near-equivalent to attr={undefined}.
    expect(toTagged("<div attr={} other=\"x\" />").code.trim())
      .toBe("jsx`<div other=\"x\" />`");
  });
});

describe("registered components", () => {
  const toTaggedRegistered = createTaggedTransformer("jsx", ts, undefined, {
    registeredComponents: ["Form.Field", "Button"],
  });

  it("emits registered components as literal tag names", () => {
    expect(toTaggedRegistered("<Form.Field name=\"email\" />").code.trim())
      .toBe("jsx`<Form.Field name=\"email\" />`");
  });

  it("keeps closing tags literal for registered components", () => {
    const result = toTaggedRegistered("<Form.Field>\n  <input />\n</Form.Field>").code;
    expect(result.trim()).toBe("jsx`<Form.Field>\n  <input />\n</Form.Field>`");
    expect(toJsx(result).code).toBe("<Form.Field>\n  <input />\n</Form.Field>");
  });

  it("registers plain component names", () => {
    expect(toTaggedRegistered("<Button label=\"ok\" />").code.trim())
      .toBe("jsx`<Button label=\"ok\" />`");
  });

  it("still wraps non-registered components", () => {
    expect(toTaggedRegistered("<Other.Field />").code.trim())
      .toBe("jsx`<${Other.Field} />`");
  });

  it("matches registered names exactly", () => {
    expect(toTaggedRegistered("<Form.Input />").code.trim())
      .toBe("jsx`<${Form.Input} />`");
  });

  it("leaves intrinsic elements unaffected", () => {
    expect(toTaggedRegistered("<div class=\"x\" />").code.trim())
      .toBe("jsx`<div class=\"x\" />`");
  });
});

describe("comments", () => {
  it("should convert legacy HTML comments to JSX comments (toJsx)", () => {
    const tagged = "jsx`<div><!-- hello world --></div>`";
    const result = toJsx(tagged).code;
    expect(result).toBe("<div>{/* hello world */}</div>");
  });

  it("should emit JSX comments as-is (toTagged)", () => {
    const jsx = "<div>{/* hello world */}</div>";
    const result = toTagged(jsx).code;
    expect(result).toBe("jsx`<div>{/* hello world */}</div>`");
  });

  it("should round-trip JSX comments", () => {
    const original = "jsx`<div>{/* comment */}</div>`";
    const jsx = toJsx(original).code;
    expect(jsx).toBe("<div>{/* comment */}</div>");
    const back = toTagged(jsx).code;
    expect(back).toBe(original);
  });

  it("should normalize legacy HTML comments to JSX comments on round-trip", () => {
    const legacy = "jsx`<div><!-- comment --></div>`";
    const jsx = toJsx(legacy).code;
    expect(jsx).toBe("<div>{/* comment */}</div>");
    const back = toTagged(jsx).code;
    expect(back).toBe("jsx`<div>{/* comment */}</div>`");
  });

  it("should round-trip empty JSX comments", () => {
    const original = "jsx`<div>{/**/}</div>`";
    const jsx = toJsx(original).code;
    expect(jsx).toBe("<div>{/**/}</div>");
    const back = toTagged(jsx).code;
    expect(back).toBe(original);
  });

  it("should degrade interpolations inside comments to inert text (idempotent)", () => {
    const original = "jsx`<div>{/* value: ${value} */}</div>`";
    const jsx = toJsx(original).code;
    // Comments are inert in JSX, so interpolations inside them become
    // literal comment text. This matches the legacy <!-- --> behavior.
    expect(jsx).toBe("<div>{/* value: {value} */}</div>");
    const back = toTagged(jsx).code;
    expect(back).toBe("jsx`<div>{/* value: {value} */}</div>`");
    // Stable on subsequent round trips.
    expect(toJsx(back).code).toBe("<div>{/* value: {value} */}</div>");
  });

  it("should escape template-breaking characters in comments", () => {
    const jsx = "<div>{/* a `b ${x} c */}</div>";
    const tagged = toTagged(jsx).code;
    expect(tagged).toBe("jsx`<div>{/* a \\`b \\${x} c */}</div>`");
    expect(toJsx(tagged).code).toBe(jsx);
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
