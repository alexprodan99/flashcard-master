import type { DataSourceType } from "../domain/models.js";
import type { IngestionStrategy } from "../ports/index.js";
export declare class StrategyNotFoundError extends Error {
    readonly strategyType: string;
    constructor(strategyType: string);
}
export declare class DuplicateStrategyError extends Error {
    readonly strategyType: string;
    constructor(strategyType: string);
}
export declare class StrategyRegistry {
    private readonly strategies;
    register(strategy: IngestionStrategy, allowOverride?: boolean): void;
    getStrategy(type: DataSourceType): IngestionStrategy;
    hasStrategy(type: DataSourceType): boolean;
    getAllTypes(): DataSourceType[];
    clear(): void;
}
//# sourceMappingURL=strategy-registry.d.ts.map