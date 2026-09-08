import { describe, it, expect } from "vitest";
import * as prettier from "prettier";
import * as embedPlugin from "prettier-plugin-embed";
import plugin from "../src/index";

const plugins = [plugin] as prettier.Plugin[];

describe("format - basic elements", () => {
  it("should format simple element", async () => {
    const code = `jsx\`<div/>\``;
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    console.log("SIMPLE:", result);
    expect(result).toContain("<div />");
  });

  it("should preserve case", async () => {
    const code = `jsx\`<CustomComponent/>\``;
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("CustomComponent />");
  });

  it("should format element with attributes", async () => {
    const code = "jsx`<div     class   =   'foo' />`";
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain('class="foo"');
  });

  it("should format element with 3+ attributes", async () => {
    const code = 'jsx`<div style="color:red;"   class="foo" role="button" id="123" />`';
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("style=");
    expect(result).toContain("class=");
  });

  it("should keep self-closing tag with 3+ attributes inline if fits print width", async () => {
    const code = 'jsx`<div style="color:red;"   class="foo" role="button" id="123" />`';
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
      printWidth: 80,
    });
    expect(result).toContain("style=");
    expect(result).toContain("class=");
    expect(result).toContain("role=");
    expect(result).toContain("id=");
    expect(result).toContain("<div ");
    expect(result).toContain("/>");
  });

  it("should format nested elements", async () => {
    const code = `jsx\`<div><span>hello</span></div>\``;
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("<div>\n");
    expect(result).toContain("<span>hello</span>\n");
    expect(result).toContain("</div>");
  });
});

describe("format - newlines", () => {
  it("should add newlines between siblings", async () => {
    const code = `jsx\`<div><div>A</div><div>B</div></div>\``;
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("<div>A</div>\n");
    expect(result).toContain("\n");
  });

  it("should add indentation", async () => {
    const code = `jsx\`<div><section><span>text</span></section></div>\``;
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("  <section>");
    expect(result).toContain("    <span>");
  });
});

describe("format - expressions", () => {
  it("should preserve expression in attribute", async () => {
    const code = 'jsx`<div id=${x} />`';
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("id=${x}");
  });

  it("should preserve expression in content", async () => {
    const code = 'jsx`<div>${x}</div>`';
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("${x}");
  });

  it("should handle mixed content", async () => {
    const code = 'jsx`<div>hello ${"world"}</div>`';
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("hello ");
    expect(result).toContain(' ${"world"}');
  });

  it("it should handle dynamic tag name", async () => {
    const code = 'jsx`<${CompA}   > Child Text Content</${CompA}  >`';
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("<${CompA}>");
    expect(result).toContain("</${CompA}>");
  });

  it("should handle multiline expressions in attributes", async () => {
    const code = `jsx\`<div id=\${
      someCondition
        ? "long_string_id_1"
        : "long_string_id_2"
    } />\``;
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("id=${someCondition");
    expect(result).toContain('? "long_string_id_1"');
    expect(result).toContain(': "long_string_id_2"');
  });

  it("should handle multiline expressions in content", async () => {
    const code = `jsx\`<div>
      \${
        items.map(item => {
          return item.name;
        })
      }
    </div>\``;
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("items.map((item) => {");
    expect(result).toContain("return item.name;");
  });

  it("should handle deeply nested elements with expressions", async () => {
    const code = `jsx\`<div class="container">
      <section>
        <h1>\${title}</h1>
        <p>
          \${description}
        </p>
      </section>
    </div>\``;
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("  <section>");
    expect(result).toContain("    <h1>${title}</h1>");
    expect(result).toContain("<p>${description}</p>");
  });
});

describe("format - comments in elements", () => {
  it("should handle // line comment in tag", async () => {
    const code = "jsx`<div // this is a comment\n     class=\"foo\">text</div>`";
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("// this is a comment");
    expect(result).toContain("class=");
  });

  it("should handle /* */ block comment in tag", async () => {
    const code = "jsx`<div /* block comment */\n     class=\"foo\">text</div>`";
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("/* block comment */");
    expect(result).toContain("class=");
  });

  it("should handle // comment on self-closing tag", async () => {
    const code = "jsx`<div // comment\n     class=\"foo\" />`";
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("// comment");
    expect(result).toContain("/>");
  });

  it("should handle // comment with no attributes", async () => {
    const code = "jsx`<div // just a comment\n>text</div>`";
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("// just a comment");
  });

  it("should interleave comments with attributes in source order", async () => {
    const code = "jsx`<div /* block */\n     class=\"foo\"\n     // line\n     id=\"bar\"\n     style=\"color:red\">text</div>`";
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("/* block */");
    expect(result).toContain("// line");
    expect(result).toContain("class=");
    expect(result).toContain("id=");
    expect(result).toContain("style=");
  });

  it("should handle expression inside block comment", async () => {
    const code = `jsx\`<div /* \${someVar} */>text</div>\``;
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("someVar");
  });

  it("should format jsx comments in children", async () => {
    const code = "jsx`<div>{/* hello */}text</div>`";
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("{/* hello */}");
    expect(result).not.toContain("<!--");
  });

  it("should normalize legacy html comments to jsx comments", async () => {
    const code = "jsx`<div><!-- hello --></div>`";
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("{/* hello */}");
    expect(result).not.toContain("<!--");
  });

  it("should keep jsx comments with expressions", async () => {
    const code = "jsx`<div>{/* value: ${someVar} */}</div>`";
    const result = await prettier.format(code, {
      parser: "babel",
      plugins: plugins,
    });
    expect(result).toContain("{/* value: ${someVar} */}");
  });
});