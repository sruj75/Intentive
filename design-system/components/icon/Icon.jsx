import React from 'react';
import { ICONS } from '../../assets/icons.js';

export function Icon(props) {
  const { name, size = 20, color = 'currentColor', strokeWidth = 2, filled = false, style, ...rest } = props;
  const body = ICONS[name];
  if (!body) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: body }}
      {...rest}
    />
  );
}
