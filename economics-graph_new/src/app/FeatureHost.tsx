// src/app/FeatureHost.tsx
// ------------------------------------------------------------
// FeatureHost: Composition/Wiring + Lifecycle owner
//
// SRP:
// - App 層不再知道某個 feature 的 ControlsPanel / GraphView / controller 細節
// - FeatureHost 只做：
//   1) 依 featureId 找 module: FeatureId、getFeatureModule(FeatureId)
//   2) 依據 layout 計算的 inner size，建 controller（一次，長壽命）: FeatureModule.createController(init)
//   3) render module.Root 並注入 controller: FeatureModule.Root
//   4) 在切換/卸載時 dispose controller
//
// OCP 可擴充性:
// - 未來新增 feature (SupplyDemand / GameTheory / GE...) 只要新增 module + Root 即可
//   - 在 features/registry 註冊 module
//   - 實作該 module 的 createController 與 Root，即可被 host 掛載
// - 未來 UI 重做（Figma Make）時：AppView 幾乎不用動；改的是各 feature 的 Root/UI
//
// [RESERVED]：
// - 目前先用 SVG 的 layoutConfig 計算 innerAvailSize（固定值）
// - 未來要做 responsive（ResizeObserver）可在這裡升級：
//   - 量測容器大小 -> dispatch RESIZE -> LIGHT 更新 viewport（Step 3/4）
// ------------------------------------------------------------

import React from "react";

// getFeatureModule(featureId): 透過 registry 取得 feature，維持 SRP
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
        // controller 是長壽命 imperative 物件 (Ex: rAF/listener/subscribe/cache)
        this.state = {
            controller: null,
        };
    }

    // ------------------------------------------------------------
    //  componentDidMount()
    //  - 將副作用 (create controller) 放到 mount 後，避免 constructor 出現副作用
    //
    //  Input: empty
    //  - 使用 this.props.featureId
    //
    //  Output: (void)
    //  - 建立 controller、setState
    // ------------------------------------------------------------
    public componentDidMount(): void {
        this.createControllerIfNeeded(this.props.featureId);
    }

    // ------------------------------------------------------------
    //  componentDidUpdate()
    //  - 處理 featureId 改變的更新情況 (只會觸發一次 render)
    //
    //  - render() 在哪被呼叫? componentDidUpdate() 是否「偵測到 featureId 改變就會自動觸發」?
    //    - render() 和 componentDidUpdate() 都不是手動呼叫的，它們是 React 在「props/state 改變」的更新
    //      流程中自動呼叫
    //    - 專案中，存在有 <FeatureHost featureId={...}/>，只要 FeatureHost 出現在 JSX 中，
    //      React 就會接管它的生命週期，並呼叫它的 render()
    //    - 只要此元件 <FeatureHost featureId={...}/> 發生更新，componentDidUpdate 就會被呼叫
    //
    //  Input: prevProps.featureId
    //
    //  Output: (void)
    //  - 若 featureId 改變 → dispose 舊 controller，再建立新 controller
    // ------------------------------------------------------------
    public componentDidUpdate(prevProps: Props): void {
        if (prevProps.featureId !== this.props.featureId) {
            this.disposeController();
            this.createControllerIfNeeded(this.props.featureId);
        }
    }

    // ------------------------------------------------------------
    //  componentWillUnmount()
    //  
    //  Input: empty
    //  
    //  Output: (void)
    //  - dispose controller，避免 rAF/listener leak
    // ------------------------------------------------------------
    public componentWillUnmount(): void {
        this.disposeController();
    }

    // ----------------------------------------------------------
    // createControllerIfNeeded
    // - 以目前 featureId 從 registry 建立 controller
    // - controller 是長壽命物件，不放在 props / render 內 new
    // ----------------------------------------------------------
    private createControllerIfNeeded(featureId: FeatureId): void {
        // 由 registry 保護掛載安全性，不會掛載到不存在的 feature
        const module = getFeatureModule(featureId);
        const inner = computeSvgInnerAvailSize();

        const controller = module.createController({
            innerAvailWidth: inner.innerWidth,
            innerAvailHeight: inner.innerHeight,
        });
        // 觸發 render
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
        // 清除 controller
        controller.dispose();
        this.setState({ controller: null });
    }

    public render(): React.ReactNode {
        // 1) 找到目前 feature 對應的 module
        // 透過 featureId 獲取 FeatureModule 物件 (確保有 Root: ComponentType<FeatureRootProps>)
        const module = getFeatureModule(this.props.featureId);
        const controller = this.state.controller;
        
        // 2) controller 還沒建好，就顯示 loading
        if (!controller) {
            return <div style={{ padding: 16 }}>Loading feature...</div>;
        }

        // 傳入 Root (Ex: ConsumerOptRoot) 
        // - Ex: <ConsumerOptRoot controller={controller}>
        const Root = module.Root;
        return <Root controller={controller} />;
    }
}
