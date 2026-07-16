export function createControllerStore<TSnapshot, TEvent>(
  initial: TSnapshot,
  reduce: (snapshot: TSnapshot, event: TEvent) => TSnapshot,
): {
  getSnapshot(): TSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(event: TEvent): void;
  dispose(): void;
} {
  let snapshot = initial;
  let disposed = false;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(event) {
      if (disposed) return;
      const next = reduce(snapshot, event);
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
