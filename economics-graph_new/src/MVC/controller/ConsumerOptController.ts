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
// - findLabelAnchor：從 drawables 找到某個 label 的 anchor（基準點）
// - clampToPlot：把拖曳座標限制在 plot 範圍內（避免拖出後再也點不到）
import { clampToPlot, findLabelAnchorsOnePass } from "./consumerOptLabel";


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

export class ConsumerOptController {
    
    // model：經濟狀態與計算的來源（domain）
    private readonly model: ConsumerOptModel;

    // builder：把 model+options 組成 scene 的工廠 ?????
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

    // options：屬於「視覺」而不是「經濟模型」的狀態
    // 放在 controller 讓 UI（控制欄）改它時，能統一驗證並重建 scene
    private options: ConsumerViewOptions;  //  budgetColor/indiffColor

    // labelOffsets：只存偏移，不摻雜 buildScene
    // labelOffsets：記錄「使用者拖曳 label 後，相對於 anchor 的偏移量」。
    // - Record<string,...>？
    //   - key = label 的 id（如 "budget-eq", "indiff-eq"...）
    //   - value = {offsetDx, offsetDy} 相對偏移
    // 這樣 builder 可以用同一套 offset 規則把文字畫到使用者想要的位置。
    private labelOffsets: Record<string, { offsetDx: number; offsetDy: number }>;

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
        model: ConsumerOptModel }) {
      
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
        
        // options 的預設值
        // - 影響 scene 的 drawables（是否畫 label / 顏色 / 字體大小等渲染用參數）
        this.options = {
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
    //  - 作用：把一個 callback 加入 listeners，之後 scene 更新會通知它
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
    //  - 作用：把某個 callback 從 listeners 移除
    // 
    //  Input: fn（Listener）
    //
    //  Output: void
    // ------------------------------------------------------------
    unsubscribe(fn: Listener) {

        // 這裡用「建立新陣列 next」的方式，而不是原地 splice：????
        // - 避免在遍歷時修改同一個陣列造成邏輯錯誤
        // - 行為更可預期（immutable-ish）
        const next: Listener[] = [];

        let listenerIndex = 0;
        while (listenerIndex < this.listeners.length) {
            const listenerItem = this.listeners[listenerIndex];

            // 僅保留「不是 fn」的 listener
            if (listenerItem !== fn) {
                next.push(listenerItem);
            }

            listenerIndex ++;
        }

        // 用新陣列覆蓋回 listeners
        this.listeners = next;
    }


    // ============================================================
    // Scene / Viewport getters
    // ============================================================

    // ------------------------------------------------------------
    //  getScene
    //  - 作用：取得目前 scene（若快取存在就直接回傳；否則 build 一次）
    // 
    //  Input: none
    //
    //  Output: SceneOutput
    // ------------------------------------------------------------
    getScene(): SceneOutput {
    //   // 若快取存在，直接回傳（避免重建）
    //   if (this.lastScene) {
    //     return this.lastScene;
    //   }

    //   // 沒快取 → 新建一次
    //   this.rebuildCache();

    //   // 防禦式寫法：
    //   // - 理論上 rebuildCache 一定會填 lastScene
    //   // - 若如果未來 builder 失敗回傳空值，這裡至少再嘗試一次
    //   // 這樣不會沒完沒了???
    //   if (!this.lastScene) {
    //     // 理論上不會發生，保險
    //     this.rebuildCache();
    //   }

    //   // TS 在這裡仍可能推不出 lastScene 不為 null，
    //   // 所以你用 `as SceneOutput` 告訴 TS：「我保證這裡不是 null」。
    //   return this.lastScene as SceneOutput;

        if (this.lastScene !== null) {
            return this.lastScene;
        }

        this.rebuildCache();

        if (this.lastScene === null) {
            // 這裡直接 fail fast，比「再 rebuild 一次」更合理
            throw new Error("[ConsumerOptController] rebuildCache() did not produce a SceneOutput.");
        }

        return this.lastScene;
    }

    // ✅ [EXPLAIN] getViewport
    // input: none
    // output: Viewport
    // 作用：取得目前 viewport（若快取存在就回傳；否則 build 一次）
    getViewport(): Viewport {
      if (this.lastViewport) {
        return this.lastViewport;
      }

      this.rebuildCache();

      if (!this.lastViewport) {
        // 保險
        // ✅ [EXPLAIN]
        // 這裡建立一個「最小可用」的 viewport，避免外部呼叫時直接炸掉。
        // (1,1,[0,1],[0,1]) 是一個 fallback（但確實屬於 magic-ish 的防禦值）。
        this.lastViewport = new Viewport(1, 1, [0, 1], [0, 1]);
      }
      return this.lastViewport;
    }

    // ✅ [EXPLAIN] getModelParamsSnapshot
    // input: none
    // output: (由 model.getModelParams() 決定的型別，通常是一個 params object)
    // 作用：提供 UI 顯示或 debug 用的「當前 model 參數快照」
    getModelParamsSnapshot() {
      return this.model.getModelParams();
    }

    // ---------------------------
    // ✅ [REFAC] options setters（集中驗證）
    // ---------------------------

    // ✅ [EXPLAIN] setViewOptions
    // input: patch: Partial<ConsumerViewOptions>
    // output: void
    //
    // Partial<T> 是 TS 的 utility type：
    // - 表示「T 的所有欄位都變成可選」
    // - 用途：讓外部只更新部分 options（例如只改 showOpt 或只改 fontSize）
    setViewOptions(patch: Partial<ConsumerViewOptions>) {
      // ✅ 產生 next options（immutable update）
      // ✅ [EXPLAIN]
      // `{ ...this.options, ...patch }`：
      // - 先展開舊 options
      // - 再展開 patch 覆蓋同名欄位
      // 這是常見的「狀態更新」寫法，避免直接 mutate this.options。
      const next: ConsumerViewOptions = { ...this.options, ...patch };

      // 防呆：字體大小範圍
      // ✅ [EXPLAIN]
      // 集中驗證的好處：所有 UI 設定改動都會通過同一個入口，
      // 不會散落在各個 onChange handler 裡。
      if (next.labelFontSize < 8) {
        next.labelFontSize = 8;
      }
      if (next.labelFontSize > 28) {
        next.labelFontSize = 28;
      }

      // ✅ 更新 options 並重建 scene 通知 view
      this.options = next;
      this.rebuildAndNotify();
    }

    // ---------------------------
    // slider events
    // ---------------------------

    // ✅ [EXPLAIN] onIncomeChange
    // input: nextI（新的 income 數值）
    // output: void
    // 作用：把 income 寫回 model，然後 rebuild scene
    onIncomeChange(nextI: number) {
      this.model.setIncome(nextI);
      this.rebuildAndNotify();
    }

    // ✅ [EXPLAIN] onAlphaChange
    // input: nextA（新的 alpha 效用權重）
    // output: void
    onAlphaChange(nextAlpha: number) {
      this.model.setAlpha(nextAlpha);
      this.rebuildAndNotify();
    }

    // ✅ [EXPLAIN] onPxChange
    // input: nextPx（新的 px）
    // output: void
    //
    // 你這裡做了最小值限制 px >= 0.1
    // 原因：避免 px 太小導致 budget 線斜率爆炸/數值不穩，或除以 0。
    onPxChange(nextPx: number) {
      const params = this.model.getModelParams();

      let px = nextPx;
      if (px < 0.1) {
        px = 0.1;
      }

      // ✅ setPrices 一次更新 px, py
      // ✅ [EXPLAIN]
      // 你先拿 params.py，是為了只改 px，不影響 py。
      this.model.setPrices(px, params.py);
      this.rebuildAndNotify();
    }

    // ✅ [EXPLAIN] onPyChange
    // input: nextPy（新的 py）
    // output: void
    onPyChange(nextPy: number) {
      const params = this.model.getModelParams();

      let py = nextPy;
      if (py < 0.1) {
        py = 0.1;
      }

      this.model.setPrices(params.px, py);
      this.rebuildAndNotify();
    }

    // ---------------------------
    // drag events
    // ---------------------------

    // ✅ [EXPLAIN] onPointDrag
    // input:
    // - id: string（被拖曳的 point drawable id，例如 "opt"）
    // - pixel: {x, y}（滑鼠/指標在 SVG 像素座標）
    // output: void
    //
    // 作用：拖曳 opt 點 → 反推 econ 點 → 更新 alpha
    onPointDrag(id: string, pixel: { x: number; y: number }) {
      // Opt 關閉就不允許拖
      // ✅ [EXPLAIN]
      // 這是「UI option gate」：不顯示就不允許互動，避免狀態和畫面不一致。
      if (!this.options.showOpt) {
        return;
      }

      // ✅ 只處理 opt 點的拖曳，其它點（未來可能有別的點）直接忽略
      if (id !== "opt") {
        return;
      }

      // ✅ 取得 viewport，把 pixel 座標轉成 econ 座標
      const vp = this.getViewport();
      const econ = vp.pixelToEconMapping(pixel);

      // ✅ [EXPLAIN]
      // denom = x+y，用來把 (x,y) 正規化成一個比例
      // alpha = x/(x+y)
      // 這種寫法表示：你把 opt 的拖曳想像成在 simplex（x+y>0）的比例移動。
      const denom = econ.x + econ.y;
      if (denom <= 0) {
        return;
      }

      let nextAlpha = econ.x / denom;

      // ✅ alpha 限制在 [0.1, 0.9]
      // ✅ [EXPLAIN]
      // 避免 alpha 太接近 0 或 1 造成圖形退化（例如 indiff curve 或最適角點狀態太極端）
      if (nextAlpha < 0.1) {
        nextAlpha = 0.1;
      }
      if (nextAlpha > 0.9) {
        nextAlpha = 0.9;
      }

      // ✅ 寫回 model 並重建
      this.model.setAlpha(nextAlpha);
      this.rebuildAndNotify();
    }

    // ✅ [EXPLAIN] onTextDrag
    // input:
    // - id: string（被拖曳的文字 label id，例如 "indiff-eq"）
    // - pixel: {x,y}（拖曳到的位置）
    // output: void
    //
    // 作用：拖曳文字 label → 計算相對於 anchor 的 dx, dy → 存入 labelOffsets
    onTextDrag(id: string, pixel: { x: number; y: number }) {
      const scene = this.getScene();

      // ✅ 找 label 的 anchor（原始基準點）
      const anchor = findLabelAnchorsOnePass(scene.drawables);
      if (!anchor) {
        // 找不到代表目前 drawables 沒有這個 label（可能被 options 關掉了）
        return;
      }

      // ✅ 拖曳範圍限制在 plot 內
      // ✅ [EXPLAIN]
      // 你遇到的痛點是：label 被拖出 plot 後，使用者再也點不到（因為 hit-test 只在可視區/或視窗內）
      // clampToPlot 會把座標限制在 [padding, width-padding] 與 [padding, height-padding] 範圍。
      const clamped = clampToPlot({
        x: pixel.x,
        y: pixel.y,
        width: scene.width,
        height: scene.height,
        padding: 2,
      });

      // ✅ dx/dy = 「使用者希望的位置」 - 「anchor 基準點」
      // ✅ [EXPLAIN]
      // 為什麼存 dx/dy 而不是存 absolute x/y？
      // - anchor 可能會因為 model/viewport 改變而移動（例如 scale、domain 改）
      // - 存偏移可以讓 label 跟著 anchor 一起移動，只保留使用者的相對調整
      const dx = clamped.x - anchor.x;
      const dy = clamped.y - anchor.y;

      // ✅ 記錄偏移（以 label id 作為 key）
      this.labelOffsets[id] = { offsetDx: dx, offsetDy: dy };

      // ✅ rebuild scene（builder 會把 offset 套上）
      this.rebuildAndNotify();
    }

    // ---------------------------
    // internals
    // ---------------------------

    // ✅ [EXPLAIN] rebuildCache (private)
    // input: none（但會讀 this.model / this.options / this.labelOffsets）
    // output: void（但會更新 this.lastScene / this.lastViewport）
    //
    // 作用：呼叫 builder.build() 產生新的 scene + viewport，並寫入快取
    private rebuildCache() {
        // ✅ [EXPLAIN]
        // builder.build 的 input：
        // - options：渲染控制（顯示哪些元素、字體大小、顏色等）
        // - labelOffsets：文字的相對偏移（由拖曳累積出來）
        const built = this.builder.buildScene({
            controlOptions: this.options,
            labelOffsets: this.labelOffsets,
        });

        // ✅ built 的 output（由 builder 定義）：
        // - built.scene: SceneOutput
        // - built.viewport: Viewport
        this.lastScene = built.scene;
        this.lastViewport = built.viewport;

        return built.scene;
    }

    // ✅ [EXPLAIN] rebuildAndNotify (private)
    // input: none
    // output: void
    //
    // 作用：
    // 1) rebuildCache 更新快取
    // 2) 逐一呼叫 listeners，把新的 scene 推給 view
    private rebuildAndNotify() {
        //   this.rebuildCache();

        //   // ✅ [EXPLAIN] 這裡用 `as SceneOutput` 的原因：
        //   // - rebuildCache 後理論上 lastScene 一定非 null
        //   // - TS 仍視為 SceneOutput | null，所以斷言
        //   const scene = this.lastScene as SceneOutput;

        //   // ✅ while 迭代 listeners，逐一通知
        //   // ✅ [EXPLAIN]
        //   // 這就是 pub/sub：controller 不知道 view 怎麼 render，
        //   // 它只負責把新 scene 丟出去。
        //   let i = 0;
        //   while (i < this.listeners.length) {
        //     const fn = this.listeners[i];
        //     fn(scene);
        //     i += 1;
        //   }

        const scene = this.rebuildCache();

        let listenerIndex = 0;
        while (listenerIndex < this.listeners.length) {
            const fn = this.listeners[listenerIndex];
            fn(scene);
            listenerIndex++;
        }
    }
}

