import React from 'react';

const sizes = {
  m: { padding: '0 22px', height: 48, fontSize: 15 },
  s: { padding: '0 16px', height: 38, fontSize: 13.5 },
};

const variants = {
  primary: { background: 'var(--apex-black)', color: 'var(--text-on-dark)', border: '1px solid transparent' },
  accent: { background: 'var(--accent)', color: 'var(--text-on-accent)', border: '1px solid transparent' },
  secondary: { background: 'var(--bg-surface-muted)', color: 'var(--text-primary)', border: '1px solid transparent' },
  outline: { background: 'transparent', color: 'var(--text-on-dark)', border: '1px solid var(--border-on-dark)' },
  ghost: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid transparent' },
};

export function Button(props) {
  const { variant = 'primary', size = 'm', disabled = false, children, style, ...rest } = props;
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.m;
  return (
    <button
      disabled={disabled}
      style={{
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
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {children}
    </button>
  );
}
