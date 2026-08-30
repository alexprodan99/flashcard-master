import type { DifficultyLevel, PersonaType } from "../domain/models.js";

export interface PromptConfig {
  difficulty: DifficultyLevel;
  persona: PersonaType | string;
  targetCount?: number;
}

export const PERSONA_PROMPTS: Record<PersonaType, string> = {
  "socratic-mentor": "You are a thoughtful Socratic Mentor guiding the learner toward deep conceptual clarity by asking precise questions that highlight underlying mechanics.",
  "strict-examiner": "You are a rigorous Examiner creating definitive, high-stakes technical test questions with zero ambiguity.",
  "executive-synthesizer": "You are an Executive Synthesizer focusing on high-level architecture, strategic trade-offs, and critical takeaways.",
};

export class PromptBuilder {
  buildSystemPersona(persona: PersonaType | string): string {
    if (persona in PERSONA_PROMPTS) {
      return PERSONA_PROMPTS[persona as PersonaType];
    }
    return typeof persona === "string" && persona.trim().length > 0
      ? persona
      : PERSONA_PROMPTS["socratic-mentor"];
  }

  buildGenerationInstructions(config: PromptConfig): string {
    const personaIntro = this.buildSystemPersona(config.persona);
    const count = config.targetCount ?? 4;

    return `${personaIntro}

TASK: Extract exactly ${count} atomic Front/Back flashcards from the text at a "${config.difficulty}" difficulty level.

MINIMUM INFORMATION PRINCIPLE RULES:
1. ATOMICITY: Each card must test exactly ONE discrete fact or concept. Never create compound or multi-part questions.
2. ACTIVE RECALL: The Front (question) must prompt the user to retrieve specific knowledge from memory, not merely guess.
3. CONCISENESS: The Back (answer) must be short, clear, and direct (1-3 sentences or a concise list).
4. GROUNDING / VERBATIM QUOTE: For every single card, you MUST provide an exact verbatim "sourceQuote" sentence from the source document that directly supports the answer.`;
  }
}
