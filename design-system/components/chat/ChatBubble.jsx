import React from 'react';

export function ChatBubble(props) {
  const { from = 'bot', surface = 'light', children, timestamp } = props;
  const isUser = from === 'user';
  const onDark = surface === 'dark';
  const bg = isUser
    ? (onDark ? 'rgba(255,255,255,0.14)' : 'var(--bg-surface-muted)')
    : 'var(--bg-surface)';
  const color = (isUser && onDark) ? 'var(--text-on-dark)' : 'var(--text-primary)';
  const tsColor = onDark ? 'rgba(255,255,255,0.45)' : 'var(--text-secondary)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 6 }}>
      <div
        style={{
          maxWidth: '82%',
          padding: '14px 18px',
          borderRadius: 'var(--radius-l)',
          borderBottomRightRadius: isUser ? 6 : 'var(--radius-l)',
          borderBottomLeftRadius: isUser ? 'var(--radius-l)' : 6,
          background: bg,
          color,
          font: 'var(--text-body-l)',
          boxShadow: (!isUser && !onDark) ? 'var(--shadow-card)' : 'none',
        }}
      >
        {children}
      </div>
      {timestamp && (
        <span style={{ font: 'var(--text-caption)', color: tsColor, padding: '0 4px', whiteSpace: 'nowrap' }}>{timestamp}</span>
      )}
    </div>
  );
}
