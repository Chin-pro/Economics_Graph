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

// // ------------------------------------------------------------
// // 小工具：exhaustiveness check
// // 目的：如果你未來在 Drawable union type 新增一種 kind（例如 "rect"）
// // 但忘記在 renderer 裡處理，TypeScript 會在這裡報錯提醒你補齊。
// // ------------------------------------------------------------
// function assertNever(x: never): never {
//   // 這個 throw 理論上不會被執行（因為 x 是 never 表示不可能發生）
//   throw new Error("Unhandled drawable kind: " + String(x));
// }

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
    // 型別建議：
    //   this.gRef = React.createRef<SVGGElement>();
    // 然後 gRef 的欄位宣告用 RefObject<SVGGElement>
    // （因為它本來就允許 current 為 null）
    // --------------------------------------------------------
    this.gRef = React.createRef<SVGGElement>();

    // 初始化拖曳狀態：尚未拖任何點
    this.draggingId = null; // 你正在拖哪一個點（例如 "opt"）
    this.pointerId = null;  // Pointer Events 的識別碼

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


  
  // ------------------------------------------------------------
  // 小工具：exhaustiveness check
  // 目的：如果你未來在 Drawable union type 新增一種 kind（例如 "rect"）
  // 但忘記在 renderer 裡處理，TypeScript 會在這裡報錯提醒你補齊。
  // ------------------------------------------------------------
  private assertNever(x: never): never {
    // 這個 throw 理論上不會被執行（因為 x 是 never 表示不可能發生）
    throw new Error("Unhandled drawable kind: " + String(x));
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

    // 把回傳前的純量命名成 xPixel / yPixel (局部像素座標)
    const xPixel = local.x;
    const yPixel = local.y;
    return { x: xPixel, y: yPixel };
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

    // Debug
    // const points = this.props.scene.drawables.filter((d) => d.kind === "point");
    // console.log("[HIT] point drawables:", points.map((p) => ({ id: p.id, c: p.center, r: p.r })));


    const drawables = this.props.scene.drawables;

    let bestId: string | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;

    // 將 local 的 x/y 明確命名成像素座標純量
    const xPixel = local.x;
    const yPixel = local.y;

    let i = 0;
    while (i < drawables.length) {
      const d = drawables[i];

      if (d.kind === "point") {  // 因為每一個 drawable 物件有多的 kind，這邊只取出 point(點) 相關的
        // local 與點中心差
        const dx = xPixel - d.center.x;
        const dy = yPixel - d.center.y;

        // 距離平方
        const d2 = dx * dx + dy * dy;

        // Debug
        // if (d.id === "opt") {
        //   console.log("[HIT-DBG] local=", local, "center=", d.center, "dx=", dx, "dy=", dy, "d2=", d2, "r=", d.r);
        // }

        // 命中半徑 = 原本半徑 + 容錯
        const tol = 24;  // tolerance
        const r = d.r + tol;  // radius
        const r2 = r * r;  // radius square

        // 若在半徑內，視為命中
        if (d2 <= r2) {
          // 若同時命中多個點，取最近的一個
          if (d2 < bestD2) {
            bestD2 = d2;
            bestId = d.id;
          }
        }
      }

      i++;
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
    const coordinatePixel = this.getLocalPoint(e);
    const hitId = this.findHitPointId(coordinatePixel);

    // Debug
    // console.log("[DOWN] coordinatePixel=", coordinatePixel, "hitId=", hitId);

    if (hitId) {
      this.draggingId = hitId;  // 記錄正在拖的 id（draggingId）
      this.pointerId = e.pointerId;  // 記錄正在拖的 id（draggingId），可能存在多工操作

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

    // Debug
    // console.log("[MOVE] draggingId=", draggingId);

    if (this.pointerId !== e.pointerId) {
      return;
    }

    const coordinatePixel = this.getLocalPoint(e);

    const cb = this.props.onPointDrag;
    if (cb) {
      cb(draggingId, coordinatePixel);
    }
    // SvgSceneView：只回報拖曳
    // Controller：算新 scene + notify
    // GraphView：setState(scene) 觸發重畫

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

          //   // ----------------------------------------------------
          //   // 1) line drawable -> <line />
          //   // ----------------------------------------------------
          //   if (d.kind === "line") {
          //     // 預設值：使用 currentColor（跟著 CSS 文字顏色）
          //     let strokeColor = "currentColor";
          //     let strokeWidth: number | undefined;
          //     let dashArray: string | undefined;

          //     // d.stroke 是可選（可能不存在）
          //     if (d.stroke) {
          //       // 若有指定顏色，覆蓋預設
          //       if (d.stroke.color) {
          //         strokeColor = d.stroke.color;
          //       }

          //       // width 可能是 undefined（SVG 會用預設 stroke-width=1）
          //       strokeWidth = d.stroke.width;

          //       // dash：array 轉成 "4 2 1 2" 這種 SVG strokeDasharray 字串
          //       if (d.stroke.dash) {
          //         dashArray = d.stroke.dash.join(" ");
          //       }
          //     }

          //     return (
          //       <line
          //         key={d.id} // React list key：用 id 當 key
          //         x1={d.a.x}
          //         y1={d.a.y}
          //         x2={d.b.x}
          //         y2={d.b.y}
          //         stroke={strokeColor}
          //         strokeWidth={strokeWidth}
          //         strokeDasharray={dashArray}
          //       />
          //     );
          //   }

          //   // ----------------------------------------------------
          //   // 2) polyline drawable -> <polyline />
          //   // ----------------------------------------------------
          //   if (d.kind === "polyline") {
          //     let strokeColor = "currentColor";
          //     let strokeWidth: number | undefined;
          //     let dashArray: string | undefined;

          //     if (d.stroke) {
          //       if (d.stroke.color) {
          //         strokeColor = d.stroke.color;
          //       }
          //       strokeWidth = d.stroke.width;
          //       if (d.stroke.dash) {
          //         dashArray = d.stroke.dash.join(" ");
          //       }
          //     }

          //     // pointsAttr：SVG polyline 需要 "x1,y1 x2,y2 x3,y3" 這種字串
          //     const pointsAttr = d.points.map((p) => `${p.x},${p.y}`).join(" ");

          //     return (
          //       <polyline
          //         key={d.id}
          //         points={pointsAttr}
          //         fill="none" // 不填滿（只畫線）
          //         stroke={strokeColor}
          //         strokeWidth={strokeWidth}
          //         strokeDasharray={dashArray}
          //       />
          //     );
          //   }

          //   // ----------------------------------------------------
          //   // 3) point drawable -> <circle />
          //   // ----------------------------------------------------
          //   if (d.kind === "point") {
          //     // fill 顏色預設 currentColor
          //     let fillColor = "currentColor";
          //     if (d.fill && d.fill.color) {
          //       fillColor = d.fill.color;
          //     }

          //     // 圓的外框 stroke 可選
          //     let strokeColor: string | undefined;
          //     let strokeWidth: number | undefined;
          //     let dashArray: string | undefined;

          //     if (d.stroke) {
          //       strokeColor = d.stroke.color;
          //       strokeWidth = d.stroke.width;
          //       if (d.stroke.dash) {
          //         dashArray = d.stroke.dash.join(" ");
          //       }
          //     }

          //     return (
          //       // <circle
          //       //   key={d.id}
          //       //   cx={d.center.x}
          //       //   cy={d.center.y}
          //       //   r={d.r}
          //       //   fill={fillColor}
          //       //   stroke={strokeColor}
          //       //   strokeWidth={strokeWidth}
          //       //   strokeDasharray={dashArray}
          //       // />
          //       <g key={d.id}>
          //         {/* 熱區：透明大圈，讓你很容易點到 */}
          //         <circle
          //           cx={d.center.x}
          //           cy={d.center.y}
          //           r={Math.max(d.r + 14, 18)}
          //           fill="transparent"
          //           style={{ pointerEvents: "all", cursor: "grab" }}
          //         />

          //         {/* 真正顯示的點（原本那顆） */}
          //         <circle
          //           cx={d.center.x}
          //           cy={d.center.y}
          //           r={d.r}
          //           fill={fillColor}
          //           stroke={strokeColor}
          //           strokeWidth={strokeWidth}
          //           strokeDasharray={dashArray}
          //           style={{ pointerEvents: "none" }}  // 避免小圈搶事件，事件交給大圈
          //         />
          //       </g>
          //     );
          //   }

          //   // ----------------------------------------------------
          //   // 4) text drawable -> <text />
          //   // （你目前預設：不是 line/polyline/point 就當 text）
          //   // 如果未來 Drawable 增加種類，這裡最好寫成 switch 並做 exhaustiveness check
          //   // ----------------------------------------------------
          //   return (
          //     <text
          //       key={d.id}
          //       x={d.pos.x}
          //       y={d.pos.y}
          //       fontSize={d.fontSize}
          //       fill="currentColor"
          //     >
          //       {d.text}
          //     </text>
          //   );
          // })

          // switch：明確處理每一種 drawable
          // 好處：未來新增 kind 時，TS 會提醒你補 renderer（exhaustiveness check）
          switch (d.kind) {
            // -----------------------------
            // case 1) line -> <line />
            // -----------------------------
            case "line": {
              // 預設 stroke 顏色：currentColor（會跟 CSS 的文字顏色一致）
              let strokeColor = "currentColor";

              // strokeWidth / dashArray：可能不存在，所以用 undefined
              let strokeWidth: number | undefined;
              let dashArray: string | undefined;

              // 若有 stroke 設定，就覆蓋預設
              if (d.stroke) {
                // 若有指定顏色，就使用指定顏色
                if (d.stroke.color) {
                  strokeColor = d.stroke.color;
                }

                // 若有指定寬度，就使用指定寬度
                strokeWidth = d.stroke.width;

                // 若有 dash（例如 [4,2]），轉成 "4 2" 給 SVG
                if (d.stroke.dash) {
                  dashArray = d.stroke.dash.join(" ");
                }
              }

              // 回傳 SVG <line />
              return (
                <line
                  key={d.id} // React list key（必須穩定）
                  x1={d.a.x} // 起點 x
                  y1={d.a.y} // 起點 y
                  x2={d.b.x} // 終點 x
                  y2={d.b.y} // 終點 y
                  stroke={strokeColor} // 線顏色
                  strokeWidth={strokeWidth} // 線寬（undefined 則用 SVG 預設 1）
                  strokeDasharray={dashArray} // 虛線樣式（undefined 則實線）
                />
              );
            }

            // -----------------------------
            // case 2) polyline -> <polyline />
            // -----------------------------
            case "polyline": {
              // 預設 stroke 顏色
              let strokeColor = "currentColor";

              // 可能不存在的線寬與 dash
              let strokeWidth: number | undefined;
              let dashArray: string | undefined;

              // 若有 stroke 設定就套用
              if (d.stroke) {
                if (d.stroke.color) {
                  strokeColor = d.stroke.color;
                }
                strokeWidth = d.stroke.width;
                if (d.stroke.dash) {
                  dashArray = d.stroke.dash.join(" ");
                }
              }

              // pointsAttr：polyline 需要 "x1,y1 x2,y2 x3,y3" 這種字串
              // map：把每個點 p 變成 "x,y"
              // join(" ")：用空白把每段 "x,y" 串起來
              const pointsAttr = d.points.map((p) => `${p.x},${p.y}`).join(" ");

              // 回傳 SVG <polyline />
              return (
                <polyline
                  key={d.id} // React key
                  points={pointsAttr} // 折線點字串
                  fill="none" // 不填滿（只畫線）
                  stroke={strokeColor} // 線顏色
                  strokeWidth={strokeWidth} // 線寬
                  strokeDasharray={dashArray} // 虛線
                />
              );
            }

            // -----------------------------
            // case 3) point -> <circle />（我們用兩顆圈：大透明熱區 + 小顯示點）
            // -----------------------------
            case "point": {
              // 預設 fill 顏色
              let fillColor = "currentColor";

              // 若有 fill.color，就使用它
              if (d.fill && d.fill.color) {
                fillColor = d.fill.color;
              }

              // 外框 stroke 可能不存在
              let strokeColor: string | undefined;
              let strokeWidth: number | undefined;
              let dashArray: string | undefined;

              // 若有 stroke，就套用
              if (d.stroke) {
                strokeColor = d.stroke.color;
                strokeWidth = d.stroke.width;
                if (d.stroke.dash) {
                  dashArray = d.stroke.dash.join(" ");
                }
              }

              // 做一個比較容易點到的「熱區半徑」
              // - 至少 18
              // - 或者 d.r + 14（點越小越需要放大熱區）
              const hitRadius = Math.max(d.r + 14, 18);

              // 回傳：用 <g> 包住兩個 circle
              return (
                <g key={d.id}>
                  {/* 
                    熱區圈：透明但會吃 pointer events
                    為什麼需要？
                    - 你的點通常很小（r=4）
                    - 使用者很難「精準點中」
                    - 所以加一顆透明大圈，讓 hit-test 更容易成功
                  */}
                  <circle
                    cx={d.center.x} // 圓心 x
                    cy={d.center.y} // 圓心 y
                    r={hitRadius} // 大圈半徑
                    fill="transparent" // 透明（看不到）
                    style={{
                      pointerEvents: "all", // 強制這顆圈接收事件
                      cursor: "grab", // 滑鼠移上去顯示可拖曳
                    }}
                  />

                  {/* 
                    真正顯示的點：原本那顆小圈
                    pointerEvents: "none" 的理由：
                    - 避免小圈自己搶事件
                    - 事件統一交給大圈（熱區）去接
                    - 這樣點擊體驗穩定
                  */}
                  <circle
                    cx={d.center.x} // 圓心 x
                    cy={d.center.y} // 圓心 y
                    r={d.r} // 真實點半徑（畫面大小）
                    fill={fillColor} // 填色
                    stroke={strokeColor} // 外框顏色（可選）
                    strokeWidth={strokeWidth} // 外框寬（可選）
                    strokeDasharray={dashArray} // 外框虛線（可選）
                    style={{
                      pointerEvents: "none", // 讓事件不要被這顆圈拿走
                    }}
                  />
                </g>
              );
            }

            // -----------------------------
            // case 4) text -> <text />
            // -----------------------------
            case "text": {
              return (
                <text
                  key={d.id} // React key
                  x={d.pos.x} // 文字位置 x
                  y={d.pos.y} // 文字位置 y
                  fontSize={d.fontSize} // 字體大小（可選）
                  fill="currentColor" // 文字顏色
                >
                  {d.text}
                </text>
              );
            }

            // -----------------------------
            // default：理論上不會進來
            // - 如果你新增了 Drawable kind 卻忘記補 case，TS 會在 assertNever 報錯提醒你
            // -----------------------------
            default: {
              const _exhaustiveCheck: never = d;
              return this.assertNever(_exhaustiveCheck);
            }
          }
        })}
      </g>
    );
  }
}
