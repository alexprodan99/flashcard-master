import { type PersonaDefinition, type DifficultyLevel } from "../domain/models.js";
export declare class ReservedPersonaError extends Error {
    constructor(id: string);
}
export declare const BUILTIN_PERSONAS: PersonaDefinition[];
export declare const DIFFICULTY_MODIFIERS: Record<DifficultyLevel, string>;
export declare class PersonaStudioService {
    private readonly personas;
    constructor(initialCustomPersonas?: PersonaDefinition[]);
    getPersona(id: string): PersonaDefinition | undefined;
    listPersonas(): PersonaDefinition[];
    registerPersona(persona: Omit<PersonaDefinition, "isBuiltIn">): PersonaDefinition;
    deletePersona(id: string): boolean;
    getDifficultyModifier(difficulty: DifficultyLevel): string;
}
//# sourceMappingURL=persona-studio-service.d.ts.map