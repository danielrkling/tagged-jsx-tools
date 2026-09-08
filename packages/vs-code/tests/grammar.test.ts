import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const syntaxesDir = join(__dirname, "..", "syntaxes");

function loadGrammar(file: string) {
  return JSON.parse(readFileSync(join(syntaxesDir, file), "utf-8"));
}

describe("jsx grammar", () => {
  const grammar = loadGrammar("jsx.json");
  const commentPatterns = grammar.repository.comment.patterns;
  const begins = commentPatterns.map((p: any) => p.begin);

  it("highlights jsx comments ({/* */})", () => {
    expect(begins).toContain("\\{/\\*");
    const jsxComment = commentPatterns.find((p: any) => p.begin === "\\{/\\*");
    expect(jsxComment.end).toBe("\\*/\\}");
    expect(jsxComment.name).toBe("comment.block.jsx");
    expect(jsxComment.contentName).toBe("comment.block.jsx");
  });

  it("keeps legacy html comments", () => {
    expect(begins).toContain("<!--");
  });

  it("matches jsx comments before generic block comments", () => {
    // TextMate tries patterns in order: the generic /\* rule would otherwise
    // match the /* inside {/* and leave the braces unhighlighted.
    const jsxIndex = begins.indexOf("\\{/\\*");
    const blockIndex = begins.indexOf("/\\*");
    expect(jsxIndex).toBeGreaterThanOrEqual(0);
    expect(blockIndex).toBeGreaterThanOrEqual(0);
    expect(jsxIndex).toBeLessThan(blockIndex);
  });

  it("includes comments in tag and tag-stuff contexts", () => {
    expect(grammar.repository.tag.patterns).toContainEqual({
      include: "#comment",
    });
    expect(grammar.repository["tag-stuff"].patterns).toContainEqual({
      include: "#comment",
    });
  });
});

describe("generated injection grammar", () => {
  it("is valid and embeds the jsx grammar", () => {
    const grammar = loadGrammar("lit-jsx-generated.json");
    expect(grammar.scopeName).toBe("text.lit-jsx");
    for (const pattern of grammar.patterns) {
      expect(pattern.patterns).toContainEqual({ include: "text.jsx" });
    }
  });

  it("uses one plain tag pattern per tag", async () => {
    const { generateGrammar } = await import("../src/generate-grammar");
    const grammar = JSON.parse(generateGrammar(["html", "mytag"]));

    expect(grammar.patterns).toHaveLength(2);
    expect(grammar.patterns[0].begin).toBe("(?i)\\b(html)(`)");
    expect(grammar.patterns[1].begin).toBe("(?i)\\b(mytag)(`)");
    for (const pattern of grammar.patterns) {
      expect(pattern.patterns).toContainEqual({
        include: "source.ts#template-substitution-element",
      });
      expect(pattern.patterns).toContainEqual({ include: "text.jsx" });
    }
  });

  it("does not generate tag-access variants for props or function calls", async () => {
    const { generateGrammar } = await import("../src/generate-grammar");
    const grammar = JSON.parse(generateGrammar(["html"]));

    const begins = grammar.patterns.map((p: any) => p.begin);
    // Registered components are matched as literal tag names by the jsx
    // grammar, so obj.tag`...` and fn().tag`...` variants are no longer needed.
    expect(begins).toHaveLength(1);
    expect(begins[0]).not.toContain("\\\\.");
    expect(begins[0]).not.toContain("\\\\(");
  });
});
