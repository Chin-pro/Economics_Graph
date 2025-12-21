/* SvgScene.tsx */
//   - renderer，把 drawables 轉成真正 SVG 元素

import { useRef } from "react";  // useRef: React Hook，用來保存「不需要觸發重新渲染」的資料
import type { Drawable, SceneOutput } from "../core/drawables";

// 元件宣告 + props
export function SvgScene(props: {
  scene: SceneOutput;  // React function component: 要畫的場景資料
  onPointDrag?: (id: string, pixel: { x: number; y: number }) => void;  // 當某個 point 被拖曳時通知外部
}) {
  const scene = props.scene;

  // DOM 參考 + 拖曳狀態
  const gRef = useRef<SVGGElement | null>(null);       // gRef 會指向下面 JSX 的 <g> DOM元素，型別 SVGGElement: 表示 SVG 的 <g> 元素；初始直 null (還沒掛上 DOM 前是 null)
  const draggingIdRef = useRef<string | null>(null);   // 儲存「目前正在拖曳的 point ID」，null 標示目前沒在拖任何點
  const pointerIdRef = useRef<number | null>(null);    // Pointer Events 的概念: 每個點擊案下去都有自己的 pointerID，是哪個 pointer 開始的拖曳，避免其他 pointer 干擾

  // 將滑鼠座標轉成 <g> 的局部座標
  function getLocalPoint(e: React.PointerEvent<SVGGElement>) {
    const g = gRef.current; // 取到 DOM <g>
    // 防呆機制
    if (!g) {
      return { x: 0, y: 0 };
    }
    const rect = g.getBoundingClientRect();  // 取得 <g> 在螢幕上的舉行範圍 (左上角座標、寬高)，rect.left.top 是 <g> 左上角的螢幕座標
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };  // 內容區像素座標，e.clientX/clientY: 滑鼠在螢幕視窗中的座標
  }

  // hit-test 判斷使用者點到哪個 point
  //   - 輸入: 滑鼠在 <g> 的局部座標 local
  //   - 輸出: 命中 point id (或 null)
  function findHitPointId(local: { x: number; y: number }) {
    // 只做最基本：命中任何 point drawable，就回傳它的 id
    let bestId: string | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;

    let i = 0;
    while (i < scene.drawables.length) {
      const d = scene.drawables[i];
      if (d.kind === "point") {
        const dx = local.x - d.center.x;
        const dy = local.y - d.center.y;
        const d2 = dx * dx + dy * dy;

        const tol = 6; // 容錯半徑
        const r = d.r + tol;
        const r2 = r * r;

        if (d2 <= r2) {
          if (d2 < bestD2) {
            bestD2 = d2;
            bestId = d.id;
          }
        }
      }
      i += 1;
    }

    return bestId;
  }

  function handlePointerDown(e: React.PointerEvent<SVGGElement>) {
    const local = getLocalPoint(e);
    const hitId = findHitPointId(local);

    if (hitId) {
      draggingIdRef.current = hitId;
      pointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGGElement>) {
    const draggingId = draggingIdRef.current;
    if (!draggingId) {
      return;
    }
    if (pointerIdRef.current !== e.pointerId) {
      return;
    }

    const local = getLocalPoint(e);

    if (props.onPointDrag) {
      props.onPointDrag(draggingId, local);
    }

    e.preventDefault();
  }

  function endDrag() {
    draggingIdRef.current = null;
    pointerIdRef.current = null;
  }

  function handlePointerUp(e: React.PointerEvent<SVGGElement>) {
    if (pointerIdRef.current === e.pointerId) {
      endDrag();
    }
  }

  function handlePointerCancel(e: React.PointerEvent<SVGGElement>) {
    if (pointerIdRef.current === e.pointerId) {
      endDrag();
    }
  }

  return (
    <g
      ref={gRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{ touchAction: "none" }}
    >
      {scene.drawables.map((d: Drawable) => {
        // （你原本的 render 邏輯完全保留）
        if (d.kind === "line") {
          let strokeColor = "currentColor";
          let strokeWidth: number | undefined;
          let dashArray: string | undefined;

          if (d.stroke) {
            if (d.stroke.color) {
              strokeColor = d.stroke.color;
            }
            strokeWidth = d.stroke.width;
            if (d.stroke.dash) {
              dashArray = d.stroke.dash.join(" ");
            }
          }

          return (
            <line
              key={d.id}
              x1={d.a.x}
              y1={d.a.y}
              x2={d.b.x}
              y2={d.b.y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
            />
          );
        }

        if (d.kind === "polyline") {
          let strokeColor = "currentColor";
          let strokeWidth: number | undefined;
          let dashArray: string | undefined;

          if (d.stroke) {
            if (d.stroke.color) {
              strokeColor = d.stroke.color;
            }
            strokeWidth = d.stroke.width;
            if (d.stroke.dash) {
              dashArray = d.stroke.dash.join(" ");
            }
          }

          const pointsAttr = d.points.map((p) => `${p.x},${p.y}`).join(" ");

          return (
            <polyline
              key={d.id}
              points={pointsAttr}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
            />
          );
        }

        if (d.kind === "point") {
          let fillColor = "currentColor";
          if (d.fill && d.fill.color) {
            fillColor = d.fill.color;
          }

          let strokeColor: string | undefined;
          let strokeWidth: number | undefined;
          let dashArray: string | undefined;

          if (d.stroke) {
            strokeColor = d.stroke.color;
            strokeWidth = d.stroke.width;
            if (d.stroke.dash) {
              dashArray = d.stroke.dash.join(" ");
            }
          }

          return (
            <circle
              key={d.id}
              cx={d.center.x}
              cy={d.center.y}
              r={d.r}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
            />
          );
        }

        return (
          <text
            key={d.id}
            x={d.pos.x}
            y={d.pos.y}
            fontSize={d.fontSize}
            fill="currentColor"
          >
            {d.text}
          </text>
        );
      })}
    </g>
  );
}
