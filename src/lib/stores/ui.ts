import { writable } from 'svelte/store';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);
  let nextId = 0;

  return {
    subscribe,
    add(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
      const id = nextId++;
      update((toasts) => [...toasts, { id, message, type }]);
      setTimeout(() => {
        update((toasts) => toasts.filter((t) => t.id !== id));
      }, 3200);
    }
  };
}

export const toasts = createToastStore();

export function addToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  toasts.add(message, type);
}

export const spinner = writable<string | null>(null);

export function showSpinner(message = 'Loading…') {
  spinner.set(message);
}

export function hideSpinner() {
  spinner.set(null);
}
