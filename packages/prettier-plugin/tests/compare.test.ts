import { describe, it, expect } from "vitest";
import * as prettier from "prettier";
import plugin from "../src/index";

const plugins = [plugin] as prettier.Plugin[];

const format = (code: string) =>
  prettier.format(code, { parser: "babel", plugins, printWidth: 80 });

/**
 * Parity suite: every expected output mirrors what stock Prettier produces
 * for the equivalent .jsx code (`{expr}` -> `${expr}`), verified manually
 * against `prettier --parser=babel` on the JSX sources.
 */
describe("parity with prettier jsx", () => {
  const cases: { name: string; tagged: string; expected: string }[] = [
    {
      // prettier: <div>{a}<span>1</span><span>2</span></div> breaks because of
      // multiple expressions and elements
      name: "multiple expressions between elements break onto own lines",
      tagged: "jsx`<div>${a}<span>1</span><span>2</span></div>`",
      expected: "jsx`<div>\n  ${a}\n  <span>1</span>\n  <span>2</span>\n</div>`;\n",
    },
    {
      name: "text glues adjacent element",
      tagged: "jsx`<div>text<span>b</span></div>`",
      expected: "jsx`<div>\n  text<span>b</span>\n</div>`;\n",
    },
    {
      name: "single expression stays inline",
      tagged: "jsx`<p>${description}</p>`",
      expected: "jsx`<p>${description}</p>`;\n",
    },
    {
      name: "two expressions force a break",
      tagged: "jsx`<p>${b}${c}</p>`",
      expected: "jsx`<p>\n  ${b}\n  ${c}\n</p>`;\n",
    },
    {
      // significant: whitespace-separated elements stay glued even inside a
      // broken parent (prettier treats {" "} as meaningful text / fill)
      name: "space separated siblings stay on one line when breaking",
      tagged: "jsx`<p><span>a</span> <span>b</span></p>`",
      expected: "jsx`<p>\n  <span>a</span> <span>b</span>\n</p>`;\n",
    },
    {
      name: "multiline source keeps user line structure",
      tagged: "jsx`<div>\n  ${a}\n  <span>1</span>\n  <span>2</span>\n</div>`",
      expected: "jsx`<div>\n  ${a}\n  <span>1</span>\n  <span>2</span>\n</div>`;\n",
    },
    {
      name: "deeply nested with single-expression children",
      tagged:
        'jsx`<div class="container">\n      <section>\n        <h1>${title}</h1>\n        <p>\n          ${description}\n        </p>\n      </section>\n    </div>`',
      expected:
        'jsx`<div class="container">\n  <section>\n    <h1>${title}</h1>\n    <p>${description}</p>\n  </section>\n</div>`;\n',
    },
    {
      name: "multiline attribute expression is normalized",
      tagged: 'const q = jsx`<div id=${\n  someCondition\n    ? "aaa"\n    : "bbb"\n} />`;',
      expected: 'const q = jsx`<div id=${someCondition ? "aaa" : "bbb"} />`;\n',
    },
    {
      name: "map call expression inlines in container",
      tagged:
        "jsx`<ul>\n  ${\n    items.map(item => {\n      return item.name;\n    })\n  }\n</ul>`",
      expected:
        "jsx`<ul>\n  ${items.map((item) => {\n    return item.name;\n  })}\n</ul>`;\n",
    },
    {
      name: "long line overflows and each sibling gets its own line",
      tagged:
        'jsx`<div><span>this is quite a long bit of content</span><span>and so is this one right here yes</span><span>plus one more for good measure okay</span></div>`',
      expected:
        'jsx`<div>\n  <span>this is quite a long bit of content</span>\n  <span>and so is this one right here yes</span>\n  <span>plus one more for good measure okay</span>\n</div>`;\n',
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      expect(await format(c.tagged)).toBe(c.expected);
    });
  }
});
