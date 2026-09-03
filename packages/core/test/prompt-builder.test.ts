import { describe, it, expect } from "vitest";
import { PromptBuilder } from "../src/services/prompt-builder.js";

describe("PromptBuilder with Depth Modes", () => {
  const builder = new PromptBuilder();

  it("builds atomic prompt instructions by default", () => {
    const prompt = builder.buildGenerationInstructions({
      difficulty: "intermediate",
      persona: "socratic-mentor",
      targetCount: 4,
    });

    expect(prompt).toContain("TASK: Extract exactly 4 atomic Front/Back flashcards");
    expect(prompt).toContain("ATOMICITY: Each card must test exactly ONE discrete fact");
    expect(prompt).toContain("CONCISENESS: The Back (answer) must be short, clear, and direct");
    expect(prompt).toContain("CRITICAL: Copy and paste an EXACT, word-for-word sentence");
  });

  it("builds deep-dive prompt instructions when depthMode is deep-dive", () => {
    const prompt = builder.buildGenerationInstructions({
      difficulty: "expert",
      persona: "strict-examiner",
      targetCount: 5,
      depthMode: "deep-dive",
    });

    expect(prompt).toContain("TASK: Synthesize exactly 5 comprehensive DEEP-DIVE flashcards");
    expect(prompt).toContain("DEEP-DIVE PEDAGOGICAL RULES");
    expect(prompt).toContain("MECHANISM & SYNTHESIS");
    expect(prompt).toContain("THOROUGH & STRUCTURED EXPLANATION");
    expect(prompt).toContain("CRITICAL: Copy and paste an EXACT, word-for-word sentence");
  });

  it("builds scenario-based prompt instructions when depthMode is scenario", () => {
    const prompt = builder.buildGenerationInstructions({
      difficulty: "intermediate",
      persona: "executive-synthesizer",
      targetCount: 3,
      depthMode: "scenario",
    });

    expect(prompt).toContain("TASK: Create exactly 3 applied SCENARIO & CASE-STUDY flashcards");
    expect(prompt).toContain("SCENARIO-BASED PEDAGOGICAL RULES");
    expect(prompt).toContain("SITUATIONAL CONTEXT");
    expect(prompt).toContain("ACTIONABLE DIAGNOSIS & REMEDIATION");
    expect(prompt).toContain("CRITICAL: Copy and paste an EXACT, word-for-word sentence");
  });
});
