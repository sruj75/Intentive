export interface IconButtonProps {
  /** Lucide icon name (see Icon component) */
  icon: string;
  size?: 'l' | 'm' | 's';
  variant?: 'surface' | 'accent' | 'dark';
  label: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}
