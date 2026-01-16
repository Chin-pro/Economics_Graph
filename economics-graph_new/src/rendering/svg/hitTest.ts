// src/mvc/view/svg/hitTest.ts
// ------------------------------------------------------------
// [NEW] hit-test：只負責「命中判定」
// SRP：不處理 pointer、rAF、渲染
// ------------------------------------------------------------

import type { Drawable } from "../../core/drawables";
import type { PixelPoint, HitTestConfig, HitTestResult } from "./types";
import { SvgTextNodeRegistry } from "./SvgTextNodeRegistry";

// ------------------------------------------------------------
// hitTestPoint
// 設計目的：
// - 找出最接近且命中的 point drawable
//
// Input：
// - drawables: Drawable[]
// - local: PixelPoint（已 clamp）
// - cfg: HitTestConfig
//
// Output：string | null（命中的 point id）
// ------------------------------------------------------------
export function hitTestPoint(
    drawables: Drawable[],
    local: PixelPoint,
    cfg: HitTestConfig
): string | null {
    let bestId: string | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;

    const x = local.x;
    const y = local.y;

    for (const d of drawables) {
        if (d.kind === "point") {
        const dx = x - d.center.x;
        const dy = y - d.center.y;
        const d2 = dx * dx + dy * dy;

        const r = d.r + cfg.pointTolerancePx;
        const r2 = r * r;

        if (d2 <= r2) {
            if (d2 < bestD2) {
            bestD2 = d2;
            bestId = d.id;
            }
        }
        }
    }

    return bestId;
}

// ------------------------------------------------------------
// hitTestDraggableText
// 設計目的：
// - 命中 draggable text（優先使用 node.getBBox）
// - 若 node 不存在則用 fallback hitbox
//
// Input：
// - drawables: Drawable[]
// - local: PixelPoint（已 clamp）
// - cfg: HitTestConfig
// - registry: SvgTextNodeRegistry（text DOM refs）
//
// Output：string | null（命中的 text id）
// ------------------------------------------------------------
export function hitTestDraggableText(
    drawables: Drawable[],
    local: PixelPoint,
    cfg: HitTestConfig,
    registry: SvgTextNodeRegistry
): string | null {
    let bestId: string | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;

    const x = local.x;
    const y = local.y;

    for (const d of drawables) {
        if (d.kind === "text" && d.draggable) {
        const node = registry.get(d.id);

        // ----------------------------------------------------
        // 1) 優先使用 bbox（更準確）
        // 2) 若 node 尚未建立，再用 fallback hitbox
        //
        // 注意：依照你的偏好，這裡避免使用 continue/break
        // ----------------------------------------------------
        let handledByBbox = false;

        if (node) {
            const bbox = node.getBBox();
            const pad = cfg.textPaddingPx;

            const left = bbox.x - pad;
            const right = bbox.x + bbox.width + pad;
            const top = bbox.y - pad;
            const bottom = bbox.y + bbox.height + pad;

            const inside = x >= left && x <= right && y >= top && y <= bottom;
            if (inside) {
                const cx = bbox.x + bbox.width / 2;
                const cy = bbox.y + bbox.height / 2;
                const dx = x - cx;
                const dy = y - cy;
                const d2 = dx * dx + dy * dy;

                if (d2 < bestD2) {
                    bestD2 = d2;
                    bestId = d.id;
                }
            }

            handledByBbox = true;
        }

        if (!handledByBbox) {
            // fallback hitbox（node 尚未建立）
            let fontSize = cfg.defaultFontSizePx;
            if (d.fontSize !== undefined) {
                fontSize = d.fontSize;
            }

            const approxW = d.text.length * fontSize * cfg.approxCharWidthFactor;
            const approxH = fontSize;

            const pad2 = cfg.fallbackTextPaddingPx;

            const left2 = d.pos.x - pad2;
            const right2 = d.pos.x + approxW + pad2;
            const top2 = d.pos.y - approxH - pad2;
            const bottom2 = d.pos.y + pad2;

            const inside2 = x >= left2 && x <= right2 && y >= top2 && y <= bottom2;
            if (inside2) {
                const cx2 = d.pos.x + approxW / 2;
                const cy2 = d.pos.y - approxH / 2;
                const dx2 = x - cx2;
                const dy2 = y - cy2;
                const d22 = dx2 * dx2 + dy2 * dy2;

                if (d22 < bestD2) {
                    bestD2 = d22;
                    bestId = d.id;
                }
            }
        }
        }
    }

    return bestId;
}

// ------------------------------------------------------------
// hitTestDraggable
// 設計目的：
// - 統一入口：先 hit text（優先），再 hit point
//
// Input：drawables/local/cfg/registry
// Output：HitTestResult | null
// ------------------------------------------------------------
export function hitTestDraggable(
    drawables: Drawable[],
    local: PixelPoint,
    cfg: HitTestConfig,
    registry: SvgTextNodeRegistry
): HitTestResult | null {
    const textId = hitTestDraggableText(drawables, local, cfg, registry);
    if (textId) {
        return { id: textId, kind: "text" };
    }

    const pointId = hitTestPoint(drawables, local, cfg);
    if (pointId) {
        return { id: pointId, kind: "point" };
    }

    return null;
}
