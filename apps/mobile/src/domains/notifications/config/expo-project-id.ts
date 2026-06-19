export interface ExpoProjectConstants {
  expoConfig?: {
    extra?: {
      eas?: {
        projectId?: unknown;
      };
    };
  } | null;
  easConfig?: {
    projectId?: unknown;
  } | null;
}

export function resolveExpoProjectId(constants: ExpoProjectConstants): string | undefined {
  const expoConfigProjectId = constants.expoConfig?.extra?.eas?.projectId;
  if (typeof expoConfigProjectId === "string" && expoConfigProjectId.length > 0) {
    return expoConfigProjectId;
  }

  const easConfigProjectId = constants.easConfig?.projectId;
  return typeof easConfigProjectId === "string" && easConfigProjectId.length > 0
    ? easConfigProjectId
    : undefined;
}
