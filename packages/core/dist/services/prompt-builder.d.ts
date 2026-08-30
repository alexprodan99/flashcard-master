import type { DifficultyLevel, PersonaType } from "../domain/models.js";
export interface PromptConfig {
    difficulty: DifficultyLevel;
    persona: PersonaType | string;
    targetCount?: number;
}
export declare const PERSONA_PROMPTS: Record<PersonaType, string>;
export declare class PromptBuilder {
    buildSystemPersona(persona: PersonaType | string): string;
    buildGenerationInstructions(config: PromptConfig): string;
}
//# sourceMappingURL=prompt-builder.d.ts.map