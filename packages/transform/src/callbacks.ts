import * as ts from "typescript";
import type { TransformerCallbacks } from "./types";

function isPrimitiveExpression(node: ts.Expression): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.UndefinedKeyword
  );
}

function shouldSkipProp(propName?: string): boolean {
  if (!propName) return false;
  return propName === "ref" || propName.startsWith("on");
}

export function createExpressionTransformCallbacks(_ts: typeof ts): TransformerCallbacks {
  return {
    toTagged: ({ expression, propName, propType, sourceCode }) => {
      if (shouldSkipProp(propName)) {
        return sourceCode.slice(expression.getStart(), expression.getEnd());
      }

      if (isPrimitiveExpression(expression)) {
        return sourceCode.slice(expression.getStart(), expression.getEnd());
      }

      // Don't wrap arrow functions (they already have their own parameters)
      if (ts.isArrowFunction(expression)) {
        return sourceCode.slice(expression.getStart(), expression.getEnd());
      }

      // Wrap all non-primitive, non-arrow-function expressions
      const text = sourceCode.slice(expression.getStart(), expression.getEnd());
      // An object literal would be parsed as the arrow's block body
      // (e.g. `() => {class: "x"}`), so parenthesize it.
      if (ts.isObjectLiteralExpression(expression)) {
        return `() => (${text})`;
      }
      return `() => ${text}`;
    },

    toJSX: ({ expression, propName, propType, sourceCode }) => {
      if (shouldSkipProp(propName)) {
        return sourceCode.slice(expression.getStart(), expression.getEnd());
      }

      if (isPrimitiveExpression(expression)) {
        return sourceCode.slice(expression.getStart(), expression.getEnd());
      }

      // Unwrap () => if it's an arrow function with no params
      if (!ts.isArrowFunction(expression) || expression.parameters.length > 0) {
        return sourceCode.slice(expression.getStart(), expression.getEnd());
      }

      // Don't unwrap if body is a block statement
      const body = expression.body;
      if (ts.isBlock(body)) {
        return sourceCode.slice(expression.getStart(), expression.getEnd());
      }

      // Restore bare object literals: () => ({a: 1}) -> {a: 1}
      if (
        ts.isParenthesizedExpression(body) &&
        ts.isObjectLiteralExpression(body.expression)
      ) {
        return body.expression.getText();
      }

      // Unwrap - remove the () => prefix
      const text = expression.getText();
      return text.replace(/^\(\)\s*=>\s*/, "");
    },
  };
}
