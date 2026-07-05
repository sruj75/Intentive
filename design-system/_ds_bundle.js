/* @ds-bundle: {"format":4,"namespace":"ApexDesignSystem_659910","components":[{"name":"ICONS","sourcePath":"assets/icons.js"},{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"Card","sourcePath":"components/cards/Card.jsx"},{"name":"StatCard","sourcePath":"components/cards/StatCard.jsx"},{"name":"ChatBubble","sourcePath":"components/chat/ChatBubble.jsx"},{"name":"ChatInput","sourcePath":"components/chat/ChatInput.jsx"},{"name":"ProgressBar","sourcePath":"components/feedback/ProgressBar.jsx"},{"name":"RingProgress","sourcePath":"components/feedback/RingProgress.jsx"},{"name":"Icon","sourcePath":"components/icon/Icon.jsx"},{"name":"NavItem","sourcePath":"components/navigation/NavItem.jsx"},{"name":"SegmentedControl","sourcePath":"components/navigation/SegmentedControl.jsx"}],"sourceHashes":{"assets/icons.js":"f60b4d2a095a","components/buttons/Button.jsx":"05a976955d4d","components/buttons/IconButton.jsx":"ceb0bb777cd6","components/cards/Card.jsx":"f1a2fab066e8","components/cards/StatCard.jsx":"80ea32b3f62a","components/chat/ChatBubble.jsx":"e2ae22c0bf2f","components/chat/ChatInput.jsx":"d006f34fe81a","components/feedback/ProgressBar.jsx":"aa9b4705ffa2","components/feedback/RingProgress.jsx":"9e6b0ce38a0a","components/icon/Icon.jsx":"e7ee5ccff3d7","components/navigation/NavItem.jsx":"98ec500e6973","components/navigation/SegmentedControl.jsx":"151e5e4ef2fa","ui_kits/desktop-app/ChatPanel.jsx":"75867a29d41c","ui_kits/desktop-app/DesktopApp.jsx":"b14a95a78a18","ui_kits/desktop-app/MainPanel.jsx":"fc30b4dfceda","ui_kits/desktop-app/Sidebar.jsx":"2819a95d0356","ui_kits/mobile-app/ChatScreen.jsx":"619296eb67f1","ui_kits/mobile-app/DashboardScreen.jsx":"5f334716ed66","ui_kits/mobile-app/MobileApp.jsx":"be5fe16b5ad3","ui_kits/mobile-app/ProgressScreen.jsx":"472079ffb129","ui_kits/mobile-app/ios-frame.jsx":"be3343be4b51"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ApexDesignSystem_659910 = window.ApexDesignSystem_659910 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/icons.js
try { (() => {
// Icon path data copied from lucide-icons/lucide (github.com/lucide-icons/lucide), MIT licensed.
// Each entry is the inner markup of a 24x24 viewBox, stroke="currentColor" icon.
const ICONS = {
  "activity": `<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"></path>`,
  "arrow-up-right": `<path d="M7 7h10v10"></path>
  <path d="M7 17 17 7"></path>`,
  "check": `<path d="M20 6 9 17l-5-5"></path>`,
  "chevron-left": `<path d="m15 18-6-6 6-6"></path>`,
  "chevron-right": `<path d="m9 18 6-6-6-6"></path>`,
  "circle": `<circle cx="12" cy="12" r="10"></circle>`,
  "coffee": `<path d="M10 2v2"></path>
  <path d="M14 2v2"></path>
  <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"></path>
  <path d="M6 2v2"></path>`,
  "droplet": `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>`,
  "dumbbell": `<path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"></path>
  <path d="m2.5 21.5 1.4-1.4"></path>
  <path d="m20.1 3.9 1.4-1.4"></path>
  <path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z"></path>
  <path d="m9.6 14.4 4.8-4.8"></path>`,
  "flame": `<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"></path>`,
  "footprints": `<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"></path>
  <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"></path>
  <path d="M16 17h4"></path>
  <path d="M4 13h4"></path>`,
  "gauge": `<path d="m12 14 4-4"></path>
  <path d="M3.34 19a10 10 0 1 1 17.32 0"></path>`,
  "heart": `<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"></path>`,
  "layers": `<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path>
  <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path>
  <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path>`,
  "mic": `<path d="M12 19v3"></path>
  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
  <rect x="9" y="2" width="6" height="13" rx="3"></rect>`,
  "plus": `<path d="M5 12h14"></path>
  <path d="M12 5v14"></path>`,
  "route": `<circle cx="6" cy="19" r="3"></circle>
  <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path>
  <circle cx="18" cy="5" r="3"></circle>`,
  "search": `<path d="m21 21-4.34-4.34"></path>
  <circle cx="11" cy="11" r="8"></circle>`,
  "send-horizontal": `<path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"></path>
  <path d="M6 12h16"></path>`,
  "settings": `<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path>
  <circle cx="12" cy="12" r="3"></circle>`,
  "sparkles": `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path>
  <path d="M20 2v4"></path>
  <path d="M22 4h-4"></path>
  <circle cx="4" cy="20" r="2"></circle>`,
  "target": `<circle cx="12" cy="12" r="10"></circle>
  <circle cx="12" cy="12" r="6"></circle>
  <circle cx="12" cy="12" r="2"></circle>`,
  "user": `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
  <circle cx="12" cy="7" r="4"></circle>`,
  "watch": `<path d="M12 10v2.2l1.6 1"></path>
  <path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05"></path>
  <path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"></path>
  <circle cx="12" cy="12" r="6"></circle>`,
  "x": `<path d="M18 6 6 18"></path>
  <path d="m6 6 12 12"></path>`,
  "zap": `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>`
};
Object.assign(__ds_scope, { ICONS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/icons.js", error: String((e && e.message) || e) }); }

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const sizes = {
  m: {
    padding: '0 22px',
    height: 48,
    fontSize: 15
  },
  s: {
    padding: '0 16px',
    height: 38,
    fontSize: 13.5
  }
};
const variants = {
  primary: {
    background: 'var(--apex-black)',
    color: 'var(--text-on-dark)',
    border: '1px solid transparent'
  },
  accent: {
    background: 'var(--accent)',
    color: 'var(--text-on-accent)',
    border: '1px solid transparent'
  },
  secondary: {
    background: 'var(--bg-surface-muted)',
    color: 'var(--text-primary)',
    border: '1px solid transparent'
  },
  outline: {
    background: 'transparent',
    color: 'var(--text-on-dark)',
    border: '1px solid var(--border-on-dark)'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-primary)',
    border: '1px solid transparent'
  }
};
function Button(props) {
  const {
    variant = 'primary',
    size = 'm',
    disabled = false,
    children,
    style,
    ...rest
  } = props;
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.m;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: s.fontSize,
      height: s.height,
      padding: s.padding,
      borderRadius: 'var(--radius-pill)',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'opacity 0.15s ease, transform 0.1s ease',
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'scale(0.97)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/cards/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card(props) {
  const {
    variant = 'surface',
    padding = 'var(--space-6)',
    radius = 'var(--radius-m)',
    style,
    children,
    ...rest
  } = props;
  const bg = variant === 'dark' ? 'var(--bg-surface-dark)' : variant === 'muted' ? 'var(--bg-surface-muted)' : variant === 'accent' ? 'var(--accent)' : 'var(--bg-surface)';
  const color = variant === 'dark' || variant === 'accent' ? 'var(--text-on-dark)' : 'var(--text-primary)';
  const shadow = variant === 'surface' ? 'var(--shadow-card)' : 'none';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: bg,
      color,
      borderRadius: radius,
      padding,
      boxShadow: shadow,
      boxSizing: 'border-box',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/Card.jsx", error: String((e && e.message) || e) }); }

// components/cards/StatCard.jsx
try { (() => {
function StatCard(props) {
  const {
    label,
    value,
    unit,
    variant = 'surface',
    icon,
    style
  } = props;
  const color = variant === 'dark' ? 'var(--text-on-dark)' : 'var(--text-primary)';
  const labelColor = variant === 'dark' ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)';
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    variant: variant,
    padding: "20px",
    style: {
      minWidth: 140,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      height: '100%',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: labelColor
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-stat-l)',
      color
    }
  }, value, unit && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-m)',
      color: labelColor,
      marginLeft: 4
    }
  }, unit))));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/chat/ChatBubble.jsx
try { (() => {
function ChatBubble(props) {
  const {
    from = 'bot',
    surface = 'light',
    children,
    timestamp
  } = props;
  const isUser = from === 'user';
  const onDark = surface === 'dark';
  const bg = isUser ? onDark ? 'rgba(255,255,255,0.14)' : 'var(--bg-surface-muted)' : 'var(--bg-surface)';
  const color = isUser && onDark ? 'var(--text-on-dark)' : 'var(--text-primary)';
  const tsColor = onDark ? 'rgba(255,255,255,0.45)' : 'var(--text-secondary)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '82%',
      padding: '14px 18px',
      borderRadius: 'var(--radius-l)',
      borderBottomRightRadius: isUser ? 6 : 'var(--radius-l)',
      borderBottomLeftRadius: isUser ? 'var(--radius-l)' : 6,
      background: bg,
      color,
      font: 'var(--text-body-l)',
      boxShadow: !isUser && !onDark ? 'var(--shadow-card)' : 'none'
    }
  }, children), timestamp && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-caption)',
      color: tsColor,
      padding: '0 4px',
      whiteSpace: 'nowrap'
    }
  }, timestamp));
}
Object.assign(__ds_scope, { ChatBubble });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chat/ChatBubble.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressBar.jsx
try { (() => {
function ProgressBar(props) {
  const {
    value,
    max = 100,
    valueLabel,
    height = 56,
    style
  } = props;
  const pct = Math.max(6, Math.min(100, value / max * 100));
  const inset = Math.round(height * 0.13);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--track-bg)',
      boxShadow: 'var(--shadow-inset-groove)',
      display: 'flex',
      alignItems: 'center',
      padding: inset,
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `calc(${pct}% - ${inset}px)`,
      height: '100%',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--apex-white)',
      boxShadow: 'var(--shadow-fill-pill)'
    }
  }), valueLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: Math.round(height * 0.42),
      top: '50%',
      transform: 'translateY(-50%)',
      font: 'var(--text-stat-m)',
      color: 'var(--text-secondary)',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-primary)'
    }
  }, valueLabel.split('/')[0]), valueLabel.includes('/') && '/' + valueLabel.split('/')[1]));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/RingProgress.jsx
try { (() => {
function RingProgress(props) {
  const {
    rings = [],
    size = 96,
    thickness = 9,
    arcDegrees = 360,
    gapBetween = 4
  } = props;
  const frac = arcDegrees / 360;
  const rotation = arcDegrees === 360 ? -90 : 90 + (360 - arcDegrees) / 2;
  const rOuter = (size - thickness) / 2;
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    style: {
      transform: `rotate(${rotation}deg)`
    }
  }, rings.map((ring, i) => {
    const rr = rOuter - i * (thickness + gapBetween);
    const cc = 2 * Math.PI * rr;
    const track = cc * frac;
    const prog = track * Math.max(0, Math.min(1, ring.value / (ring.max || 100)));
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("circle", {
      cx: size / 2,
      cy: size / 2,
      r: rr,
      fill: "none",
      stroke: "var(--track-bg)",
      strokeWidth: thickness,
      strokeLinecap: "round",
      strokeDasharray: `${track} ${cc}`
    }), /*#__PURE__*/React.createElement("circle", {
      cx: size / 2,
      cy: size / 2,
      r: rr,
      fill: "none",
      stroke: ring.color || 'var(--accent)',
      strokeWidth: thickness,
      strokeLinecap: "round",
      strokeDasharray: `${prog} ${cc}`
    }));
  }));
}
Object.assign(__ds_scope, { RingProgress });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/RingProgress.jsx", error: String((e && e.message) || e) }); }

// components/icon/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Icon(props) {
  const {
    name,
    size = 20,
    color = 'currentColor',
    strokeWidth = 2,
    filled = false,
    style,
    ...rest
  } = props;
  const body = __ds_scope.ICONS[name];
  if (!body) return null;
  return /*#__PURE__*/React.createElement("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: filled ? color : 'none',
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: 'block',
      flexShrink: 0,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: body
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icon/Icon.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const sizeMap = {
  l: 64,
  m: 52,
  s: 40
};
const filledIcons = {
  droplet: true,
  heart: true
};
function IconButton(props) {
  const {
    icon,
    size = 'm',
    variant = 'surface',
    label,
    filled,
    style,
    ...rest
  } = props;
  const d = sizeMap[size] || sizeMap.m;
  const isAccent = variant === 'accent';
  const isDark = variant === 'dark';
  const bg = isAccent ? 'var(--accent)' : isDark ? 'var(--bg-surface-dark)' : 'var(--bg-surface)';
  const color = isAccent || isDark ? 'var(--text-on-dark)' : 'var(--apex-black)';
  const shadow = isAccent ? 'var(--shadow-accent-glow)' : isDark ? 'var(--shadow-card)' : size === 's' ? 'var(--shadow-neumorph-sm)' : 'var(--shadow-neumorph)';
  const doFill = filled != null ? filled : !!filledIcons[icon];
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    style: {
      width: d,
      height: d,
      borderRadius: 'var(--radius-circle)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: bg,
      color,
      boxShadow: shadow,
      cursor: 'pointer',
      flexShrink: 0,
      transition: 'transform 0.14s ease, box-shadow 0.14s ease, opacity 0.15s ease',
      ...style
    },
    onMouseDown: e => {
      e.currentTarget.style.transform = 'scale(0.93)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: Math.round(d * 0.38),
    strokeWidth: 2.3,
    filled: doFill
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/chat/ChatInput.jsx
try { (() => {
function ChatInput(props) {
  const {
    placeholder = 'Type something..',
    value,
    onChange,
    onSubmit,
    style
  } = props;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-pill)',
      padding: '6px 6px 6px 22px',
      gap: 12,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: value,
    onChange: e => onChange && onChange(e.target.value),
    placeholder: placeholder,
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      font: 'var(--text-body-l)',
      color: 'var(--text-primary)'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: onSubmit,
    "aria-label": "Send",
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-circle)',
      border: 'none',
      background: 'var(--bg-surface-muted)',
      color: 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "mic",
    size: 17
  })));
}
Object.assign(__ds_scope, { ChatInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chat/ChatInput.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavItem.jsx
try { (() => {
function NavItem(props) {
  const {
    icon,
    label,
    active = false,
    orientation = 'vertical',
    onClick
  } = props;
  const isVertical = orientation === 'vertical';
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: 'flex',
      flexDirection: isVertical ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: isVertical ? 6 : 8,
      border: 'none',
      cursor: 'pointer',
      background: 'transparent',
      padding: isVertical ? '6px 0' : '10px 18px',
      borderRadius: isVertical ? 16 : 'var(--radius-pill)',
      color: active ? isVertical ? 'var(--apex-black)' : 'var(--text-on-dark)' : 'rgba(255,255,255,0.55)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: isVertical ? 40 : 28,
      height: isVertical ? 40 : 28,
      borderRadius: 'var(--radius-circle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: active ? isVertical ? 'var(--apex-white)' : 'var(--accent)' : 'transparent',
      color: active ? isVertical ? 'var(--accent)' : 'var(--text-on-dark)' : 'inherit'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: isVertical ? 20 : 16
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-caption)',
      fontWeight: active ? 700 : 500
    }
  }, label));
}
Object.assign(__ds_scope, { NavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SegmentedControl.jsx
try { (() => {
const {
  useState
} = React;
function SegmentedControl(props) {
  const {
    options,
    value,
    onChange,
    defaultValue,
    style
  } = props;
  const [internal, setInternal] = useState(defaultValue ?? options[0]);
  const active = value !== undefined ? value : internal;
  function select(opt) {
    if (onChange) onChange(opt);
    if (value === undefined) setInternal(opt);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      background: 'var(--bg-surface-muted)',
      borderRadius: 'var(--radius-pill)',
      padding: 4,
      gap: 2,
      ...style
    }
  }, options.map(opt => {
    const isActive = opt === active;
    return /*#__PURE__*/React.createElement("button", {
      key: opt,
      onClick: () => select(opt),
      style: {
        border: 'none',
        cursor: 'pointer',
        padding: '10px 20px',
        borderRadius: 'var(--radius-pill)',
        font: 'var(--text-label)',
        fontWeight: isActive ? 700 : 500,
        background: isActive ? 'var(--bg-surface)' : 'transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        boxShadow: isActive ? 'var(--shadow-card)' : 'none',
        transition: 'all 0.15s ease'
      }
    }, opt);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// ui_kits/desktop-app/ChatPanel.jsx
try { (() => {
const DSc = window.ApexDesignSystem_659910;
const {
  ChatBubble: CChatBubble,
  ChatInput: CChatInput,
  Icon: CIcon,
  RingProgress: CRing
} = DSc;
function MiniActivity({
  label,
  kcal,
  pct
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: 'var(--bg-surface)',
      borderRadius: 18,
      padding: '14px 16px',
      boxShadow: 'var(--shadow-card)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-body-m)',
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, kcal)), /*#__PURE__*/React.createElement(CRing, {
    rings: [{
      value: pct,
      max: 100,
      color: 'var(--accent)'
    }],
    size: 38,
    thickness: 5,
    arcDegrees: 300
  }));
}
function ChatPanel() {
  const [messages, setMessages] = React.useState([{
    from: 'user',
    text: 'How many calories did I burn yesterday?',
    ts: '2 hours ago'
  }, {
    from: 'bot',
    text: 'You burned 420 kcal across 3 activities'
  }]);
  const [draft, setDraft] = React.useState('');
  function send() {
    if (!draft.trim()) return;
    setMessages(m => [...m, {
      from: 'user',
      text: draft
    }]);
    setDraft('');
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 360,
      flexShrink: 0,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      paddingTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -30,
      left: '30%',
      right: -10,
      height: 200,
      background: 'var(--glow-accent-radial)',
      filter: 'blur(12px)',
      pointerEvents: 'none',
      zIndex: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      position: 'relative',
      zIndex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--accent)',
      color: 'var(--text-on-dark)',
      borderRadius: 'var(--radius-pill)',
      padding: '10px 20px',
      font: 'var(--text-label)',
      boxShadow: 'var(--shadow-accent-glow)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: '50%',
      background: 'var(--apex-white)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--accent)'
    }
  }, /*#__PURE__*/React.createElement(CIcon, {
    name: "sparkles",
    size: 12,
    filled: true
  })), "AI Chatbot")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      overflowY: 'auto',
      position: 'relative',
      zIndex: 1
    }
  }, messages.map((m, i) => /*#__PURE__*/React.createElement(CChatBubble, {
    key: i,
    from: m.from,
    surface: "light",
    timestamp: m.ts
  }, m.text)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(MiniActivity, {
    label: "Running",
    kcal: "120kcal",
    pct: 60
  }), /*#__PURE__*/React.createElement(MiniActivity, {
    label: "Push up",
    kcal: "200kcal",
    pct: 38
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1
    }
  }, /*#__PURE__*/React.createElement(CChatInput, {
    value: draft,
    onChange: setDraft,
    onSubmit: send
  })));
}
window.ChatPanel = ChatPanel;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/desktop-app/ChatPanel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/desktop-app/DesktopApp.jsx
try { (() => {
function DesktopApp() {
  const [active, setActive] = React.useState('dashboard');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      maxWidth: 1400,
      margin: '0 auto',
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement(window.Sidebar, {
    active: active,
    onSelect: setActive
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      gap: 32,
      minWidth: 0,
      background: 'linear-gradient(180deg, #F6F5F2 0%, #EFEEE9 100%)',
      borderRadius: 'var(--radius-xl)',
      padding: '40px 40px 44px',
      boxShadow: 'var(--shadow-raised)',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement(window.MainPanel, null), /*#__PURE__*/React.createElement(window.ChatPanel, null)));
}
window.DesktopApp = DesktopApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/desktop-app/DesktopApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/desktop-app/MainPanel.jsx
try { (() => {
const DSm = window.ApexDesignSystem_659910;
const {
  IconButton: MIconButton,
  Card: MCard,
  ProgressBar: MProgressBar,
  SegmentedControl: MSegmentedControl,
  RingProgress: MRingProgress
} = DSm;
const STEP_BARS = [10, 16, 12, 20, 14, 26, 18, 44, 54, 40, 30, 22, 16, 12];
function RouteLine() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "120",
    height: "66",
    viewBox: "0 0 120 66",
    fill: "none",
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 40 C 6 30, 14 12, 34 14 C 54 16, 44 40, 64 42 C 88 44, 78 14, 100 18 C 116 21, 110 44, 92 46",
    stroke: "var(--accent)",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "40",
    r: "4",
    fill: "var(--accent)"
  }));
}
function MainPanel() {
  const [range, setRange] = React.useState('Weekly');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 28,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--text-display-xl)',
      color: 'var(--text-primary)',
      margin: 0,
      letterSpacing: 'var(--tracking-tight)'
    }
  }, "Let\u2019s start strong!"), /*#__PURE__*/React.createElement(MCard, {
    variant: "muted",
    radius: "var(--radius-l)",
    padding: "26px 30px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-title)',
      color: 'var(--text-primary)'
    }
  }, "You\u2019re 45% to your daily goal"), /*#__PURE__*/React.createElement(MIconButton, {
    icon: "zap",
    variant: "accent",
    size: "m",
    label: "Energy",
    filled: true
  })), /*#__PURE__*/React.createElement(MProgressBar, {
    value: 2340,
    max: 8000,
    valueLabel: "2,340/8000"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 18
    }
  }, [['dumbbell', 'Workout'], ['coffee', 'Meal'], ['droplet', 'Water'], ['watch', 'Sync'], ['heart', 'Mood']].map(([icon, label]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(MIconButton, {
    icon: icon,
    label: label,
    size: "l"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, label)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--text-display-m)',
      color: 'var(--text-primary)',
      margin: 0
    }
  }, "Summary"), /*#__PURE__*/React.createElement(MSegmentedControl, {
    options: ['Daily', 'Weekly', 'Monthly'],
    value: range,
    onChange: setRange
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(MCard, {
    variant: "surface",
    radius: "var(--radius-l)",
    padding: "24px 26px",
    style: {
      flex: 1.4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement(MRingProgress, {
    rings: [{
      value: 240,
      max: 600,
      color: 'var(--accent)'
    }, {
      value: 160,
      max: 600,
      color: 'var(--apex-black)'
    }],
    size: 104,
    thickness: 11,
    arcDegrees: 270
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--accent)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "Exercise")), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-stat-m)',
      color: 'var(--text-primary)'
    }
  }, "240", /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "/600min"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--apex-black)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "Stand")), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-stat-m)',
      color: 'var(--text-primary)'
    }
  }, "160", /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "/600min")))))), /*#__PURE__*/React.createElement(MCard, {
    variant: "surface",
    radius: "var(--radius-l)",
    padding: "22px 24px",
    style: {
      flex: 1.2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)',
      marginBottom: 6
    }
  }, "Steps"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-stat-l)',
      marginBottom: 18
    }
  }, "2.340"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 5,
      height: 56
    }
  }, STEP_BARS.map((h, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      flex: 1,
      height: h,
      borderRadius: 'var(--radius-pill)',
      background: i === 7 || i === 8 || i === 9 ? 'var(--apex-black)' : 'var(--apex-gray-300)'
    }
  })))), /*#__PURE__*/React.createElement(MCard, {
    variant: "dark",
    radius: "var(--radius-l)",
    padding: "22px 24px",
    style: {
      flex: 0.9,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(RouteLine, null)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-body-s)',
      color: 'rgba(255,255,255,0.6)',
      marginBottom: 4
    }
  }, "Distance"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-stat-l)',
      color: 'var(--text-on-dark)'
    }
  }, "3.4km"))))));
}
window.MainPanel = MainPanel;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/desktop-app/MainPanel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/desktop-app/Sidebar.jsx
try { (() => {
const DSd = window.ApexDesignSystem_659910;
const {
  Icon: SIcon,
  Button: SButton
} = DSd;
const SIDEBAR_ITEMS = [{
  key: 'dashboard',
  icon: 'target',
  label: 'Dashboard'
}, {
  key: 'progress',
  icon: 'layers',
  label: 'Progress'
}, {
  key: 'insights',
  icon: 'zap',
  label: 'Insights'
}, {
  key: 'mood',
  icon: 'heart',
  label: 'Mood'
}, {
  key: 'stats',
  icon: 'gauge',
  label: 'Stats'
}, {
  key: 'profile',
  icon: 'user',
  label: 'Profile'
}, {
  key: 'settings',
  icon: 'settings',
  label: 'Settings'
}];
function Sidebar({
  active,
  onSelect
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 232,
      background: 'linear-gradient(180deg, #333330 0%, #232320 100%)',
      borderRadius: 'var(--radius-xl)',
      padding: '30px 16px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      flexShrink: 0,
      boxShadow: 'var(--shadow-dark-surface)'
    }
  }, SIDEBAR_ITEMS.map(item => {
    const on = active === item.key;
    return /*#__PURE__*/React.createElement("button", {
      key: item.key,
      onClick: () => onSelect(item.key),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '11px 12px',
        borderRadius: 'var(--radius-pill)',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        background: on ? 'rgba(255,255,255,0.10)' : 'transparent',
        color: on ? 'var(--text-on-dark)' : 'rgba(255,255,255,0.5)',
        transition: 'background 0.15s ease'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 38,
        height: 38,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: on ? 'var(--apex-white)' : 'rgba(255,255,255,0.07)',
        color: on ? 'var(--accent)' : 'rgba(255,255,255,0.65)',
        boxShadow: on ? '0 4px 12px rgba(0,0,0,0.25)' : 'none'
      }
    }, /*#__PURE__*/React.createElement(SIcon, {
      name: item.icon,
      size: 18,
      strokeWidth: 2.2
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-body-m)',
        fontWeight: on ? 700 : 500
      }
    }, item.label));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(255,255,255,0.06)',
      borderRadius: 22,
      padding: '20px 18px',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: -30,
      right: -20,
      width: 90,
      height: 90,
      background: 'var(--glow-accent-radial)',
      filter: 'blur(6px)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--text-body-m)',
      fontWeight: 700,
      color: 'var(--text-on-dark)',
      margin: '0 0 6px',
      position: 'relative'
    }
  }, "Sync your wearable"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--text-body-s)',
      color: 'rgba(255,255,255,0.55)',
      margin: '0 0 16px',
      position: 'relative'
    }
  }, "Connect a device to unlock deeper insights."), /*#__PURE__*/React.createElement(SButton, {
    variant: "secondary",
    size: "s",
    style: {
      background: 'var(--apex-white)',
      color: 'var(--apex-black)',
      position: 'relative'
    }
  }, "Get Started")));
}
window.Sidebar = Sidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/desktop-app/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/ChatScreen.jsx
try { (() => {
const DS3 = window.ApexDesignSystem_659910;
const {
  ChatBubble,
  ChatInput,
  IconButton: IconButton3,
  Button: Button3,
  RingProgress: RingProgressC
} = DS3;
function ChatScreen() {
  const [messages, setMessages] = React.useState([{
    from: 'user',
    text: 'How many calories did I burn yesterday?',
    ts: '2 hours ago'
  }, {
    from: 'bot',
    text: 'You burned 420 kcal across 3 activities'
  }, {
    from: 'user',
    text: 'Remind me to stretch at 8 PM',
    ts: '1 hours ago'
  }]);
  const [draft, setDraft] = React.useState('');
  function send() {
    if (!draft.trim()) return;
    setMessages(m => [...m, {
      from: 'user',
      text: draft
    }]);
    setDraft('');
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '8px 20px 20px',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      paddingBottom: 12
    }
  }, messages.map((m, i) => /*#__PURE__*/React.createElement(ChatBubble, {
    key: i,
    from: m.from,
    timestamp: m.ts
  }, m.text)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--bg-surface)',
      padding: '12px 16px',
      borderRadius: 16,
      boxShadow: 'var(--shadow-card)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "Running"), /*#__PURE__*/React.createElement("b", {
    style: {
      font: 'var(--text-body-m)'
    }
  }, "120kcal")), /*#__PURE__*/React.createElement(RingProgressC, {
    rings: [{
      value: 60,
      max: 100,
      color: 'var(--accent)'
    }],
    size: 34,
    thickness: 5,
    arcDegrees: 300
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--bg-surface)',
      padding: '12px 16px',
      borderRadius: 16,
      boxShadow: 'var(--shadow-card)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "Push up"), /*#__PURE__*/React.createElement("b", {
    style: {
      font: 'var(--text-body-m)'
    }
  }, "200kcal")), /*#__PURE__*/React.createElement(RingProgressC, {
    rings: [{
      value: 38,
      max: 100,
      color: 'var(--accent)'
    }],
    size: 34,
    thickness: 5,
    arcDegrees: 300
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '10px 0'
    }
  }, /*#__PURE__*/React.createElement(IconButton3, {
    icon: "zap",
    variant: "accent",
    size: "l",
    label: "Energy"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 12,
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Button3, {
    variant: "outline",
    size: "s"
  }, "Start workout"), /*#__PURE__*/React.createElement(Button3, {
    variant: "outline",
    size: "s"
  }, "Log water"), /*#__PURE__*/React.createElement(Button3, {
    variant: "outline",
    size: "s"
  }, "How did I sleep?")), /*#__PURE__*/React.createElement(ChatInput, {
    value: draft,
    onChange: setDraft,
    onSubmit: send
  }));
}
window.ChatScreen = ChatScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/ChatScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/DashboardScreen.jsx
try { (() => {
const DS = window.ApexDesignSystem_659910;
const {
  IconButton,
  Card,
  StatCard,
  ProgressBar
} = DS;
function DashboardScreen() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      padding: '8px 20px 100px'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--text-display-xl)',
      color: 'var(--text-primary)',
      margin: '12px 0 0',
      letterSpacing: 'var(--tracking-tight)'
    }
  }, "Let\u2019s start strong!"), /*#__PURE__*/React.createElement(Card, {
    variant: "muted",
    padding: "20px 22px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-title)',
      color: 'var(--text-primary)',
      maxWidth: 190
    }
  }, "You\u2019re 45% to your daily goal"), /*#__PURE__*/React.createElement(IconButton, {
    icon: "zap",
    variant: "accent",
    size: "m",
    label: "Energy"
  })), /*#__PURE__*/React.createElement(ProgressBar, {
    value: 2340,
    max: 8000,
    valueLabel: "2,340/8000"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, [['dumbbell', 'Workout'], ['coffee', 'Meal'], ['droplet', 'Water'], ['watch', 'Sync']].map(([icon, label]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: icon,
    label: label
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-caption)',
      color: 'var(--text-secondary)'
    }
  }, label)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--text-display-m)',
      color: 'var(--text-primary)',
      margin: '0 0 14px'
    }
  }, "Daily Summary"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Steps",
    value: "2.340",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Calories Burned",
    value: "320",
    unit: "kcal",
    style: {
      flex: 1
    }
  }))));
}
window.DashboardScreen = DashboardScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/MobileApp.jsx
try { (() => {
const {
  NavItem
} = window.ApexDesignSystem_659910;
const TABS = [{
  key: 'dashboard',
  icon: 'target',
  label: 'Dashboard'
}, {
  key: 'progress',
  icon: 'layers',
  label: 'Progress'
}, {
  key: 'chat',
  icon: 'zap',
  label: 'AI Chat'
}, {
  key: 'profile',
  icon: 'user',
  label: 'Profile'
}];
function MobileApp() {
  const [tab, setTab] = React.useState('dashboard');
  return /*#__PURE__*/React.createElement(window.IOSDevice, {
    title: ""
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-app)',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, tab === 'dashboard' && /*#__PURE__*/React.createElement(window.DashboardScreen, null), tab === 'progress' && /*#__PURE__*/React.createElement(window.ProgressScreen, null), tab === 'chat' && /*#__PURE__*/React.createElement(window.ChatScreen, null), tab === 'profile' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 40,
      textAlign: 'center',
      color: 'var(--text-secondary)',
      font: 'var(--text-body-m)'
    }
  }, "Profile screen not shown in reference designs.")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 14,
      left: 16,
      right: 16,
      display: 'flex',
      justifyContent: 'space-between',
      background: 'var(--bg-surface-dark)',
      borderRadius: 'var(--radius-pill)',
      padding: 8,
      boxShadow: 'var(--shadow-dark-surface)'
    }
  }, TABS.map(t => /*#__PURE__*/React.createElement(NavItem, {
    key: t.key,
    icon: t.icon,
    label: t.key === tab ? t.label : '',
    active: t.key === tab,
    orientation: "horizontal",
    onClick: () => setTab(t.key)
  })))));
}
window.MobileApp = MobileApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/MobileApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/ProgressScreen.jsx
try { (() => {
const DS2 = window.ApexDesignSystem_659910;
const {
  SegmentedControl,
  Card: Card2,
  RingProgress,
  IconButton: IconButton2,
  Button
} = DS2;
function ProgressScreen() {
  const [range, setRange] = React.useState('Weekly');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: '8px 20px 100px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '8px 0 4px'
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    options: ['Daily', 'Weekly', 'Monthly'],
    value: range,
    onChange: setRange
  })), /*#__PURE__*/React.createElement(Card2, {
    variant: "accent",
    padding: "24px 22px",
    style: {
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(IconButton2, {
    icon: "watch",
    label: "Streak",
    variant: "dark",
    size: "s",
    style: {
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--text-title)',
      margin: '0 0 18px',
      maxWidth: 220
    }
  }, "Stretching after workouts improves your sleep quality."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "s"
  }, "Dismiss"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "s",
    style: {
      background: 'var(--apex-white)',
      color: 'var(--text-primary)'
    }
  }, "Set Routine"))), /*#__PURE__*/React.createElement(Card2, {
    variant: "surface",
    padding: "22px 22px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement(RingProgress, {
    rings: [{
      value: 240,
      max: 600,
      color: 'var(--accent)'
    }, {
      value: 160,
      max: 600,
      color: 'var(--apex-black)'
    }],
    size: 96,
    thickness: 10,
    arcDegrees: 270
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--accent)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "Exercise")), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-stat-m)'
    }
  }, "240", /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "/600min"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--apex-black)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "Stand")), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-stat-m)'
    }
  }, "160", /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)'
    }
  }, "/600min")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Card2, {
    variant: "muted",
    padding: "18px 20px",
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-body-s)',
      color: 'var(--text-secondary)',
      marginBottom: 12
    }
  }, "Steps"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-stat-l)',
      marginBottom: 14
    }
  }, "2.340"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 4,
      height: 40
    }
  }, [10, 16, 12, 20, 14, 28, 40, 30, 20, 14, 10, 16].map((h, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      flex: 1,
      height: h,
      borderRadius: 'var(--radius-pill)',
      background: i === 5 || i === 6 ? 'var(--apex-black)' : 'var(--apex-gray-300)'
    }
  })))), /*#__PURE__*/React.createElement(Card2, {
    variant: "dark",
    padding: "18px 20px",
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "86",
    height: "46",
    viewBox: "0 0 120 66",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 40 C 6 30, 14 12, 34 14 C 54 16, 44 40, 64 42 C 88 44, 78 14, 100 18 C 116 21, 110 44, 92 46",
    stroke: "var(--accent)",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "40",
    r: "4",
    fill: "var(--accent)"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-body-s)',
      color: 'rgba(255,255,255,0.6)',
      marginBottom: 4
    }
  }, "Distance"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--text-stat-l)',
      color: 'var(--text-on-dark)'
    }
  }, "3.4km")))));
}
window.ProgressScreen = ProgressScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/ProgressScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/ios-frame.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports (to window): IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard
//
// Usage — wrap your screen content in <IOSDevice> to get the bezel, status bar
// and home indicator (props: title, dark, keyboard):
//
//   <IOSDevice title="Settings">
//     ...your screen content...
//   </IOSDevice>
//   <IOSDevice dark title="Search" keyboard>…</IOSDevice>
/* END USAGE */

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/ios-frame.jsx", error: String((e && e.message) || e) }); }

__ds_ns.ICONS = __ds_scope.ICONS;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.ChatBubble = __ds_scope.ChatBubble;

__ds_ns.ChatInput = __ds_scope.ChatInput;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.RingProgress = __ds_scope.RingProgress;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

})();
