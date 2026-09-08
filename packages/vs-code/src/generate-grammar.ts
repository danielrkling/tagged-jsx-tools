// Grammar generation for tagged template injection. Kept free of vscode
// imports so it can be unit tested and used to regenerate the checked-in
// default grammar.

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function generateGrammar(tags: string[]): string {
  const patterns: object[] = [];

  for (const tag of tags) {
    patterns.push({
      contentName: "meta.embedded.block.jsx",
      begin: "(?i)\\b(" + escapeRegex(tag) + ")(\x60)",
      beginCaptures: {
        "1": {
          name: "entity.name.function.tagged-template.js",
        },
        "2": {
          name: "punctuation.definition.string.template.begin.js",
        },
      },
      end: "\x60",
      endCaptures: {
        "0": {
          name: "punctuation.definition.string.template.end.js",
        },
      },
      patterns: [
        {
          include: "source.ts#template-substitution-element",
        },
        {
          include: "text.jsx",
        },
      ],
    });
  }

  const grammar = {
    $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
    fileTypes: [],
    injectionSelector:
      "L:source.js -comment -(string -meta.embedded), L:source.js.jsx -comment -(string -meta.embedded), L:source.jsx -comment -(string -meta.embedded), L:source.ts -comment -(string -meta.embedded), L:source.tsx -comment -(string -meta.embedded)",
    injections: {
      "L:source": {
        patterns: [
          {
            match: "<",
            name: "invalid.illegal.bad-angle-bracket.jsx",
          },
        ],
      },
    },
    patterns,
    scopeName: "text.lit-jsx",
  };

  return JSON.stringify(grammar, null, 2);
}
