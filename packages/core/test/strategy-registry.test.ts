import { describe, it, expect, beforeEach } from "vitest";
import { StrategyRegistry, StrategyNotFoundError, DuplicateStrategyError } from "../src/services/strategy-registry.js";
import type { IngestionStrategy } from "../src/ports/index.js";
import type { DataSource, RawDocument, CleanTextDocument } from "../src/domain/models.js";

class MockRssStrategy implements IngestionStrategy {
  readonly type = "rss" as const;
  async fetch(source: DataSource): Promise<RawDocument[]> {
    return [];
  }
  extractCleanText(raw: RawDocument): CleanTextDocument {
    return { id: raw.id, sourceId: raw.sourceId, title: raw.title, textContent: raw.rawContent, contentHash: "hash" };
  }
}

class MockWebStrategy implements IngestionStrategy {
  readonly type = "web" as const;
  async fetch(source: DataSource): Promise<RawDocument[]> {
    return [];
  }
  extractCleanText(raw: RawDocument): CleanTextDocument {
    return { id: raw.id, sourceId: raw.sourceId, title: raw.title, textContent: raw.rawContent, contentHash: "hash" };
  }
}

describe("StrategyRegistry", () => {
  let registry: StrategyRegistry;

  beforeEach(() => {
    registry = new StrategyRegistry();
  });

  it("registers and retrieves strategy by type", () => {
    const rssStrategy = new MockRssStrategy();
    registry.register(rssStrategy);

    expect(registry.hasStrategy("rss")).toBe(true);
    expect(registry.getStrategy("rss")).toBe(rssStrategy);
    expect(registry.getAllTypes()).toEqual(["rss"]);
  });

  it("throws StrategyNotFoundError when requesting an unregistered type", () => {
    expect(() => registry.getStrategy("local")).toThrow(StrategyNotFoundError);
  });

  it("throws DuplicateStrategyError when registering a duplicate without allowOverride", () => {
    registry.register(new MockRssStrategy());
    expect(() => registry.register(new MockRssStrategy())).toThrow(DuplicateStrategyError);
  });

  it("allows overriding existing strategy when allowOverride is true", () => {
    const first = new MockRssStrategy();
    const second = new MockRssStrategy();

    registry.register(first);
    registry.register(second, true);

    expect(registry.getStrategy("rss")).toBe(second);
  });
});
