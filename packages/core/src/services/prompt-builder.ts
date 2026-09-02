import type { DifficultyLevel, PersonaType } from "../domain/models.js";
import { PersonaStudioService } from "./persona-studio-service.js";

export interface PromptConfig {
  difficulty: DifficultyLevel;
  persona: PersonaType | string;
  targetCount?: number;
}

export class PromptBuilder {
  constructor(private readonly studioService: PersonaStudioService = new PersonaStudioService()) {}

  buildSystemPersona(persona: PersonaType | string): string {
    const found = this.studioService.getPersona(persona);
    if (found) {
      return found.systemPrompt;
    }
    return typeof persona === "string" && persona.trim().length > 0
      ? persona
      : this.studioService.getPersona("socratic-mentor")!.systemPrompt;
  }

  buildGenerationInstructions(config: PromptConfig): string {
    const personaIntro = this.buildSystemPersona(config.persona);
    const difficultyGuide = this.studioService.getDifficultyModifier(config.difficulty);
    const count = config.targetCount ?? 4;

    return `${personaIntro}

DIFFICULTY LEVEL (${config.difficulty.toUpperCase()}):
${difficultyGuide}

TASK: Extract exactly ${count} atomic Front/Back flashcards from the text at a "${config.difficulty}" difficulty level.

MINIMUM INFORMATION PRINCIPLE RULES:
1. ATOMICITY: Each card must test exactly ONE discrete fact or concept. Never create compound or multi-part questions.
2. ACTIVE RECALL: The Front (question) must prompt the user to retrieve specific knowledge from memory, not merely guess.
3. CONCISENESS: The Back (answer) must be short, clear, and direct (1-3 sentences or a concise list).
4. GROUNDING / VERBATIM QUOTE:
   - CRITICAL: Copy and paste an EXACT, word-for-word sentence directly from the provided text into 'sourceQuote'.
   - Do NOT paraphrase, edit, summarize, or alter any words or punctuation in 'sourceQuote'.
   - The quote must appear verbatim in the text so it can be verified by automated citation guards.`;
  }
}
