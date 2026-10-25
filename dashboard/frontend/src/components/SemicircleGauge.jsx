import React from 'react';
import { TOKENS } from '../tokens';

/**
 * Helper to convert polar coordinates on a semicircle (angle in degrees, 180 = left, 0 = right)
 * to SVG cartesian coordinates.
 */
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  };
}

function describeArcSegment(cx, cy, rOuter, rInner, startAngleDeg, endAngleDeg) {
  const p1 = polarToCartesian(cx, cy, rOuter, startAngleDeg);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngleDeg);
  const p3 = polarToCartesian(cx, cy, rInner, endAngleDeg);
  const p4 = polarToCartesian(cx, cy, rInner, startAngleDeg);

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 0 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * SVG Semicircle Gauge with segments from green to red (or red to green if invertColors=true),
 * a needle, a big value in the centre, and a label below.
 */
export default function SemicircleGauge({
  value = 50,
  min = 0,
  max = 100,
  centerText = '50%',
  subText = 'Consumption vs typical',
  statusLabel = 'Typical Balance',
  isGood = true,
  invertColors = false,
}) {
  const clamped = Math.max(min, Math.min(max, Number(value) || 0));
  const ratio = max > min ? (clamped - min) / (max - min) : 0.5;
  // Angle goes from 180 deg (left) down to 0 deg (right)
  const needleAngle = 180 - ratio * 180;

  const palette = invertColors
    ? [
        TOKENS.red[900],
        TOKENS.red[800],
        TOKENS.red[700],
        TOKENS.red[600],
        TOKENS.red[500],
        TOKENS.green[100],
        TOKENS.green[300],
        TOKENS.green[500],
        TOKENS.green[700],
        TOKENS.green[900],
      ]
    : [
        TOKENS.green[100],
        TOKENS.green[300],
        TOKENS.green[500],
        TOKENS.green[700],
        TOKENS.green[900],
        TOKENS.red[500],
        TOKENS.red[600],
        TOKENS.red[700],
        TOKENS.red[800],
        TOKENS.red[900],
      ];

  const cx = 140;
  const cy = 128;
  const rOuter = 108;
  const rInner = 74;
  const numSegments = palette.length;
  const gapDeg = 1.6;
  const stepDeg = 180 / numSegments;

  // Needle coordinates
  const tip = polarToCartesian(cx, cy, rInner - 6, needleAngle);
  const baseLeft = polarToCartesian(cx, cy, 6, needleAngle + 90);
  const baseRight = polarToCartesian(cx, cy, 6, needleAngle - 90);

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 280 155" className="w-full max-w-[290px] overflow-visible">
        {palette.map((color, idx) => {
          const startA = 180 - idx * stepDeg - (idx > 0 ? gapDeg / 2 : 0);
          const endA = 180 - (idx + 1) * stepDeg + (idx < numSegments - 1 ? gapDeg / 2 : 0);
          return (
            <path
              key={idx}
              d={describeArcSegment(cx, cy, rOuter, rInner, startA, endA)}
              fill={color}
            />
          );
        })}

        {/* Min / Mid / Max tick labels */}
        <text x={cx - rOuter} y={cy + 18} textAnchor="middle" className="fill-gray-500 text-[10px]">
          {min}%
        </text>
        <text x={cx} y={cy - rOuter - 6} textAnchor="middle" className="fill-gray-500 text-[10px]">
          {Math.round((min + max) / 2)}%
        </text>
        <text x={cx + rOuter} y={cy + 18} textAnchor="middle" className="fill-gray-500 text-[10px]">
          {max}%
        </text>

        {/* Needle */}
        <polygon
          points={`${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${baseLeft.x.toFixed(2)},${baseLeft.y.toFixed(2)} ${baseRight.x.toFixed(2)},${baseRight.y.toFixed(2)}`}
          fill="#1f2937"
        />
        <circle cx={cx} cy={cy} r="8" fill="#1f2937" />
        <circle cx={cx} cy={cy} r="3.5" fill="#ffffff" />

        {/* Big centre value */}
        <text
          x={cx}
          y={cy - 22}
          textAnchor="middle"
          className="font-bold text-[24px]"
          fill={isGood ? TOKENS.green[900] : TOKENS.red[700]}
        >
          {centerText}
        </text>
      </svg>

      {/* Label & status pill below */}
      <div className="mt-1 text-center">
        <div className="text-sm font-semibold text-gray-800">{subText}</div>
        {statusLabel && (
          <span
            className="mt-1.5 inline-block rounded-full px-3 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: isGood ? TOKENS.green[100] : '#fde8ec',
              color: isGood ? TOKENS.green[900] : TOKENS.red[800],
            }}
          >
            {statusLabel}
          </span>
        )}
      </div>
    </div>
  );
}
