import { describe, it, expect } from "vitest";
import * as prettier from "prettier";
import plugin from "../src/index";

const plugins = [plugin] as prettier.Plugin[];

// Formatting output should be stable: format(format(x)) === format(x)
describe("idempotency", () => {
  const cases = [
    "jsx`<div>${a}<span>1</span><span>2</span></div>`",
    "jsx`<p><span>a</span> <span>b</span></p>`",
    "jsx`<div>hello ${a} world and more text to make it long enough that fill has to wrap it somewhere interesting</div>`",
    'jsx`<div class="container">\n  <section>\n    <h1>${title}</h1>\n    <p>\n      ${description}\n    </p>\n  </section>\n</div>`',
  ];

  for (const code of cases) {
    it(JSON.stringify(code.slice(0, 40)), async () => {
      const once = await prettier.format(code, { parser: "babel", plugins });
      const twice = await prettier.format(once, { parser: "babel", plugins });
      expect(twice).toBe(once);
    });
  }
});
