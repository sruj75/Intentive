const ReactNative = require("react-native");

const animation = {
  delay: () => animation,
  duration: () => animation,
  easing: () => animation,
  springify: () => animation,
};

module.exports = {
  __esModule: true,
  default: {
    View: ReactNative.View,
    Text: ReactNative.Text,
    ScrollView: ReactNative.ScrollView,
  },
  FadeIn: animation,
  FadeInRight: animation,
  FadeInUp: animation,
  FadeOut: animation,
  LinearTransition: animation,
  SlideInLeft: animation,
  SlideOutLeft: animation,
};
