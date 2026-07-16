import React, { createContext, useContext, useMemo, useSyncExternalStore } from "react";

import { createProfileStore, type ProfileSnapshot, type ProfileStore } from "./profile-store";

const ProfileContext = createContext<ProfileStore | null>(null);

export function ProfileProvider({
  children,
  store,
}: {
  readonly children: React.ReactNode;
  readonly store?: ProfileStore;
}) {
  const profileStore = useMemo(() => store ?? createProfileStore(), [store]);
  return <ProfileContext.Provider value={profileStore}>{children}</ProfileContext.Provider>;
}

export function useProfileStore(): ProfileStore {
  const store = useContext(ProfileContext);
  if (store === null) throw new Error("useProfileStore must be rendered inside ProfileProvider");
  return store;
}

export function useProfileSnapshot(): ProfileSnapshot {
  const store = useProfileStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
