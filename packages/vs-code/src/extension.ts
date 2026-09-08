import { createExpressionTransformCallbacks, createJsxTransformer, createTaggedTransformer } from "@tagged-jsx/transform";
import { createPlugin } from "@tagged-jsx/prettier-plugin";
import { generateGrammar } from "./generate-grammar";
import vscode from "vscode";
import ts from "typescript";

let outputChannel: vscode.OutputChannel;

// Conditional import for Node.js environment (desktop)
const isWeb = typeof process === 'undefined' || process.env?.VSCODE_WEB_EXTENSION;
async function readFile(path: string): Promise<string> {
  if (isWeb) {
    // Use VS Code's workspace file system API for web
    const uint8Array = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
    return Buffer.from(uint8Array).toString('utf-8');
  } else {
    // Use Node.js fs for desktop
    const fs = await import('fs');
    return fs.readFileSync(path, 'utf-8');
  }
}

const GRAMMAR_FILENAME = "lit-jsx-generated.json";

async function regenerateGrammar(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("tagged-jsx");
  const customTags = config.get<string[]>("customTags", ["jsx", "html"]);

  outputChannel.appendLine("Regenerating grammar for tags: " + JSON.stringify(customTags));

  const grammarContent = generateGrammar(customTags);
  const grammarPath = context.extensionPath + "/syntaxes/" + GRAMMAR_FILENAME;
  
  // Write file using appropriate API for environment
  if (isWeb) {
    // For web, we'd need to use workspace.fs, but grammar generation is desktop-only
    outputChannel.appendLine("Grammar regeneration not supported in web version");
    return;
  } else {
    const fs = await import('fs');
    fs.writeFileSync(grammarPath, grammarContent, "utf-8");
  }
  outputChannel.appendLine("Grammar written to: " + grammarPath);
}

function getPrettierOptions(document: vscode.TextDocument): Record<string, unknown> {
  const prettierConfig = vscode.workspace.getConfiguration("prettier", document.uri);
  const editorConfig = vscode.workspace.getConfiguration("editor", document.uri);

  const options: Record<string, unknown> = {};

  const settingMap: Record<string, string> = {
    printWidth: "printWidth",
    tabWidth: "tabWidth",
    useTabs: "useTabs",
    singleQuote: "singleQuote",
    trailingComma: "trailingComma",
    bracketSpacing: "bracketSpacing",
    bracketSameLine: "bracketSameLine",
    arrowParens: "arrowParens",
    endOfLine: "endOfLine",
    embeddedLanguageFormatting: "embeddedLanguageFormatting",
    htmlWhitespaceSensitivity: "htmlWhitespaceSensitivity",
    proseWrap: "proseWrap",
    semi: "semi",
    quoteProps: "quoteProps",
    jsxSingleQuote: "jsxSingleQuote",
    singleAttributePerLine: "singleAttributePerLine",
  };

  for (const [setting, option] of Object.entries(settingMap)) {
    const value = prettierConfig.get<unknown>(setting);
    if (value !== undefined) {
      options[option] = value;
    }
  }

  if (options.tabWidth === undefined) {
    options.tabWidth = editorConfig.get<number>("tabSize", 2);
  }
  if (options.useTabs === undefined) {
    options.useTabs = !editorConfig.get<boolean>("insertSpaces", true);
  }

  return options;
}

async function formatDocument(
  document: vscode.TextDocument,
): Promise<vscode.TextEdit[]> {
  const text = document.getText();
  let result = text;

  try {
    const prettier = await import("prettier");

    const config = vscode.workspace.getConfiguration("tagged-jsx");
    const tags = config.get<string[]>("customTags", ["jsx", "html"]);
    const plugin = createPlugin(tags);

    const isTypescript = document.languageId === "typescript" || document.languageId === "typescriptreact";
    const parser = isTypescript ? "typescript" : "babel";

    const fileConfig = await prettier.resolveConfig(document.uri.fsPath, { editorconfig: true });

    const options = {
      ...fileConfig,
      ...getPrettierOptions(document),
      filepath: document.uri.fsPath,
      parser,
      plugins: [plugin, ...(fileConfig?.plugins || [])],
    };

    result = await prettier.format(text, options);
  } catch (error) {
    outputChannel.appendLine("Formatting error: " + String(error));
    return [];
  }

  if (result === text) {
    return [];
  }

  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(document.lineCount, 0),
  );

  return [new vscode.TextEdit(fullRange, result)];
}

class TaggedJsxFormatter implements vscode.DocumentFormattingEditProvider {
  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken,
  ): Promise<vscode.TextEdit[]> {
    return formatDocument(document);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Tagged JSX Templates");
  context.subscriptions.push(outputChannel);

  const grammarPath = context.extensionPath + "/syntaxes/" + GRAMMAR_FILENAME;
  
  // Check if grammar exists using appropriate method for environment
  let grammarExists = false;
  if (isWeb) {
    try {
      await vscode.workspace.fs.readFile(vscode.Uri.file(grammarPath));
      grammarExists = true;
    } catch {
      grammarExists = false;
    }
  } else {
    const fs = await import('fs');
    grammarExists = fs.existsSync(grammarPath);
  }
  
  if (!grammarExists) {
    await regenerateGrammar(context);
  }

    function getTransformers() {
    const config = vscode.workspace.getConfiguration("tagged-jsx");
    const useCallbacks = config.get<boolean>("useCallbacks", false);
    const tags = config.get<string[]>("customTags", ["jsx", "html"]);
    const preferredTag = config.get<string>("preferredTag", "jsx");
    const registeredComponents = config.get<string[]>("registeredComponents", []);

    const toJSXTransform = createJsxTransformer(
      tags,
      ts,
      useCallbacks ? createExpressionTransformCallbacks(ts) : undefined,
    );

    const toTaggedTransform = createTaggedTransformer(
      preferredTag,
      ts,
      useCallbacks ? createExpressionTransformCallbacks(ts) : undefined,
      { registeredComponents },
    );


    return { toJSXTransform, toTaggedTransform };
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("tagged-jsx.regenerateGrammar", async () => {
      await regenerateGrammar(context);
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("tagged-jsx.customTags")) {
        await regenerateGrammar(context);
        vscode.window.showInformationMessage(
          "Grammar regenerated. Reload window to apply changes.",
          "Reload Window"
        ).then((selection) => {
          if (selection === "Reload Window") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tagged-jsx.convertToJsx", async (uri?: vscode.Uri) => {
      const document = uri
        ? await vscode.workspace.openTextDocument(uri)
        : vscode.window.activeTextEditor?.document;

      if (!document) return;

      const text = document.getText();
      const { toJSXTransform } = getTransformers();
      const result = toJSXTransform(text).code;

      if (result !== text) {
        const edit = new vscode.TextEdit(
          new vscode.Range(0, 0, document.lineCount, 0),
          result
        );
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(document.uri, [edit]);
        await vscode.workspace.applyEdit(workspaceEdit);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tagged-jsx.convertToTagged", async (uri?: vscode.Uri) => {
      const document = uri
        ? await vscode.workspace.openTextDocument(uri)
        : vscode.window.activeTextEditor?.document;

      if (!document) return;

      const text = document.getText();
      const { toTaggedTransform } = getTransformers();
      const result = toTaggedTransform(text).code;

      if (result !== text) {
        const edit = new vscode.TextEdit(
          new vscode.Range(0, 0, document.lineCount, 0),
          result
        );
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(document.uri, [edit]);
        await vscode.workspace.applyEdit(workspaceEdit);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tagged-jsx.toggle", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const document = editor.document;
      const text = document.getText();
      const config = vscode.workspace.getConfiguration("tagged-jsx");
      const tags = config.get<string[]>("customTags", ["jsx", "html"]);

      const templateRegex = new RegExp(tags.map(tag => tag + "\x60[\\s\\S]*?\x60").join("|"), "g");
      const hasTemplates = templateRegex.test(text);

        const { toJSXTransform, toTaggedTransform } = getTransformers();
      

      let result: string;
      
      if (hasTemplates) {
        result = toJSXTransform(text).code;
      } else {
        result = toTaggedTransform(text).code;
      }

      if (result !== text) {
        const edit = new vscode.TextEdit(
          new vscode.Range(0, 0, document.lineCount, 0),
          result
        );
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(document.uri, [edit]);
        await vscode.workspace.applyEdit(workspaceEdit);
      }
    })
  );

  const formatter = new TaggedJsxFormatter();
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      [
        { scheme: "file", language: "javascript" },
        { scheme: "file", language: "javascriptreact" },
        { scheme: "file", language: "typescript" },
        { scheme: "file", language: "typescriptreact" },
        { scheme: "untitled", language: "javascript" },
        { scheme: "untitled", language: "javascriptreact" },
        { scheme: "untitled", language: "typescript" },
        { scheme: "untitled", language: "typescriptreact" },
      ],
      formatter
    )
  );
}

export async function deactivate(): Promise<void> {}