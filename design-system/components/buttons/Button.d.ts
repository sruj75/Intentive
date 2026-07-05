import React from 'react';

export interface ButtonProps {
  variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost';
  size?: 'm' | 's';
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
