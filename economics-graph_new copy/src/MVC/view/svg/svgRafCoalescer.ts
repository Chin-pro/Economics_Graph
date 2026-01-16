// src/mvc/view/svg/rafCoalescer.ts
// ------------------------------------------------------------
// [NEW] rAF coalescer：把高頻 move 合併成「每 frame 最多一次」
// 目的：
// - 避免每個 pointermove 都觸發上層 heavy rebuild
// - 讓 Controller 可以做 Light patch 或延遲 heavy
//
// SRP：只管 rAF 排程，不懂 drawables / hit-test
// ------------------------------------------------------------

import type { PixelPoint } from "./svgViewTypes";

export class RafCoalescer {
    private rafId: number | null;
    private pending: { id: string; kind: "point" | "text"; p: PixelPoint } | null;
    private flushFn: ((id: string, kind: "point" | "text", p: PixelPoint) => void) | null;

    constructor() {
        this.rafId = null;
        this.pending = null;
        this.flushFn = null;
    }

    // ----------------------------------------------------------
    // setFlushHandler
    // Input：handler
    // Output：void
    // 設計目的：由 SvgSceneView 注入「真正要做的回呼」
    // ----------------------------------------------------------
    setFlushHandler(
        handler: (id: string, kind: "point" | "text", p: PixelPoint) => void
    ): void {
        this.flushFn = handler;
    }

    // ----------------------------------------------------------
    // push
    // Input：id/kind/pixel（最新的一筆 move）
    // Output：void
    // 設計目的：只保留最新一筆，下一 frame flush 一次
    // ----------------------------------------------------------
    push(id: string, kind: "point" | "text", p: PixelPoint): void {
        this.pending = { id, kind, p };

        if (this.rafId !== null) {
        return;
        }

        this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null;

        const item = this.pending;
        this.pending = null;

        if (!item) {
            return;
        }

        const fn = this.flushFn;
        if (!fn) {
            return;
        }

        fn(item.id, item.kind, item.p);
        });
    }

    // ----------------------------------------------------------
    // cancel
    // Input：none
    // Output：void
    // 設計目的：drag 結束或 component unmount 時清理
    // ----------------------------------------------------------
    cancel(): void {
        if (this.rafId !== null) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
        }
        this.pending = null;
    }
}
