// src/mvc/view/svg/svgDomCoords.ts
// ------------------------------------------------------------
// [NEW] 螢幕座標 → <g> local SVG 座標
// SRP：只做座標轉換，不做 hit-test / clamp / drag
// ------------------------------------------------------------

import type React from "react";
import type { PixelPoint } from "./types";

// ------------------------------------------------------------
// getLocalSvgPoint
// 設計目的：
// - 把 e.clientX/Y（viewport 座標）轉成 <g> 所在座標系的 local pixel
//
// Input：
// - e: React.PointerEvent<SVGGElement>
// - g: SVGGElement | null（ref.current）
//
// Output：PixelPoint（local pixel）
// - 若 g/svg/ctm 不存在，回傳 {0,0}（安全 fallback）
// ------------------------------------------------------------
export function getLocalSvgPoint(
  e: React.PointerEvent<SVGGElement>,
  g: SVGGElement | null
): PixelPoint {
  if (!g) {
    return { x: 0, y: 0 };
  }

  const svg = g.ownerSVGElement;
  if (!svg) {
    return { x: 0, y: 0 };
  }

  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;

  const ctm = g.getScreenCTM();
  if (!ctm) {
    return { x: 0, y: 0 };
  }

  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

// ------------------------------------------------------------
// clampToRect
// 設計目的：
// - 把 local point clamp 到 [0,width]×[0,height] 內
//
// Input：
// - p: PixelPoint
// - width/height: number（scene 尺寸）
//
// Output：PixelPoint（clamped）
// ------------------------------------------------------------
export function clampToRect(p: PixelPoint, width: number, height: number): PixelPoint {
  let x = p.x;
  let y = p.y;

  if (x < 0) {
    x = 0;
  }
  if (y < 0) {
    y = 0;
  }
  if (x > width) {
    x = width;
  }
  if (y > height) {
    y = height;
  }

  return { x, y };
}
