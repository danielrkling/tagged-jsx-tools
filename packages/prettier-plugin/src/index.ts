import type { Plugin, Options } from "prettier";
import tsParser from "prettier/parser-typescript";
import babelParser from "prettier/parser-babel";
import * as embedPlugin from "prettier-plugin-embed";
import {
  printTaggedTemplate,
  getTaggedTemplateName,
  isInsideTaggedTemplate,
  type PluginOptions,
} from "./jsx-printer";

const DEFAULT_TAGS = ["jsx"];

const createPlugin = (
  tags: string[] = DEFAULT_TAGS,
  useCallbacks: boolean = false,
): Plugin => {
  const embedEstree =
    (embedPlugin as any).printers?.estree ||
    (embedPlugin as any).default?.printers?.estree;
  const plugin: Plugin = {
    parsers: {
      babel: {
        ...babelParser.parsers.babel,
        astFormat: "estree",
      },
      typescript: {
        ...tsParser.parsers.typescript,
        astFormat: "estree",
      },
    },
    printers: {
      estree: {
        ...embedEstree,
        embed(path, options) {
          const node = path.node as any;

          const tagName = getTaggedTemplateName(node);
          if (tagName && tags.includes(tagName)) {
            return (textToDoc, print, path) =>
              printTaggedTemplate(
                node,
                textToDoc,
                print,
                path,
                options as PluginOptions,
              );
          }

          if (isInsideTaggedTemplate(path, tags)) {
            return null;
          }

          if (embedEstree && embedEstree.embed) {
            return embedEstree.embed(path, options);
          }
          return null;
        },
      },
    },
  };
  return plugin;
};

const plugin = createPlugin(DEFAULT_TAGS);

export default plugin;
export { createPlugin };
export type { PluginOptions };

// Export a factory function that creates a plugin with callbacks enabled
export function createPluginWithCallbacks(tags?: string[]): Plugin {
  return createPlugin(tags || DEFAULT_TAGS, true);
}
