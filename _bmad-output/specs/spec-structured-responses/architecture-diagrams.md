# Architecture Diagrams

This companion contains structural and sequential diagrams representing the provider-native structured response pipeline.

---

## 1. Structured Response Generation Pipeline

```mermaid
flowchart TD
    subgraph CoreDomain["packages/core"]
        ZodSchema["CardGenerationDraftSchema<br/>(Single Source of Truth)"]
        DialectCompiler["Dialect Compiler<br/>(toGemini, toOpenAI, toAnthropic, toOllama)"]
    end

    subgraph AdaptersLayer["packages/adapters"]
        GeminiAdapter["Gemini Adapter<br/>(responseSchema)"]
        OpenAIAdapter["OpenAI Adapter<br/>(json_schema strict)"]
        AnthropicAdapter["Anthropic Adapter<br/>(tools + tool_choice)"]
        OllamaAdapter["Ollama Adapter<br/>(format JSON)"]
    end

    subgraph StreamingPipeline["Streaming & Task Center"]
        SSEStream["Progressive SSE Streamer"]
        WorkerPool["Worker Thread Pipeline"]
        TaskCenterUI["Task Center Drawer<br/>(Svelte Web UI)"]
        DB["SQLite Database<br/>(cards table)"]
    end

    ZodSchema --> DialectCompiler
    DialectCompiler -->|Gemini Schema| GeminiAdapter
    DialectCompiler -->|Strict JSON Schema| OpenAIAdapter
    DialectCompiler -->|Tool Definition| AnthropicAdapter
    DialectCompiler -->|Format Schema| OllamaAdapter

    GeminiAdapter -->|Validated Objects| WorkerPool
    OpenAIAdapter -->|Validated Objects| WorkerPool
    AnthropicAdapter -->|Validated Objects| WorkerPool
    OllamaAdapter -->|Validated Objects| WorkerPool

    WorkerPool --> SSEStream
    SSEStream -->|Live Card Events| TaskCenterUI
    WorkerPool -->|Persist Cards| DB
```

---

## 2. Token Limit Cutoff & Partial Retention Flow

```mermaid
sequenceDiagram
    autonumber
    participant UI as Task Center (Web UI)
    participant Worker as Generation Worker
    participant LLM as Provider API
    participant DB as SQLite DB

    UI->>Worker: Dispatch card generation job
    Worker->>LLM: Request structured generation (compiled schema)
    loop Progressive Card Stream
        LLM-->>Worker: Stream object / tool execution
        Worker->>Worker: Validate single card against Zod
        Worker->>DB: Commit card with keywords + sourceLocator
        Worker-->>UI: SSE event (card_created)
    end

    Note over LLM,Worker: Output Token Limit Reached (Max Tokens)
    LLM--xWorker: Stream terminates with finish_reason='length'
    Worker->>Worker: Confirm completed cards preserved
    Worker-->>UI: SSE event (job_warning: "Partial output saved; token limit reached")
    Worker->>DB: Update job status (COMPLETED_WITH_WARNINGS)
    UI->>UI: Render warning banner + preserve all generated cards
```
