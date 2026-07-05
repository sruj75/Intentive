export interface ChatInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  onSubmit?: () => void;
  style?: React.CSSProperties;
}
