export interface NavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  /** vertical = desktop sidebar item (icon over label); horizontal = mobile bottom-nav pill */
  orientation?: 'vertical' | 'horizontal';
  onClick?: () => void;
}
