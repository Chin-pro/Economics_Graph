// src/mvc/view/SvgSceneView.tsx
// ------------------------------------------------------------
// SvgSceneView（View/Renderer, thin orchestrator）
//
// ✅ [CHANGED] 重構目標（SRP / SOLID）：
// 1) 不再把「渲染 / hit-test / rAF / DOM ref cache / 座標轉換」混在同一檔
// 2) View 只做 pixel domain 的事件處理與渲染組裝，不做 econ 計算
// 3) 用 rAF coalesce 降低 pointermove 頻率，避免上層 heavy rebuild
// 4) DOM ref cache 會 prune，避免 cache 汙染
// 5) Magic numbers / types 集中管理
//
// 未來擴充：
// - D3 renderer：替換 SvgDrawableRenderer（或新增 D3DrawableRenderer）
// - MathBox 3D：新增另一個 View/Renderer backend（例如 WebGLSceneView）
// - KaTeX：可在 renderer 擴充 "mathSvg" / "foreignObject" 等 drawable kind
// - 多表聯動：上層 Controller/GraphView 統一調度，SvgSceneView 只回報事件
//
// src/
//   mvc/
//     view/
//       SvgSceneView.tsx                 // ✅ 薄：只負責組裝、事件掛載、呼叫子模組
//       svg/
//         svgViewTypes.ts                // ✅ types 集中管理
//         svgViewConstants.ts            // ✅ magic numbers 集中管理
//         svgDomCoords.ts                // ✅ 螢幕座標→local SVG 座標
//         SvgTextNodeRegistry.ts         // ✅ text DOM ref cache + prune，避免汙染
//         hitTest.ts                     // ✅ hit-test（point/text）
//         rafCoalescer.ts                // ✅ rAF coalesce（move 節流）
//         SvgDrawableRenderer.tsx        // ✅ Drawable → React SVG nodes（可替換）
//
// ------------------------------------------------------------

import React from "react";
import type { SceneOutput } from "../../core/drawables";

import type { DragCallbacks, DragState, PixelPoint } from "./svg/svgViewTypes";
import { SVG_VIEW_STYLE, HIT_TEST_DEFAULTS } from "./svg/svgViewConstants";
import { getLocalSvgPoint, clampToRect } from "./svg/svgDomCoords";
import { SvgTextNodeRegistry } from "./svg/svgTextNodeRegistry";
import { hitTestDraggable } from "./svg/svgHitTest";
import { RafCoalescer } from "./svg/svgRafCoalescer";
import { SvgDrawableRenderer } from "./svg/svgDrawableRenderer";

// ------------------------------------------------------------
// Props：SvgSceneView 的輸入
// Input：
// - scene：pixel domain 的 drawables、畫布尺寸
// - onPointDrag/onTextDrag：往上回報拖曳（View 不做狀態回推）
// Output：由 render() 輸出 <g> + children
// ------------------------------------------------------------
type Props = {
    scene: SceneOutput;
} & DragCallbacks;

// ------------------------------------------------------------
// SvgSceneView：class component（避免 move 時 setState 造成 re-render）
// ------------------------------------------------------------
export class SvgSceneView extends React.Component<Props> {
    // ✅ [CHANGED] ref 型別簡化：RefObject<SVGGElement> 本身 current 就是 SVGGElement | null
    private gRef: React.RefObject<SVGGElement | null>;

    // ✅ [CHANGED] 拖曳狀態集中成一個物件（SRP：drag state 一處管理）
    private drag: DragState;

    // ✅ [NEW] Text DOM ref registry（給 hit-test bbox 用，且可 prune）
    private textRegistry: SvgTextNodeRegistry;

    // ✅ [NEW] rAF coalescer（避免 move 高頻打爆上層）
    private raf: RafCoalescer;

    // ✅ [NEW] Renderer（可替換，為 D3/KaTeX/MathBox 預留）
    private renderer: SvgDrawableRenderer;

    constructor(props: Props) {
        super(props);

        this.gRef = React.createRef<SVGGElement>();

        this.drag = {
        draggingId: null,
        draggingKind: null,
        pointerId: null,
        };

        this.textRegistry = new SvgTextNodeRegistry();
        this.raf = new RafCoalescer();
        this.renderer = new SvgDrawableRenderer(this.textRegistry);

        // ✅ [NEW] 注入 rAF flush 行為
        this.raf.setFlushHandler((id, kind, p) => {
        this.flushDragToCallbacks(id, kind, p);
        });

        // bind
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handlePointerCancel = this.handlePointerCancel.bind(this);
    }

    // ----------------------------------------------------------
    // componentDidUpdate
    // 設計目的：
    // - prune textRegistry：避免 cache 汙染（scene 改變、id 變多時）
    //
    // Input：prevProps
    // Output：void
    // ----------------------------------------------------------
    componentDidUpdate(prevProps: Props): void {
        if (prevProps.scene !== this.props.scene) {
        const validTextIds = this.collectCurrentTextIds();
        this.textRegistry.prune(validTextIds);
        }
    }

    // ----------------------------------------------------------
    // componentWillUnmount
    // 設計目的：清理 rAF / registry，避免記憶體洩漏
    // ----------------------------------------------------------
    componentWillUnmount(): void {
        this.raf.cancel();
        this.textRegistry.clear();
    }

    // ----------------------------------------------------------
    // collectCurrentTextIds
    // 設計目的：掃描目前 scene.drawables 找出所有 text id
    //
    // Input：none（使用 this.props.scene）
    // Output：Set<string>
    // ----------------------------------------------------------
    private collectCurrentTextIds(): Set<string> {
        const ids = new Set<string>();
        for (const d of this.props.scene.drawables) {
        if (d.kind === "text") {
            ids.add(d.id);
        }
        }
        return ids;
    }

    // ----------------------------------------------------------
    // getClampedLocalPoint
    // 設計目的：
    // - 統一：座標轉換 + clamp
    // - SvgSceneView 的 pixel domain 操作都走這裡，避免散落
    //
    // Input：PointerEvent + gRef.current
    // Output：PixelPoint（local + clamped）
    // ----------------------------------------------------------
    private getClampedLocalPoint(e: React.PointerEvent<SVGGElement>): PixelPoint {
        const g = this.gRef.current;
        const local = getLocalSvgPoint(e, g);

        const w = this.props.scene.width;
        const h = this.props.scene.height;

        return clampToRect(local, w, h);
    }

    // ----------------------------------------------------------
    // beginDrag
    // 設計目的：開始拖曳（統一設定 drag state + pointer capture）
    //
    // Input：
    // - g: SVGGElement（ref.current）
    // - pointerId: number
    // - id: string（drawable.id）
    // - kind: "point" | "text"
    //
    // Output：void
    // ----------------------------------------------------------
    private beginDrag(g: SVGGElement, pointerId: number, id: string, kind: "point" | "text"): void {
        this.drag.draggingId = id;
        this.drag.draggingKind = kind;
        this.drag.pointerId = pointerId;

        // capture：確保 move/up 即使移出也能收到
        g.setPointerCapture(pointerId);
    }

    // ----------------------------------------------------------
    // endDrag
    // 設計目的：結束拖曳（統一清理 state + rAF pending）
    //
    // Input：none
    // Output：void
    // ----------------------------------------------------------
    private endDrag(): void {
        this.drag.draggingId = null;
        this.drag.draggingKind = null;
        this.drag.pointerId = null;

        this.raf.cancel();
    }

    // ----------------------------------------------------------
    // flushDragToCallbacks
    // 設計目的：
    // - rAF flush 時，真正呼叫 props callbacks
    // - 讓上層（Controller）自行決定 heavy / light pipeline
    //
    // Input：id/kind/pixel
    // Output：void
    // ----------------------------------------------------------
    private flushDragToCallbacks(id: string, kind: "point" | "text", p: PixelPoint): void {
        if (kind === "point") {
        const cb = this.props.onPointDrag;
        if (cb) {
            cb(id, p);
        }
        return;
        }

        if (kind === "text") {
        const cb = this.props.onTextDrag;
        if (cb) {
            cb(id, p);
        }
        return;
        }
    }

    // ----------------------------------------------------------
    // handlePointerDown
    // 設計目的：
    // - 找 draggable 命中目標（先 text 再 point）
    // - 開始拖曳並立即回報一次（讓 UI 立即更新）
    //
    // Input：PointerEvent
    // Output：void
    // ----------------------------------------------------------
    private handlePointerDown(e: React.PointerEvent<SVGGElement>): void {
        const g = this.gRef.current;
        if (!g) {
        return;
        }

        const p = this.getClampedLocalPoint(e);
        const drawables = this.props.scene.drawables;

        const hit = hitTestDraggable(drawables, p, HIT_TEST_DEFAULTS, this.textRegistry);
        if (!hit) {
        return;
        }

        // 若缺少對應 callback，就不啟動 drag（避免拖了但上層不處理）
        if (hit.kind === "text") {
        if (!this.props.onTextDrag) {
            return;
        }
        this.beginDrag(g, e.pointerId, hit.id, "text");
        this.flushDragToCallbacks(hit.id, "text", p);
        return;
        }

        if (hit.kind === "point") {
        if (!this.props.onPointDrag) {
            return;
        }
        this.beginDrag(g, e.pointerId, hit.id, "point");
        this.flushDragToCallbacks(hit.id, "point", p);
        return;
        }
    }

    // ----------------------------------------------------------
    // handlePointerMove
    // 設計目的：
    // - 若正在拖曳，將最新座標 push 到 rAF coalescer
    // - 每 frame 最多 flush 一次到上層（避免高頻）
    //
    // Input：PointerEvent
    // Output：void
    // ----------------------------------------------------------
    private handlePointerMove(e: React.PointerEvent<SVGGElement>): void {
        const draggingId = this.drag.draggingId;
        const draggingKind = this.drag.draggingKind;

        if (!draggingId || !draggingKind) {
        return;
        }

        if (this.drag.pointerId !== e.pointerId) {
        return;
        }

        const p = this.getClampedLocalPoint(e);

        // ✅ [CHANGED] move 不直接呼叫 callback，改用 rAF coalesce
        this.raf.push(draggingId, draggingKind, p);
    }

    // ----------------------------------------------------------
    // handlePointerUp
    // 設計目的：
    // - release capture（若存在）
    // - endDrag
    //
    // Input：PointerEvent
    // Output：void
    // ----------------------------------------------------------
    private handlePointerUp(e: React.PointerEvent<SVGGElement>): void {
        const g = this.gRef.current;

        // release capture：用 stored pointerId（比較安全）
        const pid = this.drag.pointerId;
        if (g && pid !== null) {
        try {
            g.releasePointerCapture(pid);
        } catch {
            // ignore
        }
        }

        this.endDrag();
    }

    // ----------------------------------------------------------
    // handlePointerCancel
    // 設計目的：系統中斷/手勢被接管時，視同 up
    // ----------------------------------------------------------
    private handlePointerCancel(e: React.PointerEvent<SVGGElement>): void {
        this.handlePointerUp(e);
    }

    // ----------------------------------------------------------
    // render
    // 設計目的：
    // - 將 drawables 委派給 renderer
    // - SvgSceneView 不再持有「每種 kind 的渲染細節」
    //
    // Input：this.props.scene.drawables
    // Output：<g> + children
    // ----------------------------------------------------------
    render(): React.ReactNode {
        const nodes: React.ReactNode[] = [];

        for (const d of this.props.scene.drawables) {
        const node = this.renderer.renderDrawable(d);
        if (node) {
            nodes.push(node);
        }
        }

        return (
        <g
            ref={this.gRef}
            onPointerDown={this.handlePointerDown}
            onPointerMove={this.handlePointerMove}
            onPointerUp={this.handlePointerUp}
            onPointerCancel={this.handlePointerCancel}
            style={{ touchAction: SVG_VIEW_STYLE.touchAction }}
        >
            {nodes}
        </g>
        );
    }
}
