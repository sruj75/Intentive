import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AccountState } from "@intentive/api-contract";

import { useMobileTheme, type MobileThemeColors } from "../../../design/theme";
import { useLaunchState } from "../../../providers/launch-state";
import type { ConnectionState } from "../../chat/types/conversation";
import { connectionStatusLabel, deriveConnectionStatus } from "../service/account-status";

export interface AccountSurfaceProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSignOut: () => Promise<void>;
  readonly runtimeConnectionState: ConnectionState;
  readonly controlPlaneBaseUrl: string;
  readonly accountState?: AccountState | null;
  readonly appVersion?: string;
}

export function AccountSurface({
  visible,
  onClose,
  onSignOut,
  runtimeConnectionState,
  controlPlaneBaseUrl,
  accountState,
  appVersion = "mobile-v1",
}: AccountSurfaceProps): React.JSX.Element | null {
  const { state: launchState, markSignedOut } = useLaunchState();
  const [setupGuidanceVisible, setSetupGuidanceVisible] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const theme = useMobileTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme]);
  const accountUserId = accountState?.user_id ?? null;

  // Reset transient surface state whenever the sheet opens; identity itself
  // comes from the projected accountState, refreshed by the composition root.
  useEffect(() => {
    if (!visible) return;
    setSetupGuidanceVisible(false);
    setLogoutError(null);
  }, [visible]);

  if (!visible) return null;

  const connectionStatus = deriveConnectionStatus({
    controlPlaneBaseUrl,
    runtimeConnectionState,
  });

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setLogoutError(null);
    try {
      await onSignOut();
      markSignedOut();
      onClose();
    } catch {
      setLogoutError("Could not sign out. Try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
      testID="intentive-account-surface"
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Account</Text>
            <Pressable
              accessibilityLabel="Close account"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}
              testID="intentive-account-close"
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <AccountRow styles={styles} title="Signed in" value={accountUserId ?? "Signed in"} />
            <AccountRow
              styles={styles}
              title="Connection"
              value={connectionStatusLabel(connectionStatus)}
            />
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Mac setup</Text>
                <Text style={styles.rowValue}>{macSetupValue(launchState.siblingInvitation)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSetupGuidanceVisible(true)}
                style={styles.secondaryButton}
                testID="intentive-account-mac-setup"
              >
                <Text style={styles.secondaryButtonText}>Set up Mac</Text>
              </Pressable>
            </View>

            {setupGuidanceVisible ? (
              <Text style={styles.guidance}>
                Install Intentive on your Mac and sign in with the same account.
              </Text>
            ) : null}

            <AccountRow
              styles={styles}
              title="Support"
              value="Send feedback from Help if you need us."
            />
            <AccountRow styles={styles} title="App debug" value={appVersion} />

            {logoutError === null ? null : <Text style={styles.error}>{logoutError}</Text>}

            <Pressable
              accessibilityRole="button"
              disabled={isSigningOut}
              onPress={handleSignOut}
              style={[styles.signOutButton, isSigningOut && styles.disabledButton]}
              testID="intentive-account-sign-out"
            >
              <Text style={styles.signOutText}>{isSigningOut ? "Signing out" : "Sign out"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AccountRow({
  title,
  value,
  styles,
}: {
  readonly title: string;
  readonly value: string;
  readonly styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

function macSetupValue(siblingInvitation: "pending" | "completed" | "skipped" | null): string {
  if (siblingInvitation === "pending") return "Setup available";
  if (siblingInvitation === "skipped") return "Setup available";
  return "Setup or reconnect when needed";
}

function createStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    backdrop: {
      alignItems: "center",
      backgroundColor: colors.backdrop,
      flex: 1,
      justifyContent: "flex-end",
      padding: 12,
    },
    sheet: {
      backgroundColor: colors.paper,
      borderRadius: 22,
      borderCurve: "continuous",
      maxHeight: "86%",
      overflow: "hidden",
      width: "100%",
    },
    header: {
      alignItems: "center",
      borderBottomColor: colors.line,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    title: {
      color: colors.ink,
      fontSize: 20,
      fontWeight: "700",
    },
    closeButton: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    closeText: {
      color: colors.action,
      fontSize: 14,
      fontWeight: "600",
    },
    content: {
      gap: 10,
      padding: 16,
    },
    row: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 60,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    rowCopy: {
      flex: 1,
      gap: 3,
      paddingRight: 10,
    },
    rowTitle: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: "700",
    },
    rowValue: {
      color: colors.inkMuted,
      fontSize: 14,
      lineHeight: 19,
    },
    secondaryButton: {
      backgroundColor: colors.actionMuted,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    secondaryButtonText: {
      color: colors.action,
      fontSize: 13,
      fontWeight: "700",
    },
    guidance: {
      backgroundColor: colors.actionMuted,
      borderRadius: 14,
      color: colors.ink,
      fontSize: 14,
      lineHeight: 20,
      padding: 12,
    },
    error: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 18,
    },
    signOutButton: {
      alignItems: "center",
      borderColor: colors.dangerBorder,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      marginTop: 2,
      paddingVertical: 12,
    },
    disabledButton: {
      opacity: 0.55,
    },
    signOutText: {
      color: colors.danger,
      fontSize: 15,
      fontWeight: "700",
    },
  });
}
