import { describe, it, expect } from "vitest";
import { PersonaStudioService, ReservedPersonaError } from "../src/services/persona-studio-service.js";
import { PromptBuilder } from "../src/services/prompt-builder.js";

describe("PersonaStudioService", () => {
  it("initializes with 3 built-in system personas", () => {
    const studio = new PersonaStudioService();
    const personas = studio.listPersonas();

    expect(personas.length).toBe(3);
    const ids = personas.map((p) => p.id);
    expect(ids).toContain("socratic-mentor");
    expect(ids).toContain("strict-examiner");
    expect(ids).toContain("executive-synthesizer");
  });

  it("registers and retrieves custom user personas", () => {
    const studio = new PersonaStudioService();
    const custom = studio.registerPersona({
      id: "medical-tutor",
      name: "Medical Physiology Tutor",
      description: "Focuses on clinical diagnostic reasoning and pathways.",
      systemPrompt: "You are a clinical professor drilling medical students on organ pathways.",
    });

    expect(custom.id).toBe("medical-tutor");
    expect(custom.isBuiltIn).toBe(false);

    const fetched = studio.getPersona("medical-tutor");
    expect(fetched?.name).toBe("Medical Physiology Tutor");
  });

  it("prevents deletion or modification of built-in personas", () => {
    const studio = new PersonaStudioService();

    expect(() => studio.deletePersona("socratic-mentor")).toThrow(ReservedPersonaError);
    expect(() =>
      studio.registerPersona({
        id: "strict-examiner",
        name: "Overwrite",
        description: "",
        systemPrompt: "Malicious prompt override attempt.",
      })
    ).toThrow(ReservedPersonaError);
  });

  it("PromptBuilder applies persona system prompts and difficulty modifiers", () => {
    const studio = new PersonaStudioService();
    const builder = new PromptBuilder(studio);

    const prompt = builder.buildGenerationInstructions({
      difficulty: "expert",
      persona: "strict-examiner",
      targetCount: 5,
    });

    expect(prompt).toContain("You are a rigorous Examiner");
    expect(prompt).toContain("DIFFICULTY LEVEL (EXPERT)");
    expect(prompt).toContain("Focus on subtle edge cases");
    expect(prompt).toContain("MINIMUM INFORMATION PRINCIPLE RULES");
  });
});
