import React from 'react';

export function RingProgress(props) {
  const { rings = [], size = 96, thickness = 9, arcDegrees = 360, gapBetween = 4 } = props;
  const frac = arcDegrees / 360;
  const rotation = arcDegrees === 360 ? -90 : 90 + (360 - arcDegrees) / 2;
  const rOuter = (size - thickness) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: `rotate(${rotation}deg)` }}>
      {rings.map((ring, i) => {
        const rr = rOuter - i * (thickness + gapBetween);
        const cc = 2 * Math.PI * rr;
        const track = cc * frac;
        const prog = track * Math.max(0, Math.min(1, ring.value / (ring.max || 100)));
        return (
          <g key={i}>
            <circle
              cx={size / 2} cy={size / 2} r={rr} fill="none"
              stroke="var(--track-bg)" strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${track} ${cc}`}
            />
            <circle
              cx={size / 2} cy={size / 2} r={rr} fill="none"
              stroke={ring.color || 'var(--accent)'} strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${prog} ${cc}`}
            />
          </g>
        );
      })}
    </svg>
  );
}
