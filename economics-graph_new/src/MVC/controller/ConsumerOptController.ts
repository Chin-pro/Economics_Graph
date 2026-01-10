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
// [FREEZE] 這裡修正註解：目前 Controller 沒有做 scene patch，而是依賴 builder heavy-cache 來達到輕算
//          之後可以將 Light Cache 分離出來
// [FREEZE] 再次將進行 SRP，目前 ConsumerOptController.ts 依然太多冗長
//
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

// ConsumerOptSceneBuilder.ts: 
// - class ConsumerOptSceneBuilder: 把 (model + options + labelOffsets) 組裝成 SceneOutput + Viewport
// - LABEL_CLAMP_PADDING_PIXEL: 預設邊界空白 padding = 12
import { 
    ConsumerOptSceneBuilder,
    LABEL_CLAMP_PADDING_PIXEL,  // 預設邊界空白 padding = 12
} from "./consumerOptSceneBuilder";

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
    
    // hasScheduledFlush: 避免同一 frame 重複排程
    private hasScheduledFlush: boolean;

    // scheduledFlushHandle: 用來取消已排程的 flush (若有需要)
    private scheduledFlushHandle: number | null;

    // scheduledFlushKind：記錄目前 handle 對應的排程類型（raf / timeout）
    // - number handle 無法分辨來源，取消時必須用對的 API，避免取消不到造成 double flush
    private scheduledFlushKind: "raf" | "timeout" | null;


    // ------------------------------------------------------------
    //  constructor
    //  - 建立 builder = new ConsumerOptSceneBulider({ model, innerAvailWidth, innerAvailHeight }) 
    //  - 初始化 lastScene/lastViewport = null: 首次 getScene/getViewport 會同步 build 一次
    //  - 設定 heavyDirty/lightDirty = true: 表示一開始至少要 build 一次
    //  - 初始化排成狀態: 避免重複排程 flush
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
        // Dependencies
        // 依賴注入：外部提供 model（single source of truth）
        // 把外部傳入的 model 存起來，之後 slider/drag 都會改它
        this.model = args.model;

        // builder 需要知道：model + 可用的畫布大小
        // 依賴注入：builder 不是自己 new model，而是接收同一個 model
        // 確保 single source of truth：model 狀態只有一份
        this.builder = new ConsumerOptSceneBuilder({
            // 整個經濟狀態的 single source of truth
            // - Controller 的 slider/drag 都會呼叫 model setter；builder 讀取 model 產生 scene
            // - 必須是已初始化可用的 model (具備 setIncome/setAlpha/setPrices/getModelParams/...)
            model: this.model,
            innerAvailWidth: args.innerAvailWidth,    // 可用繪圖區寬度(已扣掉外框、UI padding等)
            innerAvailHeight: args.innerAvailHeight,  // 可用繪圖區寬度(已扣掉外框、UI padding等)
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

        // Controller-owned UI state
        // labelOffsets 起始為空物件：表示 label 都在預設位置（無偏移）
        this.labelOffsets = {};

        // rAF coalesce state (init)
        // - 初始尚未 build，視為需要 flush (起始預設 heavy)
        this.heavyDirty = true;
        this.lightDirty = true;

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
    //  - 提供 View (或外部) 一個方式「訂閱 scene 更新」
    //    這是典型 pub/sub: Controller 不知道用得是 React/Vue/vanilla，反正 scene 更新時會通知
    //
    //  - 把一個 callback 加入 listeners，之後 scene 更新會通知它
    //    保留 可以在 listeners 陣列中 進行去重
    // 
    //  - subscribe 回傳 unsubscribe，並進行去重，避免 React 重複訂閱造成重複 render
    //
    //  - 內部會用 concat 產生新陣列 (immutable-ish)，降低遍歷中被 mutate 的風險
    //
    //  Input: fn（Listener）
    //  - 當 scene 更新時要做的事 (常見是 React setState)
    //
    //  Output: () => this.unsubscribe(fn)
    //  - 讓呼叫端方便  cleanup (特別是 React useEffect cleanup)
    // ------------------------------------------------------------
    subscribe(fn: Listener) {
        // this.listeners.push(fn);

        let listenerIdx = 0;
        while (listenerIdx < this.listeners.length) {
            if (this.listeners[listenerIdx] === fn) {
                return () => this.unsubscribe(fn);
            }
            listenerIdx++;
        }

        // 用 concat 避免直接 push (可讀性 + 可接近 immutable-ish)
        this.listeners = this.listeners.concat([fn]);

        return () => this.unsubscribe(fn);
    }

    // ------------------------------------------------------------
    //  unsubscribe
    //  - 把某個 callback 從 listeners 移除
    //  - 取消訂閱: 將指定的 fn 從 listeners 移除
    //  - 不直接 splice 原陣列，避免在遍歷時修改同一個陣列造成邏輯錯誤，改透過建立新陣列的方式，
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
    //  Output: SceneOutput: snapshot
    //  - SceneOuput 結構 { width, height, drawables, xDomain, yDomain }
    //  - 永遠回傳 clone，避免外部拿到 cache reference
    // ------------------------------------------------------------
    getScene(): SceneOutput {
        // cache hit: 若快取存在，直接回傳（避免重建）
        if (this.lastScene !== null) {
            const snapshot = cloneSceneOutput(this.lastScene);
            if (isDevMode()) {
                deepFreezeSceneOutput(snapshot)
            };
            return snapshot;
        }

        // cache miss: 新建一次 cache: build.scene
        // this.rebuildCache();
        this.rebuildCacheSync();

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
    //  - 提供互動所需的 pixel 
    //  
    //  - Viewport 是 class instance，不適合 clone (也不一定需要)
    //    但它仍然是「reference 外洩」的潛在點，在這裡使用「約定」:
    //    Viewport 方法必須是 pure mapping (不 mutate internal state)
    //  
    //  Input: none
    //
    //  Output: Viewport
    //  - Viewport 應該是「pure mapping」工具 (不在乎時 mutate 狀態)
    //  - 這裡沒有 clone，因為 class instance clone 成本高且不必要，用「約定」來控制
    // 
    //  保留: 調整 error handling 策略 ??????
    //  ???? 為甚麼不 clone
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
    //    { income, alpha, px, py, ... }
    //  - 這裡不進行 clone: 因為 model.getModelParams 通常應回應「值物件」或 readonly snapshot
    //  ???? 為甚麼不 clone
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
    //  - [CHANGED] clamp fontSize 不直接 mutate 既有物件欄位，改成先計算出 clamped 值再回填 (較乾淨)
    //
    //  - 先進行 merge: { ...oldOptions, ...patch }
    //    clamp labelFontSize 在 [8,28]
    //    不立即 rebuild: 改為 coalesce (減少重算/重繪風暴)
    //
    //  Input:
    //  - patch: Partial<ConsumerViewOptions>  (path: 補丁，只修改部分欄位)
    //  - Partial<T> 是 TS 的 utility type：
    //    - 表示「T 的所有欄位都變成可選」
    //    - 用途：讓外部只更新部分 options (Ex: { showOpt: false } 或 { labelFontSize: 16 })
    //
    //  Output: void
    //  - 更新 this.controlViewOptions
    //  - 呼叫 requestRebuild("light") (排程 flush)
    // ------------------------------------------------------------
    setViewOptions(patch: Partial<ConsumerViewOptions>) {
        // 產生 next options（immutable update），避免直接 mutate this.options (汙染)
        // - 先展開舊 options
        // - 再展開 patch 覆蓋同名欄位
        const mergedConsumerViewOption: ConsumerViewOptions = {
            ...this.controlViewOptions,
            ...patch,
        };

        // 防呆機制：字體大小範圍
        // - 集中驗證：所有 UI 設定改動都會通過同一個入口，避免散落在各個 onChange handler 裡
        let nextFontSize = mergedConsumerViewOption.labelFontSize;
        if (nextFontSize < 8) {
            nextFontSize = 8;
        }
        if (nextFontSize > 28) {
            nextFontSize = 28;
        }

        const nextConsumerViewOption: ConsumerViewOptions = {
            ...mergedConsumerViewOption,
            labelFontSize: nextFontSize,
        };

        // 更新 options 並重建 scene 通知 view
        this.controlViewOptions = nextConsumerViewOption;  // 型別皆為 (type) ConsumerViewOptions
        
        // this.rebuildAndNotify();
        
        // 視覺層變動 (顏色/字體/顯示) → light rebuild
        this.requestRebuild("light");
    }


    // ============================================================
    //  Slider events (model changes → heavy)
    // ============================================================

    // ------------------------------------------------------------
    //  onIncomeChange
    //  - 把 income 寫回 model，然後 rebuild scene / 通知 view (渲染)
    //    UI slider/輸入改變 income 時的入口。income 影響 budget/opt/曲線 → 必須 heavy rebuild
    //
    //  Input: nextIncome（新的 income 數值）
    //
    //  Output: void
    //  - model.setIncome(nextIncome)
    //  - requestRebuild("heavy")
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
    //  - alpha 影響 indiff/optimum → 必須 heavy rebuild。
    //
    //  Input: nextA（新的 alpha 效用權重）
    //
    //  Output: void
    //  - model.setAlpha(nextAlpha)
    //  - requestRebuild("heavy")
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
    //  - 更新價格 px/py，價格影響 budget slope、可行集合、optimum、viewport domain → heavy rebuild
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
    //  - 讀取 viewport 做映射
    //  - 計算 nextAlpha 並寫回 model
    //  - heavy rebuild
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


        // 防禦：拖到畫面外可能映射出負值，先做下界保護
        let econX = econ.x;
        let econY = econ.y;
        if (econX < 0) { econX = 0; }
        if (econY < 0) { econY = 0; }

        // denom = x+y，用來把 (x,y) 正規化成一個比例 ?????
        // alpha = x/(x+y)
        // 把 opt 的拖曳想像成在 simplex（x+y>0）的比例移動。
        const denom = econ.x + econ.y;
        if (denom <= 0) {
            return;
        }

        let nextAlpha = econX / denom;  // clamped

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
    //  - 更新 this.labelOffsets[id] = {offsetDx, offsetDy}（immutable update）
    //  - requestRebuild("light")
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
            padding: LABEL_CLAMP_PADDING_PIXEL,
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

        // // 記錄偏移: 寫入 offsets，拖曳才會生效
        // this.labelOffsets[id] = offsets;

        // 記錄偏移: 寫入 offsets，拖曳才會生效
        // - 用 immutable update，避免長期維護時不小心引入共享引用問題
        this.labelOffsets = {
            ...this.labelOffsets,
            [id]: { offsetDx: offsets.offsetDx, offsetDy: offsets.offsetDy },
        };

        // rebuild scene（builder 會把 offset 套上）
        // this.rebuildAndNotify();
        
        // 純視覺偏移 → light
        this.requestRebuild("light");
    }


    // ============================================================
    //  Private Methods (internals)
    // ============================================================

    // ------------------------------------------------------------
    //  requestRebuild (private)
    //  - Controller 的「重建請求入口」
    //  - 只標記 dirty + 排程 flush，不立即 build
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
        }

        if (kind === "light") {
            // 只要有任何視覺變動就需要
            this.lightDirty = true;
        }
        
        // 排程 flush (同 frame 只會排一次)
        this.scheduleFlush();
    }

    // ------------------------------------------------------------
    //  scheduleFlush (private)
    //  - 使用 requestAnimationFrame 將多次事件合併成一次 flush，避免「重算/重繪風暴」
    //    - 如果有 rAF: 在下個 frame flush
    //    - 如果沒有 rAF: 用 setTimeout 模擬
    //
    //  Input: (void) 
    //
    //  Output:
    //  - 設定 hasScheduledFlush = true
    //  - 設定 scheduledFlushHandle 與 scheduledFlushKind
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

        // fallback: 用 timeout 模擬 (用 16ms 模擬 1 幀)
        // - 不用 window.setTimeout，改用 setTimeout（在 tests/某些環境更穩）
        //   測試環境/SSR 可能沒有 window
        this.scheduledFlushKind = "timeout";
        this.scheduledFlushHandle = setTimeout(() => {
            this.flushScheduled();
        }, 16) as unknown as number;
    }

    // ------------------------------------------------------------
    //  flushScheduled (private)
    //  - rAF callback: 真正執行 build cache + notify listeners 的地方
    //    這裡「唯一應該會重建 scene 的地方」，除了首次 getter sync build
    //  - 一個 frame 最多呼叫 1 次
    // 
    //  - 若不 dirty 且 lastScene 已存在 → return（避免無效 flush）
    //    rebuild 後若 lastScene null → throw（fail fast）
    //    通知用 notifyListeners（每個 listener 拿到 clone）
    //  
    //  Input: (void)
    //  - 會讀取 controller state
    //  
    //  Output: (void)
    //  - 清排程狀態
    //    若 dirty → rebuildCache()
    //    清除 dirty
    //    通知 listeners
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

        // 通知 view (安全: snapshot + clone scene)
        // this.notifyListeners(this.lastScene);
        this.notifyListeners(this.lastScene);
    }

    // ------------------------------------------------------------
    //  notifyListeners
    //  - listeners 遍歷時可能被 subscribe/unsubscribe 改動 → 行為不可預期
    //  - 不能把 cache scene 原封不動丟出去 → 避免 cache 汙染
    //
    //  - listenerSnapshot = this.listeners.slice()
    //  - 對每個 listener:
    //    - sceneForListener = cloneSceneOutput(cacheScene)
    //    - dev 模式 freeze (抓 mutation)
    //    - 呼叫 fn(sceneForListener)
    //
    //  Input: cacheScene: SceneOutput
    //  - Controller 內部 cache 的 scen (不可直接外洩)
    //
    //  Output:(void)
    //  - 呼叫每個 listener
    // ------------------------------------------------------------
    private notifyListeners(cacheScene: SceneOutput): void {
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
    //  Input: (void)
    //  - none（但會讀 this.model / this.options / this.labelOffsets）
    //  
    //  Output: (void)
    //  - 更新 this.lastScene
    //  - 更新 this.lastViewport
    // ------------------------------------------------------------
    private rebuildCache(): void {
        // 建立一次 build 的快照 (shallow copy)
        const controlViewOptionsSnapshot: ConsumerViewOptions = { 
            ...this.controlViewOptions 
        };

        // labelOffsets snapshot，必須 clone value 物件，避免 reference leakage
        const labelOffsetsSnapshot: Partial<Record<LabelKey, PixelOffset>> = 
            cloneLabelOffsets(this.labelOffsets);

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
    //  - [CHANGED] 避免 getter 在未 build 時直接炸掉，但不主動 notify (notify 交給 flush) ????
    //
    //  - cancelScheduledFlushIfAny(): 避免同 frame flush 又跑一次
    //    rebuildCache()
    //    heavyDirty/lightDirty = false
    //    hasScheduledFlush = false
    //
    //  Input: (void)
    //
    //  Output: (void)
    //  - 取消已排程 flush (避免 double build)
    //    rebuildCache
    //    清除 dirty
    // ------------------------------------------------------------
    private rebuildCacheSync(): void {
        // 若已經有排程 flush，但我們現在又被迫同步 build（通常發生在第一次 getScene/getViewport）
        // 為避免同一 frame 重複 build，嘗試取消排程（若環境支援）
        this.cancelScheduledFlushIfAny();

        this.rebuildCache();

        // 同步 sync build 後，cache 已存在，dirty 清掉
        this.heavyDirty = false;
        this.lightDirty = false;
        this.hasScheduledFlush = false;
    }

    // ------------------------------------------------------------
    //  cancelScheduledFlushIfAny (private)
    //  - 取消已排程的 rAF / timeout（避免 double build）
    // 
    //  - 在「被迫同步 build」前，把已排程的 flush 取消掉，避免:
    //    同一個 frame: 先 sync build → 下一 frame flush 又 build 一次（浪費）
    //
    //  - scheduledFlushKind === "rAF" → cancelAnimationFrame(handle)
    //  - scheduledFlushKind ==== "timeout" → clearTimeout(handle)
    //  - reset handle/kind/flag
    //
    //  Input: (void)
    //  
    //  Output: (void)
    //  - 若有排成: 取消 rAF 或 timeout，並且 reset state
    // ------------------------------------------------------------
    private cancelScheduledFlushIfAny(): void {
        if (this.scheduledFlushHandle === null) {
            return;
        }
        
        // 根據 kind 正確取消，避免取消不到
        if (this.scheduledFlushKind === "raf") {
            const hasCancelRAF = typeof cancelAnimationFrame === "function";
            if (hasCancelRAF) {
                cancelAnimationFrame(this.scheduledFlushHandle);
            }
        }

        // 不使用 window.clearTimeout，改用 clearTimeout
        // - 測試環境/SSR 可能沒有 window
        // - scheduleFlush 用的是 setTimeout（非 window.setTimeout），取消也應對應 clearTimeout
        if (this.scheduledFlushKind === "timeout") {
            clearTimeout(this.scheduledFlushHandle as unknown as number);
        }


        this.scheduledFlushHandle = null;
        this.scheduledFlushKind = null;
        this.hasScheduledFlush = false;
    }
}

// ============================================================
// Helpers (pure functions)
// ============================================================

// ------------------------------------------------------------
//  isDevMode
//  - Vite: import.meta.env.DEV
//  - 再提供一個可選 fallback：globalThis.__DEV__
//
//  - 優先讀 import.meta.env.DEV (Vite)
//    fallback globalThis.__DEV__
//    default false
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
//  - 避免 reference leakage: builder 不應拿到 controller 的 offsets 內部引用
//
//  Input: offsets: Partial<Record<LabelKey, PixelOffset>>
//  - key: label id (LabelKey)
//  - value: { offsetDx, offsetDy }
//
//  Output: 更新後的 Partial<Record<LabelKey, PixelOffset>>
//  - 每個value 都重新建立物件 (deep-ish 到一層)
//
//  保留: 能否直接使用 Recursive 的方法完成???
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
        const valueObject = offsets[keyItem];

        if (valueObject) {
            out[keyItem] = { 
                offsetDx: valueObject.offsetDx, 
                offsetDy: valueObject.offsetDy 
            };
        }

        keyIdx++;
    }

    return out;
}

// ------------------------------------------------------------
//  cloneSceneOutput
//  - 深度 clone scene（至少 clone 到 drawables/points 這些最常被誤改的結構）
//  - 隔離外部對 scene 的 mutation，避免 cache 汙染
//
//  Input: scene: SceneOutput
//
//  Output:
//  - clone 後的 SceneOutput: clone drawables array, clnoe xDomain/yDomain tuple/ width/height 直接 copy value
//
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
//  cloneDrawable
//  - 支援 cloneSceneOutput: 根據 drawable.kind clone 內部資料，避免外部 mutate 影響 cache
//
//  - line/polyline/point/text/mathSvg 各自 clone
//  - 未知 kind → throw（fail fast）
//  
//  Input: d: Drawable (union type)
//
//  Output: clone 後的 Drawable
// ------------------------------------------------------------
function cloneDrawable(drawableType: Drawable): Drawable {
    if (drawableType.kind === "line") {
        const minEndPoint: Point2D = { 
            x: drawableType.minEndPoint.x, 
            y: drawableType.minEndPoint.y 
        };
        const maxEndPoint: Point2D = { 
            x: drawableType.maxEndPoint.x, 
            y: drawableType.maxEndPoint.y 
        };
        const dashClone: number[] = drawableType.stroke.dash.slice();

        return {
            kind: "line",
            id: drawableType.id,
            minEndPoint: minEndPoint,
            maxEndPoint: maxEndPoint,
            stroke: { 
                width: drawableType.stroke.width, 
                dash: dashClone,
                color: drawableType.stroke.color 
            },
        };
    }

    if (drawableType.kind === "polyline") {
        const points: Point2D[] = [];
        let i = 0;
        while (i < drawableType.points.length) {
            const point = drawableType.points[i];
            points.push({ x: point.x, y: point.y });
            i++;
        }

        const dashClone: number[] = drawableType.stroke.dash.slice();

        return {
            kind: "polyline",
            id: drawableType.id,
            points: points,
            stroke: { 
                width: drawableType.stroke.width, 
                dash: dashClone,
                color: drawableType.stroke.color 
            },
        };
    }

    if (drawableType.kind === "point") {
        const dashClone: number[] = drawableType.stroke.dash.slice();
        return {
            kind: "point",
            id: drawableType.id,
            center: { x: drawableType.center.x, y: drawableType.center.y },
            r: drawableType.r,
            fill: { color: drawableType.fill.color },
            stroke: { 
                width: drawableType.stroke.width, 
                dash: dashClone,
                color: drawableType.stroke.color 
            },
        };
    }

    if (drawableType.kind === "text") {
        // spans：逐個 clone，避免外部改到 cache
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let spansClone: any[] = [];

        let spansIdx = 0;
        while (spansIdx < drawableType.spans.length) {
            const span = drawableType.spans[spansIdx];
            spansClone.push({
                text: span.text,
                offsetDx: span.offsetDx,
                offsetDy: span.offsetDy,
                baselineShift: span.baselineShift,
                fontSize: span.fontSize,
                fontStyle: span.fontStyle,
                fontWeight: span.fontWeight,
                kind: span.kind,
            });
            spansIdx++;
        }

        return {
            kind: "text",
            id: drawableType.id,
            pos: { x: drawableType.pos.x, y: drawableType.pos.y },
            text: drawableType.text,
            spans: spansClone as any,
            fontSize: drawableType.fontSize,
            fill: { color: drawableType.fill.color },
            draggable: drawableType.draggable,
            textAnchor: drawableType.textAnchor,
        } as Drawable;
    }

    if (drawableType.kind === "mathSvg") {
        return {
            kind: "mathSvg",
            id: drawableType.id,
            pos: { x: drawableType.pos.x, y: drawableType.pos.y },
            latex: drawableType.latex,
            fontSize: drawableType.fontSize,
            fill: { color: drawableType.fill.color },
            draggable: drawableType.draggable,
            displayMode: drawableType.displayMode,
        };
    }

    // 若未來新增 drawable kind，這裡 fail-fast
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error("[cloneDrawable] Unknown drawable kind: " + (drawableType as any).kind);
}

// ------------------------------------------------------------
//  deepFreezeSceneOutput
//  - 把 scene 變成不可變 (Object.freeze)，只要任何人嘗試 mutate 就會立刻爆，方便抓 bug
//
//  - 僅用於 dev：抓任何 mutate（包含 listener 或 debug code）
//  - 這會讓「錯誤更早爆」而不是靜悄悄污染
//
//  Input: scene: SceneOutput
//
//  Output: (void)
//  - freeze scene、domains、drawables array、並對每個 drawable 做 deepFreezeDrawable
// ------------------------------------------------------------
function deepFreezeSceneOutput(scene: SceneOutput): void {
    // freeze domains
    Object.freeze(scene.xDomain);
    Object.freeze(scene.yDomain);

    // freeze drawables contents
    let sceneDrawableIdx = 0;
    while (sceneDrawableIdx < scene.drawables.length) {
        deepFreezeDrawable(scene.drawables[sceneDrawableIdx]);
        sceneDrawableIdx++;
    }

    // freeze drawables array
    Object.freeze(scene.drawables);

    // freeze scene object itself
    Object.freeze(scene);
}

// ------------------------------------------------------------
//  deepFreezeDrawable
//  - 針對不同 kind freeze 內部 nested object (points、stroke、fill、spans 等)
//
//  Input: d: Drawable
//
//  Output: (void)
//  - freeze drawable 的所有可變 nested 結構
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

