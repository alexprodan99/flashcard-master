import type { ExporterPort } from "../ports/index.js";

export class ExporterRegistry {
  private readonly exporters: Map<string, ExporterPort> = new Map();

  register(exporter: ExporterPort): void {
    if (!exporter || !exporter.format) {
      throw new Error("Cannot register an exporter without a valid format identifier.");
    }
    this.exporters.set(exporter.format.toLowerCase(), exporter);
  }

  get(format: string): ExporterPort | undefined {
    return this.exporters.get(format.toLowerCase());
  }

  has(format: string): boolean {
    return this.exporters.has(format.toLowerCase());
  }

  listFormats(): string[] {
    return Array.from(this.exporters.keys()).sort();
  }

  unregister(format: string): boolean {
    return this.exporters.delete(format.toLowerCase());
  }
}
