import React from 'react';

export function Card(props) {
  const { variant = 'surface', padding = 'var(--space-6)', radius = 'var(--radius-m)', style, children, ...rest } = props;
  const bg = variant === 'dark' ? 'var(--bg-surface-dark)'
    : variant === 'muted' ? 'var(--bg-surface-muted)'
    : variant === 'accent' ? 'var(--accent)'
    : 'var(--bg-surface)';
  const color = (variant === 'dark' || variant === 'accent') ? 'var(--text-on-dark)' : 'var(--text-primary)';
  const shadow = variant === 'surface' ? 'var(--shadow-card)' : 'none';
  return (
    <div
      style={{
        background: bg,
        color,
        borderRadius: radius,
        padding,
        boxShadow: shadow,
        boxSizing: 'border-box',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
