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

export interface TransformOptions {
  /**
   * Component names emitted as literal tag names in tagged templates instead
   * of ${...} expressions. The runtime resolves these from its component
   * registry. Names are matched exactly (e.g. "Form.Field", "Button").
   */
  registeredComponents?: string[];
}

export interface TransformerCallbacks {
  toTagged?: (opts: ToTaggedCallbackOptions) => string;
  toJSX?: (opts: ToJsxCallbackOptions) => string;
}
