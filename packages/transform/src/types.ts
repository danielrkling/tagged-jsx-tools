import type * as ts from "typescript";
import type { ExpressionToken } from "@tagged-jsx/parse";

export interface ToTaggedCallbackOptions {
  expression: ts.Expression;
  propName?: string;
  propType: "attribute" | "child";
  sourceCode: string;
}

export interface ToJsxCallbackOptions {
  expression: ts.Expression;
  propName?: string;
  propType: "attribute" | "child";
  templateNode: ExpressionToken;
  sourceCode: string;
}

export interface TransformError {
  start: number;
  end: number;
  message: string;
}

export interface CreateTaggedTransformerOptions {
  /** The tag name that wraps converted templates, e.g. `html`. */
  tag: string;
  ts: typeof ts;
  callbacks?: TransformerCallbacks;
  /**
   * Component names emitted as literal tag names in tagged templates instead
   * of ${...} expressions. The runtime resolves these from its component
   * registry. Names are matched exactly (e.g. "Form.Field", "Button").
   */
  registeredComponents?: string[];
}

export interface CreateJsxTransformerOptions {
  /** Tag names whose tagged templates are converted to JSX, e.g. `["html", "jsx"]`. */
  tags: string[];
  ts: typeof ts;
  callbacks?: TransformerCallbacks;
}

export interface TransformerCallbacks {
  toTagged?: (opts: ToTaggedCallbackOptions) => string;
  toJSX?: (opts: ToJsxCallbackOptions) => string;
}
