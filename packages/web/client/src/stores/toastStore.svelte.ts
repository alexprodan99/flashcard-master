export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  durationMs?: number;
  timestamp: number;
}

export class ToastStore {
  toasts = $state<Toast[]>([]);

  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', durationMs = 4500) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const toast: Toast = { id, type, message, durationMs, timestamp: Date.now() };
    this.toasts = [...this.toasts, toast];

    if (durationMs > 0 && typeof window !== 'undefined') {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }
    return id;
  }

  success(message: string, durationMs?: number) {
    return this.show(message, 'success', durationMs);
  }

  error(message: string, durationMs = 6000) {
    return this.show(message, 'error', durationMs);
  }

  warn(message: string, durationMs?: number) {
    return this.show(message, 'warning', durationMs);
  }

  warning(message: string, durationMs?: number) {
    return this.warn(message, durationMs);
  }

  info(message: string, durationMs?: number) {
    return this.show(message, 'info', durationMs);
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  clear() {
    this.toasts = [];
  }
}

export const toastStore = new ToastStore();
