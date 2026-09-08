import { describe, it, expect } from "vitest";
import {
  tokenize,
  parse,
  ROOT_NODE,
  ELEMENT_NODE,
  TEXT_NODE,
  EXPRESSION_NODE,
  COMMENT_NODE,
  BOOLEAN_PROP,
  STRING_PROP,
  EXPRESSION_PROP,
  SPREAD_PROP,
  CommentNode,
  CLOSE_TAG_TOKEN,
  UNEXPECTED_CHARACTER_TOKEN,
} from "../src/index";

function parseTemplate(strings: TemplateStringsArray, ...values: any[]) {
  return parse(tokenize(strings));
}

describe("parse - basic elements", () => {
  it("should parse self-closing tag", () => {
    const result = parseTemplate`<div/>`;

    expect(result.type).toBe(ROOT_NODE);
    expect(result.children).toHaveLength(1);

    const child = result.children[0] as any;
    expect(child.type).toBe(ELEMENT_NODE);
    expect(child.name).toBe("div");
    expect(child.props).toEqual([]);
    expect(child.children).toEqual([]);
    expect(child.tokens.openTag.slash).toBeDefined();
  });

  it("should parse container element", () => {
    const result = parseTemplate`<div></div>`;

    expect(result.children).toHaveLength(1);

    const child = result.children[0] as any;
    expect(child.type).toBe(ELEMENT_NODE);
    expect(child.name).toBe("div");
    expect(child.tokens.openTag.close).toBeDefined();
  });

  it("should parse void elements", () => {
    const result = parseTemplate`<img/>`;

    const child = result.children[0] as any;
    expect(child.name).toBe("img");
    expect(child.children).toEqual([]);
  });

  it("should parse element with whitespace before closing", () => {
    const result = parseTemplate`<div > </div>`;

    const child = result.children[0] as any;
    expect(child.name).toBe("div");
    expect(child.tokens.openTag.close).toBeDefined();
  });

  it("should parse element with whitespace before tag name", () => {
    const result = parseTemplate`< div></ div>`;

    const child = result.children[0] as any;
    expect(child.name).toBe("div");
  });
});

describe("parse - nested elements", () => {
  it("should parse simple nested elements", () => {
    const result = parseTemplate`<div><span></span></div>`;

    const div = result.children[0] as any;
    expect(div.name).toBe("div");
    expect(div.children).toHaveLength(1);

    const span = div.children[0] as any;
    expect(span.type).toBe(ELEMENT_NODE);
    expect(span.name).toBe("span");
  });

  it("should parse deep nesting", () => {
    const result = parseTemplate`<div><section><article><p></p></article></section></div>`;

    const div = result.children[0] as any;
    const section = div.children[0] as any;
    const article = section.children[0] as any;
    const p = article.children[0] as any;

    expect(p.name).toBe("p");
  });

  it("should parse multiple sibling elements", () => {
    const result = parseTemplate`<div><a></a><b></b><c></c></div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(3);
    expect(div.children[0].name).toBe("a");
    expect(div.children[1].name).toBe("b");
    expect(div.children[2].name).toBe("c");
  });
});

describe("parse - text content", () => {
  it("should parse plain text content", () => {
    const result = parseTemplate`<div>Hello</div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(1);

    const text = div.children[0] as any;
    expect(text.type).toBe(TEXT_NODE);
    expect(text.value).toBe("Hello");
  });

  it("should preserve whitespace in text", () => {
    const result = parseTemplate`<div>  Hello World  </div>`;

    const div = result.children[0] as any;
    const text = div.children[0] as any;
    expect(text.value).toBe("  Hello World  ");
  });

  it("should parse text before and after child element", () => {
    const result = parseTemplate`<div>Hello <span>World</span>!</div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(3);

    expect(div.children[0].type).toBe(TEXT_NODE);
    expect(div.children[0].value).toBe("Hello ");

    expect(div.children[1].type).toBe(ELEMENT_NODE);
    expect(div.children[1].name).toBe("span");

    expect(div.children[2].type).toBe(TEXT_NODE);
    expect(div.children[2].value).toBe("!");
  });
});

describe("parse - expressions", () => {
  it("should parse simple expression as child", () => {
    const result = parseTemplate`<div>${"anyValue"}</div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(1);

    const expr = div.children[0] as any;
    expect(expr.type).toBe(EXPRESSION_NODE);
    expect(expr.value).toBe(0);
  });

  it("should parse multiple expressions as children", () => {
    const result = parseTemplate`<div>${"a"}${"b"}${"c"}</div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(3);

    expect(div.children[0].value).toBe(0);
    expect(div.children[1].value).toBe(1);
    expect(div.children[2].value).toBe(2);
  });

  it("should parse expression mixed with text", () => {
    const result = parseTemplate`<div>Hello ${"name"}!</div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(3);

    expect(div.children[0].type).toBe(TEXT_NODE);
    expect(div.children[0].value).toBe("Hello ");

    expect(div.children[1].type).toBe(EXPRESSION_NODE);
    expect(div.children[1].value).toBe(0);

    expect(div.children[2].type).toBe(TEXT_NODE);
    expect(div.children[2].value).toBe("!");
  });

  it("should parse standalone expression", () => {
    const result = parseTemplate`${"standalone"}`;

    expect(result.children).toHaveLength(1);

    const expr = result.children[0] as any;
    expect(expr.type).toBe(EXPRESSION_NODE);
    expect(expr.value).toBe(0);
  });

  it("should parse expression between siblings", () => {
    const result = parseTemplate`<div/>${"between"}<span/>`;

    expect(result.children).toHaveLength(3);
    expect((result.children[0] as any).name).toBe("div");
    expect((result.children[1] as any).value).toBe(0);
    expect((result.children[2] as any).name).toBe("span");
  });
});

describe("parse - dynamic tag names", () => {
  it("should parse dynamic tag name", () => {
    const result = parseTemplate`<${"DynamicTag"}/>`;

    const child = result.children[0] as any;
    expect(child.type).toBe(ELEMENT_NODE);
    expect(child.name).toBe(0);
  });

  it("should parse dynamic tag name with children", () => {
    const result = parseTemplate`<${"Tag"}>Content</${"Tag"}>`;

    const child = result.children[0] as any;
    expect(child.type).toBe(ELEMENT_NODE);
    expect(child.name).toBe(0);
    expect(child.children).toHaveLength(1);

    const text = child.children[0] as any;
    expect(text.type).toBe(TEXT_NODE);
    expect(text.value).toBe("Content");
  });
});

describe("parse - attributes", () => {
  it("should parse boolean attribute", () => {
    const result = parseTemplate`<input disabled/>`;

    const input = result.children[0] as any;
    expect(input.props).toHaveLength(1);

    const prop = input.props[0] as any;
    expect(prop.type).toBe(BOOLEAN_PROP);
    expect(prop.name).toBe("disabled");
    expect(prop.value).toBe(true);
  });

  it("should parse string attribute", () => {
    const result = parseTemplate`<div id="my-id" class="container"/>`;

    const div = result.children[0] as any;
    expect(div.props).toHaveLength(2);

    const idProp = div.props[0] as any;
    expect(idProp.type).toBe(STRING_PROP);
    expect(idProp.name).toBe("id");
    expect(idProp.value).toBe("my-id");

    const classProp = div.props[1] as any;
    expect(classProp.type).toBe(STRING_PROP);
    expect(classProp.name).toBe("class");
    expect(classProp.value).toBe("container");
  });

  it("should parse expression attribute", () => {
    const result = parseTemplate`<div id=${"dynamicId"}/>`;

    const div = result.children[0] as any;
    const prop = div.props[0] as any;

    expect(prop.type).toBe(EXPRESSION_PROP);
    expect(prop.name).toBe("id");
    expect(prop.value).toBe(0);
  });

  it("should parse spread attribute", () => {
    const result = parseTemplate`<div ...${"props"}/>`;

    const div = result.children[0] as any;
    const prop = div.props[0] as any;

    expect(prop.type).toBe(SPREAD_PROP);
    expect(prop.value).toBe(0);
  });

  it("should parse mixed attributes", () => {
    const result = parseTemplate`<input type="text" disabled value=${"val"} ...${"rest"}/>`;

    const input = result.children[0] as any;
    expect(input.props).toHaveLength(4);

    expect(input.props[0].type).toBe(STRING_PROP);
    expect(input.props[1].type).toBe(BOOLEAN_PROP);
    expect(input.props[2].type).toBe(EXPRESSION_PROP);
    expect(input.props[3].type).toBe(SPREAD_PROP);
  });

  it("should handle attribute with empty string value", () => {
    const result = parseTemplate`<div data=""/>`;

    const div = result.children[0] as any;
    const prop = div.props[0] as any;
    expect(prop.type).toBe(STRING_PROP);
    expect(prop.value).toBe("");
  });
});

describe("parse - token tracking", () => {
  it("should track open tag tokens", () => {
    const result = parseTemplate`<div id="test"></div>`;

    const div = result.children[0] as any;
    const { openTag } = div.tokens;

    expect(openTag.open.type).toBe("<");
    expect(openTag.name.value).toBe("div");
    expect(openTag.close.type).toBe(">");
  });

  it("should track self-closing slash token", () => {
    const result = parseTemplate`<div/>`;

    const div = result.children[0] as any;
    expect(div.tokens.openTag.slash).toBeDefined();
  });

  it("should track close tag tokens (within element)", () => {
    const result = parseTemplate`<div></div>`;

    const div = result.children[0] as any;
    const { openTag } = div.tokens;

    expect(openTag.open.type).toBe("<");
    expect(openTag.name.value).toBe("div");
    expect(openTag.close.type).toBe(">");
  });

  it("should track text token", () => {
    const result = parseTemplate`<div>hello</div>`;

    const div = result.children[0] as any;
    const text = div.children[0] as any;
    expect(text.tokens.text.type).toBe("TEXT");
    expect(text.tokens.text.value).toBe("hello");
  });

  it("should track expression token", () => {
    const result = parseTemplate`<div>${"x"}</div>`;

    const div = result.children[0] as any;
    const expr = div.children[0] as any;
    expect(expr.tokens.expression.type).toBe("EXPRESSION");
    expect(expr.tokens.expression.value).toBe(0);
  });

  it("should track prop tokens", () => {
    const result = parseTemplate`<div id="myId" class="cls" enabled data=${42} ...${"spread"}/>`;

    const div = result.children[0] as any;
    
    const stringProp = div.props[0] as any;
    expect(stringProp.tokens.name.value).toBe("id");
    expect(stringProp.tokens.equals.type).toBe("=");
    expect(stringProp.tokens.string.value).toBe("myId");

    const boolProp = div.props[2] as any;
    expect(boolProp.tokens.name.value).toBe("enabled");

    const exprProp = div.props[3] as any;
    expect(exprProp.tokens.name.value).toBe("data");
    expect(exprProp.tokens.expression.value).toBe(0);

    const spreadProp = div.props[4] as any;
    expect(spreadProp.tokens.spread.type).toBe("SPREAD");
    expect(spreadProp.tokens.expression.value).toBe(1);
  });
});

describe("parse - real-world JSX patterns", () => {
  it("should parse component with children", () => {
    const result = parseTemplate`
      <MyComponent>
        <Header />
        <Body>
          <p>Content</p>
        </Body>
      </MyComponent>
    `;

    const children = (result.children as any[]);
    const component = children.find(c => c.name === "MyComponent");
    expect(component).toBeDefined();
    expect(component.children.length).toBeGreaterThanOrEqual(2);
  });

  it("should parse list rendering pattern", () => {
    const result = parseTemplate`<ul>${"items"}.map(item => <li>${"item"}</li>)</ul>`;

    const ul = result.children[0] as any;
    expect(ul.children[0].type).toBe(EXPRESSION_NODE);
    expect(ul.children[0].value).toBe(0);
  });

  it("should parse conditional rendering pattern", () => {
    const result = parseTemplate`<div>${"show"} && <Spinner/></div>`;

    const div = result.children[0] as any;
    expect(div.children[0].type).toBe(EXPRESSION_NODE);
    expect(div.children[1].type).toBe(TEXT_NODE);
    expect(div.children[2].name).toBe("Spinner");
  });

  it("should parse component with expression props", () => {
    const result = parseTemplate`<Component title=${"title"} count=${"count"} />`;

    const component = result.children[0] as any;
    expect(component.props).toHaveLength(2);
    expect(component.props[0].value).toBe(0);
    expect(component.props[1].value).toBe(1);
  });

  it("should parse nested components with mixed content", () => {
    const result = parseTemplate`
      <Card>
        <Header title="Hello" />
        <Body>
          <p>Description</p>
        </Body>
      </Card>
    `;

    const children = (result.children as any[]);
    const card = children.find(c => c.name === "Card");
    expect(card.name).toBe("Card");
    const elementChildren = card.children.filter((c: any) => c.type === ELEMENT_NODE);
    expect(elementChildren[0].name).toBe("Header");
    expect(elementChildren[1].name).toBe("Body");
    expect(elementChildren[1].children[1].name).toBe("p");
  });
});

describe("parse - error cases", () => {
  it("should throw descriptive error on unclosed tag", () => {
    expect(() => parseTemplate`<div>`).toThrow("Unclosed tag found: <div>");
  });

  it("should throw descriptive error on deeply unclosed tags", () => {
    expect(() => parseTemplate`<div><span><p>`).toThrow("Unclosed tag found: <div, span, p>");
  });

  it("should throw descriptive error on mismatched closing tag", () => {
    expect(() => parseTemplate`<div></span>`).toThrow("Mismatched closing tag");
  });

  it("should throw descriptive error on wrong closing tag with nested elements", () => {
    expect(() => parseTemplate`<div><span></p>`).toThrow("Mismatched closing tag");
  });

  it("should throw descriptive error on missing tag name after <", () => {
    expect(() => parseTemplate`<>`).toThrow("Expected tag name after \"<\"");
  });

  it("should throw descriptive error on invalid attribute with expression", () => {
    expect(() => parseTemplate`<div ${"something"}/>`).toThrow("Invalid attribute");
  });

  it("should throw descriptive error on invalid attribute with string", () => {
    expect(() => parseTemplate`<div "test"/>`).toThrow("Invalid attribute");
  });

  it("should throw descriptive error on spread without expression", () => {
    expect(() => parseTemplate`<div .../>`).toThrow("Spread operator must be followed by an expression");
  });

  it("should throw descriptive error for missing tag name", () => {
    expect(() => parseTemplate`< >/>`).toThrow("Expected tag name");
  });

  it("should throw for unexptected token in text state", () => {
    expect(() => parse([{ type: CLOSE_TAG_TOKEN, segment: 0, start: 0, end: 1 }])).toThrow();
  });

  it("should throw for unterminated string literal", () => {
    expect(() => parseTemplate`<div id="hello`).toThrow("Unterminated string literal");
  });

  it("should throw for unexpected value after equals", () => {
    expect(() => parseTemplate`<div id=foo>`).toThrow('Expected attribute value after "="');
  });

  it("should throw for unexpected character token at top level", () => {
    expect(() => parse([
      { type: UNEXPECTED_CHARACTER_TOKEN, value: "@", segment: 0, start: 0, end: 1 } as any,
    ])).toThrow("Unexpected character: @");
  });
});

describe("parse - edge cases", () => {
  it("should parse empty root", () => {
    const result = parseTemplate``;
    expect(result.type).toBe(ROOT_NODE);
    expect(result.children).toEqual([]);
  });

  it("should parse element with only whitespace content", () => {
    const result = parseTemplate`<div>   </div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(1);
    expect(div.children[0].type).toBe(TEXT_NODE);
    expect(div.children[0].value).toBe("   ");
  });

  it("should parse separated expressions with text", () => {
    const result = parseTemplate`<div>${"a"} and ${"b"}</div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(3);
    expect(div.children[0].value).toBe(0);
    expect(div.children[1].type).toBe(TEXT_NODE);
    expect(div.children[1].value).toBe(" and ");
    expect(div.children[2].value).toBe(1);
  });

  it("should parse custom element names with special chars", () => {
    const result = parseTemplate`<my-component data-value="test"/>`;

    const el = result.children[0] as any;
    expect(el.name).toBe("my-component");
    expect(el.props[0].name).toBe("data-value");
  });

  it("should parse unicode tag names", () => {
    const result = parseTemplate`<日本語 data-value="test"/>`;

    const el = result.children[0] as any;
    expect(el.name).toBe("日本語");
    expect(el.props[0].name).toBe("data-value");
  });

  it("should handle self-closing with attributes", () => {
    const result = parseTemplate`<img src="test.png" alt="test" loading="lazy"/>`;

    const img = result.children[0] as any;
    expect(img.name).toBe("img");
    expect(img.props).toHaveLength(3);
    expect(img.children).toEqual([]);
  });

  it("should handle deeply nested with expressions at all levels", () => {
    const result = parseTemplate`
      <Level1 attr1=${"a"}>
        <Level2 attr2=${"b"}>
          <Level3>${"c"}</Level3>
        </Level2>
      </Level1>
    `;

    const children = (result.children as any[]);
    const l1 = children.find(c => c.name === "Level1");
    expect(l1.props[0].value).toBe(0);

    const l1ElementChildren = l1.children.filter((c: any) => c.type === ELEMENT_NODE);
    const l2 = l1ElementChildren[0];
    expect(l2.props[0].value).toBe(1);

    const l2ElementChildren = l2.children.filter((c: any) => c.type === ELEMENT_NODE);
    const l3 = l2ElementChildren[0];
    const exprChildren = l3.children.filter((c: any) => c.type === EXPRESSION_NODE);
    expect(exprChildren[0].value).toBe(2);
  });

  it("should handle empty string attribute", () => {
    const result = parseTemplate`<div class=""/>`;

    const div = result.children[0] as any;
    expect(div.props[0].value).toBe("");
  });

  it("should handle multiple boolean attributes", () => {
    const result = parseTemplate`<input disabled readonly required/>`;

    const input = result.children[0] as any;
    expect(input.props).toHaveLength(3);
    expect(input.props[0].name).toBe("disabled");
    expect(input.props[1].name).toBe("readonly");
    expect(input.props[2].name).toBe("required");
  });

  it("should handle nested siblings with text", () => {
    const result = parseTemplate`<div>Before <span>Middle</span> After</div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(3);
    expect(div.children[0].value).toBe("Before ");
    expect(div.children[1].name).toBe("span");
    expect(div.children[2].value).toBe(" After");
  });
});

describe("parse - comments", () => {
  it("should parse comment with text content", () => {
    const result = parseTemplate`<div><!-- hello --></div>`;

    const div = result.children[0] as any;
    expect(div.children).toHaveLength(1);

    const comment = div.children[0] as any;
    expect(comment.type).toBe(COMMENT_NODE);
    expect(comment.children).toHaveLength(1);
    expect(comment.children[0].type).toBe(TEXT_NODE);
    expect(comment.children[0].value).toBe(" hello ");
  });

  it("should parse comment with expression", () => {
    const result = parseTemplate`<div><!-- value: ${"expr"} --></div>`;

    const div = result.children[0] as any;
    const comment = div.children[0] as any;
    expect(comment.type).toBe(COMMENT_NODE);
    expect(comment.children).toHaveLength(3);


    expect(comment.children[0].type).toBe(TEXT_NODE);
    expect(comment.children[0].value).toBe(" value: ");

    expect(comment.children[1].type).toBe(EXPRESSION_NODE);
    expect(comment.children[1].value).toBe(0);

    expect(comment.children[2].type).toBe(TEXT_NODE);
    expect(comment.children[2].value).toBe(" ");
  });

  it("should parse comment at root level", () => {
    const result = parseTemplate`<!-- root comment --><div/>`;

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe(COMMENT_NODE);
    expect((result.children[0] as CommentNode).children[0].type).toBe(TEXT_NODE);
    expect(result.children[1].type).toBe(ELEMENT_NODE);
  });
});

describe("line comments", () => {
  it("should parse line comment in tag", () => {
    const result = parseTemplate`<div // comment\n/>`;

    expect(result.children).toHaveLength(1);
    const div = result.children[0] as any;
    expect(div.type).toBe(ELEMENT_NODE);

    expect(div.comments).toHaveLength(1);
    // Line comment should be a child of the element
    const comment = div.comments[0] as any;
    expect(comment.children[0].type).toBe(TEXT_NODE);
    expect(comment.children[0].value).toBe(" comment");
  });

});
