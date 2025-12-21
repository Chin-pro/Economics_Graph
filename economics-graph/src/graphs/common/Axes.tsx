/* Axes.tsx */
//   - 畫座標軸 (目前只畫兩條線)

import type { Margin } from "./types";

export function Axes(props: {
  width: number;
  height: number;
  margin: Margin;
}) {
  const { width, height, margin } = props;

  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
      {/* x-axis */}
      <line x1={0} y1={height} x2={width} y2={height} stroke="currentColor" />
      {/* y-axis */}
      <line x1={0} y1={0} x2={0} y2={height} stroke="currentColor" />
    </g>
  );
}
