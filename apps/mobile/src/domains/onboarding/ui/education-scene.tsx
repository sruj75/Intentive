import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeInRight } from "react-native-reanimated";

import { CircleButton, PrimaryButton } from "../../../design/primitives";
import { mobileTheme as theme } from "../../../design/theme";
import { onboardingContent as content, type EducationSlide } from "../config/content";

function EducationExample({ slide }: { readonly slide: EducationSlide }) {
  return (
    <View accessibilityLabel={slide.mediaLabel} style={styles.exampleCard}>
      <Text selectable style={styles.eyebrow}>
        {slide.eyebrow}
      </Text>
      <View style={styles.exampleConversation}>
        {slide.example.map((line, index) => {
          if (line.side === "system") {
            return (
              <View key={`${line.text}-${index}`} style={styles.systemRow}>
                <View style={styles.systemCircle} />
                <Text selectable style={styles.systemText}>
                  {line.text}
                </Text>
              </View>
            );
          }
          return (
            <View
              key={`${line.text}-${index}`}
              style={[styles.exampleLine, line.side === "user" && styles.exampleLineUser]}
            >
              {line.side === "user" ? (
                <View style={styles.userBubble}>
                  <Text selectable style={styles.exampleText}>
                    {line.text}
                  </Text>
                </View>
              ) : (
                <Text selectable style={styles.companionText}>
                  {line.text}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function EducationScene({
  index,
  onNext,
  onPrevious,
  onSkip,
}: {
  readonly index: number;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onSkip: () => void;
}) {
  const slide = content.education[index] ?? content.education[0]!;
  const isLast = index === content.education.length - 1;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId("education-pan")
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          if (event.translationX <= -60) onNext();
          if (event.translationX >= 60) onPrevious();
        }),
    [onNext, onPrevious],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.screen} testID={`education-slide-${index + 1}`}>
        <View style={styles.closeRow}>
          <CircleButton
            accessibilityLabel={content.educationControls.skip}
            label="×"
            onPress={onSkip}
            testID="skip-education"
          />
        </View>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            key={index}
            entering={FadeInRight.duration(theme.motion.standard)}
            style={styles.slide}
          >
            <EducationExample slide={slide} />
            <View style={styles.copy}>
              <Text selectable style={styles.title}>
                {slide.title}
              </Text>
              <Text selectable style={styles.body}>
                {slide.body}
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
        <View style={styles.footer}>
          <View
            accessibilityLabel={`Page ${index + 1} of ${content.education.length}`}
            style={styles.dots}
          >
            {content.education.map((item, slideIndex) => (
              <View
                key={item.title}
                style={[styles.dot, slideIndex === index && styles.dotActive]}
              />
            ))}
          </View>
          <PrimaryButton
            label={isLast ? content.educationControls.finish : content.educationControls.continue}
            onPress={onNext}
            testID="education-continue"
          />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.canvas },
  closeRow: {
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    alignItems: "flex-start",
  },
  content: { flexGrow: 1, paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm },
  slide: { flex: 1, gap: theme.space.xl },
  exampleCard: {
    minHeight: theme.component.education.exampleMinHeight,
    flex: 1,
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.color.surface,
    padding: theme.space.lg,
    overflow: "hidden",
    gap: theme.space.xl,
  },
  eyebrow: { ...theme.type.caption, color: theme.color.mutedInk, textAlign: "right" },
  exampleConversation: { flex: 1, justifyContent: "center", gap: theme.space.xl },
  exampleLine: { width: "100%" },
  exampleLineUser: { alignItems: "flex-end" },
  userBubble: {
    maxWidth: "88%",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceStrong,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
  },
  exampleText: { ...theme.type.body, color: theme.color.ink },
  companionText: { ...theme.type.bodyLarge, color: theme.color.ink },
  systemRow: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  systemCircle: {
    width: theme.component.education.systemCircleSize,
    height: theme.component.education.systemCircleSize,
    borderRadius: theme.component.education.systemCircleSize / 2,
    borderWidth: theme.component.education.systemCircleBorderWidth,
    borderColor: theme.color.hairline,
  },
  systemText: { ...theme.type.caption, color: theme.color.secondaryInk, flex: 1 },
  copy: { gap: theme.space.md, paddingHorizontal: theme.space.md },
  title: { ...theme.type.title, color: theme.color.ink, textAlign: "center" },
  body: { ...theme.type.body, color: theme.color.mutedInk, textAlign: "center" },
  footer: { padding: theme.space.lg, gap: theme.space.lg },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.space.xs,
  },
  dot: {
    width: theme.component.education.dotSize,
    height: theme.component.education.dotSize,
    borderRadius: theme.component.education.dotSize / 2,
    backgroundColor: theme.color.mutedInk,
  },
  dotActive: { width: theme.component.education.activeDotWidth, backgroundColor: theme.color.ink },
});
