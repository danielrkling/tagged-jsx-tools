import { describe, it, expect } from "vitest";
import { createJsxTransformer, createTaggedTransformer, getJsxPosition, getTaggedPosition, computeMappings } from "../src/index";

const ts = require("typescript") as typeof import("typescript");
const toJsx = createJsxTransformer({ tags: ["jsx"], ts });
const toTagged = createTaggedTransformer({ tag: "jsx", ts });

describe("position mapping", () => {
  describe("toJsx result structure", () => {
    it("should return string code", () => {
      const result = toJsx("const x = jsx`<div></div>`;").code;
      expect(result).toBe("const x = <div></div>;");
    });

    it("should handle multiple templates", () => {
      const result = toJsx("const a = jsx`<div></div>`; const b = jsx`<span></span>`;").code;
      expect(result).toContain("<div></div>");
      expect(result).toContain("<span></span>");
    });
  });

  describe("toJsxWithMappings", () => {
    it("should return code and mappings", () => {
      const { code, mappings } = toJsx("const x = jsx`<div></div>`;");
      expect(code).toBe("const x = <div></div>;");
      expect(mappings).toBeDefined();
      expect(mappings.mappings).toBeDefined();
      expect(mappings.reverseMappings).toBeDefined();
    });
  });

  describe("getJsxPosition", () => {
    it("should map start of file to start of output", () => {
      const { code, mappings } = toJsx("const x = jsx`<div></div>`;");
      expect(getJsxPosition(0, mappings.mappings, code.length)).toBe(0);
    });

    it("should map positions before template correctly", () => {
      const { code, mappings } = toJsx("const x = jsx`<div></div>`;");
      expect(getJsxPosition(5, mappings.mappings, code.length)).toBe(5);
    });

    it("should map position at end of template", () => {
      const input = "const x = jsx`<div></div>`;";
      const { code, mappings } = toJsx(input);

      const templateEndPos = input.indexOf("`;");
      const mapped = getJsxPosition(templateEndPos, mappings.mappings, code.length);

      expect(code.charAt(mapped!)).toBe(";");
    });

    it("should map position inside template content", () => {
      const input = "const x = jsx`<div>hello</div>`;";
      const { code, mappings } = toJsx(input);

      const divPos = input.indexOf("div");
      const mapped = getJsxPosition(divPos, mappings.mappings, code.length);

      expect(code.charAt(mapped!)).toBe("d");
    });

    it("should map ${ to {", () => {
      const input = "const x = jsx`<div>${name}</div>`;";
      const { code, mappings } = toJsx(input);

      const exprStart = input.indexOf("${");
      const mapped = getJsxPosition(exprStart, mappings.mappings, code.length);

      expect(code.charAt(mapped!)).toBe("{");
    });

    it("should handle positions beyond file length", () => {
      const { code, mappings } = toJsx("const x = jsx`<div></div>`;");
      expect(getJsxPosition(code.length + 100, mappings.mappings, code.length)).toBeUndefined();
    });

    it("should handle negative positions", () => {
      const { code, mappings } = toJsx("const x = jsx`<div></div>`;");
      expect(getJsxPosition(-1, mappings.mappings, code.length)).toBeUndefined();
    });
  });

  describe("getTaggedPosition", () => {
    it("should map jsx position back to original position", () => {
      const input = "const x = jsx`<div></div>`;";
      const { code, mappings } = toJsx(input);

      const jsxDivPos = code.indexOf("div");
      const reverseMapped = getTaggedPosition(jsxDivPos, mappings.reverseMappings, input.length);

      expect(reverseMapped).toBe(input.indexOf("div"));
    });

    it("should roundtrip position mapping", () => {
      const input = "const x = jsx`<div></div>`;";
      const { code, mappings } = toJsx(input);

      const originalPos = input.indexOf("div");
      const toJsxPos = getJsxPosition(originalPos, mappings.mappings, code.length);
      const backToTagged = getTaggedPosition(toJsxPos!, mappings.reverseMappings, input.length);

      expect(backToTagged).toBe(originalPos);
    });
  });

  describe("toTagged mapping", () => {
    it("should return mappings for jsx to tagged conversion", () => {
      const { code, mappings } = toTagged("const x = <div></div>;");

      expect(code).toContain("jsx`");
      expect(mappings).toBeDefined();
    });

    it("should map jsx positions to tagged template positions", () => {
      const input = "const x = <div></div>;";
      const { code, mappings } = toTagged(input);

      const jsxDivPos = input.indexOf("div");
      const mapped = getJsxPosition(jsxDivPos, mappings.mappings, code.length);

      expect(code.charAt(mapped!)).toBe("d");
    });
  });

  describe("multiple templates", () => {
    it("should handle two templates with different content", () => {
      const input = "jsx`<div></div>`jsx`<span></span>`";
      const { code, mappings } = toJsx(input);

      expect(mappings.mappings.length).toBeGreaterThanOrEqual(3);
      expect(getJsxPosition(0, mappings.mappings, code.length)).toBe(0);
      expect(getJsxPosition(15, mappings.mappings, code.length)).toBe(11);
      expect(getJsxPosition(16, mappings.mappings, code.length)).toBe(12);
    });
  });

  describe("computeMappings", () => {
    it("should compute mappings between two strings", () => {
      const oldCode = "const x = jsx`<div></div>`;";
      const newCode = "const x = <div></div>;";
      const { mappings, reverseMappings } = computeMappings(oldCode, newCode);

      expect(mappings.length).toBeGreaterThan(0);
      expect(reverseMappings.length).toBe(mappings.length);
    });

    it("should handle equal strings (no change)", () => {
      const code = "const x = 1;";
      const { mappings, reverseMappings } = computeMappings(code, code);

      expect(mappings.length).toBeGreaterThan(0);
      expect(reverseMappings.length).toBe(mappings.length);
    });
  });

  describe("edge cases", () => {
    it("should handle tagged template without children", () => {
      const result = toJsx("jsx`<div></div>`").code;
      expect(result).toBe("<div></div>");
    });

    it("should handle empty tagged template", () => {
      const result = toJsx("jsx`<${Foo}></${Foo}>").code;
      expect(result).toBe("<Foo></Foo>");
    });

    it("should handle lowercase component (not uppercase)", () => {
      const result = toJsx("jsx`<foo />").code;
      expect(result).toBe("<foo />");
    });

    it("should handle multiple elements at root level", () => {
      const input = "jsx`<div></div><span></span>`";
      const result = toJsx(input).code;
      expect(result).toBe("<><div></div><span></span></>");
    });

    it("should handle self-closing tag as only child", () => {
      const result = toJsx("jsx`<div><img /></div>`").code;
      expect(result).toBe("<div><img /></div>");
    });

    it("should handle components", () => {
      const result = toJsx("jsx`<Button><img /></Button>`").code;
      expect(result).toBe("<Button><img /></Button>");
    });

    it("should handle deeply nested structure", () => {
      const result = toJsx("jsx`<div><span><strong>text</strong></span></div>`").code;
      expect(result).toBe("<div><span><strong>text</strong></span></div>");
    });

    it("should handle JSX to tagged with whitespace between children", () => {
      const input = "const x = <div>hello    <span>world</span></div>;";
      const result = toTagged(input).code;
      expect(result).toContain("jsx`");
    });

    it("should handle attribute expression with string literal value", () => {
      const input = "const x = <div data-msg=\"hello\"></div>;";
      const result = toTagged(input).code;
      expect(result).toContain('data-msg="hello"');
    });

    it("should handle attribute with unknown/undefined expression", () => {
      const input = "const x = <div data={someUnknown}></div>;";
      const result = toTagged(input).code;
      expect(result).toContain("data=${someUnknown}");
    });

    it("should handle positions beyond reverse mapping boundary returning undefined", () => {
      const input = "const x = jsx`<div></div>`;";
      const { code, mappings } = toJsx(input);
      expect(getTaggedPosition(code.length + 100, mappings.reverseMappings, input.length)).toBeUndefined();
    });

    it("should handle uppercase component in jsx to tagged", () => {
      const result = toTagged("const x = <Component></Component>;").code;
      expect(result).toContain("${Component}");
    });

    it("should handle uppercase component self-closing", () => {
      const result = toTagged("const x = <Component />").code;
      expect(result).toContain("${Component}");
    });

    it("should handle uppercase component with attributes", () => {
      const result = toTagged("const x = <MyComp foo=\"bar\"></MyComp>;").code;
      expect(result).toContain("${MyComp}");
    });

    it("should handle jsx fragment", () => {
      const result = toTagged("const x = <>hello</>;").code;
      expect(result).toContain("jsx`");
    });

    it("should handle jsx text child", () => {
      const result = toTagged("const x = <div>hello world</div>;").code;
      expect(result).toContain("hello world");
    });

    it("should handle boolean attribute in jsx", () => {
      const result = toTagged("const x = <input disabled></input>;").code;
      expect(result).toContain("disabled");
    });

    it("should handle spread in jsx", () => {
      const result = toTagged("const x = <div {...props}></div>;").code;
      expect(result).toContain("jsx`");
    });

    it("should return undefined for getJsxPosition when position is out of bounds", () => {
      const { code, mappings } = toJsx("const x = jsx`<div></div>`;");
      expect(getJsxPosition(-10, mappings.mappings, code.length)).toBeUndefined();
      expect(getJsxPosition(code.length + 10, mappings.mappings, code.length)).toBeUndefined();
    });

    it("should return undefined for getTaggedPosition when position is out of bounds", () => {
      const input = "const x = jsx`<div></div>`;";
      const { code, mappings } = toJsx(input);
      expect(getTaggedPosition(-10, mappings.reverseMappings, input.length)).toBeUndefined();
      expect(getTaggedPosition(code.length + 10, mappings.reverseMappings, input.length)).toBeUndefined();
    });
  });
});
