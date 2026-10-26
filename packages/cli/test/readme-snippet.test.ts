import { describe, it, expect } from "vitest";
import {
  createDatabaseClient,
  FlashcardRepository,
  CardGenerationService,
  PromptBuilder,
  GroundingGuard,
} from "@flashcard-master/core";
import { OllamaAdapter } from "@flashcard-master/adapters";

describe("README Code Snippets Verification", () => {
  it("verifies Node.js library usage snippet", () => {
    const db = createDatabaseClient({ inMemory: true });
    const cardRepo = new FlashcardRepository(db);
    const llm = new OllamaAdapter({ model: "phi4-mini" });
    const promptBuilder = new PromptBuilder();
    const groundingGuard = new GroundingGuard();

    const cardGen = new CardGenerationService(llm, undefined, promptBuilder, groundingGuard);
    expect(cardGen).toBeDefined();
    expect(cardRepo).toBeDefined();
  });
});
