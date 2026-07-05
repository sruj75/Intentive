import React from 'react';
import { Icon } from '../icon/Icon.jsx';

export function NavItem(props) {
  const { icon, label, active = false, orientation = 'vertical', onClick } = props;
  const isVertical = orientation === 'vertical';
  return (
    <button
      onClick={onClick}
      style={{
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
        color: active ? (isVertical ? 'var(--apex-black)' : 'var(--text-on-dark)') : 'rgba(255,255,255,0.55)',
      }}
    >
      <span
        style={{
          width: isVertical ? 40 : 28,
          height: isVertical ? 40 : 28,
          borderRadius: 'var(--radius-circle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? (isVertical ? 'var(--apex-white)' : 'var(--accent)') : 'transparent',
          color: active ? (isVertical ? 'var(--accent)' : 'var(--text-on-dark)') : 'inherit',
        }}
      >
        <Icon name={icon} size={isVertical ? 20 : 16} />
      </span>
      <span style={{ font: 'var(--text-caption)', fontWeight: active ? 700 : 500 }}>{label}</span>
    </button>
  );
}
