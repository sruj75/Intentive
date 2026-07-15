import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { experienceContent as content } from "../content";
import { experienceTheme as theme } from "../theme";
import { useExperience } from "./experience-provider";
import { CircleButton, MediaSlot, PrimaryButton } from "./primitives";

export function AuthScene() {
  const { dispatch } = useExperience();
  const { height } = useWindowDimensions();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.authContent,
        {
          minHeight: Math.max(
            theme.component.auth.contentMinHeight,
            height - theme.component.auth.windowInset,
          ),
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.authHero}>
        <Text selectable style={styles.authGreeting}>
          {content.auth.greetingLead}
          <Text style={styles.authAccent}>{content.auth.greetingAccent}</Text>
        </Text>
      </View>
      <View style={styles.authActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => dispatch({ type: "authentication_selected", method: "apple" })}
          style={({ pressed }) => [styles.appleButton, pressed && styles.pressed]}
          testID="continue-with-apple"
        >
          <Text style={styles.appleMark}>●</Text>
          <Text style={styles.appleLabel}>{content.auth.apple}</Text>
        </Pressable>
        <PrimaryButton
          label={content.auth.phone}
          onPress={() => dispatch({ type: "authentication_selected", method: "phone" })}
          testID="continue-with-phone"
        />
        <Text selectable style={styles.legal}>
          {content.auth.legal}
        </Text>
      </View>
    </ScrollView>
  );
}

export function NameScene() {
  const { snapshot, dispatch } = useExperience();
  const { height } = useWindowDimensions();

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.nameContent,
          {
            minHeight: Math.max(
              theme.component.name.contentMinHeight,
              height - theme.component.name.windowInset,
            ),
          },
        ]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.nameForm}>
          <Text selectable style={styles.fieldLabel}>
            {content.name.label}
          </Text>
          {snapshot.nameError ? (
            <Text
              accessibilityRole="alert"
              selectable
              style={styles.fieldError}
              testID="name-error"
            >
              {snapshot.nameError}
            </Text>
          ) : null}
          <View style={[styles.nameField, snapshot.nameError && styles.nameFieldError]}>
            <TextInput
              accessibilityLabel={content.name.label}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              enterKeyHint="next"
              onChangeText={(value) => dispatch({ type: "name_edited", value })}
              onSubmitEditing={() => dispatch({ type: "name_submitted" })}
              placeholder={content.name.placeholder}
              placeholderTextColor={theme.color.mutedInk}
              returnKeyType="next"
              style={styles.nameInput}
              testID="full-name-input"
              value={snapshot.fullName}
            />
            <CircleButton
              accessibilityLabel={content.name.continue}
              label="↑"
              onPress={() => dispatch({ type: "name_submitted" })}
              testID="submit-name"
              tone="dark"
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function FriendsIntroScene() {
  const { dispatch } = useExperience();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.introContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.conversationExample}>
        <View style={styles.exampleUserRow}>
          <View style={styles.exampleBubble}>
            <Text selectable style={styles.exampleText}>
              {content.friends.example.firstPrompt}
            </Text>
          </View>
          <View style={styles.exampleAvatar} />
        </View>
        <Text selectable style={styles.exampleProse}>
          {content.friends.example.reply}
        </Text>
        <View style={styles.exampleUserRow}>
          <View style={styles.exampleBubble}>
            <Text selectable style={styles.exampleText}>
              {content.friends.example.secondPrompt}
            </Text>
          </View>
          <View style={styles.exampleAvatar} />
        </View>
      </View>
      <View style={styles.introCopy}>
        <Text selectable style={styles.introTitle}>
          {content.friends.title}
        </Text>
        <Text selectable style={styles.introBody}>
          {content.friends.body}
        </Text>
      </View>
      <PrimaryButton
        label={content.friends.action}
        onPress={() => dispatch({ type: "advance" })}
        testID="add-friends-intro"
      />
    </ScrollView>
  );
}

export function PermissionsIntroScene() {
  const { dispatch } = useExperience();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.introContent}
      showsVerticalScrollIndicator={false}
    >
      <MediaSlot label={content.permissions.mediaLabel}>
        <View style={styles.phonePreview}>
          <View style={styles.exampleUserRow}>
            <View style={styles.exampleBubble}>
              <Text selectable style={styles.exampleText}>
                {content.permissions.example.prompt}
              </Text>
            </View>
            <View style={styles.exampleAvatar} />
          </View>
          <Text selectable style={styles.exampleProse}>
            {content.permissions.example.reply}
          </Text>
          <View style={styles.previewComposer}>
            <Text style={styles.previewPlaceholder}>
              {content.permissions.example.composerPlaceholder}
            </Text>
          </View>
        </View>
      </MediaSlot>
      <Text selectable style={styles.introTitle}>
        {content.permissions.title}
      </Text>
      <PrimaryButton
        label={content.permissions.action}
        onPress={() => dispatch({ type: "advance" })}
        testID="enable-permissions"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: theme.component.auth.pressedOpacity },
  authContent: {
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.xxl,
    paddingBottom: theme.space.xl,
    justifyContent: "space-between",
    gap: theme.space.xl,
  },
  authHero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: theme.component.auth.heroMinHeight,
  },
  authGreeting: {
    ...theme.component.auth.greeting,
    color: theme.color.ink,
    textAlign: "center",
  },
  authAccent: { color: theme.color.accent },
  authActions: { gap: theme.space.sm },
  appleButton: {
    minHeight: theme.component.auth.appleButtonMinHeight,
    borderWidth: theme.stroke.hairline,
    borderColor: theme.color.hairline,
    borderRadius: theme.radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
  },
  appleMark: { color: theme.color.ink, fontSize: theme.component.auth.appleMarkSize },
  appleLabel: { ...theme.type.label, color: theme.color.ink },
  legal: {
    ...theme.type.caption,
    color: theme.color.secondaryInk,
    textAlign: "center",
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.xs,
  },
  nameContent: {
    justifyContent: "flex-end",
    paddingHorizontal: theme.space.md,
    paddingBottom: theme.space.xl,
  },
  nameForm: { gap: theme.space.xs },
  fieldLabel: { ...theme.type.label, color: theme.color.mutedInk, paddingLeft: theme.space.xs },
  fieldError: { ...theme.type.caption, color: theme.color.error, paddingLeft: theme.space.xs },
  nameField: {
    minHeight: theme.component.name.fieldMinHeight,
    borderWidth: theme.component.name.fieldBorderWidth,
    borderColor: theme.color.hairline,
    borderRadius: theme.radius.pill,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: theme.space.md,
    paddingRight: theme.component.name.fieldTrailingPadding,
    gap: theme.space.xs,
  },
  nameFieldError: { borderColor: theme.color.error },
  nameInput: {
    flex: 1,
    ...theme.type.bodyLarge,
    color: theme.color.ink,
    paddingVertical: theme.component.name.inputVerticalPadding,
  },
  introContent: {
    flexGrow: 1,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.lg,
    paddingBottom: theme.space.xl,
    justifyContent: "space-between",
    gap: theme.space.lg,
  },
  conversationExample: {
    flex: 1,
    justifyContent: "center",
    gap: theme.space.xl,
    minHeight: theme.component.intro.exampleMinHeight,
  },
  exampleUserRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: theme.space.xs,
  },
  exampleBubble: {
    backgroundColor: theme.color.surfaceStrong,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.component.intro.bubbleVerticalPadding,
    maxWidth: "82%",
  },
  exampleText: { ...theme.type.body, color: theme.color.ink },
  exampleAvatar: {
    width: theme.component.intro.avatarSize,
    height: theme.component.intro.avatarSize,
    borderRadius: theme.component.intro.avatarSize / 2,
    backgroundColor: theme.color.avatarPlaceholder,
  },
  exampleProse: { ...theme.type.bodyLarge, color: theme.color.ink },
  introCopy: { gap: theme.space.md },
  introTitle: { ...theme.type.title, color: theme.color.ink, textAlign: "center" },
  introBody: { ...theme.type.body, color: theme.color.mutedInk, textAlign: "center" },
  phonePreview: { flex: 1, justifyContent: "space-between", gap: theme.space.lg },
  previewComposer: {
    minHeight: theme.component.intro.previewComposerMinHeight,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.canvas,
    justifyContent: "center",
    paddingHorizontal: theme.space.md,
  },
  previewPlaceholder: { ...theme.type.caption, color: theme.color.mutedInk },
});
