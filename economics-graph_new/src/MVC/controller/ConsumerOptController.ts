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
// 
// rAF coalesce: 同一個 frame 只 flush 一次
//
// 避免 cache 汙染 (reference leakage)
// - 不把 cache 物件「原封不動」暴露給外部 (listeners / getScene)
// - buildScene 的輸入做快照 (shallow copy)，避免未來 refactor 時 builder 持有可變參考
// - notify 時使用 listeners snapshot，避免 re-entrancy / 訂閱列表被邊走邊改
// - dev 模式提供 deepFreeze (抓到任何不小心 mutate 的地方)
//
// Scope:
// - Controller = orchestration (協調者)，不負責　renderer / 幾何計算　/ 公式排版
// ------------------------------------------------------------

// SceneOutput: 代表「View 需要渲染的一切資料」(width/height/drawables/...)
import type { SceneOutput, Drawable, Point2D } from "../../core/drawables";

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
    // ============================================================
    //  Dependencies
    // ============================================================
    // model：經濟狀態與計算的來源（domain）
    private readonly model: ConsumerOptModel;

    // builder：把 (model + options + label offsets) 組成 scene 的組件器
    // Controller 不應該自己做 scene builder，因此把 buildScene 放在 builder
    private readonly builder: ConsumerOptSceneBuilder;


    // ============================================================
    //  Pub/Sub
    // ============================================================
    // listeners：訂閱 scene 更新的 callback 清單 (典型 pub/sub 模式)
    private listeners: Listener[];


    // ============================================================
    //  Cache
    // ============================================================
    // lastScene：scene cache 快取
    // - null 表示目前尚未 build 或 cache 被視為無效
    // - 好處：避免每次 getScene() 都重算 build（可能昂貴）
    private lastScene: SceneOutput | null;

    // lastViewport：viewport cache 快取
    // - build 時一起產生，給 drag 事件做 pixel<->econ 轉換
    private lastViewport: Viewport | null;


    // ============================================================
    //  Controller-owned UI state
    // ============================================================
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


    // ============================================================
    //  rAF coalesce state
    //  - 把大量事件合併成「每 frame flush 一次」，避免重算/重繪風暴
    // ============================================================

    // dirty: 是否有尚未 flush 的變更 (heavyDirty 代表至少需要 heavy 等級)
    private heavyDirty: boolean;
    private lightDirty: boolean;

    // pendingKind: 累積到目前為止最高等級 (heavy > light)
    private pendingKind: RebuildKind | null;
    
    // hasScheduledFlush: 避免同一 frame 重複排程
    private hasScheduledFlush: boolean;

    // scheduledFlushHandle: 用來取消已排程的 flush (若有需要)
    private scheduledFlushHandle: number | null;

    // scheduledFlushKind：記錄目前 handle 對應的排程類型（raf / timeout）
    // - number handle 無法分辨來源，取消時必須用對的 API，避免取消不到造成 double flush
    private scheduledFlushKind: "raf" | "timeout" | null;


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
        // 依賴注入：外部提供 model（single source of truth）
        // 把外部傳入的 model 存起來，之後 slider/drag 都會改它
        this.model = args.model;

        // builder 需要知道：model + 可用的畫布大小
        // 依賴注入：builder 不是自己 new model，而是接收同一個 model
        // 確保 single source of truth：model 狀態只有一份
        this.builder = new ConsumerOptSceneBuilder({
            model: this.model,
            innerAvailWidth: args.innerAvailWidth,
            innerAvailHeight: args.innerAvailHeight,
        });

        // pub/sub init
        // - listeners 起始是空陣列
        this.listeners = [];
        
        // cache init
        // - 快取 (cache) 起始為 null，表示還沒 build
        this.lastScene = null;
        this.lastViewport = null;
        
        // view options init（純視覺）
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

        // rAF coalesce init
        // - 初始尚未 build，視為需要 flush (起始預設 heavy)
        this.heavyDirty = true;
        this.lightDirty = true;
        this.pendingKind = "heavy";

        // 初始化排成狀態
        this.hasScheduledFlush = false;
        this.scheduledFlushHandle = null;

        this.scheduledFlushKind = null;
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
    //
    // 保留 可以在 listeners 陣列中 進行去重
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
    //  - 取得目前 scene
    //    cache hit: 就直接回傳；cache miss 則 rebuildCache）
    //  - 即使 dirty，也不會在 getter 強制 flush
    //  - 永遠回傳 clone，避免外部拿到 cache 的 reference
    // 
    //  Input: none
    //
    //  Output: SceneOutput
    // ------------------------------------------------------------
    getScene(): SceneOutput {
        // cache hit: 若快取存在，直接回傳（避免重建）
        if (this.lastScene !== null) {
            const snapshot = cloneSceneOutput(this.lastScene);
            if (isDevMode()) deepFreezeSceneOutput(snapshot);
            return snapshot;
        }

        // cache miss: 新建一次 cache: build.scene
        // this.rebuildCache();
        this.rebuildCacheSync();

        // // 防禦式寫法：理論上不會發生，保險
        // // - 理論上 rebuildCache 一定會填 lastScene
        // // - 若如果未來 builder 失敗回傳空值，這裡至少再嘗試一次
        // if (!this.lastScene) {
        //     this.rebuildCache();
        // }

        // 重試後，依然為空，則直接報錯
        if (this.lastScene === null) {
            // 直接 fail fast
            throw new Error("[ConsumerOptController] rebuildCache() did not produce a SceneOutput.");
        }

        // 回傳 clone (避免外部改到 cache)
        const snapshot = cloneSceneOutput(this.lastScene);

        // dev 模式下 freeze snapshot: 任何 mutate 立刻被抓到
        if (isDevMode()) {
            deepFreezeSceneOutput(snapshot);
        }

        return snapshot;
    }

    // ------------------------------------------------------------
    //  getViewport
    //  - 取得目前 viewport（cache hit: 快取存在就回傳；cache miss: build 一次）
    //  
    //  - Viewport 是 class instance，不適合 clone (也不一定需要)
    //    但它仍然是「reference 外洩」的潛在點，在這裡使用「約定」:
    //    Viewport 方法必須是 pure mapping (不 mutate internal state)
    //  
    //  Input: none
    //
    //  Output: Viewport
    // 
    //  保留: 調整 error handling 策略 ??????
    // ------------------------------------------------------------
    getViewport(): Viewport {
        // cache hit: 檢查 cache (快取)
        if (this.lastViewport) {
            return this.lastViewport;
        }

        // cache miss: 重建 scene
        // this.rebuildCache();
        this.rebuildCacheSync();


        // Defensive Programming: 若重建回傳空值，再次嘗試一次
        if (!this.lastViewport) {
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
    //  View options setters（集中驗證）
    // ============================================================

    // ------------------------------------------------------------
    //  setViewOptions
    //  - 更新 view options (只允許部分更新 patch)，並集中驗證 (Ex: 字體大小範圍)
    //  - [CHANGED] 不再 rebuildAndNotify() 立即重建
    //              改成 requestRebuild("light") → rAF coalesce
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
        
        // this.rebuildAndNotify();
        
        // 視覺層變動 (顏色/字體/顯示) 屬於 light
        this.requestRebuild("light");
    }


    // ============================================================
    //  Slider events (model changes → heavy)
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
        
        // this.rebuildAndNotify();

        // income 會影響 budget/optimum/curve → heavy
        this.requestRebuild("heavy");
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
        
        // this.rebuildAndNotify();

        // alpha/exponent 會影響 optimum/curve → heavy
        this.requestRebuild("heavy");
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
        
        // this.rebuildAndNotify();

        // px 會影響 budget/optimum/viewport/curve → heavy
        this.requestRebuild("heavy");
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
        
        // this.rebuildAndNotify();

        // py 會影響 budget/optimum/viewport/curve → heavy
        this.requestRebuild("heavy");
    }


    // =========================================================
    //  Drag events
    // =========================================================

    // ------------------------------------------------------------
    //  onPointDrag
    //  - 拖曳 opt 點 → 反推 econ 點 → 更新 alpha → model.setAlpha → heavy rebuild
    //  - [CHANGED] 不再即時 rebuildAndNotify()，改為 requestRebuild("heavy")
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
        // - alpha 不影響 viewport；但若尚未 build，getter 會 sync build 一次 ??????
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
        
        // this.rebuildAndNotify();

        // alpha 改變 → optimum/curve 改變 → heavy
        this.requestRebuild("heavy");
    }

    // ------------------------------------------------------------
    //  onTextDrag
    //  - 拖曳文字 label → 計算相對於 anchor 的 dx, dy → 存入 labelOffsets
    //  
    //  - [CHANGED] 不再即時 rebuildAndNotify()，改為 requestRebuild("light")
    //              labelOffsets 是純視覺偏移 → light
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
        // 只允許 LabelKey 進入 offsets/anchors 流程
        // 避免任意 string 當 key 汙染 offsets 表，並讓 TS 正確 narrowing
        if (!isLabelKey(id)) {
            return;
        }

        // 盡量使用 cache scene (上一 frame 即可)
        // 若尚未 build，getScene() 會同步 build 一次，避免 anchor 計算失效
        const scene = this.getScene();

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
        // this.rebuildAndNotify();
        
        // 純視覺偏移 → light
        this.requestRebuild("light");
    }


    // ============================================================
    //  Private Methods (internals)
    // ============================================================

    // ------------------------------------------------------------
    //  requestRebuild
    //  - Controller 的「重建請求入口」
    //  - 只標記 dirty + 排程 flush
    //
    //  目的:
    //  - heavy > light: 如果同一 frame 既有 light 又有 heavy，最後以 heavy 為準
    //    但 flush 時仍然只呼叫一次 buildScene (builder 內部自己 cache heavy)
    // ------------------------------------------------------------
    private requestRebuild(kind: RebuildKind): void {
        if (kind === "heavy") {
            // 代表整個結果都可能需要更新
            this.heavyDirty = true;
            this.lightDirty = true;
            this.pendingKind = "heavy";
        }

        if (kind === "light") {
            // 只要有任何視覺變動就需要
            this.lightDirty = true;

            // 若目前沒有 pending 或 pending 是 light，就維持/設定 light
            // 若 pending 已經是 heavy，就保持 heavy (不降級)
            if (this.pendingKind === null) {
                this.pendingKind = "light";
            } else {
                if (this.pendingKind === "light") {
                    this.pendingKind = "light";
                }
                // pendingKind === "heavy": 保持 heavy，不執行任何動作
            }
        }
        
        // 排程 flush (同 frame 只會排一次)
        this.scheduleFlush();
    }

    // ------------------------------------------------------------
    //  scheduleFlush
    //  - 使用 requestAnimationFrame 將多次事件合併成一次 flush
    // ------------------------------------------------------------
    private scheduleFlush(): void {
        if (this.hasScheduledFlush) {
            return;
        }

        this.hasScheduledFlush = true;

        // 兼容: 若環境沒有 rAF，退回 setTimeout ????
        const hasRAF = typeof requestAnimationFrame === "function";

        if (hasRAF) {
            // 紀錄 kind，方便取消
            this.scheduledFlushKind = "raf";
            
            // 記住 handle，若同步 biuld 先發生也能取消 (避免 double build)
            this.scheduledFlushHandle = requestAnimationFrame(() => {
                this.flushScheduled();
            });
            return;
        } 
        
        // else {
        //     // fallback: 用 16ms 模擬 1 幀
        //     this.scheduledFlushHandle = window.setTimeout(() => {
        //         this.flushScheduled();
        //     } ,16);
        // }

        // fallback: 用 timeout 模擬
        // 紀錄 kind，方便取消
        this.scheduledFlushKind = "timeout";

        this.scheduledFlushHandle = window.setTimeout(()=>{
            this.flushScheduled()
        } ,16);
    }

    // ------------------------------------------------------------
    //  flushScheduled
    //  - rAF callback: 真正執行 build + notify 的地方
    //  - 一個 frame 最多呼叫 1 次
    // ------------------------------------------------------------
    private flushScheduled(): void {
        // 清除排成狀態
        this.hasScheduledFlush = false;
        this.scheduledFlushHandle = null;

        // 清除掉 kind
        this.scheduledFlushKind = null;

        // 若沒有 dirty，代表期間被同步 build 或狀態又被回復，則直接退出
        if (!this.heavyDirty && !this.lightDirty && this.lastScene !== null) {
            return;
        }

        // flush = rebuild cache
        this.rebuildCache();

        if (this.lastScene === null) {
            throw new Error(
                "[ConsumerOptController] lastScene is null after rebuildCache() in flushScheduled()."
            );
        }

        // 清除 dirty
        this.heavyDirty = false;
        this.lightDirty = false;
        this.pendingKind = null;

        // 通知 view (安全: snapshot + clone scene)
        // this.notifyListeners(this.lastScene);
        this.notifyListenersSafely(this.lastScene);
    }

    // // ------------------------------------------------------------
    // //  notifyListeners
    // //  - pub/sub 對外通知
    // // ------------------------------------------------------------
    // private notifyListeners(scene: SceneOutput): void {
    //     let listenerIndex = 0;
    //     while (listenerIndex < this.listeners.length) {
    //         const fn = this.listeners[listenerIndex];
    //         fn(scene);
    //         listenerIndex++;
    //     }
    // }

    // ------------------------------------------------------------
    //  notifyListenersSafely
    //  - listeners 跌代時可能被 subscribe/unsubscribe 改動 → 行為不可預期
    //  - 不能把 cache scene 原封不動丟出去 → 避免 cache 汙染
    // ------------------------------------------------------------
    private notifyListenersSafely(cacheScene: SceneOutput): void {
        // snapshot listeners，避免遍歷中被改動
        const listenersSnapshot = this.listeners.slice();
        
        let listenerIndex = 0;
        while (listenerIndex < listenersSnapshot.length) {
            const fn = listenersSnapshot[listenerIndex];

            // 每個 listener 都 clone 一份，避免 listener1 的 mutation 影響 listener2
            const sceneForListener = cloneSceneOutput(cacheScene);

            // dev 模式: freeze listener scene，抓 mutation bug
            if (isDevMode()) {
                deepFreezeSceneOutput(sceneForListener);
            }

            fn(sceneForListener);
            listenerIndex++;
        }
    }


    // ============================================================
    //  Cache rebuild (sync/flush)
    // ============================================================

    // ------------------------------------------------------------
    //  rebuildCache (private)
    //  - 呼叫 builder.build() 產生新的 scene + viewport，並寫入快取
    //
    //  - 即使 Controller pendingKind 是 light，這裡仍然呼叫 buildScene，
    //    因為 builder 會自己處理 heavy cache hit/miss
    //
    //  - [CHANGE] 避免 builder 看到「可變參考」
    //    - controlOptions / labelOffsets 做 shallow copy 當成一次 build 的快照
    //    - 這可避免未來 builder refactor 時意外持有 controller state 的 reference 
    //
    //  Input: 
    //  - none（但會讀 this.model / this.options / this.labelOffsets）
    //  
    //  Output: 
    //  - void
    //  - 不回傳值，僅用來更新 (cache) this.lastScene / this.lastViewport
    // ------------------------------------------------------------
    private rebuildCache(): void {
        // 建立一次 build 的快照 (shallow copy)
        const controlViewOptionsSnapshot: ConsumerViewOptions = { ...this.controlViewOptions };

        // labelOffsets snapshot，必須 clone value 物件，避免 reference leakage
        const labelOffsetsSnapshot: Partial<Record<LabelKey, PixelOffset>> = cloneLabelOffsets(this.labelOffsets);

        // builder.build 的 input：
        // - options：渲染控制（顯示哪些元素、字體大小、顏色等）
        // - labelOffsets：文字的相對偏移（由拖曳累積出來）
        const built = this.builder.buildScene({
            controlOptions: controlViewOptionsSnapshot,
            labelOffsets: labelOffsetsSnapshot,
        });

        // 寫入 cache
        this.lastScene = built.scene;          // built.scene: SceneOutput
        this.lastViewport = built.viewport;    // built.viewport: Viewport

        // dev 模式下凍結 cache: 抓「有人改了 cache」的 bug (通常是外部 reference leakage)
        // 已經在 getScene / notify 做 clone，理論上外部取不到 cache；
        // 但是 freeze 仍可抓到內部誤改 cache 的情況 (例如未來 refactor 的時候)
        if (isDevMode()) {
            // freeze cache 本體
            deepFreezeSceneOutput(this.lastScene);
        }
    }

    // ------------------------------------------------------------
    //  rebuildCacheSync
    //  - 只用「cache 尚未建立」時的同步保底
    //  - [CHANGED] 避免 getter 在未 build 時直接炸掉，但不主動 notify (notify 交給 flush)
    // ------------------------------------------------------------
    private rebuildCacheSync(): void {
        // 若已經有排程 flush，但我們現在又被迫同步 build（通常發生在第一次 getScene/getViewport）
        // 為避免同一 frame 重複 build，嘗試取消排程（若環境支援）
        this.cancelScheduledFlushIfAny();

        this.rebuildCache();

        // 同步 sync build 後，cache 已存在，dirty 清掉
        this.heavyDirty = false;
        this.lightDirty = false;
        this.pendingKind = null;
        this.hasScheduledFlush = false;
    }

    // ------------------------------------------------------------
    // cancelScheduledFlushIfAny
    // - 取消已排程的 rAF / timeout（避免 double build）
    // ------------------------------------------------------------
    private cancelScheduledFlushIfAny(): void {
        if (this.scheduledFlushHandle === null) {
            return;
        }

        // const hasCancelRAF = typeof cancelAnimationFrame === "function";
        // if (hasCancelRAF) {
        //     // rAF handle
        //     cancelAnimationFrame(this.scheduledFlushHandle);
        // } else {
        //     // timeout handle
        //     window.clearTimeout(this.scheduledFlushHandle);
        // }

        // 根據 kind 正確取消，避免取消不到
        if (this.scheduledFlushKind === "raf") {
            const hasCancelRAF = typeof cancelAnimationFrame === "function";
            if (hasCancelRAF) {
                cancelAnimationFrame(this.scheduledFlushHandle);
            }
        }

        if (this.scheduledFlushKind === "timeout") {
            window.clearTimeout(this.scheduledFlushHandle);
        }


        this.scheduledFlushHandle = null;
        this.scheduledFlushKind = null;
        this.hasScheduledFlush = false;
    }


    // // ------------------------------------------------------------
    // //  rebuildAndNotify (private)
    // //  - rebuildCache 更新快取
    // //  - 逐一呼叫 listeners，把新的 scene 推給 view
    // //
    // //  Input: none
    // //
    // //  Output: void
    // // ------------------------------------------------------------
    // private rebuildAndNotify() {
    //     // 更新 cache
    //     this.rebuildCache();

    //     if (this.lastScene === null) {
    //         throw new Error(
    //             "[ConsumerOptController] lastScene is null after rebuildCache()."
    //         );
    //     }

    //     // controller 的內部流程，因此直接獲取 cache，不用再次 getScene()
    //     const scene = this.lastScene;

    //     // while 迭代 listeners，逐一通知
    //     // 這是 pub/sub：controller 不知道 view 怎麼 render，它只負責把新 scene 丟出去
    //     let listenerIndex = 0;
    //     while (listenerIndex < this.listeners.length) {
    //         const fn = this.listeners[listenerIndex];
    //         fn(scene);
    //         listenerIndex++;
    //     }
    // }
}

// ============================================================
// Helpers (pure functions)
// ============================================================

// ------------------------------------------------------------
// isDevMode
// - Vite: import.meta.env.DEV
// - 再提供一個可選 fallback：globalThis.__DEV__
// ------------------------------------------------------------
function isDevMode(): boolean {
    // ----------------------------------------------------------
    // Vite / modern bundlers
    // - import.meta.env.DEV 是 boolean
    // ----------------------------------------------------------
    try {
        // 使用 any 是為了避免 TS 在非 Vite 環境下對 import.meta.env 報型別問題
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metaAny = import.meta as any;
        
        // 若 env.DEV 存在且是 boolean，直接回傳
        if (metaAny && metaAny.env && typeof metaAny.env.DEV === "boolean") {
        return metaAny.env.DEV;
        }
    } catch (_e) {
        // ignore：某些環境可能不支援 import.meta
    }

    // ----------------------------------------------------------
    // Optional fallback: globalThis.__DEV__
    // - 只有你有自行注入這個旗標才會生效
    // ----------------------------------------------------------
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g: any = globalThis as any;

        if (g && typeof g.__DEV__ === "boolean") {
        return g.__DEV__;
        }
    } catch (_e2) {
        // ignore
    }

    // ----------------------------------------------------------
    // 最保守預設：false（避免未知環境 freeze 造成意外）
    // ----------------------------------------------------------
    return false;
}

// ------------------------------------------------------------
//  cloneLabelOffsets：clone 每個 value 物件，避免 reference leakage
// ------------------------------------------------------------
function cloneLabelOffsets(
    offsets: Partial<Record<LabelKey, PixelOffset>>,
): Partial<Record<LabelKey, PixelOffset>> {
    const out: Partial<Record<LabelKey, PixelOffset>> = {};

    // 只走訪 own keys（Partial 的 key 可能是稀疏的）
    const keys = Object.keys(offsets);

    let keyIdx = 0;
    while (keyIdx < keys.length) {
        const keyItem = keys[keyIdx] as LabelKey;
        const v = offsets[keyItem];

        if (v) {
            out[keyItem] = { offsetDx: v.offsetDx, offsetDy: v.offsetDy };
        }

        keyIdx++;
    }

    return out;
}

// ------------------------------------------------------------
// cloneSceneOutput
// - 深度 clone scene（至少 clone 到 drawables/points 這些最常被誤改的結構）
// - 隔離外部對 scene 的 mutation，避免 cache 汙染
// ------------------------------------------------------------
function cloneSceneOutput(scene: SceneOutput): SceneOutput {
    // clone drawables array
    const clonedDrawables: Drawable[] = [];

    let drawableIdx = 0;
    while (drawableIdx < scene.drawables.length) {
        const drawableType = scene.drawables[drawableIdx];
        clonedDrawables.push(cloneDrawable(drawableType));
        drawableIdx++;
    }

    // clone xDomain/yDomain tuple
    const xDomainClone: [number, number] = [scene.xDomain[0], scene.xDomain[1]];
    const yDomainClone: [number, number] = [scene.yDomain[0], scene.yDomain[1]];

    // return new scene object
    return {
        width: scene.width,
        height: scene.height,
        drawables: clonedDrawables,
        xDomain: xDomainClone,
        yDomain: yDomainClone,
    };
}

// ------------------------------------------------------------
// cloneDrawable
// - 依 kind 分支 clone
// - 不使用 break/continue
// ------------------------------------------------------------
function cloneDrawable(d: Drawable): Drawable {
    if (d.kind === "line") {
        const minEndPoint: Point2D = { x: d.minEndPoint.x, y: d.minEndPoint.y };
        const maxEndPoint: Point2D = { x: d.maxEndPoint.x, y: d.maxEndPoint.y };
        const dashClone: number[] = d.stroke.dash.slice();

        return {
            kind: "line",
            id: d.id,
            minEndPoint: minEndPoint,
            maxEndPoint: maxEndPoint,
            stroke: { 
                width: d.stroke.width, 
                dash: dashClone,
                color: d.stroke.color 
            },
        };
    }

    if (d.kind === "polyline") {
        const pts: Point2D[] = [];
        let i = 0;
        while (i < d.points.length) {
            const p = d.points[i];
            pts.push({ x: p.x, y: p.y });
            i++;
        }

        const dashClone: number[] = d.stroke.dash.slice();

        return {
            kind: "polyline",
            id: d.id,
            points: pts,
            stroke: { 
                width: d.stroke.width, 
                dash: dashClone,
                color: d.stroke.color 
            },
        };
    }

    if (d.kind === "point") {
        const dashClone: number[] = d.stroke.dash.slice();

        return {
            kind: "point",
            id: d.id,
            center: { x: d.center.x, y: d.center.y },
            r: d.r,
            fill: { color: d.fill.color },
            stroke: { 
                width: d.stroke.width, 
                dash: dashClone,
                color: d.stroke.color 
            },
        };
    }

    if (d.kind === "text") {
        // spans 可能是複雜結構：若你希望 100% 安全，可以在此做更深 clone
        // 目前做「保守 shallow clone」：至少避免 text drawable 本體被改到 cache
        // let spansClone: any = undefined;
        let spansClone: any[] = [];

        // if (d.spans) {
        //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
        //     const s: any = d.spans as any;

        //     // 若 spans 是 array，做淺層複製，避免 push/pop 汙染
        //     if (Array.isArray(s)) {
        //         spansClone = s.slice();
        //     } else {
        //         spansClone = s;
        //     }
        // }

        // const next: any = {
        //     kind: "text",
        //     id: d.id,
        //     pos: { x: d.pos.x, y: d.pos.y },
        //     text: d.text,
        //     fontSize: d.fontSize,
        //     fill: { color: d.fill.color },
        // };

        // if (typeof d.draggable === "boolean") {
        //     next.draggable = d.draggable;
        // }

        // if (d.spans) {
        //     next.spans = spansClone;
        // }

        // return next as Drawable;

        let sIdx = 0;
        while (sIdx < d.spans.length) {
        const s = d.spans[sIdx];

        spansClone.push({
            text: s.text,
            offsetDx: s.offsetDx,
            offsetDy: s.offsetDy,
            baselineShift: s.baselineShift,
            fontSize: s.fontSize,
            fontStyle: s.fontStyle,
            fontWeight: s.fontWeight,
            kind: s.kind,
        });

        sIdx++;
        }

        return {
        kind: "text",
        id: d.id,
        pos: { x: d.pos.x, y: d.pos.y },
        text: d.text,
        spans: spansClone as any,
        fontSize: d.fontSize,
        fill: { color: d.fill.color },
        draggable: d.draggable,
        textAnchor: d.textAnchor,
        } as Drawable;
    }

    if (d.kind === "mathSvg") {
        return {
            kind: "mathSvg",
            id: d.id,
            pos: { x: d.pos.x, y: d.pos.y },
            latex: d.latex,
            fontSize: d.fontSize,
            fill: { color: d.fill.color },
            draggable: d.draggable,
            displayMode: d.displayMode,
        };
    }

    // 若未來新增 drawable kind，這裡 fail-fast
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error("[cloneDrawable] Unknown drawable kind: " + (d as any).kind);
}

// ------------------------------------------------------------
// deepFreezeSceneOutput
// - 僅用於 dev：抓任何 mutate（包含 listener 或 debug code）
// - 這會讓「錯誤更早爆」而不是靜悄悄污染
// ------------------------------------------------------------
function deepFreezeSceneOutput(scene: SceneOutput): void {
  // freeze domains
  Object.freeze(scene.xDomain);
  Object.freeze(scene.yDomain);

  // freeze drawables contents
  let i = 0;
  while (i < scene.drawables.length) {
    deepFreezeDrawable(scene.drawables[i]);
    i++;
  }

  // freeze drawables array
  Object.freeze(scene.drawables);

  // freeze scene object itself
  Object.freeze(scene);
}

// ------------------------------------------------------------
// deepFreezeDrawable
// - 依 kind freeze 內部結構
// ------------------------------------------------------------
function deepFreezeDrawable(d: Drawable): void {
  if (d.kind === "line") {
    Object.freeze(d.minEndPoint);
    Object.freeze(d.maxEndPoint);

    // stroke + dash
    Object.freeze(d.stroke.dash);
    Object.freeze(d.stroke);

    Object.freeze(d);
    return;
  }

  if (d.kind === "polyline") {
    let i = 0;
    while (i < d.points.length) {
      Object.freeze(d.points[i]);
      i++;
    }
    Object.freeze(d.points);

    Object.freeze(d.stroke.dash);
    Object.freeze(d.stroke);

    Object.freeze(d);
    return;
  }

  if (d.kind === "point") {
    Object.freeze(d.center);
    Object.freeze(d.fill);

    Object.freeze(d.stroke.dash);
    Object.freeze(d.stroke);

    Object.freeze(d);
    return;
  }

  if (d.kind === "text") {
    Object.freeze(d.pos);
    Object.freeze(d.fill);

    // // spans：如果是 array，freeze 容器；內容是否需要 freeze 視你的 spans 結構而定
    // // 這裡保守處理：若 spans 是 array，freeze array 本體
    // // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // const anyD: any = d as any;
    // if (anyD.spans && Array.isArray(anyD.spans)) {
    //   Object.freeze(anyD.spans);
    // }

    // spans：freeze 每個 span，再 freeze array
    let i = 0;
    while (i < d.spans.length) {
      Object.freeze(d.spans[i]);
      i++;
    }
    Object.freeze(d.spans);

    Object.freeze(d);
    return;
  }

    if (d.kind === "mathSvg") {
        Object.freeze(d.pos);
        Object.freeze(d.fill);
        Object.freeze(d);
        return;
    }

  // 未知 kind：fail-fast
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error("[deepFreezeDrawable] Unknown drawable kind: " + (d as any).kind);
}

