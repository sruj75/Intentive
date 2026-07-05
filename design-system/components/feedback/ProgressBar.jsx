import React from 'react';

export function ProgressBar(props) {
  const { value, max = 100, valueLabel, height = 56, style } = props;
  const pct = Math.max(6, Math.min(100, (value / max) * 100));
  const inset = Math.round(height * 0.13);
  return (
    <div
      style={{
        position: 'relative',
        height,
        borderRadius: 'var(--radius-pill)',
        background: 'var(--track-bg)',
        boxShadow: 'var(--shadow-inset-groove)',
        display: 'flex',
        alignItems: 'center',
        padding: inset,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        style={{
          width: `calc(${pct}% - ${inset}px)`,
          height: '100%',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--apex-white)',
          boxShadow: 'var(--shadow-fill-pill)',
        }}
      />
      {valueLabel && (
        <span
          style={{
            position: 'absolute',
            right: Math.round(height * 0.42),
            top: '50%',
            transform: 'translateY(-50%)',
            font: 'var(--text-stat-m)',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          <b style={{ color: 'var(--text-primary)' }}>{valueLabel.split('/')[0]}</b>
          {valueLabel.includes('/') && '/' + valueLabel.split('/')[1]}
        </span>
      )}
    </div>
  );
}
