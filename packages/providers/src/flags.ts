/**
 * Feature flags provider.
 *
 * STUB. Real implementation should fetch from a flags backend and
 * expose a synchronous check API (with reasonable defaults if the
 * backend is unreachable).
 */

export interface FlagClient {
  isEnabled(flag: string, user_id?: string): boolean;
}

export function createFlagClient(_config: { defaults: Record<string, boolean> }): FlagClient {
  return {
    isEnabled: (flag, _user_id) => _config.defaults[flag] ?? false,
  };
}
