export function safeIsoDate(dateStr?: string | null): string | undefined {
  if (!dateStr || typeof dateStr !== "string") {
    return undefined;
  }
  try {
    const d = new Date(dateStr);
    const time = d.getTime();
    if (isNaN(time)) {
      return undefined;
    }
    const year = d.getFullYear();
    if (year < 1970 || year > 2100) {
      return undefined;
    }
    return d.toISOString();
  } catch {
    return undefined;
  }
}
