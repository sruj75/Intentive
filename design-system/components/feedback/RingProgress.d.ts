export interface RingProgressRing {
  value: number;
  max?: number;
  color?: string;
}
export interface RingProgressProps {
  /** One ring drawn per entry, outermost first (e.g. Exercise, Stand). */
  rings: RingProgressRing[];
  size?: number;
  thickness?: number;
  /** Sweep of the arc in degrees. 360 = full circle; 270 = gauge with a gap at the bottom (Apex's summary gauges). */
  arcDegrees?: number;
  /** Radial gap between concentric rings. Default 4. */
  gapBetween?: number;
}
