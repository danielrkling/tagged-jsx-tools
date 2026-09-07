import type { Plugin } from "prettier";
import * as tsParser from "prettier/plugins/typescript";
import * as babelParser from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";
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
  const baseEstree = estreePlugin.printers.estree;
  const plugin: Plugin = {
    parsers: {
      babel: {
        ...(babelParser.parsers?.babel ||
          (babelParser as any).default?.parsers?.babel),
        astFormat: "estree",
      },
      typescript: {
        ...(tsParser.parsers?.typescript ||
          (tsParser as any).default?.parsers?.typescript),
        astFormat: "estree",
      },
    },
    printers: {
      estree: {
        ...baseEstree,
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

          if (baseEstree.embed) {
            return baseEstree.embed(path, options);
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

export function createPluginWithCallbacks(tags?: string[]): Plugin {
  return createPlugin(tags || DEFAULT_TAGS, true);
}
