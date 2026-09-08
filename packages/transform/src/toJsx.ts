import {
  tokenize,
  WHITESPACE_TOKEN,
  OPEN_TAG_TOKEN,
  CLOSE_TAG_TOKEN,
  SLASH_TOKEN,
  TAG_NAME_TOKEN,
  PROP_NAME_TOKEN,
  EQUALS_TOKEN,
  STRING_TOKEN,
  TEXT_TOKEN,
  EXPRESSION_TOKEN,
  SPREAD_TOKEN,
  COMMENT_START_TOKEN,
  COMMENT_END_TOKEN,
  type Token,
} from "@tagged-jsx/parse";
import { computeMappings } from "./mappings";
import type { MappingResult } from "./mappings";
import type * as tsModule from "typescript";
import type {
  TransformerCallbacks,
  TransformError,
  CreateJsxTransformerOptions,
} from "./types";

export function createJsxTransformer(options: CreateJsxTransformerOptions) {
  const { tags, ts, callbacks } = options;
  function findFirstTaggedTemplate(
    node: tsModule.Node,
  ): tsModule.TaggedTemplateExpression | undefined {
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = node.tag;
      if (ts.isIdentifier(tag) && tags.includes(tag.text)) {
        return node;
      }
    }

    return ts.forEachChild(node, findFirstTaggedTemplate);
  }

  function tokensToJsx(
    tokens: Token[],
    expressions: tsModule.Expression[],
    sourceCode: string,
  ): string {
    let result = "";
    let depth = 0;
    let rootItems = 0;
    let tagHadSlash = false;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      switch (token.type) {
        case OPEN_TAG_TOKEN: {
          const nextToken = tokens[i + 1];
          if (nextToken?.type !== SLASH_TOKEN) {
            if (depth === 0) rootItems++;
            depth++;
          }
          result += "<";
          tagHadSlash = false;
          break;
        }
        case CLOSE_TAG_TOKEN:
          if (tagHadSlash && depth > 0) depth--;
          tagHadSlash = false;
          result += ">";
          break;
        case SLASH_TOKEN:
          tagHadSlash = true;
          result += "/";
          break;
        case TAG_NAME_TOKEN:
        case PROP_NAME_TOKEN:
          result += token.value;
          break;
        case EQUALS_TOKEN:
          result += "=";
          break;
        case STRING_TOKEN:
          result += token.quote + token.value + token.quote;
          break;
        case TEXT_TOKEN:
          if (depth === 0 && token.value.trim()) rootItems++;
          result += token.value;
          break;
        case WHITESPACE_TOKEN:
          result += token.value;
          break;
        case SPREAD_TOKEN: {
          const nextToken = tokens[i + 1];
          if (nextToken?.type === EXPRESSION_TOKEN) {
            const expr = expressions[nextToken.value];
            result += `{...${expr?.getText() ?? "/* error */"}}`;
            i++;
          }
          break;
        }
        case EXPRESSION_TOKEN: {
          const prevToken = tokens[i - 1];
          if (prevToken?.type === SPREAD_TOKEN) break;
          const expr = expressions[token.value];
          const isTagName = prevToken?.type === OPEN_TAG_TOKEN || prevToken?.type === SLASH_TOKEN;
          const isPropValue = prevToken?.type === EQUALS_TOKEN;
          let prevProp: string | undefined;
          if (isPropValue) {
            const propToken = tokens[i - 2];
            if (propToken?.type === PROP_NAME_TOKEN) {
              prevProp = propToken.value;
            }
          }
          let exprText = expr?.getText() ?? "/* error */";
          if (!isTagName && callbacks?.toJSX) {
            try {
              exprText = callbacks.toJSX({
                expression: expr!,
                propName: prevProp,
                propType: prevProp ? "attribute" : "child",
                templateNode: token,
                sourceCode,
              });
            } catch {
              exprText = expr?.getText() ?? "/* error */";
            }
          }
          if (isTagName) {
            result += exprText;
          } else {
            result += `{${exprText}}`;
          }
          break;
        }
        case COMMENT_START_TOKEN:
          if (token.value === "<!--") {
            result += "{/*";
          } else {
            result += token.value;
          }
          break;
        case COMMENT_END_TOKEN:
          if (token.value === "-->") {
            result += "*/}";
          } else {
            result += token.value;
          }
          break;
      }
    }

    if (result === "") {
      return "<></>";
    }
    if (rootItems > 1) {
      return `<>${result}</>`;
    }
    return result;
  }

  function toJsx(code: string): string {
    let result = code;
    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      iterations++;

      const sourceFile = ts.createSourceFile(
        "test.ts",
        result,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      const template = findFirstTaggedTemplate(sourceFile);

      if (!template) {
        break;
      }

      const needsParens = template.parent && (
        ts.isReturnStatement(template.parent) ||
        ts.isThrowStatement(template.parent) ||
        ts.isYieldExpression(template.parent)
      );

      let strings: string[];
      let expressions: tsModule.Expression[];

      if (ts.isNoSubstitutionTemplateLiteral(template.template)) {
        strings = [template.template.text];
        expressions = [];
      } else {
        if (!template.template.templateSpans) {
          console.error('templateSpans is not iterable or undefined');
          break;
        }
        strings = [
          template.template.head.text,
          ...template.template.templateSpans.map((span) => span.literal.text),
        ];
        expressions = template.template.templateSpans.map(
          (span) => span.expression,
        );
      }

      const tokens = tokenize(strings as unknown as TemplateStringsArray);
      const jsxCode = tokensToJsx(tokens, expressions, result);

      result =
        result.slice(0, template.getStart()) +
        (needsParens ? "(" : "") +
        jsxCode +
        (needsParens ? ")" : "") +
        result.slice(template.getEnd());
    }

    return result;
  }

  return function toJsxWithMappings(code: string): { code: string; mappings: MappingResult; errors: TransformError[] } {
    const errors: TransformError[] = [];
    const codeResult = toJsx(code);
    const mappings = computeMappings(code, codeResult);
    return { code: codeResult, mappings, errors };
  };
}
