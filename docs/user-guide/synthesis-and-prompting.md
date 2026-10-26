# ⚡ Flashcard Synthesis & Prompt Tuning

Flashcard Master pairs state-of-the-art Large Language Models with a deterministic verification pipeline to turn raw text into high-impact, hallucination-free active-recall flashcards.

---

## 🛡️ The Grounding Guard: Zero Hallucinations

The single most critical failure mode of generic AI flashcard tools is **hallucination**—generating questions about facts, dates, or concepts that do not exist in the source material, or citing false sources.

Flashcard Master solves this via the **Grounding Guard** (`GroundingGuard`):

```
Source Document Text  ──▶  LLM Generation Prompt
                                  │
                                  ▼
                       [Draft Flashcard Candidate]
                       - Question
                       - Answer
                       - Verbatim Source Quote
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │        GroundingGuard        │
                   │ Exact Substring Search Check │
                   └──────────────┬───────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   ▼                             ▼
              [VERIFIED]                    [REJECTED]
       Quote matches source text!      Quote altered or made up.
          Card is persisted.             Discarded & backfilled!
```

### How Grounding Verification Works:
1. Every prompt sent to the LLM mandates that it extract a verbatim, word-for-word quote from the text that directly justifies the answer.
2. Before any card is written to the SQLite database, `GroundingGuard.filterValidDrafts()` scans the candidate card.
3. It performs a case-insensitive, normalized substring verification against the original document chunks.
4. If an LLM paraphrases, synthesizes, or invents a citation, the card is **immediately discarded**.
5. **Adaptive Backfilling**: If discarded cards cause the batch to fall short of your requested target count, the generator automatically triggers a bounded oversampling backfill loop to produce fresh verified cards.

---

## 🎯 Multi-Tier Difficulty Scaling

Flashcard Master tailors question complexity to your current level of mastery:

| Difficulty Tier | Cognitive Focus | Example Question Style |
| :--- | :--- | :--- |
| **Beginner** | Core vocabulary, fundamental definitions, and basic facts. | *"What is SQLite's WAL mode and what does the acronym stand for?"* |
| **Intermediate** *(Default)* | Functional mechanics, relationships between concepts, and trade-offs. | *"Why does WAL mode improve concurrency compared to traditional rollback journals in multi-process applications?"* |
| **Advanced** | Edge cases, failure modes, subtle architectural implications, and synthesis. | *"Under what specific file locking or shared-memory condition does WAL mode fall back to exclusive table locking during active write transactions?"* |

---

## 🎭 Cognitive Personas

Different subjects benefit from different pedagogical styles. Flashcard Master includes tailored cognitive learning personas:

```
┌────────────────────────┐      ┌────────────────────────┐
│     Socratic Tutor     │      │  Exam Drill Sergeant   │
│ Guides through inquiry │      │  Laser-focused, direct │
└────────────────────────┘      └────────────────────────┘
┌────────────────────────┐      ┌────────────────────────┐
│     Analogy Weaver     │      │ First Principles Thinker│
│ Intuitive metaphors    │      │ Axiomatic foundations  │
└────────────────────────┘      └────────────────────────┘
```

- **Socratic Tutor**: Frames questions as guided inquiry. Challenges assumptions and explores boundary conditions.
- **Exam Drill Sergeant**: Concise, unambiguous, and laser-focused on rapid active-recall drills (ideal for medical, bar, or certification exams).
- **Analogy Weaver**: Pairs technical definitions with intuitive physical or real-world metaphors to anchor complex abstract models.
- **First-Principles Thinker**: Strips problems down to their fundamental truths and reasons upwards from axioms.

---

## ⚙️ Selecting the Right Model & Provider

Flashcard Master strictly supports 4 cutting-edge AI providers:

1. **Ollama (`phi4-mini`)**:
   - **Cost**: 100% Free
   - **Privacy**: 100% Local (no network traffic)
   - **Best For**: Sensitive documents, private notes, offline travel studying.
2. **Google Gemini (`gemini-3.6-flash`)**:
   - **Cost**: Generous free tier & affordable token rates
   - **Performance**: High throughput and exceptional long-context grounding accuracy.
   - **Best For**: Large textbooks, bulk chapter synthesis, fast iteration.
3. **OpenAI (`gpt-4o-mini`)**:
   - **Cost**: Low cost per million tokens
   - **Performance**: High instruction following and clean concise formatting.
   - **Best For**: Precision exam drills and structured technical flashcards.
4. **Anthropic (`claude-haiku-4-5-20251001`)**:
   - **Cost**: Cost-effective tier
   - **Performance**: Nuanced cognitive reasoning and rich pedagogical phrasing.
   - **Best For**: Advanced philosophical, legal, and deep synthesis cards.

> 💡 **Tip:** Use the in-repo agent skill `model-advisor` (`.agent/skills/model-advisor/`) if you need automated evaluation of your budget, privacy, and volume requirements.
