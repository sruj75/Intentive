export interface IconProps {
  /** Icon name — one of the keys in assets/icons.js (Lucide set: activity, arrow-up-right, check,
   * chevron-left, chevron-right, circle, coffee, droplet, dumbbell, flame, footprints, gauge, heart,
   * layers, mic, plus, route, search, send-horizontal, settings, sparkles, target, user, watch, x, zap) */
  name: string;
  /** Pixel size (square). Default 20. */
  size?: number;
  /** Stroke color. Default currentColor — set via parent's `color` CSS. */
  color?: string;
  /** Stroke width. Default 2. */
  strokeWidth?: number;
  /** Fill the glyph with `color` (for solid icons like droplet/heart in the quick-action row). Default false. */
  filled?: boolean;
  style?: React.CSSProperties;
}
