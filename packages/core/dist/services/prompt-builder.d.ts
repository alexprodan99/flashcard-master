import type { DifficultyLevel, PersonaType } from "../domain/models.js";
import { PersonaStudioService } from "./persona-studio-service.js";
export interface PromptConfig {
    difficulty: DifficultyLevel;
    persona: PersonaType | string;
    targetCount?: number;
}
export declare class PromptBuilder {
    private readonly studioService;
    constructor(studioService?: PersonaStudioService);
    buildSystemPersona(persona: PersonaType | string): string;
    buildGenerationInstructions(config: PromptConfig): string;
}
//# sourceMappingURL=prompt-builder.d.ts.map