export interface CardProps {
  /** surface = white w/ shadow (default); muted = flat warm-gray fill; dark = charcoal; accent = orange */
  variant?: 'surface' | 'muted' | 'dark' | 'accent';
  padding?: string;
  radius?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
