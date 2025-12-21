// src/mvc/view/SvgSceneView.tsx

// ------------------------------------------------------------
// SvgSceneView（View/Renderer）
// 任務：
// 1) 把 scene.drawables 轉成真正的 SVG 元素（line/polyline/circle/text）
// 2) 處理「互動」：pointer down/move/up/cancel
//    - 命中（hit-test）point drawable
//    - 若命中，開始拖曳
//    - 拖曳過程回報給上層（GraphView -> Controller）
//
// 注意：
// - SvgSceneView 不做經濟計算
// - SvgSceneView 不知道 Viewport / domain
// - 它只知道：我拿到「像素座標的 drawables」，我要畫出來並提供拖曳事件
// ------------------------------------------------------------

import React from "react";

// Drawable/SceneOutput 是 renderer 的核心輸入規格
// - Drawable：每個圖元（line/polyline/point/text）
// - SceneOutput：包含 drawables + width/height + domain（domain通常不在 renderer 用）
// SvgSceneView 只用 drawables 來畫
import type { Drawable, SceneOutput } from "../../core/drawables";

// ------------------------------------------------------------
// Props：SvgSceneView 的輸入
// - scene：當前場景（像素座標版的 drawables）
// - onPointDrag：拖曳時回報（id + pixel 座標）
//   - 這是「往上層的 callback」，SvgSceneView 不做狀態回推
// ------------------------------------------------------------
type Props = {
  scene: SceneOutput;
  onPointDrag?: (id: string, pixel: { x: number; y: number }) => void;
};

// ------------------------------------------------------------
// class component 版本（OOP）
// extends React.Component<Props> 表示：只用 props，不用 state
// （拖曳狀態用 class fields 存，不放 state，避免 move 時狂 re-render）
// ------------------------------------------------------------
export class SvgSceneView extends React.Component<Props> {

  // ----------------------------------------------------------
  // gRef：指向 <g> DOM 元素，讓我們能取 getBoundingClientRect()
  //
  // ✅ 重要：ref 的 current 在 React 裡「初始化一定是 null」
  // 所以正確型別應該允許 null：SVGGElement | null
  //
  // 你這裡宣告是 RefObject<SVGGElement | null>，
  // 但 createRef<SVGGElement>() 回傳的其實是 RefObject<SVGGElement>
  //（current: SVGGElement | null）
  //
  // 因此建議你用最標準寫法：
  //   private gRef: React.RefObject<SVGGElement>;
  // 這樣就不會出現你之前的 ts(2322) 型別衝突。
  // ----------------------------------------------------------
  private gRef: React.RefObject<SVGGElement | null>;

  // draggingId：目前正在拖曳的 point drawable id（例如 "opt"）
  private draggingId: string | null;

  // pointerId：Pointer Events 裡用來辨識是哪一個 pointer 在拖曳
  // 目的：避免多指/多點觸控時互相干擾
  private pointerId: number | null;

  constructor(props: Props) {
    super(props);

    // --------------------------------------------------------
    // createRef：建立一個 ref container
    // current 在掛載前是 null，掛載後才會被 React 填入 DOM
    //
    // ⚠️ 型別建議：
    //   this.gRef = React.createRef<SVGGElement>();
    // 然後 gRef 的欄位宣告用 RefObject<SVGGElement>
    // （因為它本來就允許 current 為 null）
    // --------------------------------------------------------
    this.gRef = React.createRef<SVGGElement>();

    // 初始化拖曳狀態：尚未拖任何點
    this.draggingId = null;
    this.pointerId = null;

    // --------------------------------------------------------
    // bind：class component 必備
    // 因為 onPointerDown={this.handlePointerDown} 會把方法當 callback 傳走
    // 若不 bind，this 可能 undefined
    // --------------------------------------------------------
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
  }

  // ----------------------------------------------------------
  // getLocalPoint：
  // 把滑鼠/手指事件 e.clientX/e.clientY（視窗座標）
  // 轉成 <g> 群組內的「局部像素座標」
  //
  // 原理：
  // - getBoundingClientRect() 取得 <g> 在螢幕上的左上角（rect.left, rect.top）
  // - 用 clientX - rect.left，得到點擊位置相對於 <g> 左上角的偏移
  // ----------------------------------------------------------
  private getLocalPoint(e: React.PointerEvent<SVGGElement>) {
    const g = this.gRef.current;

    // 防呆：ref 還沒掛載時 current 可能是 null
    if (!g) {
      return { x: 0, y: 0 };
    }

    const rect = g.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ----------------------------------------------------------
  // findHitPointId（hit-test）：
  // 給定 local(x,y)，找出「最接近且命中的 point drawable」
  //
  // 你目前的規則：
  // - 只對 kind === "point" 的 drawable 做命中
  // - 計算距離平方 d2（避免 sqrt）
  // - 容錯半徑 tol = 6，實際命中半徑 = d.r + tol
  // - 若同時命中多點，取距離最小者
  // ----------------------------------------------------------
  private findHitPointId(local: { x: number; y: number }) {
    const drawables = this.props.scene.drawables;

    let bestId: string | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;

    let i = 0;
    while (i < drawables.length) {
      const d = drawables[i];

      if (d.kind === "point") {
        // local 與點中心差
        const dx = local.x - d.center.x;
        const dy = local.y - d.center.y;

        // 距離平方
        const d2 = dx * dx + dy * dy;

        // 命中半徑 = 原本半徑 + 容錯
        const tol = 6;
        const r = d.r + tol;
        const r2 = r * r;

        // 若在半徑內，視為命中
        if (d2 <= r2) {
          // 若同時命中多個點，取最近的一個
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

  // ----------------------------------------------------------
  // handlePointerDown：
  // - 取得 local 座標
  // - hit-test 找命中的 point id
  // - 若命中：開始拖曳
  //   - 記錄 draggingId / pointerId
  //   - setPointerCapture：讓後續 move/up 即使移出元素也能收到事件
  //   - preventDefault：避免瀏覽器原生行為（選字、拖曳、捲動）
  // ----------------------------------------------------------
  private handlePointerDown(e: React.PointerEvent<SVGGElement>) {
    const local = this.getLocalPoint(e);
    const hitId = this.findHitPointId(local);

    if (hitId) {
      this.draggingId = hitId;
      this.pointerId = e.pointerId;

      // 捕捉 pointer：確保 move/up 事件都送到這個元素
      e.currentTarget.setPointerCapture(e.pointerId);

      e.preventDefault();
    }
  }

  // ----------------------------------------------------------
  // handlePointerMove：
  // - 若沒有 draggingId：表示目前沒有在拖，直接 return
  // - 若 pointerId 不匹配：忽略（避免多指干擾）
  // - 取得 local 座標
  // - 若有 onPointDrag callback：回報 (draggingId, local)
  //
  // 重要：這裡不 setState，因為 move 會非常頻繁
  // 真正要更新圖形，交給上層 Controller -> rebuild -> notify -> GraphView setState
  // ----------------------------------------------------------
  private handlePointerMove(e: React.PointerEvent<SVGGElement>) {
    const draggingId = this.draggingId;

    if (!draggingId) {
      return;
    }
    if (this.pointerId !== e.pointerId) {
      return;
    }

    const local = this.getLocalPoint(e);

    const cb = this.props.onPointDrag;
    if (cb) {
      cb(draggingId, local);
    }

    e.preventDefault();
  }

  // ----------------------------------------------------------
  // endDrag：
  // 清空拖曳狀態（結束拖曳）
  // ----------------------------------------------------------
  private endDrag() {
    this.draggingId = null;
    this.pointerId = null;
  }

  // ----------------------------------------------------------
  // handlePointerUp / handlePointerCancel：
  // - 若是同一個 pointer 結束，就 endDrag()
  // cancel：例如系統中斷、手勢被瀏覽器接管等情況
  // ----------------------------------------------------------
  private handlePointerUp(e: React.PointerEvent<SVGGElement>) {
    if (this.pointerId === e.pointerId) {
      this.endDrag();
    }
  }

  private handlePointerCancel(e: React.PointerEvent<SVGGElement>) {
    if (this.pointerId === e.pointerId) {
      this.endDrag();
    }
  }

  // ----------------------------------------------------------
  // render：
  // - 輸出 <g> 群組
  // - 綁定 pointer handlers
  // - 用 scene.drawables.map(...) 逐個轉成 SVG 元素
  //
  // style={{ touchAction: "none" }}
  // - 重要：避免觸控時被瀏覽器預設行為（例如捲動、縮放）搶走事件
  // ----------------------------------------------------------
  render() {
    const scene = this.props.scene;

    return (
      <g
        ref={this.gRef} // 把 ref 掛上，React 會把 <g> DOM 填到 gRef.current
        onPointerDown={this.handlePointerDown}
        onPointerMove={this.handlePointerMove}
        onPointerUp={this.handlePointerUp}
        onPointerCancel={this.handlePointerCancel}
        style={{ touchAction: "none" }}
      >
        {scene.drawables.map((d: Drawable) => {

          // ----------------------------------------------------
          // 1) line drawable -> <line />
          // ----------------------------------------------------
          if (d.kind === "line") {
            // 預設值：使用 currentColor（跟著 CSS 文字顏色）
            let strokeColor = "currentColor";
            let strokeWidth: number | undefined;
            let dashArray: string | undefined;

            // d.stroke 是可選（可能不存在）
            if (d.stroke) {
              // 若有指定顏色，覆蓋預設
              if (d.stroke.color) {
                strokeColor = d.stroke.color;
              }

              // width 可能是 undefined（SVG 會用預設 stroke-width=1）
              strokeWidth = d.stroke.width;

              // dash：array 轉成 "4 2 1 2" 這種 SVG strokeDasharray 字串
              if (d.stroke.dash) {
                dashArray = d.stroke.dash.join(" ");
              }
            }

            return (
              <line
                key={d.id} // React list key：用 id 當 key
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

          // ----------------------------------------------------
          // 2) polyline drawable -> <polyline />
          // ----------------------------------------------------
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

            // pointsAttr：SVG polyline 需要 "x1,y1 x2,y2 x3,y3" 這種字串
            const pointsAttr = d.points.map((p) => `${p.x},${p.y}`).join(" ");

            return (
              <polyline
                key={d.id}
                points={pointsAttr}
                fill="none" // 不填滿（只畫線）
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray}
              />
            );
          }

          // ----------------------------------------------------
          // 3) point drawable -> <circle />
          // ----------------------------------------------------
          if (d.kind === "point") {
            // fill 顏色預設 currentColor
            let fillColor = "currentColor";
            if (d.fill && d.fill.color) {
              fillColor = d.fill.color;
            }

            // 圓的外框 stroke 可選
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

          // ----------------------------------------------------
          // 4) text drawable -> <text />
          // （你目前預設：不是 line/polyline/point 就當 text）
          // 如果未來 Drawable 增加種類，這裡最好寫成 switch 並做 exhaustiveness check
          // ----------------------------------------------------
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
}
