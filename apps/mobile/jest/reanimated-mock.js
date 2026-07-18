const React = require("react");
const ReactNative = require("react-native");

const animation = {
  delay: () => animation,
  duration: () => animation,
  easing: () => animation,
  springify: () => animation,
};

// Test env has no native animation clock; resolve to the settled value so
// renders stay deterministic instead of racing a real timing loop.
function useSharedValue(initialValue) {
  return React.useRef({ value: initialValue }).current;
}

function useAnimatedStyle(updater) {
  return updater();
}

function withTiming(toValue) {
  return toValue;
}

function withSequence(...values) {
  return values[values.length - 1];
}

function withRepeat(value) {
  return value;
}

function withDelay(_delay, value) {
  return value;
}

// react-native-gesture-handler's GestureDetector only takes the worklet
// event path when `useSharedValue` is present, so this mock must also
// satisfy its `useEvent`/`setGestureState` surface once that's true.
function useEvent() {
  return undefined;
}

function setGestureState() {}

module.exports = {
  __esModule: true,
  default: {
    View: ReactNative.View,
    Text: ReactNative.Text,
    ScrollView: ReactNative.ScrollView,
    createAnimatedComponent: (Component) => Component,
  },
  FadeIn: animation,
  FadeInRight: animation,
  FadeInUp: animation,
  FadeOut: animation,
  LinearTransition: animation,
  SlideInLeft: animation,
  SlideOutLeft: animation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  useEvent,
  setGestureState,
};
