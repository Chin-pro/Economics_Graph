// src/MVC/controller/ConsumerOptController.ts
// ------------------------------------------------------------
// Controller：
// (1) 接收 UI 事件
// (2) 更新 model / options 狀態
// (3) 觸發 builder 重建 scene（並快取）
// (4) 通知 View 重新 render
//
// buildScene 已抽到 ConsumerOptSceneBuilder（SRP）
// label anchor/offset/clamp 已抽到 consumerOptLabel.ts（SRP）
// equation spans 已抽到 consumerOptEquation.ts（SRP）
//
// Heavy/Light split pipleline:
// - Heavy: 呼叫 builder.buildScene(...) (通常包含 econ 計算)
// - Light: 不呼叫 builder，只 patch 現有 scene (顯示/隱藏/更新 label 位置) 
// - rAF coalesce: 同一個 frame 只 flush 一次
//
// Scope:
// - Controller = orchestration (協調者)，不負責　renderer / 幾何計算　/ 公式排版
// ------------------------------------------------------------

// SceneOutput: 代表「View 需要渲染的一切資料」(width/height/drawables/...)
import type { SceneOutput } from "../../core/drawables";

// Viewport: 經濟座標 <-> 像素座標映射工具
// - Controller 會呼叫 model 的 setter (Ex: setAlpha/setIncome)
import { Viewport } from "../../core/Viewport";

// ConsumerOptModel: 承載經濟模型的狀態 (income, alpha, px, py...) 極其更新方法
import { ConsumerOptModel } from "../model/ConsumerOptModel";

// ConsumerViewOptions: 純視覺/顯示層選項 (顯示 label? 字體大小? 顏色? 是否顯示 opt?)
import type { ConsumerViewOptions } from "../../core/types";

// ConsumerOptSceneBuilder: 把 (model + options + labelOffsets) 組裝成 SceneOutput + Viewport
import { ConsumerOptSceneBuilder } from "./consumerOptSceneBuilder";

// consumerOptLabel.ts：專門處理 label 相關幾何規則：
// - findLabelAnchorOnePass (drawables)：回傳 anchors map
// - clampToPlot：把拖曳座標限制在 plot 範圍內（避免拖出後再也點不到）
// - 引入 LabelKey + buildFixedEquationAnchors，讓拖曳支援固定 anchor（utility/indiff）
import { 
    clampToPlot, 
    findLabelAnchorsOnePass, 
    buildFixedEquationAnchors, 
    isLabelKey, 
    type LabelKey, 
    type PixelPoint,  
    type PlotArea, 
    type PixelOffset, 
} from "./consumerOptLabel";


// ------------------------------------------------------------
//  Listener 型別 (訂閱者 callback)
//  - 當 scene 更新時，Controller 會把新 scene 丟給它
//
//  Input: scene (SceneOutput)
//
//  Output: 
//  - void（不回傳值，只做 side effects，例如 setState 觸發 React re-render）
// ------------------------------------------------------------
type Listener = (scene: SceneOutput) => void;

// ------------------------------------------------------------
//  RebuildKind: 用來區分 heavy vs light
//  - Heavy: model 變動 / 幾何可能改變，需要 builder.buildScene (影響 curve/optimum/domain)
//  - Light: 純視覺/偏移，只改 view options / labelOffsets，允許 patch 現有 scene (顏色/字體/顯示/labelOffsets)
// ------------------------------------------------------------
type RebuildKind = "heavy" | "light";


export class ConsumerOptController {
    
    // model：經濟狀態與計算的來源（domain）
    private readonly model: ConsumerOptModel;

    // builder：把 (model + options + label offsets) 組成 scene 的組件器
    // Controller 不應該自己做 scene builder，因此把 buildScene 放在 builder
    private readonly builder: ConsumerOptSceneBuilder;

    // listeners：訂閱 scene 更新的 callback 清單 (典型 pub/sub 模式)
    private listeners: Listener[];

    // lastScene：scene cache（快取）
    // - null 表示目前尚未 build 或 cache 被視為無效
    // - 好處：避免每次 getScene() 都重算 build（可能昂貴）
    private lastScene: SceneOutput | null;

    // lastViewport：viewport cache（快取）
    // - build 時一起產生，給 drag 事件做 pixel<->econ 轉換
    private lastViewport: Viewport | null;

    // controlViewOptions：屬於「視覺」而不是「經濟模型」的狀態
    // 放在 controller 讓 UI（控制欄）改它時，能統一驗證並重建 scene
    private controlViewOptions: ConsumerViewOptions;  //  budgetColor/indiffColor

    // labelOffsets：只存偏移，不摻雜 buildScene
    // labelOffsets：記錄「使用者拖曳 label 後，相對於 anchor 的偏移量」。
    // - Record<string,...>？
    //   - key = label 的 id（如 "budget-eq", "indiff-eq"...）
    //   - value = {offsetDx, offsetDy} 相對偏移
    // 這樣 builder 可以用同一套 offset 規則把文字畫到使用者想要的位置。
    private labelOffsets: Partial<Record<LabelKey, PixelOffset>>;

    // ------------------------------------------------------------
    //  constructor
    //  
    //  Input: args = { innerAvailW, innerAvailH, model }
    //  - innerAvailW/H：可用繪圖區域大小（扣掉 UI 或 padding 後）
    //  - model：由外部建立的 ConsumerOptModel（注入依賴）
    //  
    //  Output: 建立並初始化 controller（無回傳）
    // ------------------------------------------------------------
    constructor(args: { 
        innerAvailWidth: number; 
        innerAvailHeight: number; 
        model: ConsumerOptModel;
    }) {
      
        // 把外部傳入的 model 存起來，之後 slider/drag 都會改它
        this.model = args.model;

        // builder 需要知道：model + 可用的畫布大小
        // 「依賴注入」：builder 不是自己 new model，而是接收同一個 model
        // 確保 single source of truth：model 狀態只有一份
        this.builder = new ConsumerOptSceneBuilder({
            model: this.model,
            innerAvailWidth: args.innerAvailWidth,
            innerAvailHeight: args.innerAvailHeight,
        });

        // listeners 起始是空陣列
        this.listeners = [];

        // 快取 (cache) 起始為 null，表示還沒 build
        this.lastScene = null;
        this.lastViewport = null;
        
        // 預設 controlViewOptions 的預設值 (視覺渲染向關參數)
        // - 影響 scene 的 drawables（是否畫 label / 顏色 / 字體大小等渲染用參數）
        this.controlViewOptions = {
            showEquationLabels: true,
            labelFontSize: 12,

            showOpt: true,
            optPointColor: "#111111",
            optTextColor: "#111111",

            budgetColor: "#111111",
            indiffColor: "#111111",
        };

        // labelOffsets 起始為空物件：表示 label 都在預設位置（無偏移）
        this.labelOffsets = {};
    }


    // ============================================================
    // subscribe/unsubscribe  ?????
    // ============================================================

    // ------------------------------------------------------------
    //  subscribe
    //  - 把一個 callback 加入 listeners，之後 scene 更新會通知它
    //  - 訂閱 scene 更新事件: 每次 rebuildAndNotify 都會呼叫 fn(scene)
    //
    //  Input: fn（Listener）
    //
    //  Output: void
    // ------------------------------------------------------------
    subscribe(fn: Listener) {
      this.listeners.push(fn);
    }

    // ------------------------------------------------------------
    //  unsubscribe
    //  - 把某個 callback 從 listeners 移除
    //  - 取消訂閱: 將指定的 fn 從 listeners 移除
    //  - 避免在遍歷時修改同一個陣列造成邏輯錯誤，透過建立新陣列的方式，
    //    行為更可預期，避免汙染 (immutable-ish)
    // 
    //  Input: fn（Listener）
    //
    //  Output: void
    // ------------------------------------------------------------
    unsubscribe(fn: Listener) {
        const nextListenersList: Listener[] = [];

        let listenerIndex = 0;
        while (listenerIndex < this.listeners.length) {
            const listenerItem = this.listeners[listenerIndex];

            // 僅保留「不是 fn」的 listener
            if (listenerItem !== fn) {
                nextListenersList.push(listenerItem);
            }
            listenerIndex ++;
        }

        // 用新陣列覆蓋回 listeners
        this.listeners = nextListenersList;
    }


    // ============================================================
    // Scene / Viewport getters
    // ============================================================

    // ------------------------------------------------------------
    //  getScene
    //  - 作用：取得目前 scene（cache hit: 就直接回傳；cache miss 則 rebuildCache）
    // 
    //  Input: none
    //
    //  Output: SceneOutput
    // ------------------------------------------------------------
    getScene(): SceneOutput {
        // cache hit: 若快取存在，直接回傳（避免重建）
        if (this.lastScene !== null) {
            return this.lastScene;
        }

        // cache miss: 新建一次 cache: build.scene
        this.rebuildCache();

        // 防禦式寫法：理論上不會發生，保險
        // - 理論上 rebuildCache 一定會填 lastScene
        // - 若如果未來 builder 失敗回傳空值，這裡至少再嘗試一次
        if (!this.lastScene) {
            this.rebuildCache();
        }

        // 重試後，依然為空，則直接報錯
        if (this.lastScene === null) {
            // 直接 fail fast
            throw new Error("[ConsumerOptController] rebuildCache() did not produce a SceneOutput.");
        }

        return this.lastScene;
    }

    // ------------------------------------------------------------
    //  getViewport
    //  - 取得目前 viewport（cache hit: 快取存在就回傳；cache miss: build 一次）
    //  
    //  Input: none
    //
    //  Output: Viewport
    // 
    //  調整 error handling 策略 ??????
    // ------------------------------------------------------------
    getViewport(): Viewport {
        // cache hit: 檢查 cache (快取)
        if (this.lastViewport) {
            return this.lastViewport;
        }

        // cache miss: 重建 scene
        this.rebuildCache();

        // Defensive Programming: 若重建回傳空值，再次嘗試一次
        if (!this.lastViewport) {
            // 這裡建立一個「最小可用」的 viewport，避免外部呼叫時直接炸掉。
            // (1,1,[0,1],[0,1]) 是一個 fallback（但確實屬於 magic-ish 的防禦值）。
            // ??? 應該回傳 Viewport 的預設值??? 需要把 Viewport中的 magic nubmer 導入
            // this.lastViewport = new Viewport(1, 1, [0, 1], [0, 1]);
            throw new Error(
                "[ConsumerOptController] rebuildCache() did not produce a Viewport."
            );
        }
        return this.lastViewport;
    }

    // ------------------------------------------------------------
    //  getModelParamsSnapshot
    //  - 提供 UI 顯示或 debug 用的「當前 model 參數快照」
    //
    //  Input: none
    //
    //  Output:
    //  - 由 model.getModelParams() 決定的型別，通常是一個 params object
    // ------------------------------------------------------------
    getModelParamsSnapshot() {
         return this.model.getModelParams();
    }


    // ============================================================
    //  options setters（集中驗證）
    // ============================================================

    // ------------------------------------------------------------
    //  setViewOptions
    //  - 更新 view options (只允許部分更新 patch)，並集中驗證 (Ex: 字體大小範圍)
    //
    //  Input:
    //  - patch: Partial<ConsumerViewOptions>  (path: 補丁，只修改部分欄位)
    //  - Partial<T> 是 TS 的 utility type：
    //    - 表示「T 的所有欄位都變成可選」
    //    - 用途：讓外部只更新部分 options (Ex: { showOpt: false } 或 { labelFontSize: 16 })
    //
    //  Output: void
    // ------------------------------------------------------------
    setViewOptions(patch: Partial<ConsumerViewOptions>) {
      // 產生 next options（immutable update），避免直接 mutate this.options (汙染)
      // - 先展開舊 options
      // - 再展開 patch 覆蓋同名欄位
        const nextConsumerViewOption: ConsumerViewOptions = { 
            ...this.controlViewOptions, 
            ...patch 
        };

        // 防呆機制：字體大小範圍
        // - 集中驗證：所有 UI 設定改動都會通過同一個入口，避免散落在各個 onChange handler 裡
        if (nextConsumerViewOption.labelFontSize < 8) {
            nextConsumerViewOption.labelFontSize = 8;
        }
        if (nextConsumerViewOption.labelFontSize > 28) {
            nextConsumerViewOption.labelFontSize = 28;
        }

        // 更新 options 並重建 scene 通知 view
        this.controlViewOptions = nextConsumerViewOption;  // 型別皆為 (type) ConsumerViewOptions
        this.rebuildAndNotify();
    }


    // ============================================================
    //  slider events
    // ============================================================

    // ------------------------------------------------------------
    //  onIncomeChange
    //  - 作用：把 income 寫回 model，然後 rebuild scene / 通知 view (渲染)
    //
    //  Input: nextIncome（新的 income 數值）
    //
    //  Output: void
    // ------------------------------------------------------------
    onIncomeChange(nextIncome: number) {
      this.model.setIncome(nextIncome);
      this.rebuildAndNotify();
    }

    // ------------------------------------------------------------
    //  onAlphaChange
    //  - 更新 alpha (偏好權重)，然後 rebuild scene / 通知 view (渲染)
    //
    //  Input: nextA（新的 alpha 效用權重）
    //
    //  Output: void
    // ------------------------------------------------------------
    onAlphaChange(nextAlpha: number) {
        this.model.setAlpha(nextAlpha);
        this.rebuildAndNotify();
    }

    // ------------------------------------------------------------
    //  onPxChange
    //  - 更新 px (價格)，，然後 rebuild scene / 通知 view (渲染)
    //  - 做了最小值限制 px >= 0.1，避免 px 太小導致 budget 線斜率爆炸/數值不穩，或除以 0
    //  
    //  Input: nextPx（新的 px）
    //
    //  Output: void
    // ------------------------------------------------------------
    onPxChange(nextPx: number) {
        const params = this.model.getModelParams();

        let px = nextPx;
        if (px < 0.1) {
            px = 0.1;
        }

        // setPrices 一次更新 px, py，只改 px，不影響 py。
        this.model.setPrices(px, params.py);
        this.rebuildAndNotify();
    }

    // ------------------------------------------------------------
    //  onPyChange
    //  - 更新 py (價格)，，然後 rebuild scene / 通知 view (渲染)
    //
    //  Input: nextPy（新的 py）
    //
    //  Output: void
    // ------------------------------------------------------------
    onPyChange(nextPy: number) {
        const params = this.model.getModelParams();

        let py = nextPy;
        if (py < 0.1) {
            py = 0.1;
        }

        this.model.setPrices(params.px, py);
        this.rebuildAndNotify();
    }


    //=========================================================
    // drag events
    //=========================================================

    // ------------------------------------------------------------
    //  onPointDrag
    //  - 拖曳 opt 點 → 反推 econ 點 → 更新 alpha → rebuild scene / notify view (渲染)
    //
    //  Input:
    //  - id: string（被拖曳的 point drawable id，例如 "opt"）
    //  - pixel: {x, y}（滑鼠/指標在 SVG 像素座標）
    //
    //  Output: void
    // ------------------------------------------------------------
    onPointDrag(id: string, pixel: { x: number; y: number }) {
        // Opt 關閉就不允許拖
        // UI option gate：不顯示就不允許互動，避免狀態和畫面不一致
        if (!this.controlViewOptions.showOpt) {
            return;
        }

        // 只處理 opt 點的拖曳，其它點（未來可能有別的點）直接忽略
        if (id !== "opt") {
            return;
        }

        // 取得 viewport，把 pixel 座標轉成 econ 座標
        const vp = this.getViewport();
        const econ = vp.pixelToEconMapping(pixel);

        // denom = x+y，用來把 (x,y) 正規化成一個比例 ?????
        // alpha = x/(x+y)
        // 把 opt 的拖曳想像成在 simplex（x+y>0）的比例移動。
        const denom = econ.x + econ.y;
        if (denom <= 0) {
            return;
        }

        let nextAlpha = econ.x / denom;

        // 將 alpha 限制在 [0.1, 0.9]
        // 避免 alpha 太接近 0 或 1 造成圖形退化（例如 indiff curve 或最適角點狀態太極端）
        if (nextAlpha < 0.1) {
            nextAlpha = 0.1;
        }
        if (nextAlpha > 0.9) {
            nextAlpha = 0.9;
        }

        // 寫回 model 並重建
        this.model.setAlpha(nextAlpha);
        this.rebuildAndNotify();
    }

    // ------------------------------------------------------------
    //  onTextDrag
    //  - 拖曳文字 label → 計算相對於 anchor 的 dx, dy → 存入 labelOffsets
    //
    //  - findLabelAnchorsOnePass(drawables) 回傳 anchors map，必須用 id 獲取 anchor
    //  - 需要將 offset 存進 this.labelOffsets，否則拖曳不會生效
    //  - 加入 type gurad，避免任意 string 寫進 offsets
    //
    //  Input:
    //  - id: string（被拖曳的文字 label id，例如 "indiff-eq"）
    //  - pixel: {x,y}（拖曳到的位置）
    //
    //  Output: void
    // ------------------------------------------------------------
    onTextDrag(id: string, pixel: { x: number; y: number }) {
        const scene = this.getScene();

        // 只允許 LabelKey 進入 offsets/anchors 流程
        // 避免任意 string 當 key 汙染 offsets 表，並讓 TS 正確 narrowing
        if (!isLabelKey(id)) {
            return;
        }

        // anchors 來源 = 固定 anchors + 掃描 anchors (合併)
        // - fixedAnchors: utility-eq / indiff-eq 這類「固定標記」anchor，不需要貼 drawable，也應可拖曳
        // - scannedAnchors: budget-eq / opt-label 這類「貼著圖形」anchor
        const fixedAnchors = buildFixedEquationAnchors(
            this.controlViewOptions.labelFontSize
        );

        const scannedAnchors = findLabelAnchorsOnePass(scene.drawables);
        const anchorsByKey: Partial<Record<LabelKey, PixelPoint>> = {
            ...fixedAnchors,
            ...scannedAnchors,
        };

        // 找 label 的 anchor（原始基準點）
        const anchor = anchorsByKey[id];
        if (!anchor) {
            // 找不到代表目前 drawables 沒有這個 label（Ex: 可能該 drawable 不存在或選項關閉）
            return;
        }

        const plotArea: PlotArea = {
            width: scene.width,
            height: scene.height,
            padding: 2,
        }

        const positionPixelPoint: PixelPoint = {
            x: pixel.x,
            y: pixel.y
        };
        
        // 拖曳範圍限制在 plot 內
        // label 被拖出 plot 後，使用者再也點不到（因為 hit-test 只在可視區/或視窗內）
        // clampToPlot 會把座標限制在 plotArea 範圍
        const clamped = clampToPlot(plotArea, positionPixelPoint);


        // offset = clamped - anchor (存在相對偏移，而不是絕對座標)
        // anchor 會跟著模型重算移動，但 offset 仍能保持使用者相對調整
        // 為什麼存 dx/dy 而不是存 absolute x/y？
        // - anchor 可能會因為 model/viewport 改變而移動（例如 scale、domain 改）
        // - 存偏移可以讓 label 跟著 anchor 一起移動，只保留使用者的相對調整
        const offsets: PixelOffset = {
            offsetDx: clamped.x - anchor.x,
            offsetDy: clamped.y - anchor.y,
        };

        // 記錄偏移: 寫入 offsets，拖曳才會生效
        this.labelOffsets[id] = offsets;

        // rebuild scene（builder 會把 offset 套上）
        this.rebuildAndNotify();
    }


    // ============================================================
    //  Private Methods (internals)
    // ============================================================
    
    // // ------------------------------------------------------------
    // //  isLabelKey (private)
    // //  - Type guard: 把一般 string 縮小成 LabelKey
    // //  - 讓 TS 知道 id 可以安全地用來 index anchors map / offsets table
    // //  - id is LabelKey: 先對 id 進行型別檢查
    // //  - 為甚麼這邊不先命名參數? const k: LabelKey = id;
    // //    - 這樣可能會造成 silence error，因為在 runtime 不會檢查，直接在 compile 時候報錯
    // //
    // //  Input: id: string
    // //
    // //  Output:
    // //  - boolean (並提供 TS narrowing: id is Labelkey) 
    // // ------------------------------------------------------------
    // private isLabelKey(id: string): id is LabelKey {
    //     if (id === "budget-eq") {
    //         return true;
    //     }
    //     if (id === "indiff-eq") {
    //         return true;
    //     }
    //     if (id === "opt-label") {
    //         return true;
    //     }
    //     if (id === "utility-eq") {
    //         return true;
    //     }
    //     return false;
    // }

    // ------------------------------------------------------------
    //  rebuildCache (private)
    //  - 呼叫 builder.build() 產生新的 scene + viewport，並寫入快取
    //
    //  Input: 
    //  - none（但會讀 this.model / this.options / this.labelOffsets）
    //  
    //  Output: 
    //  - void
    //  - 不回傳值，僅用來更新 (cache) this.lastScene / this.lastViewport
    // ------------------------------------------------------------
    private rebuildCache(): void {
        // builder.build 的 input：
        // - options：渲染控制（顯示哪些元素、字體大小、顏色等）
        // - labelOffsets：文字的相對偏移（由拖曳累積出來）
        const built = this.builder.buildScene({
            controlOptions: this.controlViewOptions,
            labelOffsets: this.labelOffsets,
        });

        this.lastScene = built.scene;          // built.scene: SceneOutput
        this.lastViewport = built.viewport;    // built.viewport: Viewport
    }

    // ------------------------------------------------------------
    //  rebuildAndNotify (private)
    //  - rebuildCache 更新快取
    //  - 逐一呼叫 listeners，把新的 scene 推給 view
    //
    //  Input: none
    //
    //  Output: void
    // ------------------------------------------------------------
    private rebuildAndNotify() {
        // 更新 cache
        this.rebuildCache();

        if (this.lastScene === null) {
            throw new Error(
                "[ConsumerOptController] lastScene is null after rebuildCache()."
            );
        }

        // controller 的內部流程，因此直接獲取 cache，不用再次 getScene()
        const scene = this.lastScene;

        // while 迭代 listeners，逐一通知
        // 這是 pub/sub：controller 不知道 view 怎麼 render，它只負責把新 scene 丟出去
        let listenerIndex = 0;
        while (listenerIndex < this.listeners.length) {
            const fn = this.listeners[listenerIndex];
            fn(scene);
            listenerIndex++;
        }
    }
}

