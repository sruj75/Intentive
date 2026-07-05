import React from 'react';
import { Icon } from '../icon/Icon.jsx';

const sizeMap = { l: 64, m: 52, s: 40 };
const filledIcons = { droplet: true, heart: true };

export function IconButton(props) {
  const { icon, size = 'm', variant = 'surface', label, filled, style, ...rest } = props;
  const d = sizeMap[size] || sizeMap.m;
  const isAccent = variant === 'accent';
  const isDark = variant === 'dark';
  const bg = isAccent ? 'var(--accent)' : isDark ? 'var(--bg-surface-dark)' : 'var(--bg-surface)';
  const color = isAccent || isDark ? 'var(--text-on-dark)' : 'var(--apex-black)';
  const shadow = isAccent
    ? 'var(--shadow-accent-glow)'
    : isDark
      ? 'var(--shadow-card)'
      : (size === 's' ? 'var(--shadow-neumorph-sm)' : 'var(--shadow-neumorph)');
  const doFill = filled != null ? filled : !!filledIcons[icon];
  return (
    <button
      aria-label={label}
      style={{
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
        ...style,
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.93)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(d * 0.38)} strokeWidth={2.3} filled={doFill} />
    </button>
  );
}
