export interface ProgressBarProps {
  value: number;
  max?: number;
  /** e.g. "2,340/8000" rendered to the right of the track */
  valueLabel?: string;
  style?: React.CSSProperties;
}
