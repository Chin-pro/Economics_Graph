// src/rendering/svg/SvgRendererAdapter.tsx
// ------------------------------------------------------------
// SvgRendererAdapter (Step 1: adapter 包住既有 rendering/svg/*)
// ------------------------------------------------------------
// 目的：
// - 讓既有 SvgSceneView / hitTest / export 以「Renderer 介面」對外提供能力
// - 不改任何現有功能，只做薄薄的一層 Adapter
// ------------------------------------------------------------

import React from "react";

import type {
  Renderer,
  RendererExportArgs,
  RendererHitTestArgs,
  RendererRenderArgs,
  HitTestResult,
} from "../types";

import { SvgSceneView } from "./SvgSceneView";
import { SVG_HIT_TEST_DEFAULTS } from "./constants";
import { SvgTextNodeRegistry } from "./SvgTextNodeRegistry";
import { hitTestDraggable } from "./hitTest";
import { exportSvgElement } from "../export/svgExport";

// ------------------------------------------------------------
// SvgRendererAdapter
// ------------------------------------------------------------
export class SvgRendererAdapter implements Renderer {
  public readonly id: string;

  private registry: SvgTextNodeRegistry;

  public constructor() {
    this.id = "svg";
    this.registry = new SvgTextNodeRegistry();
  }

  // ----------------------------------------------------------
  // render
  // Input:
  // - args.scene: SceneOutput
  // - args.callbacks: drag callbacks (optional)
  //
  // Output:
  // - ReactElement: <SvgSceneView ... />
  //
  // 設計目的：
  // - 維持既有 SvgSceneView 行為（它自己處理 pointer + rAF + registry）
  // - 讓外部改成依賴 Renderer 介面，而不是直接依賴 SvgSceneView
  // ----------------------------------------------------------
  public render(args: RendererRenderArgs): React.ReactElement {
    const callbacks = args.callbacks;

    return (
      <SvgSceneView
        scene={args.scene}
        onPointDrag={callbacks.onPointDrag}
        onTextDrag={callbacks.onTextDrag}
      />
    );
  }

  // ----------------------------------------------------------
  // hitTest
  // Input:
  // - scene: SceneOutput
  // - local: PixelPoint (plot-area local coords)
  //
  // Output:
  // - HitTestResult | null
  //
  // 注意：
  // - 這裡提供一個「可用的 fallback hitTest」：
  //   registry 若沒有 DOM node，hitTest.ts 會自動走 fallback hitbox（文字近似框）
  // ----------------------------------------------------------
  public hitTest(args: RendererHitTestArgs): HitTestResult | null {
    const result = hitTestDraggable(
      args.scene.drawables,
      args.local,
      SVG_HIT_TEST_DEFAULTS,
      this.registry
    );

    if (!result) {
      return null;
    }

    return { id: result.id, kind: result.kind };
  }

  // ----------------------------------------------------------
  // export
  // Input:
  // - container: unknown (預期是 SVGSVGElement)
  // - fileNameRaw / width / height
  //
  // Output: void (目前直接下載)
  // ----------------------------------------------------------
  public export(args: RendererExportArgs): void {
    const el = args.container as SVGSVGElement | null;
    if (!el) {
      return;
    }

    exportSvgElement(el, {
      fileNameRaw: args.fileNameRaw,
      width: args.width,
      height: args.height,
    });
  }

  // ----------------------------------------------------------
  // dispose
  // ----------------------------------------------------------
  public dispose(): void {
    this.registry.clear();
  }
}

// ------------------------------------------------------------
// helper: 讓外部更容易取得預設 renderer（避免到處 new）
// ------------------------------------------------------------
let singleton: SvgRendererAdapter | null = null;

export function getSvgRenderer(): SvgRendererAdapter {
  if (!singleton) {
    singleton = new SvgRendererAdapter();
  }
  return singleton;
}
