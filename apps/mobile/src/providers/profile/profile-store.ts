export interface ProfileSnapshot {
  readonly fullName: string;
  readonly firstName: string;
  readonly initials: string;
}

export interface ProfileStore {
  getSnapshot(): ProfileSnapshot;
  subscribe(listener: () => void): () => void;
  setName(fullName: string): void;
  reset(): void;
}

const emptyProfile: ProfileSnapshot = { fullName: "", firstName: "", initials: "" };

function profileFor(fullName: string): ProfileSnapshot {
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    fullName,
    firstName: parts[0] ?? "",
    initials: parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join(""),
  };
}

export function createProfileStore(): ProfileStore {
  let snapshot = emptyProfile;
  const listeners = new Set<() => void>();
  const publish = (next: ProfileSnapshot): void => {
    if (
      next.fullName === snapshot.fullName &&
      next.firstName === snapshot.firstName &&
      next.initials === snapshot.initials
    ) {
      return;
    }
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setName: (fullName) => publish(profileFor(fullName)),
    reset: () => publish(emptyProfile),
  };
}
