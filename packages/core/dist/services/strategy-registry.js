export class StrategyNotFoundError extends Error {
    strategyType;
    constructor(strategyType) {
        super(`No ingestion strategy registered for data source type: "${strategyType}"`);
        this.strategyType = strategyType;
        this.name = "StrategyNotFoundError";
    }
}
export class DuplicateStrategyError extends Error {
    strategyType;
    constructor(strategyType) {
        super(`Ingestion strategy already registered for type: "${strategyType}". Use allowOverride=true to replace.`);
        this.strategyType = strategyType;
        this.name = "DuplicateStrategyError";
    }
}
export class StrategyRegistry {
    strategies = new Map();
    register(strategy, allowOverride = false) {
        if (!strategy || !strategy.type) {
            throw new Error("Invalid ingestion strategy instance.");
        }
        if (this.strategies.has(strategy.type) && !allowOverride) {
            throw new DuplicateStrategyError(strategy.type);
        }
        this.strategies.set(strategy.type, strategy);
    }
    getStrategy(type) {
        const strategy = this.strategies.get(type);
        if (!strategy) {
            throw new StrategyNotFoundError(type);
        }
        return strategy;
    }
    hasStrategy(type) {
        return this.strategies.has(type);
    }
    getAllTypes() {
        return Array.from(this.strategies.keys());
    }
    clear() {
        this.strategies.clear();
    }
}
//# sourceMappingURL=strategy-registry.js.map