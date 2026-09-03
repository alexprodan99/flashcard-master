import type { DifficultyLevel, PersonaType, CardDepthMode } from "../domain/models.js";
import { PersonaStudioService } from "./persona-studio-service.js";

export interface PromptConfig {
  difficulty: DifficultyLevel;
  persona: PersonaType | string;
  targetCount?: number;
  depthMode?: CardDepthMode;
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
    const depthMode: CardDepthMode = config.depthMode ?? "atomic";

    let depthRules = "";
    let taskTitle = "";

    if (depthMode === "deep-dive") {
      taskTitle = `TASK: Synthesize exactly ${count} comprehensive DEEP-DIVE flashcards from the text at a "${config.difficulty}" difficulty level.`;
      depthRules = `DEEP-DIVE PEDAGOGICAL RULES:
1. MECHANISM & SYNTHESIS: The Front (question) must prompt for a deep conceptual explanation, architectural mechanism, tradeoff comparison, or root-cause analysis rather than a simple definition.
2. THOROUGH & STRUCTURED EXPLANATION: The Back (answer) must provide a comprehensive, multi-step explanation (3-6 sentences or structured bullet breakdown) detailing HOW and WHY the mechanism works.
3. HIGH COGNITIVE RIGOR: Target structural relationships, operational lifecycle, failure modes, and engineering tradeoffs.`;
    } else if (depthMode === "scenario") {
      taskTitle = `TASK: Create exactly ${count} applied SCENARIO & CASE-STUDY flashcards from the text at a "${config.difficulty}" difficulty level.`;
      depthRules = `SCENARIO-BASED PEDAGOGICAL RULES:
1. SITUATIONAL CONTEXT: The Front (question) must frame an applied engineering scenario, troubleshooting challenge, or architectural design decision (e.g., "Given a system where...", "When encountering issue X during Y...").
2. ACTIONABLE DIAGNOSIS & REMEDIATION: The Back (answer) must explain the diagnosis, optimal strategy, and underlying rationale step-by-step.
3. APPLIED MASTERY: Test practical application of the concepts described in the text.`;
    } else {
      taskTitle = `TASK: Extract exactly ${count} atomic Front/Back flashcards from the text at a "${config.difficulty}" difficulty level.`;
      depthRules = `MINIMUM INFORMATION PRINCIPLE RULES:
1. ATOMICITY: Each card must test exactly ONE discrete fact or concept. Never create compound or multi-part questions.
2. ACTIVE RECALL: The Front (question) must prompt the user to retrieve specific knowledge from memory, not merely guess.
3. CONCISENESS: The Back (answer) must be short, clear, and direct (1-3 sentences or a concise list).`;
    }

    return `${personaIntro}

DIFFICULTY LEVEL (${config.difficulty.toUpperCase()}):
${difficultyGuide}

${taskTitle}

${depthRules}
4. GROUNDING / VERBATIM QUOTE:
   - CRITICAL: Copy and paste an EXACT, word-for-word sentence directly from the provided text into 'sourceQuote'.
   - Do NOT paraphrase, edit, summarize, or alter any words or punctuation in 'sourceQuote'.
   - The quote must appear verbatim in the text so it can be verified by automated citation guards.`;
  }
}
