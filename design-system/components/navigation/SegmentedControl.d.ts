export interface SegmentedControlProps {
  options: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (option: string) => void;
  style?: React.CSSProperties;
}
