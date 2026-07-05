import React from 'react';
import { Card } from './Card.jsx';

export function StatCard(props) {
  const { label, value, unit, variant = 'surface', icon, style } = props;
  const color = variant === 'dark' ? 'var(--text-on-dark)' : 'var(--text-primary)';
  const labelColor = variant === 'dark' ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)';
  return (
    <Card variant={variant} padding="20px" style={{ minWidth: 140, ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', justifyContent: 'space-between' }}>
        <span style={{ font: 'var(--text-body-s)', color: labelColor }}>{label}</span>
        <span style={{ font: 'var(--text-stat-l)', color }}>
          {value}{unit && <span style={{ font: 'var(--text-body-m)', color: labelColor, marginLeft: 4 }}>{unit}</span>}
        </span>
      </div>
    </Card>
  );
}
