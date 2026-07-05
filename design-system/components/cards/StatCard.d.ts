export interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  variant?: 'surface' | 'muted' | 'dark';
  style?: React.CSSProperties;
}
