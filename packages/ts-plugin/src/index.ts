import type * as tsModule from "typescript/lib/tsserverlibrary";
import { createJsxTransformer, getTaggedPosition, getJsxPosition, createExpressionTransformCallbacks } from "@tagged-jsx/transform";

interface JsxAnalysis {
  ls: tsModule.LanguageService;
  mappings: any;
  jsxCode: string;
  originalCode: string;
  originalSourceFile: tsModule.SourceFile;
  scriptVersion: string | undefined;
  templateErrors: tsModule.Diagnostic[];
}

const analysisCache = new Map<string, JsxAnalysis>();
const templateErrorCache = new Map<string, { diag: tsModule.Diagnostic; scriptVersion: string | undefined }>();

function createSyntheticLSHost(
  fileName: string,
  jsxCode: string,
  scriptVersion: string | undefined,
  originalProgram: tsModule.Program,
  ts: typeof tsModule
): tsModule.LanguageServiceHost {
  const compilerOptions = originalProgram.getCompilerOptions();
  const currentDirectory = originalProgram.getCurrentDirectory();
  const defaultLibFileName = ts.getDefaultLibFilePath(compilerOptions);

  const syntheticOptions: tsModule.CompilerOptions = {
    ...compilerOptions,
  };
  if (!syntheticOptions.jsx) {
    syntheticOptions.jsx = ts.JsxEmit.Preserve;
  }
  if (!syntheticOptions.jsxImportSource) {
    syntheticOptions.jsxImportSource = "solid-js";
  }
  if (!syntheticOptions.moduleResolution) {
    syntheticOptions.moduleResolution = ts.ModuleResolutionKind.NodeJs;
  }

  const allRootFiles = originalProgram.getSourceFiles().map(sf => sf.fileName);
  console.error("[tagged-jsx] Synthetic LS host files:", allRootFiles.length, "jsxImportSource:", syntheticOptions.jsxImportSource, "jsx:", syntheticOptions.jsx, "moduleResolution:", syntheticOptions.moduleResolution);

  function getScriptKindFromName(name: string): tsModule.ScriptKind {
    if (name === fileName) return ts.ScriptKind.TSX;
    const ext = name.toLowerCase().split('.').pop();
    if (ext === 'tsx') return ts.ScriptKind.TSX;
    if (ext === 'jsx') return ts.ScriptKind.JSX;
    if (ext === 'mjs') return ts.ScriptKind.JS;
    if (ext === 'cjs') return ts.ScriptKind.JS;
    if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
  }

  return {
    getScriptFileNames: () => allRootFiles,
    getScriptVersion: () => scriptVersion ?? "1",
    getScriptKind: getScriptKindFromName,
    getScriptSnapshot: (name) => {
      if (name === fileName) {
        return ts.ScriptSnapshot.fromString(jsxCode);
      }
      const sf = originalProgram.getSourceFile(name);
      if (sf) return ts.ScriptSnapshot.fromString(sf.getFullText());
      try {
        const fs = require("fs");
        if (fs.existsSync(name)) {
          return ts.ScriptSnapshot.fromString(fs.readFileSync(name, "utf-8"));
        }
      } catch {}
      return undefined;
    },
    getCurrentDirectory: () => currentDirectory,
    getCompilationSettings: () => syntheticOptions,
    getDefaultLibFileName: () => defaultLibFileName,
    fileExists: (name) => {
      if (name === fileName) return true;
      const sf = originalProgram.getSourceFile(name);
      if (sf) return true;
      try {
        return require("fs").existsSync(name);
      } catch {
        return false;
      }
    },
    readFile: (name) => {
      if (name === fileName) return jsxCode;
      const sf = originalProgram.getSourceFile(name);
      if (sf) return sf.getFullText();
      try {
        return require("fs").readFileSync(name, "utf-8");
      } catch {
        return undefined;
      }
    },
    readDirectory: (path, extensions, exclude, include, depth) => {
      try {
        const fs = require("fs");
        const pathModule = require("path");
        const results: string[] = [];
        const walk = (dir: string, currentDepth: number) => {
          if (depth !== undefined && currentDepth > depth) return;
          let entries: string[];
          try {
            entries = fs.readdirSync(dir);
          } catch {
            return;
          }
          for (const entry of entries) {
            const fullPath = pathModule.join(dir, entry);
            let stat: any;
            try {
              stat = fs.statSync(fullPath);
            } catch {
              continue;
            }
            if (stat.isDirectory()) {
              if (!exclude?.some((e: string) => entry.match(e))) {
                walk(fullPath, currentDepth + 1);
              }
            } else if (stat.isFile()) {
              const ext = pathModule.extname(entry);
              if (!extensions || extensions.includes(ext)) {
                if (!exclude?.some((e: string) => entry.match(e))) {
                  if (!include || include.some((i: string) => entry.match(i))) {
                    results.push(fullPath);
                  }
                }
              }
            }
          }
        };
        walk(path, 0);
        return results;
      } catch {
        return [];
      }
    },
    directoryExists: (name) => {
      try {
        return require("fs").existsSync(name) && require("fs").statSync(name).isDirectory();
      } catch {
        return false;
      }
    },
  };
}

function findFirstTemplatePosition(
  code: string,
  tags: string[],
  ts: typeof tsModule
): { start: number; end: number } | undefined {
  const sourceFile = ts.createSourceFile("", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result: { start: number; end: number } | undefined;
  function visit(node: tsModule.Node) {
    if (result) return;
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && tags.includes(node.tag.text)) {
      result = { start: node.getStart(), end: node.getEnd() };
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}

function getOrCreateAnalysis(
  fileName: string,
  info: tsModule.server.PluginCreateInfo,
  toJsxWithMappings: (code: string) => { code: string; mappings: any; errors: Array<{ start: number; end: number; message: string }> },
  ts: typeof tsModule,
  tags: string[]
): JsxAnalysis | undefined {
  try {
    const originalProgram = info.languageService.getProgram();
    if (!originalProgram) {
      console.error("[tagged-jsx] getOrCreateAnalysis: no program");
      return undefined;
    }

    const originalSourceFile = originalProgram.getSourceFile(fileName);
    if (!originalSourceFile) {
      console.error("[tagged-jsx] getOrCreateAnalysis: no source file for", fileName);
      return undefined;
    }

    const scriptVersion = (originalSourceFile as any).version as string | undefined;
    const cached = analysisCache.get(fileName);
    if (cached && cached.scriptVersion === scriptVersion) {
      console.error("[tagged-jsx] getOrCreateAnalysis: cache HIT for", fileName, "version:", scriptVersion);
      return cached;
    }
    console.error("[tagged-jsx] getOrCreateAnalysis: cache MISS for", fileName, "version:", scriptVersion);

    const originalCode = originalSourceFile.getFullText();

    templateErrorCache.delete(fileName);

    let jsxCode: string;
    let mappings: any;
    let templateErrors: tsModule.Diagnostic[] = [];
    try {
      const result = toJsxWithMappings(originalCode);
      jsxCode = result.code;
      mappings = result.mappings;
      templateErrors = (result.errors || []).map((err) => ({
        file: originalSourceFile,
        start: err.start,
        length: err.end - err.start,
        messageText: err.message,
        category: ts.DiagnosticCategory.Error,
        code: 9999,
        source: "tagged-jsx",
      }));
      console.error("[tagged-jsx] Transform OK,", (result.errors || []).length, "template errors, jsxCode length:", jsxCode.length);
      const jsxSnippet = jsxCode.length > 300 ? jsxCode.substring(0, 300) + "..." : jsxCode;
      console.error("[tagged-jsx] JSX:\n" + jsxSnippet);
    } catch (e) {
      console.error("[tagged-jsx] Transform failed:", (e as Error).message);
      const templatePos = findFirstTemplatePosition(originalCode, tags, ts);
      if (templatePos) {
        templateErrorCache.set(fileName, {
          diag: {
            file: originalSourceFile,
            start: templatePos.start,
            length: templatePos.end - templatePos.start,
            messageText: (e as Error).message || "Failed to parse JSX template content",
            category: ts.DiagnosticCategory.Error,
            code: 9999,
            source: "tagged-jsx",
          },
          scriptVersion,
        });
      }
      return undefined;
    }

    if (jsxCode === originalCode) {
      console.error("[tagged-jsx] jsxCode === originalCode (no templates found), skipping");
      return undefined;
    }

    const host = createSyntheticLSHost(fileName, jsxCode, scriptVersion, originalProgram, ts);
    const ls = ts.createLanguageService(host);

    const analysis: JsxAnalysis = { ls, mappings, jsxCode, originalCode, originalSourceFile, scriptVersion, templateErrors };
    analysisCache.set(fileName, analysis);
    console.error("[tagged-jsx] Analysis created and cached for", fileName);
    return analysis;
  } catch (e) {
    console.error("[tagged-jsx] Error creating analysis for", fileName, e);
    return undefined;
  }
}

function mapDiagnostic(diag: tsModule.Diagnostic, mappings: any, _jsxCodeLen: number, originalCodeLen: number, originalSourceFile: tsModule.SourceFile): tsModule.Diagnostic | undefined {
  if (diag.start === undefined) return undefined;

  const taggedStart = getTaggedPosition(diag.start, mappings.reverseMappings, originalCodeLen);
  const taggedEnd = getTaggedPosition(diag.start + (diag.length || 0), mappings.reverseMappings, originalCodeLen);

  if (taggedStart === undefined) return undefined;

  const length = taggedEnd !== undefined ? taggedEnd - taggedStart : (diag.length || 1);

  return {
    ...diag,
    file: originalSourceFile,
    start: taggedStart,
    length: length,
  };
}

function mapTextSpan(span: tsModule.TextSpan | undefined, mappings: any, originalCodeLen: number): tsModule.TextSpan | undefined {
  if (!span) return undefined;
  const start = getTaggedPosition(span.start, mappings.reverseMappings, originalCodeLen);
  if (start === undefined) return undefined;
  const end = getTaggedPosition(span.start + span.length, mappings.reverseMappings, originalCodeLen);
  if (end === undefined) return undefined;
  return { start, length: end - start };
}

function getVscodeSettings(projectRoot: string): Record<string, unknown> {
  try {
    const fs = require("fs");
    const path = require("path");
    const settingsPath = path.join(projectRoot, ".vscode", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, "utf-8");
      return JSON.parse(content);
    }
  } catch {}
  return {};
}

function init(modules: { typescript: typeof tsModule }) {
  const ts = modules.typescript;

  function create(info: tsModule.server.PluginCreateInfo) {
    const explicitTags = info.config?.tags as string[] | undefined;
    const projectRoot = info.project.getCurrentDirectory?.() ?? info.languageService.getProgram()?.getCurrentDirectory() ?? "";
    const vscodeConfig = getVscodeSettings(projectRoot);
    const vscodeTags = (vscodeConfig["tagged-jsx.customTags"] ?? (vscodeConfig as any)["tagged-jsx"]?.customTags) as string[] | undefined;
    const tags: string[] = explicitTags ?? vscodeTags ?? ["html", "jsx"];
    const useCallbacks: boolean = info.config?.useCallbacks ?? (vscodeConfig["tagged-jsx.useCallbacks"] ?? (vscodeConfig as any)["tagged-jsx"]?.useCallbacks) ?? true;
    const callbacks = useCallbacks ? createExpressionTransformCallbacks(ts) : undefined;
    const toJsxWithMappings = createJsxTransformer({ tags, ts, callbacks });
    console.error("[tagged-jsx] Plugin initialized. tags:", tags, "useCallbacks:", useCallbacks, "projectRoot:", projectRoot);
    console.error("[tagged-jsx] Plugin config:", JSON.stringify(info.config));

    const proxy: tsModule.LanguageService = Object.create(null);
    for (const k of Object.keys(info.languageService) as Array<keyof tsModule.LanguageService>) {
      const x = info.languageService[k]!;
      //@ts-expect-error - proxy forwarding
      proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args);
    }

    proxy.getSemanticDiagnostics = (fileName: string) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) {
        const originalDiags = info.languageService.getSemanticDiagnostics(fileName);
        const errorEntry = templateErrorCache.get(fileName);
        if (errorEntry) {
          console.error("[tagged-jsx] getSemanticDiagnostics: no analysis, returning cached error");
          return [errorEntry.diag, ...originalDiags];
        }
        return originalDiags;
      }

      const { ls, mappings, jsxCode, originalCode, originalSourceFile, templateErrors } = analysis;
      const syntactic = ls.getSyntacticDiagnostics(fileName);
      const semantic = ls.getSemanticDiagnostics(fileName);

      console.error("[tagged-jsx] getSemanticDiagnostics: templateErrors:", templateErrors.length, "syntactic:", syntactic.length, "semantic:", semantic.length);

      const result: tsModule.Diagnostic[] = [...templateErrors];
      for (const diag of [...syntactic, ...semantic]) {
        const mapped = mapDiagnostic(diag, mappings, jsxCode.length, originalCode.length, originalSourceFile);
        if (mapped) result.push(mapped);
      }
      return result;
    };

    proxy.getCompletionsAtPosition = (fileName: string, position: number, options: any) => {
      try {
        console.error("[tagged-jsx] getCompletionsAtPosition for", fileName.split(/[/\\]/).pop(), "pos:", position, "triggerKind:", options?.triggerKind, "triggerChar:", options?.triggerCharacter);
        const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
        if (!analysis) {
          console.error("[tagged-jsx]   no analysis, fallback to original LS");
          return info.languageService.getCompletionsAtPosition(fileName, position, options);
        }

        const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
        console.error("[tagged-jsx]   original pos:", position, "-> jsxPos:", jsxPos);
        if (jsxPos === undefined) {
          console.error("[tagged-jsx]   jsxPos undefined, fallback");
          return info.languageService.getCompletionsAtPosition(fileName, position, options);
        }

        const completions = analysis.ls.getCompletionsAtPosition(fileName, jsxPos, options);
        if (!completions) {
          console.error("[tagged-jsx]   synthetic LS returned null, fallback to original LS");
          return info.languageService.getCompletionsAtPosition(fileName, position, options);
        }

        console.error("[tagged-jsx]   synthetic LS completions count:", completions.entries.length);

        // Map replacementSpan from JSX→original coordinates and fix insertText for template syntax
        const entries = completions.entries.map((entry) => {
          let e = entry;
          if (e.replacementSpan) {
            const mapped = mapTextSpan(e.replacementSpan, analysis.mappings, analysis.originalCode.length);
            if (mapped) e = { ...e, replacementSpan: mapped };
          }
          if (e.insertText) {
            const fixed = e.insertText.replace(/=\{/g, '=${');
            if (fixed !== e.insertText) {
              const { isSnippet: _, ...rest } = e;
              e = { ...rest, insertText: fixed } as tsModule.CompletionEntry;
            }
          }
          return e;
        });

        let optionalReplacementSpan = completions.optionalReplacementSpan;
        if (optionalReplacementSpan) {
          optionalReplacementSpan = mapTextSpan(optionalReplacementSpan, analysis.mappings, analysis.originalCode.length);
          console.error("[tagged-jsx]   mapped optionalReplacementSpan: orig", JSON.stringify(completions.optionalReplacementSpan), "->", JSON.stringify(optionalReplacementSpan));
        }

        return { ...completions, entries, optionalReplacementSpan };
      } catch (e) {
        console.error("[tagged-jsx]   ERROR in getCompletionsAtPosition:", (e as Error).message, (e as Error).stack);
        return info.languageService.getCompletionsAtPosition(fileName, position, options);
      }
    };

    proxy.getCompletionEntryDetails = (fileName: string, position: number, entryName: string, formatOptions: any, source: string | undefined, preferences: any, data: any) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);

      const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
      if (jsxPos === undefined) return info.languageService.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);

      return analysis.ls.getCompletionEntryDetails(fileName, jsxPos, entryName, formatOptions, source, preferences, data);
    };

    proxy.getQuickInfoAtPosition = (fileName: string, position: number) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.getQuickInfoAtPosition(fileName, position);

      const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
      if (jsxPos === undefined) return info.languageService.getQuickInfoAtPosition(fileName, position);

      const quickInfo = analysis.ls.getQuickInfoAtPosition(fileName, jsxPos);
      if (!quickInfo) return undefined;

      const mappedSpan = mapTextSpan(quickInfo.textSpan, analysis.mappings, analysis.originalCode.length);
      if (!mappedSpan) return undefined;

      return { ...quickInfo, textSpan: mappedSpan };
    };

    proxy.getSignatureHelpItems = (fileName: string, position: number, options: any) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.getSignatureHelpItems(fileName, position, options);

      const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
      if (jsxPos === undefined) return info.languageService.getSignatureHelpItems(fileName, position, options);

      const sigHelp = analysis.ls.getSignatureHelpItems(fileName, jsxPos, options);
      if (!sigHelp) return undefined;

      const mappedSpan = mapTextSpan(sigHelp.applicableSpan, analysis.mappings, analysis.originalCode.length);
      if (!mappedSpan) return undefined;

      return { ...sigHelp, applicableSpan: mappedSpan };
    };

    proxy.getOutliningSpans = (fileName: string) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.getOutliningSpans(fileName);

      const spans = analysis.ls.getOutliningSpans(fileName);
      return spans.reduce<tsModule.OutliningSpan[]>((acc, span) => {
        const textSpan = mapTextSpan(span.textSpan, analysis.mappings, analysis.originalCode.length);
        const hintSpan = mapTextSpan(span.hintSpan, analysis.mappings, analysis.originalCode.length);
        if (textSpan && hintSpan) {
          acc.push({ ...span, textSpan, hintSpan });
        }
        return acc;
      }, []);
    };

    proxy.getDefinitionAtPosition = (fileName: string, position: number) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.getDefinitionAtPosition(fileName, position);

      const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
      if (jsxPos === undefined) return info.languageService.getDefinitionAtPosition(fileName, position);

      const defs = analysis.ls.getDefinitionAtPosition(fileName, jsxPos);
      if (!defs) return undefined;

      return defs.map((d) => {
        if (d.fileName !== fileName) return d;
        const mapped = mapTextSpan(d.textSpan, analysis.mappings, analysis.originalCode.length);
        if (!mapped) return d;
        return { ...d, textSpan: mapped };
      });
    };

    proxy.getImplementationAtPosition = (fileName: string, position: number) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.getImplementationAtPosition(fileName, position);

      const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
      if (jsxPos === undefined) return info.languageService.getImplementationAtPosition(fileName, position);

      const impls = analysis.ls.getImplementationAtPosition(fileName, jsxPos);
      if (!impls) return undefined;

      return impls.map((d) => {
        if (d.fileName !== fileName) return d;
        const mapped = mapTextSpan(d.textSpan, analysis.mappings, analysis.originalCode.length);
        if (!mapped) return d;
        return { ...d, textSpan: mapped };
      });
    };

    proxy.getTypeDefinitionAtPosition = (fileName: string, position: number) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.getTypeDefinitionAtPosition(fileName, position);

      const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
      if (jsxPos === undefined) return info.languageService.getTypeDefinitionAtPosition(fileName, position);

      const defs = analysis.ls.getTypeDefinitionAtPosition(fileName, jsxPos);
      if (!defs) return undefined;

      return defs.map((d) => {
        if (d.fileName !== fileName) return d;
        const mapped = mapTextSpan(d.textSpan, analysis.mappings, analysis.originalCode.length);
        if (!mapped) return d;
        return { ...d, textSpan: mapped };
      });
    };

    proxy.findReferences = (fileName: string, position: number) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.findReferences(fileName, position);

      const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
      if (jsxPos === undefined) return info.languageService.findReferences(fileName, position);

      const refs = analysis.ls.findReferences(fileName, jsxPos);
      if (!refs) return undefined;

      return refs.map((ref) => ({
        ...ref,
        references: ref.references.map((r) => {
          if (r.fileName !== fileName) return r;
          const mapped = mapTextSpan(r.textSpan, analysis.mappings, analysis.originalCode.length);
          if (!mapped) return r;
          return { ...r, textSpan: mapped };
        }),
      }));
    };

    proxy.getRenameInfo = (fileName: string, position: number) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.getRenameInfo(fileName, position);

      const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
      if (jsxPos === undefined) return info.languageService.getRenameInfo(fileName, position);

      const info_ = analysis.ls.getRenameInfo(fileName, jsxPos);
      if (!info_) return info_;

      if (info_.canRename && info_.triggerSpan) {
        const mappedSpan = mapTextSpan(info_.triggerSpan, analysis.mappings, analysis.originalCode.length);
        if (mappedSpan) {
          return { ...info_, triggerSpan: mappedSpan };
        }
      }
      return info_;
    };

    proxy.findRenameLocations = (fileName: string, position: number, findInStrings: boolean, findInComments: boolean, providePrefixAndSuffixTextForRename?: any) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.findRenameLocations(fileName, position, findInStrings, findInComments, providePrefixAndSuffixTextForRename);

      const jsxPos = getJsxPosition(position, analysis.mappings.mappings, analysis.jsxCode.length);
      if (jsxPos === undefined) return info.languageService.findRenameLocations(fileName, position, findInStrings, findInComments, providePrefixAndSuffixTextForRename);

      const locations = analysis.ls.findRenameLocations(fileName, jsxPos, findInStrings, findInComments, providePrefixAndSuffixTextForRename);
      if (!locations) return undefined;

      return locations.map((loc) => {
        if (loc.fileName !== fileName) return loc;
        const mappedSpan = mapTextSpan(loc.textSpan, analysis.mappings, analysis.originalCode.length);
        if (!mappedSpan) return loc;
        const mappedContextSpan = loc.contextSpan ? mapTextSpan(loc.contextSpan, analysis.mappings, analysis.originalCode.length) : undefined;
        return { ...loc, textSpan: mappedSpan, contextSpan: mappedContextSpan };
      });
    };

    proxy.getNavigationBarItems = (fileName: string) => {
      const analysis = getOrCreateAnalysis(fileName, info, toJsxWithMappings, ts, tags);
      if (!analysis) return info.languageService.getNavigationBarItems(fileName);

      const items = analysis.ls.getNavigationBarItems(fileName);

      const mapItem = (item: any): any => {
        const spans = item.spans
          .map((s: tsModule.TextSpan) => mapTextSpan(s, analysis.mappings, analysis.originalCode.length))
          .filter((s: tsModule.TextSpan | undefined): s is tsModule.TextSpan => s !== undefined);
        if (spans.length !== item.spans.length) return null;
        return {
          ...item,
          spans,
          childItems: item.childItems.map(mapItem).filter((c: any) => c !== null),
        };
      };

      return items.map(mapItem).filter((item: any) => item !== null);
    };

    return proxy;
  }

  return { create };
}

export = init;
