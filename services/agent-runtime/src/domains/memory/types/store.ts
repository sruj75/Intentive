export interface UserMemoryStoreItem {
  readonly value: {
    readonly content?: unknown;
  };
}

export interface UserMemoryStore {
  get(namespace: string[], key: string): Promise<UserMemoryStoreItem | null>;
}
