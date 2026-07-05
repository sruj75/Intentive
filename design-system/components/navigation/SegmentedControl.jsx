import React, { useState } from 'react';

export function SegmentedControl(props) {
  const { options, value, onChange, defaultValue, style } = props;
  const [internal, setInternal] = useState(defaultValue ?? options[0]);
  const active = value !== undefined ? value : internal;
  function select(opt) {
    if (onChange) onChange(opt);
    if (value === undefined) setInternal(opt);
  }
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--bg-surface-muted)',
        borderRadius: 'var(--radius-pill)',
        padding: 4,
        gap: 2,
        ...style,
      }}
    >
      {options.map((opt) => {
        const isActive = opt === active;
        return (
          <button
            key={opt}
            onClick={() => select(opt)}
            style={{
              border: 'none',
              cursor: 'pointer',
              padding: '10px 20px',
              borderRadius: 'var(--radius-pill)',
              font: 'var(--text-label)',
              fontWeight: isActive ? 700 : 500,
              background: isActive ? 'var(--bg-surface)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: isActive ? 'var(--shadow-card)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
