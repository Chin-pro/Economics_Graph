// src/app/FeatureHost.tsx
// ------------------------------------------------------------
// FeatureHost（方案 B / Step 2.5）
//
// 目的：
// - App 層不再知道某個 feature 的 ControlsPanel / GraphView / controller 細節
// - App 只負責：
//   1) 選擇 featureId
//   2) 從 registry 取得 FeatureModule
//   3) 建立 controller（一次）
//   4) 掛載 module.Root（由 feature 自己組裝 UI）
//
// 設計重點（可擴充性）：
// - 未來新增 SupplyDemand / GameTheory / GE... 只要新增 module + Root 即可
// - 未來 UI 重做（Figma Make）時：AppView 幾乎不用動；改的是各 feature 的 Root/UI
//
// 注意：
// - 目前先用 SVG 的 layoutConfig 計算 innerAvailSize（固定值）
// - 未來要做 responsive（ResizeObserver）可在這裡升級：
//   - 量測容器大小 -> dispatch RESIZE -> LIGHT 更新 viewport（Step 3/4）
// ------------------------------------------------------------

import React from "react";
import { getFeatureModule } from "../features/registry";
import type { FeatureId, FeatureController } from "../features/types";
import { computeSvgInnerAvailSize } from "../rendering/svg/layoutConfig";

type Props = {
    featureId: FeatureId;
};

type State = {
    controller: FeatureController | null;
};

// ------------------------------------------------------------
//  FeatureHost
//
//  Input:
//  - featureId: FeatureId（要掛載的 feature）
//
//  Output:
//  - ReactElement：渲染 module.Root
// ------------------------------------------------------------
export class FeatureHost extends React.Component<Props, State> {
    public constructor(props: Props) {
        super(props);

        this.state = {
            controller: null,
        };
    }

    public componentDidMount(): void {
        this.createControllerIfNeeded(this.props.featureId);
    }

    public componentDidUpdate(prevProps: Props): void {
        if (prevProps.featureId !== this.props.featureId) {
            this.disposeController();
            this.createControllerIfNeeded(this.props.featureId);
        }
    }

    public componentWillUnmount(): void {
        this.disposeController();
    }

    // ----------------------------------------------------------
    // createControllerIfNeeded
    // - 以目前 featureId 從 registry 建立 controller
    // - controller 是長壽命物件，不放在 props / render 內 new
    // ----------------------------------------------------------
    private createControllerIfNeeded(featureId: FeatureId): void {
        const module = getFeatureModule(featureId);
        const inner = computeSvgInnerAvailSize();

        const controller = module.createController({
            innerAvailWidth: inner.innerWidth,
            innerAvailHeight: inner.innerHeight,
        });

        this.setState({ controller: controller });
    }

    // ----------------------------------------------------------
    // disposeController
    // - 切換 feature / unmount 時釋放資源，避免 rAF / listener leak
    // ----------------------------------------------------------
    private disposeController(): void {
        const controller = this.state.controller;
        if (!controller) {
            return;
        }

        controller.dispose();
        this.setState({ controller: null });
    }

    public render(): React.ReactNode {
        const module = getFeatureModule(this.props.featureId);
        const controller = this.state.controller;

        if (!controller) {
            return <div style={{ padding: 16 }}>Loading feature...</div>;
        }

        const Root = module.Root;
        return <Root controller={controller} />;
    }
}
