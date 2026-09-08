import type * as tsModule from "typescript";
import { computeMappings } from "./mappings";
import type { MappingResult } from "./mappings";
import type {
  TransformerCallbacks,
  ToTaggedCallbackOptions,
  CreateTaggedTransformerOptions,
} from "./types";

export function createTaggedTransformer(options: CreateTaggedTransformerOptions) {
  const {
    tag,
    ts,
    callbacks: globalCallbacks,
    registeredComponents = [],
  } = options;
  function toTagged(code: string, callbacks?: TransformerCallbacks): string {
    const activeCallbacks = callbacks || globalCallbacks;
    let result = code;
    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      iterations++;

      const sourceFile = ts.createSourceFile(
        "test.tsx",
        result,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      const jsxElement = findFirstJSXElement(sourceFile);

      if (!jsxElement) {
        break;
      }

      let inner = "";
      if (ts.isJsxElement(jsxElement)) {
        inner = convertJsxElementToString(jsxElement, sourceFile, activeCallbacks);
      } else if (ts.isJsxSelfClosingElement(jsxElement)) {
        inner = convertJsxSelfClosingToString(jsxElement, sourceFile, activeCallbacks);
      } else if (ts.isJsxFragment(jsxElement)) {
        inner = convertJsxFragmentToString(jsxElement, sourceFile, activeCallbacks);
      }

      const replacement = `${tag}\`${inner}\``;

      result =
        result.slice(0, jsxElement.getStart()) +
        replacement +
        result.slice(jsxElement.getEnd());
    }

    return result;
  }

  function toTaggedWithMappings(code: string, callbacks?: TransformerCallbacks): { code: string; mappings: MappingResult } {
    const codeResult = toTagged(code, callbacks);
    const mappings = computeMappings(code, codeResult);
    return { code: codeResult, mappings };
  }

  function findFirstJSXElement(
    node: tsModule.Node,
  ): tsModule.JsxElement | tsModule.JsxSelfClosingElement | tsModule.JsxFragment | undefined {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      return node as tsModule.JsxElement | tsModule.JsxSelfClosingElement | tsModule.JsxFragment;
    }

    return ts.forEachChild(node, findFirstJSXElement);
  }

  function getAttributeName(
    name: tsModule.Identifier | tsModule.JsxNamespacedName,
  ): string {
    if (ts.isIdentifier(name)) {
      return name.text;
    }
    // Namespaced attribute names, e.g. xlink:href
    return `${name.namespace.text}:${name.name.text}`;
  }

  function convertAttributes(
    attributes: tsModule.JsxAttributes,
    sourceFile: tsModule.SourceFile,
    callbacks?: TransformerCallbacks,
  ): string {
    let result = "";

    for (let i = 0; i < attributes.properties.length; i++) {
      const attr = attributes.properties[i];
      const prevAttr = i > 0 ? attributes.properties[i - 1] : undefined;

      // Get the whitespace between previous attribute and this one
      let whitespace = " ";
      if (prevAttr) {
        const prevEnd = prevAttr.getEnd();
        const currStart = attr.getStart();
        if (currStart > prevEnd) {
          whitespace = sourceFile.text.slice(prevEnd, currStart);
        }
      } else {
        // Check whitespace between tag name and first attribute
        const parent = attr.parent; // JsxAttributes
        const openingElement = parent?.parent; // JsxOpeningElement | JsxSelfClosingElement
        if (openingElement) {
          const nameNode = (openingElement as any).tagName;
          if (nameNode) {
            const nameEnd = nameNode.getEnd();
            const attrStart = attr.getStart();
            if (attrStart > nameEnd) {
              whitespace = sourceFile.text.slice(nameEnd, attrStart);
            }
          }
        }
      }

      if (ts.isJsxAttribute(attr)) {
        const name = getAttributeName(attr.name);
        const value = attr.initializer;

        if (value) {
          if (ts.isJsxExpression(value)) {
            const expr = value.expression;
            if (expr) {
              let exprText = sourceFile.text.slice(expr.getStart(), expr.getEnd());
              if (callbacks?.toTagged) {
                exprText = callbacks.toTagged({
                  expression: expr,
                  propName: name,
                  propType: "attribute",
                  sourceCode: sourceFile.text,
                } as ToTaggedCallbackOptions);
              }
              result += `${whitespace}${name}=\${${exprText}}`;
            }
          } else if (ts.isStringLiteral(value)) {
            // Raw JSX attribute strings cannot contain both quote characters,
            // so picking the quote absent from the value is always safe.
            const text = escapeTemplateText(value.text);
            const quote = text.includes('"') ? "'" : '"';
            result += `${whitespace}${name}=${quote}${text}${quote}`;
          }
        } else {
          result += `${whitespace}${name}`;
        }
      } else if (ts.isJsxSpreadAttribute(attr)) {
        const expression = attr.expression;
        let text = sourceFile.text.slice(expression.getStart(), expression.getEnd());
        if (callbacks?.toTagged) {
          text = callbacks.toTagged({
            expression: expression,
            propType: "attribute",
            sourceCode: sourceFile.text,
          } as ToTaggedCallbackOptions);
        }
        result += `${whitespace}...$\{${text}}`;
      }
    }

    return result;
  }

  function convertJsxChildToTagged(
    child: tsModule.JsxChild,
    sourceFile: tsModule.SourceFile,
    callbacks?: TransformerCallbacks,
  ): string {
    if (ts.isJsxElement(child)) {
      return convertJsxElementToString(child, sourceFile, callbacks);
    } else if (ts.isJsxSelfClosingElement(child)) {
      return convertJsxSelfClosingToString(child, sourceFile, callbacks);
    } else if (ts.isJsxFragment(child)) {
      return convertJsxFragmentToString(child, sourceFile, callbacks);
    } else if (ts.isJsxExpression(child)) {
      if (child.expression) {
        let text = sourceFile.text.slice(
          child.expression.getStart(),
          child.expression.getEnd(),
        );
        if (callbacks?.toTagged) {
          text = callbacks.toTagged({
            expression: child.expression,
            propType: "child",
            sourceCode: sourceFile.text,
          } as ToTaggedCallbackOptions);
        }
        return "${" + text + "}";
      }
      const fullText = sourceFile.text.slice(child.getStart(), child.getEnd());
      const inner = fullText.slice(1, -1).trim();
      if (inner.startsWith("/*") && inner.endsWith("*/")) {
        const content = escapeTemplateText(inner.slice(2, -2).trim());
        return content ? `{/* ${content} */}` : "{/**/}";
      }
      return "";
    } else if (ts.isJsxText(child)) {
      return escapeTemplateText(child.getText(sourceFile));
    }

    return "";
  }

  function convertJsxElementChildren(
    node: tsModule.JsxElement,
    sourceFile: tsModule.SourceFile,
    callbacks?: TransformerCallbacks,
  ): string {
    const children = node.children;
    if (children.length === 0) return "";

    let result = "";
    const text = sourceFile.text;

    const openingEnd = node.openingElement.getEnd();
    const firstChild = children[0];
    const firstStart = firstChild.getStart();
    if (firstStart > openingEnd) {
      result += text.slice(openingEnd, firstStart);
    }

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (i > 0) {
        const prevChild = children[i - 1];
        const prevEnd = prevChild.getEnd();
        const currStart = child.getStart();
        if (currStart > prevEnd) {
          result += text.slice(prevEnd, currStart);
        }
      }

      result += convertJsxChildToTagged(child, sourceFile, callbacks);
    }

    return result;
  }

  function getTagNameText(
    tagName: tsModule.JsxTagNameExpression,
    sourceFile: tsModule.SourceFile,
  ): string {
    if (ts.isIdentifier(tagName)) {
      return tagName.text;
    }
    // Member expressions (<Form.Field />) and namespaced names (<svg:use />)
    return tagName.getText(sourceFile);
  }

  // Escapes text emitted into the template literal so template cooking
  // restores the exact source characters (backslash, backtick and ${ would
  // otherwise be cooked/interpolated).
  function escapeTemplateText(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${");
  }

  // Mirrors TypeScript's isIntrinsicJsxName: a tag is intrinsic iff it starts
  // with a lowercase ASCII letter or contains a dash. Everything else is a
  // component reference and must be emitted as ${...} for the runtime to
  // resolve it.
  function isIntrinsicJsxName(name: string): boolean {
    const ch = name.charCodeAt(0);
    return (ch >= 97 && ch <= 122) || name.includes("-");
  }

  function formatTagName(
    tagName: tsModule.JsxTagNameExpression,
    sourceFile: tsModule.SourceFile,
  ): string {
    const text = getTagNameText(tagName, sourceFile);
    // Registered components are emitted as literal tag names so the runtime
    // can resolve them from its component registry.
    if (registeredComponents.includes(text)) {
      return text;
    }
    return isComponent(tagName) ? "${" + text + "}" : text;
  }

  function isComponent(tagName: tsModule.JsxTagNameExpression): boolean {
    if (ts.isIdentifier(tagName)) {
      return !isIntrinsicJsxName(tagName.text);
    }
    // Member expressions are component references in JSX and must be emitted as
    // ${...} so the runtime can evaluate them. Namespaced names are not JS
    // expressions and are kept as literal tag names.
    return ts.isPropertyAccessExpression(tagName);
  }

  function convertJsxElementToString(
    node: tsModule.JsxElement,
    sourceFile: tsModule.SourceFile,
    callbacks?: TransformerCallbacks,
  ): string {
    const openTagName = formatTagName(node.openingElement.tagName, sourceFile);
    const attributes = convertAttributes(
      node.openingElement.attributes,
      sourceFile,
      callbacks,
    );

    const closeTag = formatTagName(node.closingElement.tagName, sourceFile);

    const children = convertJsxElementChildren(node, sourceFile, callbacks);

    return `<${openTagName}${attributes}>${children}</${closeTag}>`;
  }

  function convertJsxSelfClosingToString(
    node: tsModule.JsxSelfClosingElement,
    sourceFile: tsModule.SourceFile,
    callbacks?: TransformerCallbacks,
  ): string {
    const tagStr = formatTagName(node.tagName, sourceFile);
    const attributes = convertAttributes(node.attributes, sourceFile, callbacks);

    // Preserve whitespace between last attribute and />
    let whitespaceBeforeSlash = " ";
    const attrs = node.attributes;
    if (attrs.properties.length > 0) {
      const lastAttr = attrs.properties[attrs.properties.length - 1];
      const lastEnd = lastAttr.getEnd();
      // Find the position of '/' in the source text starting from last attribute end
      const nodeStart = node.getStart();
      const nodeText = sourceFile.text.slice(nodeStart, node.getEnd());
      const slashPos = nodeText.indexOf('/');
      if (slashPos >= 0) {
        const absoluteSlashPos = nodeStart + slashPos;
        if (absoluteSlashPos > lastEnd) {
          whitespaceBeforeSlash = sourceFile.text.slice(lastEnd, absoluteSlashPos);
        }
      }
    }

    return `<${tagStr}${attributes}${whitespaceBeforeSlash}/>`;
  }

  function convertJsxFragmentToString(
    node: tsModule.JsxFragment,
    sourceFile: tsModule.SourceFile,
    callbacks?: TransformerCallbacks,
  ): string {
    const text = sourceFile.text;
    let children = "";

    // Preserve whitespace between opening fragment and first child
    if (node.children.length > 0) {
      const openingEnd = node.openingFragment.getEnd();
      const firstChild = node.children[0];
      const firstStart = firstChild.getStart();
      if (firstStart > openingEnd) {
        children += text.slice(openingEnd, firstStart);
      }
    }

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];

      if (i > 0) {
        const prevChild = node.children[i - 1];
        const prevEnd = prevChild.getEnd();
        const currStart = child.getStart();
        if (currStart > prevEnd) {
          children += text.slice(prevEnd, currStart);
        }
      }

      children += convertJsxChildToTagged(child, sourceFile, callbacks);
    }

    // Preserve whitespace between last child and closing fragment
    if (node.children.length > 0) {
      const lastChild = node.children[node.children.length - 1];
      const lastEnd = lastChild.getEnd();
      const closingStart = node.closingFragment.getStart();
      if (closingStart > lastEnd) {
        children += text.slice(lastEnd, closingStart);
      }
    }

    return `${children}`;
  }

  return toTaggedWithMappings;
}
