import React from 'react';
import { Icon } from '../icon/Icon.jsx';

export function ChatInput(props) {
  const { placeholder = 'Type something..', value, onChange, onSubmit, style } = props;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-pill)',
        padding: '6px 6px 6px 22px',
        gap: 12,
        ...style,
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          font: 'var(--text-body-l)',
          color: 'var(--text-primary)',
        }}
      />
      <button
        onClick={onSubmit}
        aria-label="Send"
        style={{
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
          flexShrink: 0,
        }}
      >
        <Icon name="mic" size={17} />
      </button>
    </div>
  );
}
