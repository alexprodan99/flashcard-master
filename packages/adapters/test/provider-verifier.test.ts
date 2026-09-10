import { describe, it, expect, vi } from "vitest";
import { ProviderVerifier } from "../src/verification/provider-verifier.js";

describe("ProviderVerifier", () => {
  describe("Notion verification", () => {
    it("returns success with bot and workspace details when token is valid", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any) => {
        if (String(url).includes("/v1/users/me")) {
          return new Response(
            JSON.stringify({
              object: "user",
              id: "user-1234",
              name: "Flashcard Master",
              type: "bot",
              bot: {
                owner: { type: "workspace", workspace: true },
                workspace_name: "Engineering Docs",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        return new Response("Not found", { status: 404 });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "notion",
        key: "secret_valid_notion_key",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Flashcard Master");
      expect(result.message).toContain("Engineering Docs");
      expect(result.details?.botName).toBe("Flashcard Master");
      expect(result.details?.workspaceName).toBe("Engineering Docs");
      expect(result.details?.userId).toBe("user-1234");
    });

    it("supports custom endpoint URL for Notion", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any) => {
        expect(String(url)).toContain("https://notion-proxy.internal");
        return new Response(
          JSON.stringify({
            object: "user",
            id: "user-proxy",
            name: "Proxy Bot",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "notion",
        key: "secret_proxy",
        endpoint: "https://notion-proxy.internal",
      });

      expect(result.success).toBe(true);
      expect(result.details?.botName).toBe("Proxy Bot");
    });

    it("returns failure when Notion token is omitted", async () => {
      const verifier = new ProviderVerifier();
      const result = await verifier.verify({
        provider: "notion",
        key: null,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("No Notion API token provided");
    });

    it("returns authentication failure when Notion API responds with 401 unauthorized", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            object: "error",
            status: 401,
            code: "unauthorized",
            message: "API token is invalid.",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "notion",
        key: "secret_invalid",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Notion authentication failed: invalid API token.");
    });

    it("handles Notion timeout (> 3s)", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (_url, options) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch, defaultTimeoutMs: 50 });
      const result = await verifier.verify({
        provider: "notion",
        key: "secret_hanging",
        timeoutMs: 50,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Connection to Notion timed out");
    });
  });

  describe("OpenAI verification", () => {
    it("returns success and model count when API key is valid", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any) => {
        expect(String(url)).toBe("https://api.openai.com/v1/models");
        return new Response(
          JSON.stringify({
            object: "list",
            data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "openai",
        key: "sk-valid-key",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Connected to OpenAI successfully.");
      expect(result.details?.modelCount).toBe(2);
    });

    it("allows keyless verification for local OpenAI endpoints", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any) => {
        expect(String(url)).toBe("http://localhost:8080/v1/models");
        return new Response(
          JSON.stringify({
            object: "list",
            data: [{ id: "llama-3.2-3b" }],
          }),
          { status: 200 }
        );
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "openai",
        key: null,
        endpoint: "http://localhost:8080/v1",
      });

      expect(result.success).toBe(true);
      expect(result.details?.modelCount).toBe(1);
    });

    it("uses custom endpoint override when provided", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any) => {
        expect(String(url)).toBe("https://custom-openai-proxy.local/v1/models");
        return new Response(JSON.stringify({ object: "list", data: [{ id: "custom-model" }] }), { status: 200 });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "openai",
        key: "sk-custom",
        endpoint: "https://custom-openai-proxy.local/v1/",
      });

      expect(result.success).toBe(true);
      expect(result.details?.modelCount).toBe(1);
    });

    it("returns authentication failure when OpenAI responds with 401", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "openai",
        key: "sk-bad-key",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("OpenAI authentication failed: invalid API key.");
    });

    it("extracts structured error message from OpenAI API failure", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ error: { message: "Project access restricted." } }), { status: 403, statusText: "Forbidden" });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "openai",
        key: "sk-restricted",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Project access restricted.");
    });

    it("returns rate limit failure when OpenAI responds with 429", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), { status: 429 });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "openai",
        key: "sk-quota-exceeded",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("OpenAI rate limit or quota exceeded.");
    });

    it("returns failure when OpenAI key is missing for non-local endpoint", async () => {
      const verifier = new ProviderVerifier();
      const result = await verifier.verify({
        provider: "openai",
        key: "",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("No OpenAI API key provided");
    });
  });

  describe("Anthropic verification", () => {
    it("returns success with models endpoint probe", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
        expect(String(url)).toBe("https://api.anthropic.com/v1/models");
        expect(opts?.headers?.["x-api-key"]).toBe("sk-ant-valid");
        expect(opts?.headers?.["anthropic-version"]).toBe("2023-06-01");
        return new Response(
          JSON.stringify({
            data: [{ id: "claude-3-5-sonnet-20241022" }, { id: "claude-3-haiku-20240307" }],
          }),
          { status: 200 }
        );
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "anthropic",
        key: "sk-ant-valid",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Connected to Anthropic successfully.");
      expect(result.details?.modelCount).toBe(2);
    });

    it("falls back to 1-token message ping if /models returns 404", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any) => {
        if (String(url).endsWith("/models")) {
          return new Response("Not found", { status: 404 });
        }
        if (String(url).endsWith("/messages")) {
          return new Response(JSON.stringify({ id: "msg_123", content: [{ type: "text", text: "pong" }] }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "anthropic",
        key: "sk-ant-proxy-key",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Connected to Anthropic successfully.");
    });

    it("returns auth failure when Anthropic responds with 401", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "anthropic",
        key: "sk-ant-invalid",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Anthropic authentication failed: invalid API key.");
    });

    it("returns rate limit failure when Anthropic responds with 429", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), { status: 429 });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "anthropic",
        key: "sk-ant-rate-limited",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Anthropic rate limit or quota exceeded.");
    });
  });

  describe("Google Gemini verification", () => {
    it("uses x-goog-api-key header and returns success when API key is valid", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
        expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models");
        expect(opts?.headers?.["x-goog-api-key"]).toBe("AIzaValidKey");
        return new Response(
          JSON.stringify({
            models: [{ name: "models/gemini-1.5-flash" }, { name: "models/gemini-1.5-pro" }],
          }),
          { status: 200 }
        );
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "gemini",
        key: "AIzaValidKey",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Connected to Google Gemini successfully.");
      expect(result.details?.modelCount).toBe(2);
    });

    it("returns auth failure when Gemini responds with 400 or 403", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "gemini",
        key: "AIzaInvalidKey",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Google Gemini authentication failed: invalid API key.");
    });
  });

  describe("Ollama verification", () => {
    it("returns success with installed model names when Ollama daemon is reachable", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any) => {
        expect(String(url)).toBe("http://localhost:11434/api/tags");
        return new Response(
          JSON.stringify({
            models: [{ name: "phi4-mini:latest" }, { name: "llama3.2:latest" }],
          }),
          { status: 200 }
        );
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "ollama",
        endpoint: "http://localhost:11434",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("2 models installed");
      expect(result.details?.models).toEqual(["phi4-mini:latest", "llama3.2:latest"]);
    });

    it("attaches Authorization header when key is provided for authenticated Ollama instances", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
        expect(opts?.headers?.["Authorization"]).toBe("Bearer ollama-auth-token");
        return new Response(
          JSON.stringify({
            models: [{ name: "mistral:latest" }],
          }),
          { status: 200 }
        );
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "ollama",
        key: "ollama-auth-token",
        endpoint: "https://remote-ollama.corp.internal",
      });

      expect(result.success).toBe(true);
      expect(result.details?.models).toEqual(["mistral:latest"]);
    });

    it("handles Ollama instance with zero models gracefully", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "ollama",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Connected to Ollama (no models currently installed).");
      expect(result.details?.models).toEqual([]);
    });

    it("returns descriptive failure when Ollama daemon is offline/unreachable", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch });
      const result = await verifier.verify({
        provider: "ollama",
        endpoint: "http://localhost:11434",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Cannot connect to Ollama at http://localhost:11434: instance unreachable or offline.");
    });
  });

  describe("Edge cases & General validation", () => {
    it("handles null/undefined options safely", async () => {
      const verifier = new ProviderVerifier();
      const result = await verifier.verify(null as any);
      expect(result.success).toBe(false);
      expect(result.message).toBe("Options object is required.");
    });

    it("returns unsupported provider error for unknown providers", async () => {
      const verifier = new ProviderVerifier();
      const result = await verifier.verify({
        provider: "deepseek" as any,
        key: "secret",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unsupported provider "deepseek".');
    });

    it("interpolates dynamic timeout duration in error messages", async () => {
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (_url, options) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });

      const verifier = new ProviderVerifier({ customFetch: mockFetch, defaultTimeoutMs: 2000 });
      const result = await verifier.verify({
        provider: "openai",
        key: "sk-hanging",
        timeoutMs: 2000,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Connection to OpenAI timed out after 2 seconds.");
    });
  });
});
