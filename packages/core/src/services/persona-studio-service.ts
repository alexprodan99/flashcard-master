import {
  type PersonaDefinition,
  type PersonaType,
  type DifficultyLevel,
  PersonaDefinitionSchema,
} from "../domain/models.js";

export class ReservedPersonaError extends Error {
  constructor(id: string) {
    super(`Cannot delete or modify built-in persona "${id}".`);
    this.name = "ReservedPersonaError";
  }
}

export const BUILTIN_PERSONAS: PersonaDefinition[] = [
  {
    id: "socratic-mentor",
    name: "Socratic Mentor",
    description: "Guides the learner toward deep conceptual clarity by asking precise questions highlighting underlying mechanics.",
    systemPrompt: "You are a thoughtful Socratic Mentor guiding the learner toward deep conceptual clarity by asking precise questions that highlight underlying mechanics.",
    isBuiltIn: true,
  },
  {
    id: "strict-examiner",
    name: "Strict Technical Examiner",
    description: "Creates definitive, high-stakes technical test questions with zero ambiguity and rigorous edge cases.",
    systemPrompt: "You are a rigorous Examiner creating definitive, high-stakes technical test questions with zero ambiguity.",
    isBuiltIn: true,
  },
  {
    id: "executive-synthesizer",
    name: "Executive Synthesizer",
    description: "Focuses on high-level architecture, strategic trade-offs, and critical takeaways.",
    systemPrompt: "You are an Executive Synthesizer focusing on high-level architecture, strategic trade-offs, and critical takeaways.",
    isBuiltIn: true,
  },
];

export const DIFFICULTY_MODIFIERS: Record<DifficultyLevel, string> = {
  beginner: "Focus on fundamental definitions, core terminology, and high-level concepts in plain, accessible language.",
  intermediate: "Focus on standard operational mechanics, workflows, best practices, and technical precision.",
  expert: "Focus on subtle edge cases, architectural trade-offs, internal failure modes, and performance nuances.",
};

export class PersonaStudioService {
  private readonly personas: Map<string, PersonaDefinition> = new Map();

  constructor(initialCustomPersonas: PersonaDefinition[] = []) {
    // 1. Load built-ins
    for (const p of BUILTIN_PERSONAS) {
      this.personas.set(p.id, p);
    }
    // 2. Load custom personas
    for (const custom of initialCustomPersonas) {
      const valid = PersonaDefinitionSchema.parse(custom);
      this.personas.set(valid.id, valid);
    }
  }

  getPersona(id: string): PersonaDefinition | undefined {
    return this.personas.get(id);
  }

  listPersonas(): PersonaDefinition[] {
    return Array.from(this.personas.values());
  }

  registerPersona(persona: Omit<PersonaDefinition, "isBuiltIn">): PersonaDefinition {
    if (["socratic-mentor", "strict-examiner", "executive-synthesizer"].includes(persona.id)) {
      throw new ReservedPersonaError(persona.id);
    }

    const valid = PersonaDefinitionSchema.parse({
      ...persona,
      isBuiltIn: false,
    });

    this.personas.set(valid.id, valid);
    return valid;
  }

  deletePersona(id: string): boolean {
    const existing = this.personas.get(id);
    if (!existing) {
      return false;
    }
    if (existing.isBuiltIn) {
      throw new ReservedPersonaError(id);
    }
    return this.personas.delete(id);
  }

  getDifficultyModifier(difficulty: DifficultyLevel): string {
    return DIFFICULTY_MODIFIERS[difficulty] || DIFFICULTY_MODIFIERS["intermediate"];
  }
}
