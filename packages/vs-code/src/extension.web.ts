import vscode from "vscode";
import {
  createJsxTransformer,
  createExpressionTransformCallbacks,
  createTaggedTransformer,
} from "@tagged-jsx/transform";
import ts from "typescript";
import prettier from "prettier/standalone";
import { createPlugin } from "@tagged-jsx/prettier-plugin/web";
import parserTypescript from "prettier/plugins/typescript";
import parserBabel from "prettier/plugins/babel";

let outputChannel: vscode.OutputChannel;

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

async function resolvePrettierConfigFromFile(document: vscode.TextDocument): Promise<Record<string, unknown>> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) return {};

  const rootUri = workspaceFolder.uri;

  const jsonFiles = [".prettierrc", ".prettierrc.json"];
  for (const file of jsonFiles) {
    try {
      const fileUri = vscode.Uri.joinPath(rootUri, file);
      const content = await vscode.workspace.fs.readFile(fileUri);
      const text = new TextDecoder().decode(content);
      return JSON.parse(text);
    } catch {
      continue;
    }
  }

  try {
    const pkgUri = vscode.Uri.joinPath(rootUri, "package.json");
    const content = await vscode.workspace.fs.readFile(pkgUri);
    const text = new TextDecoder().decode(content);
    const pkg = JSON.parse(text);
    if (pkg.prettier) return pkg.prettier;
  } catch {
    // no package.json
  }

  return {};
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Tagged JSX Tools (Web)");
  context.subscriptions.push(outputChannel);

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

  // Register commands for web - simplified version
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tagged-jsx.regenerateGrammar",
      async () => {
        vscode.window.showInformationMessage(
          "Grammar regeneration only available in desktop version",
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tagged-jsx.convertToJsx",
      async (uri?: vscode.Uri) => {
        const document = uri
          ? await vscode.workspace.openTextDocument(uri)
          : vscode.window.activeTextEditor?.document;

        if (!document) return;

        const { toJSXTransform } = getTransformers();

        try {
          const text = document.getText();
          const result = toJSXTransform(text).code;

          if (result !== text) {
            const edit = new vscode.TextEdit(
              new vscode.Range(0, 0, document.lineCount, 0),
              result,
            );
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(document.uri, [edit]);
            await vscode.workspace.applyEdit(workspaceEdit);
          }
        } catch (error) {
          outputChannel.appendLine("Convert to JSX error: " + String(error));
          vscode.window.showErrorMessage(
            "Failed to convert to JSX: " + String(error),
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tagged-jsx.convertToTagged",
      async (uri?: vscode.Uri) => {
        const document = uri
          ? await vscode.workspace.openTextDocument(uri)
          : vscode.window.activeTextEditor?.document;

        if (!document) return;

        const { toTaggedTransform } = getTransformers();

        try {
          const text = document.getText();
          const result = toTaggedTransform(text).code;

          if (result !== text) {
            const edit = new vscode.TextEdit(
              new vscode.Range(0, 0, document.lineCount, 0),
              result,
            );
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(document.uri, [edit]);
            await vscode.workspace.applyEdit(workspaceEdit);
          }
        } catch (error) {
          outputChannel.appendLine("Convert to Tagged error: " + String(error));
          vscode.window.showErrorMessage(
            "Failed to convert to Tagged: " + String(error),
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tagged-jsx.toggle", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const document = editor.document;
      const text = document.getText();
      const config = vscode.workspace.getConfiguration("tagged-jsx");
      const tags = config.get<string[]>("customTags", ["jsx", "html"]);

      const templateRegex = new RegExp(
        `(${tags.join("|")})\`[\\s\\S]*?\``,
        "g",
      );
      const hasTemplates = templateRegex.test(text);

      try {
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
            result,
          );
          const workspaceEdit = new vscode.WorkspaceEdit();
          workspaceEdit.set(document.uri, [edit]);
          await vscode.workspace.applyEdit(workspaceEdit);
        }
      } catch (error) {
        outputChannel.appendLine("Toggle error: " + String(error));
        vscode.window.showErrorMessage("Toggle failed: " + String(error));
      }
    }),
  );

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
      {
        async provideDocumentFormattingEdits(document: vscode.TextDocument) {
          const text = document.getText();
          try {
            const taggedConfig = vscode.workspace.getConfiguration("tagged-jsx");
            const tags = taggedConfig.get<string[]>("customTags", ["jsx", "html"]);
            const isTypescript = document.languageId === "typescript" || document.languageId === "typescriptreact";
            const parser = isTypescript ? "typescript" : "babel";

            const fileConfig = await resolvePrettierConfigFromFile(document);

            const options = {
              ...fileConfig,
              ...getPrettierOptions(document),
              parser,
              plugins: [createPlugin(tags), parserTypescript, parserBabel],
            };

            const formatted = await prettier.format(text, options);
            if (formatted === text) return [];
            return [
              vscode.TextEdit.replace(
                new vscode.Range(0, 0, document.lineCount, 0),
                formatted,
              ),
            ];
          } catch (error) {
            outputChannel.appendLine("Formatting error: " + String(error));
            return [];
          }
        },
      },
    ),
  );

  outputChannel.appendLine("Tagged JSX Tools (Web) activated");
}
