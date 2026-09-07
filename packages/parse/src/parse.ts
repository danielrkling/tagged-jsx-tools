import { ParseJSXError } from "./error";
import {
  StringToken,
  CLOSE_TAG_TOKEN,
  EQUALS_TOKEN,
  EqualsToken,
  EXPRESSION_TOKEN,
  ExpressionToken,
  TAG_NAME_TOKEN,
  PROP_NAME_TOKEN,
  OPEN_TAG_TOKEN,
  SLASH_TOKEN,
  SPREAD_TOKEN,
  SpreadToken,
  TEXT_TOKEN,
  Token,
  OpenTagToken,
  CloseTagToken,
  SlashToken,
  TagNameToken,
  PropNameToken,
  TextToken,
  STRING_TOKEN,
  BaseToken,
  WHITESPACE_TOKEN,
  COMMENT_END_TOKEN,
  COMMENT_START_TOKEN,
  CommentEndToken,
  CommentStartToken,
  UNEXPECTED_CHARACTER_TOKEN,
  UnexpectedCharacterToken,
} from "./tokenize";

// Node type constants
export const ROOT_NODE = "ROOT";
export const ELEMENT_NODE = "ELEMENT";
export const TEXT_NODE = "TEXT";
export const EXPRESSION_NODE = "EXPRESSION";
export const COMMENT_NODE = "COMMENT";

// Prop type constants
export const BOOLEAN_PROP = "BOOLEAN";
export const STRING_PROP = "STRING";
export const EXPRESSION_PROP = "EXPRESSION";
export const SPREAD_PROP = "SPREAD";

export type NodeType =
  | typeof ROOT_NODE
  | typeof ELEMENT_NODE
  | typeof TEXT_NODE
  | typeof EXPRESSION_NODE
  | typeof COMMENT_NODE;
export type PropType =
  | typeof BOOLEAN_PROP
  | typeof STRING_PROP
  | typeof EXPRESSION_PROP
  | typeof SPREAD_PROP

export type ChildNode = ElementNode | TextNode | ExpressionNode | CommentNode;

export interface RootNode {
  type: typeof ROOT_NODE;
  children: ChildNode[];
}

export interface ElementNode {
  type: typeof ELEMENT_NODE;
  name: string | number;
  props: PropNode[];
  children: ChildNode[];
  comments: CommentNode[];
  tokens: {
    openTag: {
      open: OpenTagToken;
      name: TagNameToken;
      slash?: SlashToken;
      close: CloseTagToken;
    };
    closeTag?: {
      open: OpenTagToken;
      slash: SlashToken;
      name: TagNameToken | ExpressionToken;
      close: CloseTagToken;
    };
  };
}

export interface TextNode {
  type: typeof TEXT_NODE;
  value: string;
  tokens: {
    text: TextToken;
  };
}

export interface ExpressionNode {
  type: typeof EXPRESSION_NODE;
  value: number;
  tokens: {
    expression: ExpressionToken;
  };
}

export interface CommentNode {
  type: typeof COMMENT_NODE;
  children: (TextNode | ExpressionNode)[];
  followsNewline?: boolean;
  tokens: {
    start: CommentStartToken;
    end: CommentEndToken;
  };
}

export interface BooleanProp {
  name: string;
  type: typeof BOOLEAN_PROP;
  value: boolean;
  tokens: {
    name: PropNameToken;
  };
}

export interface StringProp {
  name: string;
  type: typeof STRING_PROP;
  value: string;
  tokens: {
    name: PropNameToken;
    equals: EqualsToken;
    string: StringToken;
  };
}

export interface ExpressionProp {
  name: string;
  type: typeof EXPRESSION_PROP;
  value: number;
  tokens: {
    name: PropNameToken;
    equals: EqualsToken;
    expression: ExpressionToken;
  };
}

export interface SpreadProp {
  type: typeof SPREAD_PROP;
  value: number;
  tokens: {
    spread: SpreadToken;
    expression: ExpressionToken;
  };
}

export type PropNode = BooleanProp | StringProp | ExpressionProp | SpreadProp;

export const parse = (tokens: Token[], rawStrings?: string[]): RootNode => {
  const root: RootNode = { type: ROOT_NODE, children: [] };
  const stack: (RootNode | ElementNode)[] = [root];
  let pos = 0;
  const len = tokens.length;

  const checkFollowsNewline = (token: CommentStartToken): boolean => {
    if (!rawStrings) return false;
    const raw = rawStrings[token.segment];
    if (!raw) return false;
    for (let i = token.start - 1; i >= 0; i--) {
      const ch = raw[i];
      if (ch === "\n") return true;
      if (ch !== " " && ch !== "\t") return false;
    }
    return false;
  };

  while (pos < len) {
    const token = tokens[pos];
    const parent = stack[stack.length - 1];

    switch (token.type) {
      case TEXT_TOKEN: {
        // --- TEXT ---
        const value = token.value;
        // if (value.trim() === "") {
        //   const prevType = tokens[pos - 1]?.type;
        //   const nextType = tokens[pos + 1]?.type;
        //   // Filter out empty text nodes between tags
        //   if (prevType === CLOSE_TAG_TOKEN || nextType === OPEN_TAG_TOKEN) {
        //     pos++;
        //     continue;
        //   }
        // }
        parent.children.push({
          type: TEXT_NODE,
          value,
          tokens: { text: token },
        });
        pos++;
        continue;
      }

      case WHITESPACE_TOKEN:
        pos++;
        continue;

      case EXPRESSION_TOKEN: {
        // --- EXPRESSION ---
        parent.children.push({
          type: EXPRESSION_NODE,
          value: token.value,
          tokens: { expression: token },
        });
        pos++;
        continue;
      }

      case OPEN_TAG_TOKEN: {
        pos++;
        while (tokens[pos]?.type === WHITESPACE_TOKEN) pos++;
        const nextToken = tokens[pos];
        if (!nextToken) {
          throw new ParseJSXError("Expected tag name or '/' after '<'");
        }

        // Handle Closing Tag: </name>
        if (nextToken.type === SLASH_TOKEN) {
          pos++;
          while (tokens[pos]?.type === WHITESPACE_TOKEN) pos++;
          const nameToken = tokens[pos];
          pos++;
          // Skip whitespace between the closing name and '>'
          while (tokens[pos]?.type === WHITESPACE_TOKEN) pos++;
          const closeToken = tokens[pos];
          const currentParent = stack[stack.length - 1] as ElementNode;
          if (
            stack.length > 1 &&
            closeToken?.type === CLOSE_TAG_TOKEN &&
            ((nameToken?.type === TAG_NAME_TOKEN &&
              currentParent.name === (nameToken as TagNameToken).value) ||
              (nameToken?.type === EXPRESSION_TOKEN &&
                typeof currentParent.name === "number"))
          ) {
            stack.pop();
            pos++;
            continue;
          }
          throw new ParseJSXError("Mismatched closing tag", token);
        }

        // Handle Opening Tag: <name ...>
        else if (
          nextToken.type === TAG_NAME_TOKEN ||
          nextToken.type === EXPRESSION_TOKEN
        ) {
          const tagName = nextToken.value;
          const node = {
            type: ELEMENT_NODE,
            name: tagName,
            props: [],
            children: [],
            comments: [],
            tokens: {
              openTag: {
                open: token,
                name: nextToken,
                close: undefined as CloseTagToken | undefined,
              },
            },
          } as ElementNode;
          parent.children.push(node);
          pos++; // Consume tag name

          // --- Attribute Parsing Loop ---
          while (pos < len) {
            const attrToken = tokens[pos];
            if (attrToken.type === WHITESPACE_TOKEN) {
              pos++;
              continue;
            }
            if (
              attrToken.type === CLOSE_TAG_TOKEN ||
              attrToken.type === SLASH_TOKEN
            ) {
              break; // End of attributes
            }

            if (attrToken.type === SPREAD_TOKEN) {
              const expr = tokens[pos + 1];
              if (expr?.type === EXPRESSION_TOKEN) {
                node.props.push({
                  type: SPREAD_PROP,
                  value: expr.value,
                  tokens: {
                    spread: attrToken,
                    expression: expr,
                  },
                });
                pos += 2; // Consume '...' and expression
              } else {
                throw new ParseJSXError(
                  `Spread operator must be followed by an expression.`,
                  attrToken,
                );
              }
            } else if (attrToken.type === PROP_NAME_TOKEN) {
              const name = attrToken.value;
              // Skip whitespace between the prop name and '='
              let ni = pos + 1;
              while (tokens[ni]?.type === WHITESPACE_TOKEN) ni++;
              const next = tokens[ni];

              if (next?.type === EQUALS_TOKEN) {
                const equalsToken = next;
                pos = ni + 1; // Consume name, whitespace and '='
                // Skip whitespace between '=' and the value
                while (tokens[pos]?.type === WHITESPACE_TOKEN) pos++;
                const valToken = tokens[pos];
                if (valToken.type === EXPRESSION_TOKEN) {
                  node.props.push({
                    name,
                    type: EXPRESSION_PROP,
                    value: valToken.value,
                    tokens: {
                      name: attrToken as PropNameToken,
                      equals: equalsToken,
                      expression: valToken,
                    },
                  });
                  pos++;
                } else if (valToken.type === STRING_TOKEN) {
                  if (valToken.end - valToken.start !== valToken.value.length + 2) {
                    throw new ParseJSXError(
                      "Unterminated string literal",
                      valToken,
                    );
                  }
                  node.props.push({
                    name,
                    type: STRING_PROP,
                    value: valToken.value,
                    tokens: {
                      name: attrToken as PropNameToken,
                      equals: equalsToken,
                      string: valToken,
                    },
                  });
                  pos++;
                } else {
                  throw new ParseJSXError(
                    `Expected attribute value after "="`,
                    valToken,
                  );
                }
              } else {
                // Boolean prop
                node.props.push({
                  type: BOOLEAN_PROP,
                  name,
                  value: true,
                  tokens: {
                    name: attrToken as PropNameToken,
                  },
                });
                pos++;
              }
            } else if (attrToken.type === COMMENT_START_TOKEN) {
              const children = [] as (TextNode | ExpressionNode)[];
              pos++; // Consume COMMENT_START_TOKEN
              while (tokens[pos]?.type !== COMMENT_END_TOKEN && pos < len) {
                const token = tokens[pos] as TextToken | ExpressionToken;
                if (token.type === TEXT_TOKEN) {
                  children.push({
                    type: TEXT_NODE,
                    value: token.value,
                    tokens: { text: token },
                  });
                } else if (token.type === EXPRESSION_TOKEN) {
                  children.push({
                    type: EXPRESSION_NODE,
                    value: token.value,
                    tokens: { expression: token },
                  });
                }
                pos++;
              }
              node.comments.push({
                type: COMMENT_NODE,
                children,
                followsNewline: checkFollowsNewline(attrToken),
                tokens: {
                  start: attrToken,
                  end: tokens[pos] as CommentEndToken,
                },
              });
              pos++; // Consume COMMENT_END_TOKEN
            } else {
              throw new ParseJSXError(
                `Invalid attribute: unexpected ${attrToken.type}.`,
                attrToken as BaseToken,
              );
            }
          }

          // --- Tag Closing Logic ---
          const endToken = tokens[pos];
          if (endToken.type === SLASH_TOKEN) {
            // Self-closing: <div/>
            node.tokens.openTag.slash = endToken;
            node.tokens.openTag.close = tokens[pos + 1] as CloseTagToken;
            pos += 2; // Consume '/' and '>'
          } else if (endToken.type === CLOSE_TAG_TOKEN) {
            // Opening: <div>
            node.tokens.openTag.close = endToken;
            pos++; // Consume '>'
            stack.push(node);
          }
          continue;
        } else {
          throw new ParseJSXError(
            `Expected tag name after "<"`,
            token,
          );
        }
      }

      case UNEXPECTED_CHARACTER_TOKEN: {
        throw new ParseJSXError(
          `Unexpected character: ${(token as UnexpectedCharacterToken).value}`,
          token as UnexpectedCharacterToken,
        );
      }

      case COMMENT_START_TOKEN: {
        const children = [] as (TextNode | ExpressionNode)[];
        pos++; // Consume COMMENT_START_TOKEN
        while (tokens[pos]?.type !== COMMENT_END_TOKEN && pos < len) {
          const token = tokens[pos] as TextToken | ExpressionToken;
          if (token.type === TEXT_TOKEN) {
            children.push({
              type: TEXT_NODE,
              value: token.value,
              tokens: { text: token },
            });
          } else if (token.type === EXPRESSION_TOKEN) {
            children.push({
              type: EXPRESSION_NODE,
              value: token.value,
              tokens: { expression: token },
            });
          }
          pos++;
        }
        parent.children.push({
          type: COMMENT_NODE,
          children,
          tokens: {
            start: token,
            end: tokens[pos] as CommentEndToken,
          },
        });
        pos++; // Consume COMMENT_END_TOKEN
        continue;
      }

      default:
        throw new ParseJSXError(
          `Unexpected token: ${JSON.stringify(token)}`,
          token as BaseToken,
        );
    }
  }

  if (stack.length > 1) {
    const unclosedTags = stack
      .slice(1)
      .map((n) => (n as ElementNode).name)
      .join(", ");
    throw new ParseJSXError(`Unclosed tag found: <${unclosedTags}>`);
  }

  return root;
};
