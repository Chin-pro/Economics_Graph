// src/features/types.ts
// ------------------------------------------------------------
// Feature interfaces (Step 1: "介面釘死")
// ------------------------------------------------------------
// 目的：
// - 讓 app 不直接依賴某個 feature 的內部結構（Controller/Model/SceneBuilder）
// - 以 FeatureModule 作為「可插拔」擴充點：未來加供需、一般均衡、賽局、多圖聯動 ...
//
// 這一步只定義介面，不重寫任何功能。
// ------------------------------------------------------------

import type { SceneOutput } from "../core/drawables";
import type { Viewport } from "../core/viewport/Viewport";
import type { ComponentType } from "react";

// ------------------------------------------------------------
// SceneBuilder：把 (model/options/env) → SceneOutput 的責任定型
// ------------------------------------------------------------
export interface SceneBuilder<TInput, TOutput> {
    buildScene(args: TInput): TOutput;
}

// ------------------------------------------------------------
// FeatureController：feature 的互動入口（由 UI / GraphView 呼叫）
// - subscribe：讓 view 訂閱更新（React setState / useSyncExternalStore）
// - getScene/getViewport：view 層唯一需要吃的資料
// ------------------------------------------------------------
export type Unsubscribe = () => void;
export type Listener = () => void;

export interface FeatureController {
    subscribe(listener: Listener): Unsubscribe;
    unsubscribe(listener: Listener): void;

    getScene(): SceneOutput;
    getViewport(): Viewport;

    // 讓 app 在切換 feature / unmount 時釋放資源
    dispose(): void;
}

// ------------------------------------------------------------
//  FeatureRootProps: Feature 提供的 Root UI
//  - FeatureHost 會用它來掛載 feature 的 UI (Controls + Graph 等)
//  - Root 只依賴 FeatureController 介面，不依賴 AppView
// ------------------------------------------------------------
export type FeatureRootProps = {
    controller: FeatureController;
};

// ------------------------------------------------------------
// FeatureModule：app-level 的組裝單位
// - createController：建立 controller（內部會 new model / sceneBuilder）
// ------------------------------------------------------------
export type FeatureId = string;

// ------------------------------------------------------------
//  FeatureInitBase
//  - 所有 feature 至少需要的初始資訊
// ------------------------------------------------------------
export type FeatureInitBase = {
    innerAvailWidth: number;
    innerAvailHeight: number;
};


export interface FeatureModule<
    TController extends FeatureController = FeatureController,
    TInit extends FeatureInitBase = FeatureInitBase
> {
    readonly id: FeatureId;
    createController(init: TInit): TController;
    // 由 feature 自己提供 Root UI，App 只負責掛載
    readonly Root: ComponentType<FeatureRootProps>;
}
