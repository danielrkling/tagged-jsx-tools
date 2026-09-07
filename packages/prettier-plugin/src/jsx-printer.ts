import type { Options } from "prettier";
import { builders as docBuilders } from "prettier/doc";
import {
  tokenize,
  parse,
  type RootNode,
  type ElementNode,
  type ChildNode,
} from "@tagged-jsx/parse";

const {
  group,
  indent,
  softline,
  hardline,
  line: docLine,
  join: docJoin,
  ifBreak,
  fill,
  conditionalGroup,
} = docBuilders;

export interface PluginOptions extends Options {
  embeddedJsxTags?: string[];
  useCallbacks?: boolean;
}

/**
 * Local willBreak implementation (not exported by prettier/doc builders).
 * Checks whether a doc contains a hardline / already-broken group.
 */
const isHardLine = (doc: any): boolean => {
  if (!doc) return false;
  if (Array.isArray(doc)) return doc.some(isHardLine);
  if (typeof doc !== "object") return false;
  if (doc.type === "line" && doc.hard) return true;
  if (doc.type === "break-parent") return true;
  return false;
};
const localWillBreak = (doc: any): boolean => {
  if (!doc || typeof doc !== "object") return false;
  if (Array.isArray(doc)) return doc.some(localWillBreak);
  if (isHardLine(doc)) return true;
  if ((doc.type === "group" || doc.type === "fill") && doc.shouldBreak) {
    return true;
  }
  if (doc.type === "group" || doc.type === "indent") {
    return localWillBreak(doc.contents);
  }
  if (doc.type === "fill") {
    return (doc.parts ?? []).some(localWillBreak);
  }
  return false;
};

// --- Ported from prettier's src/language-js/print/jsx.js (printJsxChildren) ---
// JSX whitespace is only space, LF, CR and TAB.

type TextTokenPart = { ws: boolean; value: string };

const splitJsxText = (text: string): TextTokenPart[] => {
  const out: TextTokenPart[] = [];
  const re = /([ \t\r\n]+)|([^ \t\r\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ ws: !!m[1], value: m[1] ?? m[2] });
  }
  return out;
};

/**
 * Meaningful if it contains a non-whitespace character,
 * or it contains whitespace without a newline.
 */
const isMeaningfulText = (value: string): boolean =>
  /\S/.test(value) || !/\n/.test(value);

const RAW_JSX_WHITESPACE = '${" "}';
// Single identity-stable whitespace doc (prints as `${" "}` when breaking).
const wsDoc: any = ifBreak([RAW_JSX_WHITESPACE, softline], " ");

const isEmptyStringOrAnyLine = (doc: any) =>
  doc === "" || doc === docLine || doc === hardline || doc === softline;

/**
 * Produces fill()-compatible docs for children following the exact rules of
 * prettier's printJsxChildren:
 * - meaningful text keeps its words separated by `line`
 * - boundary whitespace without newline becomes the `whitespace` doc
 *   (prints as `${" "}` when breaking)
 * - a separator after a child followed by meaningful text is `softline`,
 *   otherwise `hardline`
 * - blank lines between children are preserved (up to one)
 */
const childrenToFillParts = (
  allChildren: ChildNode[],
  printChild: (child: ChildNode) => any,
): { parts: any[]; containsMeaningfulText: boolean } => {
  const parts: any[] = [""];
  const push = (doc: any) => {
    parts.push([parts.pop(), doc]);
  };
  const pushLine = (doc: any) => {
    if (doc === "") return;
    parts.push(doc, "");
  };

  let containsMeaningfulText = false;

  for (let ci = 0; ci < allChildren.length; ci++) {
    const child = allChildren[ci];
    const next = allChildren[ci + 1];

    if (child.type === "TEXT") {
      const text = child.value;

      // Whitespace-only text node.
      if (!/\S/.test(text)) {
        // Keep (up to one) blank line between tags/expressions/text.
        if ((text.match(/\n/g) || []).length > 1) {
          pushLine(hardline);
        } else if (!/\n/.test(text)) {
          // Significant space without newline counts as meaningful text
          // and must emit the `whitespace` doc.
          pushLine(wsDoc);
          containsMeaningfulText = true;
        }
        continue;
      }
      containsMeaningfulText = true;

      const tokens = splitJsxText(text);

      // Starts with whitespace.
      let startIdx = 0;
      if (tokens.length > 0 && tokens[0].ws) {
        pushLine(/\n/.test(tokens[0].value) ? hardline : wsDoc);
        startIdx = 1;
      }

      // Ends with whitespace.
      let endIdx = tokens.length;
      let trailingWsToken: TextTokenPart | undefined;
      if (tokens.length - startIdx >= 2 && tokens[tokens.length - 1].ws) {
        trailingWsToken = tokens[tokens.length - 1];
        endIdx--;
      }

      for (let ti = startIdx; ti < endIdx; ti++) {
        const t = tokens[ti];
        if (t.ws) pushLine(docLine);
        else push(t.value);
      }

      if (trailingWsToken !== undefined) {
        pushLine(/\n/.test(trailingWsToken.value) ? hardline : wsDoc);
      } else {
        // No trailing whitespace before an adjacent sibling element/expr.
        pushLine(softline);
      }
      continue;
    }

    // Non-text child (element / expression / comment).
    push(printChild(child));

    const directlyFollowedByMeaningfulText =
      !!next && next.type === "TEXT" && isMeaningfulText(next.value);

    pushLine(directlyFollowedByMeaningfulText ? softline : hardline);
  }

  return { parts, containsMeaningfulText };
};

/**
 * Cleanup + trimming + multiline transformation, ported from prettier's
 * printJsxElementInternal. Returns the content doc for a broken element plus
 * the cleaned single-line parts and whether breaking is forced.
 */
const assembleChildContent = (
  rawParts: any[],
  containsMeaningfulText: boolean,
  extraForcedBreak: boolean,
): { content: any; cleanedParts: any[]; forcedBreak: boolean } => {
  const children = [...rawParts];

  // We can end up with multiple whitespace elements with empty string
  // content between them; remove redundant empties/lines like prettier does.
  for (let i = children.length - 2; i >= 0; i--) {
    const isPairOfEmptyStrings = children[i] === "" && children[i + 1] === "";
    const isPairOfHardlines =
      children[i] === hardline &&
      children[i + 1] === "" &&
      children[i + 2] === hardline;
    const isLineFollowedByWhitespace =
      (children[i] === softline || children[i] === hardline) &&
      children[i + 1] === "" &&
      children[i + 2] === wsDoc;
    const isWhitespaceFollowedByLine =
      children[i] === wsDoc &&
      children[i + 1] === "" &&
      (children[i + 2] === softline || children[i + 2] === hardline);
    const isDoubleWhitespace =
      children[i] === wsDoc &&
      children[i + 1] === "" &&
      children[i + 2] === wsDoc;
    const isPairOfHardOrSoftLines =
      (children[i] === softline &&
        children[i + 1] === "" &&
        children[i + 2] === hardline) ||
      (children[i] === hardline &&
        children[i + 1] === "" &&
        children[i + 2] === softline);

    if (
      (isPairOfHardlines && containsMeaningfulText) ||
      isPairOfEmptyStrings ||
      isLineFollowedByWhitespace ||
      isDoubleWhitespace ||
      isPairOfHardOrSoftLines
    ) {
      children.splice(i, 2);
    } else if (isWhitespaceFollowedByLine) {
      children.splice(i + 1, 2);
    }
  }

  // Trim trailing lines (or empty strings).
  while (children.length > 0 && isEmptyStringOrAnyLine(children.at(-1))) {
    children.pop();
  }

  // Trim leading lines (or empty strings).
  while (
    children.length > 1 &&
    isEmptyStringOrAnyLine(children[0]) &&
    isEmptyStringOrAnyLine(children[1])
  ) {
    children.shift();
    children.shift();
  }

  // Build the multiline content, ensuring fill() rule (line-like doc at odd index).
  const multilineChildren: any[] = [""];
  let forcedBreak = extraForcedBreak;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (child === wsDoc) {
      if (i === 1 && children[i - 1] === "") {
        if (children.length === 2) {
          // Solitary whitespace
          multilineChildren.push([multilineChildren.pop(), RAW_JSX_WHITESPACE]);
          continue;
        }
        // Leading whitespace
        multilineChildren.push([RAW_JSX_WHITESPACE, hardline], "");
        continue;
      } else if (i === children.length - 1) {
        // Trailing whitespace
        multilineChildren.push([multilineChildren.pop(), RAW_JSX_WHITESPACE]);
        continue;
      } else if (children[i - 1] === "" && children[i - 2] === hardline) {
        // Whitespace after line break
        multilineChildren.push([multilineChildren.pop(), RAW_JSX_WHITESPACE]);
        continue;
      }
    }

    if (i % 2 === 0) {
      // non-line-like
      multilineChildren.push([multilineChildren.pop(), child]);
    } else {
      // line-like
      multilineChildren.push(child, "");
    }

    if (localWillBreak(child)) {
      forcedBreak = true;
    }
  }

  // If there is text we use `fill` to fit as much onto each line as possible.
  // When there is no text (just tags and expressions) we use `group`
  // to output each on a separate line.
  const content = containsMeaningfulText
    ? fill(multilineChildren)
    : group(multilineChildren, { shouldBreak: true });

  return { content, cleanedParts: children, forcedBreak };
};

export const printJsx = (
  node: RootNode,
  printExpression: (idx: number) => any,
  options: PluginOptions,
): any => {
  const printNonTextChild = (child: ChildNode): any => {
    if (child.type === "EXPRESSION") {
      const printed = printExpression(child.value as number);
      return ["${", printed, "}"];
    }
    if (child.type === "ELEMENT") {
      return printElement(child);
    }
    if (child.type === "COMMENT") {
      const parts: any[] = ["<!--"];
      for (const c of child.children) {
        if (c.type === "TEXT") {
          parts.push(c.value.trim());
        } else if (c.type === "EXPRESSION") {
          const printed = printExpression(c.value as number);
          parts.push(["${", printed, "}"]);
        }
      }
      parts.push("-->");
      return parts;
    }
    // Meaningful text should never reach here, but be safe.
    return child.value;
  };

  /**
   * Formats a list of children into the prettier JSX style:
   * single-line form via conditionalGroup when possible,
   * multiline fill/group form otherwise.
   */
  const formatChildrenList = (
    allChildren: ChildNode[],
    openingExtraForcedBreak: boolean,
  ): { doc: any; parts: any[]; content: any; forcedBreak: boolean } => {
    const containsTag = allChildren.some((c) => c.type === "ELEMENT");
    const containsMultipleExpressions =
      allChildren.filter((c) => c.type === "EXPRESSION").length > 1;

    let forcedBreak =
      containsTag || containsMultipleExpressions || openingExtraForcedBreak;

    const { parts: rawParts, containsMeaningfulText } = childrenToFillParts(
      allChildren,
      printNonTextChild,
    );

    const { content, cleanedParts, forcedBreak: contentForced } =
      assembleChildContent(rawParts, containsMeaningfulText, forcedBreak);

    forcedBreak = forcedBreak || contentForced;

    if (cleanedParts.length === 0) {
      return { doc: "", parts: cleanedParts, content, forcedBreak };
    }

    return {
      doc: [indent([hardline, content]), hardline],
      parts: cleanedParts,
      content,
      forcedBreak,
    };
  };

  const printElement = (el: ElementNode): any => {
    const tagNameDoc =
      typeof el.name === "number"
        ? ["${", printExpression(el.name), "}"]
        : el.name;
    const props = el.props;
    const elChildren = el.children;
    const isSelfClosing =
      elChildren.every(
        (c: ChildNode) => c.type === "TEXT" && !/\S/.test(c.value),
      ) || !!el.tokens.openTag.slash;

    const attrDocs: any[] = [];
    for (let pi = 0; pi < props.length; pi++) {
      const prop = props[pi];
      if (prop.type === "BOOLEAN") {
        attrDocs.push(prop.name);
      } else if (prop.type === "STRING") {
        const quote = prop.value.includes('"') ? "'" : '"';
        attrDocs.push(`${prop.name}=${quote}${prop.value}${quote}`);
      } else if (prop.type === "EXPRESSION") {
        const printed = printExpression(Number(prop.value));
        attrDocs.push([prop.name, "=${", printed, "}"]);
      } else if (prop.type === "SPREAD") {
        const printed = printExpression(Number(prop.value));
        attrDocs.push(["${", printed, "}"]);
      }
    }

    const commentDocs = el.comments.map((c) => {
      const isLine = c.tokens.start.value === "//";
      const parts: any[] = [];
      for (const child of c.children) {
        if (child.type === "TEXT") {
          parts.push(isLine ? child.value.trim() : child.value);
        } else if (child.type === "EXPRESSION") {
          parts.push(["${", printExpression(child.value as number), "}"]);
        }
      }
      if (isLine) {
        return ["// ", ...parts];
      }
      return ["/*", ...parts, "*/"];
    });

    const positioned: any[] = [];
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      const firstToken =
        (prop as any).type === "SPREAD"
          ? (prop as any).tokens.spread
          : (prop as any).tokens.name;
      positioned.push({
        pos: [firstToken.segment, firstToken.start],
        type: "attr",
        doc: attrDocs[i],
      });
    }
    for (let i = 0; i < el.comments.length; i++) {
      const c = el.comments[i];
      positioned.push({
        pos: [c.tokens.start.segment, c.tokens.start.start],
        type: "comment",
        isLine: c.tokens.start.value === "//",
        followsNewline: !!c.followsNewline,
        doc: commentDocs[i],
      });
    }
    positioned.sort(
      (a: any, b: any) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1],
    );

    // Line comments on same line as preceding attr stay there; on own line stay separate
    const allAttrDocs: any[] = [];
    for (let i = 0; i < positioned.length; i++) {
      const item = positioned[i];
      if (
        item.type === "comment" &&
        item.isLine &&
        !item.followsNewline &&
        allAttrDocs.length > 0
      ) {
        allAttrDocs[allAttrDocs.length - 1] = [
          allAttrDocs[allAttrDocs.length - 1],
          " ",
          item.doc,
        ];
      } else {
        allAttrDocs.push(item.doc);
      }
    }
    const hasComment = el.comments.length > 0;
    const containsMultipleAttributes = props.length > 1;

    const openTag = group(
      [
        "<",
        tagNameDoc,
        allAttrDocs.length
          ? [indent([docLine, docJoin(docLine, allAttrDocs)]), softline]
          : [],
        isSelfClosing ? [ifBreak("", " "), "/>"] : ">",
      ],
      hasComment ? { shouldBreak: true } : undefined,
    );

    if (isSelfClosing) return openTag;

    const { content, parts: childParts, forcedBreak } = formatChildrenList(
      elChildren,
      containsMultipleAttributes,
    );

    const closingTag = ["</", tagNameDoc, ">"];

    const multilineElem = group([
      openTag,
      indent([hardline, content]),
      hardline,
      closingTag,
    ]);

    if (forcedBreak) {
      return multilineElem;
    }

    // Like prettier, prefer the single-line form when it fits.
    return conditionalGroup([
      group([openTag, ...childParts, closingTag]),
      multilineElem,
    ]);
  };

  // Root level: treat like a fragment between the backticks.
  const allChildren = node.children as ChildNode[];
  if (allChildren.length === 1 && allChildren[0].type === "ELEMENT") {
    return printElement(allChildren[0] as ElementNode);
  }

  {
    const { parts: rawParts, containsMeaningfulText } = childrenToFillParts(
      allChildren,
      printNonTextChild,
    );

    const { content, cleanedParts, forcedBreak } = assembleChildContent(
      rawParts,
      containsMeaningfulText,
      false,
    );

    if (cleanedParts.length === 0) return "";

    const multilineForm = group([indent([hardline, content]), hardline]);

    if (forcedBreak) return multilineForm;

    return conditionalGroup([group([...cleanedParts]), multilineForm]);
  }
};

/**
 * Shared embed callback body: parses the tagged template's quasi strings with
 * @tagged-jsx/parse and prints them using the shared JSX printer.
 */
export const printTaggedTemplate = async (
  node: any,
  textToDoc: any,
  print: (path?: any) => any,
  path: any,
  options: PluginOptions,
): Promise<any> => {
  const rawStrings = node.quasi.quasis.map((q: any) => q.value.raw);
  const templateStrings = Object.assign(rawStrings, { raw: rawStrings });

  const tokens = tokenize(templateStrings as any);
  const ast = parse(tokens, rawStrings);

  const printExpression = (idx: number) => {
    return path.call(print, "quasi", "expressions", idx);
  };

  return [
    print("tag"),
    "`",
    printJsx(ast, printExpression, options),
    "`",
  ];
};

export const getTaggedTemplateName = (node: any): string | undefined => {
  if (node.type !== "TaggedTemplateExpression") return undefined;
  return node.tag.type === "Identifier"
    ? node.tag.name
    : node.tag.property?.name;
};

export const isInsideTaggedTemplate = (path: any, tags: string[]): boolean => {
  const parent = path.parent;
  if (parent?.type !== "TaggedTemplateExpression") return false;
  const tagName =
    parent.tag.type === "Identifier"
      ? parent.tag.name
      : parent.tag.property?.name;
  return !!tagName && tags.includes(tagName);
};
