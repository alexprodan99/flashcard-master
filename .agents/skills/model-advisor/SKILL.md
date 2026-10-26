---
name: model-advisor
description: Evaluates flashcard generation criteria (budget/cost-efficiency, offline privacy, verbatim quote grounding, deep synthesis) to recommend the optimal AI provider and model configuration in Flashcard Master.
---

# 🧠 Flashcard Master — LLM Model Advisor Skill

## Purpose
Recommend the most suitable LLM provider and model configuration for any flashcard generation workload in Flashcard Master based on explicit user priorities:
- **Cost / Token Efficiency** (minimizing expense per card while maintaining schema validity)
- **Local Privacy & Offline Access** (zero telemetry, self-hosted execution)
- **Verbatim Grounding Fidelity** (strict citation adherence without hallucination)
- **Deep Cognitive Synthesis** (complex academic texts, multi-step scenario reasoning)

---

## The 4 Official Supported Providers & Modern Model Registry

Flashcard Master strictly supports four vetted providers. Outdated/legacy model generations (e.g. Gemini 1.5, older Claude 3) have been superseded by the modern lineup:

| Provider | In-Code Default | Modern Alternatives | Pricing per 1M Tokens (In / Out) | Strengths & Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| 🔵 **Google Gemini** | **`gemini-3.6-flash`** | `gemini-3.6-pro`<br>`gemini-2.5-flash`<br>`gemini-2.5-pro` | **$0.10 / $0.40**<br>*(Generous free tier)* | Ultra-fast time-to-first-token, native `responseSchema` structured JSON, 1M+ token context window. Optimal price-to-performance ratio. |
| 🟢 **OpenAI** | **`gpt-4o-mini`** | `o3-mini`<br>`gpt-4o`<br>`gpt-4.5-preview` | **$0.15 / $0.60** | Strict `json_schema` schema compliance, consistent formatting, low latency, global reliability. |
| 🟣 **Anthropic Claude** | **`claude-haiku-4-5-20251001`** | `claude-sonnet-5`<br>`claude-opus-5` | **$0.80 / $4.00** | Exceptional nuance, superior adherence to negative constraints ("never hallucinate quotes"), top-tier verbatim grounding. |
| 🦙 **Ollama (Local)** | **`phi4-mini`** | `qwen2.5:7b`<br>`llama3.3:70b`<br>`mistral` | **$0.00**<br>*(100% Free / Offline)* | Zero external network calls, zero data leakage. `phi4-mini` runs comfortably on consumer laptops (<4GB VRAM). |

---

## Workload Sizing & Cost Estimation Formulas

A standard card generation batch in Flashcard Master consists of:
- **Input / Prompt Tokens:** ~1,500 tokens (document slice + system prompt + persona + Zod schema definition).
- **Output / Completion Tokens:** ~800 tokens (15–20 structured flashcards with quotes, difficulty, and keywords).

### Cost Comparison per 1,000 Flashcards (~50 batches)

| Provider & Model | Estimated Input Cost | Estimated Output Cost | Total Cost / 1,000 Cards |
| :--- | :--- | :--- | :--- |
| **Ollama (`phi4-mini` / `qwen2.5:7b`)** | $0.00 | $0.00 | **$0.00 (Free)** |
| **Google Gemini (`gemini-3.6-flash`)** | $0.0075 | $0.016 | **~$0.02** |
| **OpenAI (`gpt-4o-mini`)** | $0.011 | $0.024 | **~$0.035** |
| **Anthropic (`claude-haiku-4-5-20251001`)** | $0.060 | $0.160 | **~$0.22** |
| **OpenAI (`o3-mini` Reasoning)** | $0.082 | $0.176 | **~$0.26** (+ reasoning tokens) |
| **Anthropic (`claude-sonnet-5`)** | $0.225 | $1.200 | **~$1.42** |

---

## Recommendation Decision Trees

### Case 1: "I want maximum value and lowest cost per card" (Default Workloads)
- **Top Recommendation:** **Google Gemini `gemini-3.6-flash`**
- **Runner-Up:** **OpenAI `gpt-4o-mini`**
- **Rationale:** At ~$0.02–$0.03 per 1,000 cards generated, both models deliver sub-second generation speeds and native strict schema compliance without draining credits.

### Case 2: "I want 100% privacy, zero cost, and offline operation"
- **Top Recommendation for Standard Laptops (<8GB RAM/VRAM):** **Ollama `phi4-mini`**
- **Top Recommendation for Workstations (16GB+ RAM):** **Ollama `qwen2.5:7b`**
- **Rationale:** `phi4-mini` is ultra-compact and generates flashcards smoothly without heating up laptops. `qwen2.5:7b` provides the strongest structured JSON adherence among open-weight models.

### Case 3: "I am studying medical, legal, or high-stakes textbooks where quotes must be 100% exact"
- **Top Recommendation:** **Anthropic Claude `claude-haiku-4-5-20251001`**
- **Rationale:** Anthropic's models exhibit the lowest hallucination rate on verbatim citation retrieval, ensuring cards are anchored strictly in source text.

### Case 4: "I need deep reasoning across dense, ambiguous, or multi-step academic concepts"
- **Top Recommendation:** **Google Gemini `gemini-3.6-pro`** or **OpenAI `o3-mini`**
- **Rationale:** Deeper cognitive synthesis capable of connecting disparate chapters into cohesive question/answer pairs.

---

## Configuration Recipes

### 1. In the Web UI Settings Studio (`http://localhost:3000/#/settings`)
1. Navigate to **⚙️ Settings & Integrations**.
2. Select your provider under **AI Generation Defaults** (e.g. `gemini`).
3. Set the model identifier in **Default Model Name** (e.g. `gemini-3.6-flash`).
4. Click **Save Settings** (applies instantly at runtime with zero server restart).

### 2. Via CLI Command
Override the model for an ad-hoc generation batch:
```bash
# High-speed budget batch via Gemini
flashcard-master generate --provider gemini --model gemini-3.6-flash --source 1 --limit 20

# 100% offline local batch via Ollama
flashcard-master generate --provider ollama --model phi4-mini --source 1 --limit 15

# Strict verbatim grounding via Claude
flashcard-master generate --provider anthropic --model claude-haiku-4-5-20251001 --source 1 --limit 10
```

### 3. Via Environment Variables (`.env`)
```bash
DEFAULT_AI_PROVIDER=gemini
DEFAULT_AI_MODEL=gemini-3.6-flash
```
