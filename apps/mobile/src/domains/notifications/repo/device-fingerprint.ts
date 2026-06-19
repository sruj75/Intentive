import * as SecureStore from "expo-secure-store";

const DEVICE_FINGERPRINT_KEY = "intentive.device_fingerprint.v1";

export async function getOrCreateDeviceFingerprint(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_FINGERPRINT_KEY);
  if (existing) return existing;

  const generated = globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
  await SecureStore.setItemAsync(DEVICE_FINGERPRINT_KEY, generated);
  return generated;
}

function fallbackUuid(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
