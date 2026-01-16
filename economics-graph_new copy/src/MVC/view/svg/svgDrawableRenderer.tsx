// src/mvc/view/svg/SvgDrawableRenderer.tsx
// ------------------------------------------------------------
// [NEW] Drawable → SVG ReactNode
// SRP：只負責把「資料」渲染成 SVG 元素
// 目的：
// - SvgSceneView 不再關心每種 drawable 的渲染細節
// - 未來可替換成 D3 renderer（仍輸出 <path> 或直接操作 DOM）
// - KaTeX/Math SVG 之後也可以在這裡擴充對應 kind（例如 "mathSvg"）
// ------------------------------------------------------------

import React from "react";
import type { Drawable, TextSpan } from "../../../core/drawables";
import { SvgTextNodeRegistry } from "./SvgTextNodeRegistry";
import { HIT_TEST_DEFAULTS } from "./svgViewConstants";

export class SvgDrawableRenderer {
    private registry: SvgTextNodeRegistry;

    constructor(registry: SvgTextNodeRegistry) {
        this.registry = registry;
    }

    // ----------------------------------------------------------
    // renderDrawable
    // Input：d: Drawable
    // Output：ReactNode | null
    // 設計目的：單筆 drawable 的渲染入口
    // ----------------------------------------------------------
    renderDrawable(d: Drawable): React.ReactNode {
        if (d.kind === "line") {
        return this.renderLine(d);
        }

        if (d.kind === "polyline") {
        return this.renderPolyline(d);
        }

        if (d.kind === "point") {
        return this.renderPoint(d);
        }

        if (d.kind === "text") {
        return this.renderText(d);
        }

        // 若未來新增 drawable.kind，建議你在 core/drawables 用 union + never 檢查
        // 這裡保守回傳 null，避免 renderer 直接炸掉
        return null;
    }

    // -------------------- private renderers --------------------

    private renderLine(d: Extract<Drawable, { kind: "line" }>): React.ReactNode {
        let stroke = "currentColor";
        if (d.stroke && d.stroke.color) {
        stroke = d.stroke.color;
        }

        let w = 1;
        if (d.stroke && d.stroke.width) {
        w = d.stroke.width;
        }

        let dashArray: string | undefined = undefined;
        if (d.stroke && d.stroke.dash) {
        dashArray = d.stroke.dash.join(" ");
        }

        return (
        <line
            key={d.id}
            x1={d.minEndPoint.x}
            y1={d.minEndPoint.y}
            x2={d.maxEndPoint.x}
            y2={d.maxEndPoint.y}
            stroke={stroke}
            strokeWidth={w}
            strokeDasharray={dashArray}
        />
        );
    }

    private renderPolyline(d: Extract<Drawable, { kind: "polyline" }>): React.ReactNode {
        let stroke = "currentColor";
        if (d.stroke && d.stroke.color) {
        stroke = d.stroke.color;
        }

        let w = 1;
        if (d.stroke && d.stroke.width) {
        w = d.stroke.width;
        }

        const pts = d.points.map((p) => `${p.x},${p.y}`).join(" ");

        return (
        <polyline
            key={d.id}
            points={pts}
            fill="none"
            stroke={stroke}
            strokeWidth={w}
        />
        );
    }

    private renderPoint(d: Extract<Drawable, { kind: "point" }>): React.ReactNode {
        let fill = "currentColor";
        if (d.fill && d.fill.color) {
        fill = d.fill.color;
        }

        let stroke: string | undefined = undefined;
        if (d.stroke && d.stroke.color) {
        stroke = d.stroke.color;
        }

        let sw: number | undefined = undefined;
        if (d.stroke && d.stroke.width) {
        sw = d.stroke.width;
        }

        return (
        <circle
            key={d.id}
            cx={d.center.x}
            cy={d.center.y}
            r={d.r}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
        />
        );
    }

    private renderText(d: Extract<Drawable, { kind: "text" }>): React.ReactNode {
        let fontSize = HIT_TEST_DEFAULTS.defaultFontSizePx;
        if (d.fontSize !== undefined) {
        fontSize = d.fontSize;
        }

        let fill = "currentColor";
        if (d.fill && d.fill.color) {
        fill = d.fill.color;
        }

        const style: React.CSSProperties = {};
        if (d.draggable) {
        style.cursor = "grab";
        }

        // ✅ [CHANGED] ref callback 統一交給 registry 管理
        const setRef = (node: SVGTextElement | null) => {
        this.registry.set(d.id, node);
        };

        if (d.spans && d.spans.length > 0) {
        return (
            <text
            key={d.id}
            ref={setRef}
            x={d.pos.x}
            y={d.pos.y}
            fontSize={fontSize}
            fill={fill}
            style={style}
            >
            {d.spans.map((s: TextSpan, idx: number) => {
                const tspanStyle: React.CSSProperties = {};
                if (s.baselineShift !== undefined) {
                // baselineShift 在 SVG 標準中允許 "sub"/"super"/number
                // 這裡保持相容性，故用 any
                (tspanStyle as any).baselineShift = s.baselineShift;
                }
                if (s.fontStyle !== undefined) {
                tspanStyle.fontStyle = s.fontStyle;
                }
                if (s.fontWeight !== undefined) {
                tspanStyle.fontWeight = s.fontWeight;
                }

                let spanFontSize: number | undefined = undefined;
                if (s.fontSize !== undefined) {
                spanFontSize = s.fontSize;
                }

                let dx: number | undefined = undefined;
                if (s.offsetDx !== undefined) {
                dx = s.offsetDx;
                }

                let dy: number | undefined = undefined;
                if (s.offsetDy !== undefined) {
                dy = s.offsetDy;
                }

                return (
                <tspan
                    key={`${d.id}-s-${idx}`}
                    dx={dx}
                    dy={dy}
                    fontSize={spanFontSize}
                    style={tspanStyle}
                >
                    {s.text}
                </tspan>
                );
            })}
            </text>
        );
        }

        return (
        <text
            key={d.id}
            ref={setRef}
            x={d.pos.x}
            y={d.pos.y}
            fontSize={fontSize}
            fill={fill}
            style={style}
        >
            {d.text}
        </text>
        );
    }
}
