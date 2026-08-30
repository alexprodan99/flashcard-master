import type { DataSourceType } from "../domain/models.js";
import type { IngestionStrategy } from "../ports/index.js";

export class StrategyNotFoundError extends Error {
  constructor(public readonly strategyType: string) {
    super(`No ingestion strategy registered for data source type: "${strategyType}"`);
    this.name = "StrategyNotFoundError";
  }
}

export class DuplicateStrategyError extends Error {
  constructor(public readonly strategyType: string) {
    super(`Ingestion strategy already registered for type: "${strategyType}". Use allowOverride=true to replace.`);
    this.name = "DuplicateStrategyError";
  }
}

export class StrategyRegistry {
  private readonly strategies = new Map<DataSourceType, IngestionStrategy>();

  register(strategy: IngestionStrategy, allowOverride = false): void {
    if (!strategy || !strategy.type) {
      throw new Error("Invalid ingestion strategy instance.");
    }

    if (this.strategies.has(strategy.type) && !allowOverride) {
      throw new DuplicateStrategyError(strategy.type);
    }

    this.strategies.set(strategy.type, strategy);
  }

  getStrategy(type: DataSourceType): IngestionStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new StrategyNotFoundError(type);
    }
    return strategy;
  }

  hasStrategy(type: DataSourceType): boolean {
    return this.strategies.has(type);
  }

  getAllTypes(): DataSourceType[] {
    return Array.from(this.strategies.keys());
  }

  clear(): void {
    this.strategies.clear();
  }
}
