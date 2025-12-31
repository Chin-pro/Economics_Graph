// src/mvc/controller/ConsumerOptController.ts

// 1) SceneOutput / Drawable：這是 View 會吃的「畫圖資料規格」
//    - SceneOutput: {width, height, drawables, xDomain, yDomain}
//    - Drawable: line/polyline/point/text 之一
//    - textSpan:假上下標
//    Controller 產生 SceneOutput，View 只負責 render。
import type { SceneOutput, Drawable, TextSpan } from "../../core/drawables";

// 2) Viewport：座標系轉換器
//    - econ(x,y) -> pixel(x,y) 用 map
//    - pixel -> econ 用 unmap
//    這是拖曳互動的核心工具：使用者拖的是像素，但模型要用經濟座標。
import { Viewport } from "../../core/Viewport";

// 3) Model：負責持有參數 + 經濟計算
//    Controller 不直接算 Cobb-Douglas，而是叫 model 幫你算。
//    這是 MVC 的核心：
//    - Model：算
//    - Controller：協調（接事件、更新 model、產 scene、通知 view）
//    - View：畫
import { ConsumerOptModel } from "../model/ConsumerOptModel";

// 4) Listener：訂閱者（通常是 View）
//    Controller 內部維護 listeners，當 scene 更新時通知。
//    (scene: SceneOutput) => void 表示：收到新 scene 後做些事情（例如 setState）。
type Listener = (scene: SceneOutput) => void;

type PixelOffset = { dx: number; dy: number };


export class ConsumerOptController {
  // ---------------------------
  // Controller 的「持久狀態」
  // ---------------------------

  // 1) model：你整張圖的經濟模型與參數都放在這裡
  // readonly：表示建構後不允許替換 model 物件（但 model 內部狀態仍可改）
  private readonly model: ConsumerOptModel;

  // 2) innerW/innerH：繪圖內容區（扣掉 margin 後）的寬高
  //    注意：這裡是「內容區」，不是整張 SVG 的 W/H
  //    View 那邊通常會：
  //      W=520/H=360 + margin，然後 innerW = W - margin.left - margin.right
  private readonly innerW: number;
  private readonly innerH: number;

  // 3) listeners：訂閱者列表（通常是 GraphView）
  //    只要 scene 重算，就會通知每個 listener。
  private listeners: Listener[];

  // 4) lastScene：快取（cache）
  //    - 目的：避免每次 View 呼叫 getScene 都重算一次
  //    - 只要參數變了（I/a），就 rebuildAndNotify 會把它更新
  private lastScene: SceneOutput | null;

  // 5) lastViewport: 和 lastScene 同步的「同一份座標轉換器」
  private lastViewport: Viewport | null;

  // 6) 線段顏色 (線與其方程式標籤會共用)
  private budgetColor: string;
  private indiffColor: string;

  // 7) id -> 方程式標籤的「使用者拖曳 offset」 (相對於 anchor)
  private labelOffsets: Record<string, PixelOffset>;

  // ---------------------------------------------------------
  // 新增：顯示控制 + 字體大小 + Opt 顏色
  // 需求對應：
  // 1) 控制是否顯示：方程式標籤、Opt
  // 3) 控制 Opt point / Opt text 顏色
  // 1) 控制文字標籤字體大小（我這裡把 Opt + equations 都視為「標籤」）
  // ---------------------------------------------------------
  private showEquationLabels: boolean;  // 控制 utility/budget/indiff 方程式文字標籤
  private showOpt: boolean;             // 控制 opt 點 + opt 文字
  private labelFontSize: number;        // 控制 「標籤」字體大小 ()

  
  private optPointColor: string;        // Opt point 顏色
  private optTextColor: string;         // Opt text 顏色

  // ---------------------------
  // 建構子：注入依賴（Dependency Injection）
  // ---------------------------
  constructor(args: {
    innerWidth: number;
    innerHeight: number;
    model: ConsumerOptModel;
  }) {
    // 內容區寬高（畫圖區）
    this.innerW = args.innerWidth;
    this.innerH = args.innerHeight;

    // 注入 model
    this.model = args.model;

    // 初始沒有訂閱者
    this.listeners = [];

    // 初始 scene 尚未生成（lazy build）
    this.lastScene = null;

    // 初始 viewport 尚未生成（lazy build）
    this.lastViewport = null;

    // 預設顏色
    this.budgetColor = "#111111";
    this.indiffColor = "#111111";

    this.labelOffsets = {};

    this.showEquationLabels = true;      // 預設顯示方程式文字標籤
    this.labelFontSize = 12;             // 預設顯示 Opt 點 與 文字
    this.showOpt = true;                 // 預設標籤字體大小

    this.optPointColor = "#111111";    // 預設 Opt 點顏色
    this.optTextColor = "#111111";     // 預設 Opt 文字顏色
  }

  // ------------------------------------------------------
  // subscribe 訂閱 / unsubscribe 取消訂閱：View 用
  // ------------------------------------------------------
  // subscribe(fn)：把 View 的 callback 放進 listeners
  // View 通常在 constructor/componentDidMount 訂閱
  subscribe(fn: Listener) {
    this.listeners.push(fn);
  }

  // unsubscribe(fn)：把指定 listener 移除
  // 你用 while + 手動 copy 的方式做 immutable-like 更新（不使用 filter）
  // 好處：不會用到 break/continue，行為也可控
  unsubscribe(fn: Listener) {
    const next: Listener[] = [];
    let i = 0;
    while (i < this.listeners.length) {
      const item = this.listeners[i];
      // 只保留不是同一個 function 的 listener
      if (item !== fn) {
        next.push(item);
      }
      i += 1;
    }
    this.listeners = next;
  }

  // ---------------------------
  // View 取 scene 的方法
  // ---------------------------

  // getScene：給 View 拿最新場景
  // - 如果 lastScene 有值：回傳快取（不重算）
  // - 如果沒有：呼叫 buildScene() 計算一次，並保存快取
  //
  // 這個 lazy build 的設計，使得：
  // - Controller 剛建好但 View 還沒 render 時，不會先做重算
  // - 只有真正需要畫圖時才算
  getScene(): SceneOutput {
    if (this.lastScene) {
      return this.lastScene;
    }
    const scene = this.buildScene();
    this.lastScene = scene;
    return scene;
  }

  // =========================================================
  // getViewport：提供 View 使用（AxesView 會用）
  // - 確保 viewport 永遠和 lastScene 同步
  // =========================================================
  getViewport(): Viewport {
    // 若尚未 build，先確保 scene.viewport 被建立
    if (!this.lastScene || !this.lastViewport) {
      // buildScene 內會同步更新 this.lastViewport
      const scene = this.buildScene();
      this.lastScene = scene;
    }

    // 此時 lastViewport 一定存在 (若不存在表示 buildScene 忘了更新)
    if (!this.lastViewport) {
      // 保險: 理論上不會發生
      this.lastViewport = new Viewport(this.innerW, this.innerH, [0,1], [0,1]);
    }

    return this.lastViewport;
  }


  // =========================================================
  // UI events (from View)
  // 這些方法都是「View 事件入口」
  // =========================================================

  // slider：Income 改變
  // - 更新 model
  // - 重建 scene + 通知 view
  onIncomeChange(nextI: number) {
    this.model.setIncome(nextI);
    this.rebuildAndNotify();
  }

  // slider：alpha 改變
  onAlphaChange(nextA: number) {
    this.model.setAlpha(nextA);
    this.rebuildAndNotify();
  }

  // ---------------------------------------------------------
  // UI events: prices
  // - px / py 是模型參數，所以必須：
  //   1) 更新 model
  //   2) rebuildAndNotify() 重算 scene + 通知 view
  // ---------------------------------------------------------
  onPxChange(nextPx: number) {
    // 取得目前的 py (保持不變)
    const params = this.model.getModelParams();

    // 防呆: 價格不能 <= 0
    let px = nextPx;
    if (px < 0.1) {
      px = 0.1;
    }

    this.model.setPrices(px, params.py);
    this.rebuildAndNotify();
  }

  onPyChange(nextPy: number) {
    // 取得目前的 px (保持不變)
    const params = this.model.getModelParams();

    // 防呆: 價格不能 <= 0
    let py = nextPy;
    if (py < 0.1) {
      py = 0.1
    }

    this.model.setPrices(params.px, py);
    this.rebuildAndNotify();
  }

  // 拖曳互動：View 回報被拖曳的 point（以像素座標回報）
  // - id: 哪一個點（你的 drawables 中 point 的 id）
  // - pixel: 使用者當下拖曳的局部座標（在內容區 <g> 裡）
  onPointDrag(id: string, pixel: { x: number; y: number }) {
    // 若 Opt 被關掉，就不允許拖曳 opt
    if (!this.showOpt) {
      return;
    }
    
    // 目前你只允許拖 opt 這個點
    // 其他點拖了也忽略（直接 return）
    if (id !== "opt") {
      return;
    }

    // // 先取得當前 scene（可能是 cache）
    // const scene = this.getScene();

    // // 用當前 scene 的 domain 建立 viewport
    // // 這步很重要：因為 domain 會隨 I/px/py 改變，不能用舊 domain
    // const vp = new Viewport(
    //   this.innerW,
    //   this.innerH,
    //   scene.xDomain,
    //   scene.yDomain
    // );

    // 不再 new Viewport，直接用「controller 當前的 viewport」
    const vp = this.getViewport();

    // 像素座標 -> 經濟座標
    // 使用者拖曳的是 pixel，但你的經濟模型應該接 econ(x,y)
    const econPoint = vp.pixelToEconMapping(pixel);
    const xEcon = econPoint.x;
    const yEcon = econPoint.y;

    // ---------------------------------------------------------
    // 關鍵：拖 opt 點要怎麼「回推 a」？
    // ---------------------------------------------------------
    // 你註解寫得很實在：有很多種定義方式
    //
    // 你現在採用的是一個簡單 proxy：
    //   alpha ≈ x / (x + y)
    //
    // 解釋：
    // - alpha 在 Cobb-Douglas 裡是「x 的權重」
    // - 拖到越靠右（x 大），a 就越大
    // - 拖到越靠上（y 大），a 就越小
    //
    // 這不是嚴格從 FOC 推回來的，但互動上直觀。
    const denom = xEcon + yEcon;

    // 防呆：避免 denom <= 0 時除以 0 或得到奇怪值
    if (denom <= 0) {
      return;
    }

    // 計算新的 a
    let nextAlpha = xEcon / denom;

    // clamp：限制 a 的範圍到 [0.1, 0.9]
    // 因為 a=0 或 1 會讓 indifference curve / 效用等出現數值問題
    // （例如 1/(1-a) 會爆掉）
    if (nextAlpha < 0.1) {
      nextAlpha = 0.1;
    }
    if (nextAlpha > 0.9) {
      nextAlpha = 0.9;
    }

    // 更新 model 的 a
    this.model.setAlpha(nextAlpha);

    // 重建 scene + 通知 view（讓圖重畫、slider 也能同步）
    this.rebuildAndNotify();
  }

  // ---------------------------------------------------------
  // 拖曳：方程式標籤（text）
  //  - 1 找出「這個標籤」對應的 anchor（例如預算線中點）
  //  - 2 計算 offset = 使用者拖到的位置 - anchor
  //  - 3 存起來（labelOffsets[id]）
  //  - 4 rebuildScene 時把 offset 加回去（位置就會保留）
  //  - 5 限制 方程式標前拖曳區域 為 plot 區域
  //      - 從 SvgSceneView 回報的是「plot group 內 local pixel」
  //      - plot 區域座標範圍: x in [0, scene.width], y in [0, scene.height]
  // ---------------------------------------------------------
  onTextDrag(id: string, pixel: { x: number; y: number }) {
    const scene = this.getScene();
    const anchor = this.findLabelAnchor(scene.drawables, id);
    if (!anchor) {
      return;
    }


    // clamp: 標籤拖曳限制在 plot 區域
    const padding = 2;
    let x = pixel.x;
    let y = pixel.y;

    if (x < padding) {
      x = padding;
    }
    if (y < padding) {
      y = padding;
    }

    if (x > scene.width - padding) {
      x = scene.width - padding;
    }
    if (y > scene.height - padding) {
      y = scene.height - padding;
    }

    const dx = pixel.x - anchor.x;
    const dy = pixel.y - anchor.y;

    this.labelOffsets[id] = { dx, dy };

    // 標籤位置改了，需要通知 view 重新渲染
    this.rebuildAndNotify();
  }


  // ---------------------------------------------------------
  //  View options setters
  // ---------------------------------------------------------
  setShowEquationLabels(show: boolean) {
    this.showEquationLabels = show;
    this.rebuildAndNotify();
  }

  setEquationFontSize(size: number) {
    let next = size;
    if (next < 8) {
      next = 8;
    }
    if (next > 28) {
      next = 28;
    }
    this.labelFontSize = next;
    this.rebuildAndNotify();
  }

  setShowOpt(show: boolean) {
    this.showOpt = show;
    this.rebuildAndNotify();
  }

  setOptPointColor(color: string) {
    this.optPointColor = color;
    this.rebuildAndNotify();
  }

  setOptTextColor(color: string) {
    this.optTextColor = color;
    this.rebuildAndNotify();
  }

  // 顏色變更: 線段 與 標籤一起變
  setBudgetColor(color: string) {
    this.budgetColor = color;
    this.rebuildAndNotify();
  }

  setIndiffColor(color: string) {
    this.indiffColor = color;
    this.rebuildAndNotify();
  }

  

  // =========================================================
  // getModelParamsSnapshot：讓 View 讀到目前 model 參數
  // - 目的：GraphView 初始化 slider(px/py) 的 state 用
  // =========================================================
  getModelParamsSnapshot() {
    return this.model.getModelParams();
  }


  // =========================================================
  // Internals（Controller 內部工具方法）
  // =========================================================

  private formatNum(value: number): string {
    // 避免方程式顯示一堆小數
    return value.toFixed(2);
  }

  // 工具: anchor + offset (若曾拖曳就套用)
  private resolveLabelPos(
    labelId: string,
    anchor: { x: number ; y: number },
    defaultDx: number,
    defaultDy: number
  ): { x: number; y: number } {
    const offset = this.labelOffsets[labelId];
    let x = anchor.x + defaultDx;
    let y = anchor.y + defaultDy;
    if (offset) {
      x = anchor.x + offset.dx;
      y = anchor.y + offset.dy;
    }
    
    return { x, y }
  }



  // rebuildAndNotify：重算場景 + 通知所有訂閱者
  //
  // 這是 MVC 裡 controller 最核心的動作：
  // - model 變了
  // - scene 必須更新
  // - view 必須被通知重新 render
  private rebuildAndNotify() {
    // 重算並覆蓋快取 (buildScene 會同步更新 lastViewport)
    this.lastScene = this.buildScene();

    // 用 local 變數避免 TS 對 null 抱怨，也避免通知時被改動
    const scene = this.lastScene;

    // 逐一通知 listener
    // listener 通常會 setState({scene}) 或同步 slider state 等
    let i = 0;
    while (i < this.listeners.length) {
      const fn = this.listeners[i];

      fn(scene);

      i += 1;
    }
  }

  
  // ---------------------------------------------------------
  // computePlotInnerSize(): 依 px/py 決定「plot 區域」像素寬高比例
  // - arg:
  //   1. width: 這次要畫圖的區域-像素寬度
  //   2. height: 這次要畫圖的區域-像素高度
  // 
  //   - px 變大 → x 軸變短（相對於 y）
  //   - py 變大 → y 軸變短（等價：x 相對變長）
  //
  // Let
  //   plotWidth / plotHeight = py / px
  //
  // 同時：plotW/plotH 不能超出可用的 innerW/innerH
  // 所以要在 availW×availH 裡，找「最大可放的矩形」
  // ---------------------------------------------------------
  private computePlotInnerSize(px: number, py:number): {
    width: number;
    height: number
  } {
    const availWidth = this.innerW;   // 可畫圖的區域 (像素寬度)
    const availHeight = this.innerH;  // 可畫圖的區域 (像素高度)

    // priceRatio = plotWidth / plotHeight
    let priceRatio = 1;  // 預設 1，plot 區域的長寬比 = px 和 py 的比
    // 防呆: px、py 需要大於 0
    if (px > 0 && py > 0) {
      priceRatio = py/px
    }

    // 避免極端比例讓圖接近消失 (可自行調整上下界)
    //  - 如果出現: px/py 極端，priceRatio 可能非常大禍非常小，導致圖形變成一條線
    if (priceRatio < 0.1) {
      priceRatio = 0.1;
    }
    if (priceRatio > 10) {
      priceRatio = 10;
    }

    const availRatio = availWidth / availHeight;

    // 預設把 plot 塞滿整個可用區
    let width = availWidth;
    let height = availHeight;

    if (availRatio > priceRatio) {
      height = availHeight;
      width = availHeight * priceRatio;
    } else {
      width = availWidth;
      height = availWidth / priceRatio;
    }

    if (width < 1) {
      width = 1;
    }
    if (height < 1) {
      height = 1;
    }

    return {width, height};
  }


  // ---------------------------------------------------------
  // findLabelAnchor: 找方程式標籤的 anchor（用目前 drawables 取，穩）
  // - budget-eq -> budget line 的中點
  // - indiff-eq -> indiff polyline 的中間點
  // ---------------------------------------------------------
  private findLabelAnchor(
    drawables: Drawable[],
    labelId: string
  ): { x: number; y: number } | null {
    if (labelId === "budget-eq") {
      let i = 0;
      while (i < drawables.length) {
        const drawableType = drawables[i];
        if (drawableType.kind === "line" && drawableType.id === "budget") {
          return { x: (drawableType.a.x + drawableType.b.x)/2 , y: (drawableType.a.y + drawableType.b.y) / 2 };
        }
        i++;
      }
      return null;
    }
    
    if (labelId === "indiff-eq") {
      let i = 0;
      while (i < drawables.length) {
        const drawableType = drawables[i];
        if (drawableType.kind === "polyline" && drawableType.id === "indiff") {
          const n = drawableType.points.length;
          if (n <= 0) {
            return null;
          }
          const mid = Math.floor(n/2);
          return { x: drawableType.points[mid].x, y: drawableType.points[mid].y };
        }
        i++;
      }
      return null;
    }

    if (labelId === "opt-label") {
      let i = 0;
      while (i < drawables.length) {
        const d = drawables[i];
        if (d.kind === "point" && d.id === "opt") {
          // Opt 文字 anchor：跟著 opt 點走（稍微右上偏移）
          return { x: d.center.x + 8, y: d.center.y - 8 };
        }
        i += 1;
      }
      return null;
    }

    if (labelId === "utility-eq") {
      // utility-eq anchor：固定放在左上角（在 plot 內）
      // 讓它預設不依賴任何線/曲線也能出現，這不是貼在線上，所以用固定位置（靠左上，避免跟 tick 擠）
      return { x: 12, y: 18 };
    }

    return null;
  }

  // ---------------------------------------------------------
  //  類似 LaText: 用 tspans 模擬上下標
  // ---------------------------------------------------------
  private supSize(base: number): number {
    const supTextSize = Math.round(base * 0.8);
    if (supTextSize < 8) {
      return 8;
    }
    return supTextSize;
  }

  private buildUtilitySpans(a: number, fontSize: number): TextSpan[] {
    const supTextSize = this.supSize(fontSize);
    // U(x,y) = x^{\alpha} y^{1-\alpha}, \alpha = 0.5
    return [
      { text: "U(x,y) = x" },
      { text: "α", baselineShift: "super", fontSize: supTextSize },
      { text: " y" },
      { text: "1-α", baselineShift: "super", fontSize: supTextSize },
      { text: ",  α=" + this.formatNum(a) },
    ];
  }

  private buildBudgetSpans(px: number, py: number, I: number, fontSize: number): TextSpan[] {
    const supTextSize = this.supSize(fontSize);
    // p_x x + p_y y = I, p_x=..., p_y=..., I=...
    return [
      { text: "p" },
      { text: "x", baselineShift: "sub", fontSize: supTextSize },
      { text: " x + p" },
      { text: "y", baselineShift: "sub", fontSize: supTextSize },
      { text: " y = I" },
      { text: ",  p" },
      { text: "x", baselineShift: "sub", fontSize: supTextSize },
      { text: "=" + this.formatNum(px) },
      { text: ",  p" },
      { text: "y", baselineShift: "sub", fontSize: supTextSize },
      { text: "=" + this.formatNum(py) },
      { text: ",  I=" + this.formatNum(I) },
    ];
  }

  private buildIndiffSpans(U0: number, a: number, fontSize: number): TextSpan[] {
    const supTextSize = this.supSize(fontSize);
    // y = (U_0 / x^{α})^{1/(1-α)},  U_0 = ...
    return [
      { text: "y = (U" },
      { text: "0", baselineShift: "sub", fontSize: supTextSize },
      { text: " / x" },
      { text: "α", baselineShift: "super", fontSize: supTextSize },
      { text: ")" },
      { text: "1/(1-α)", baselineShift: "super", fontSize: supTextSize },
      { text: ",  U" },
      { text: "0", baselineShift: "sub", fontSize: supTextSize },
      { text: "=" + this.formatNum(U0) + ",  α=" + this.formatNum(a) },
    ];
  }


  // =========================================================
  // buildScene：把 model 的參數轉成 SceneOutput
  //
  // 這步「等價於你舊架構的 ConsumerOptScene.build()」
  // 但 MVC/OOP 版本把它放進 controller（或你也可以拆成 SceneBuilder class）
  // =========================================================
  private buildScene(): SceneOutput {
    // 取得 model 當前參數（I, px, py, a）
    const p = this.model.getModelParams();

    // 決定經濟座標最大範圍（多留 20% 邊界）
    const xEconMax = (p.I / p.px) * 1.2;
    const yEconMax = (p.I / p.py) * 1.2;


    // 依 px/py 決定 plot 的像素大小 (軸長會跟著變)
    const plotSize = this.computePlotInnerSize(p.px, p.py);


    // 建立 viewport：經濟座標 -> 像素座標
    const vp = new Viewport(plotSize.width, plotSize.height, [0, xEconMax], [0, yEconMax]);
    this.lastViewport = vp;  // 同步更新 lastViewport


    // 由 model 計算經濟元素
    const budget = this.model.computeBudget();     // 預算線端點（經濟座標）
    const optEcon = this.model.computeOptimum();       // 最適點（經濟座標）

    const xEcon = optEcon.x;
    const yEcon = optEcon.y;

    const U0 = this.model.computeUtilityAt(xEcon, yEcon); // 最適效用

    // 無異曲線取樣的 xMin：避免 x 太小造成 y 爆掉
    const xMinCandidate = xEconMax * 0.05;
    let xMin = 0.0001;
    if (xMinCandidate > xMin) {
      xMin = xMinCandidate;
    }

    // 取樣無異曲線（回傳 econ 點）
    const curveEconPts = this.model.computeIndifferenceCurve(U0, xMin, xEconMax, 60);

    // econ -> pixel（line/polyline/point 都要 pixel 才能畫）
    const curvePxPts = curveEconPts.map((pt) => vp.econToPixelMapping(pt));
    const optPx = vp.econToPixelMapping(optEcon);


    // 先建 drawable 物件 (用來計算 label anchor)
    // 預算線：line
    const budgetLine: Drawable = {
      kind: "line",
      id: "budget",
      a: vp.econToPixelMapping(budget.p1),
      b: vp.econToPixelMapping(budget.p2),
      stroke: { width: 2, color: this.budgetColor },
    }
    // 無異曲線：polyline
    const indiffCurve: Drawable = {
      kind: "polyline",
      id: "indiff",
      points: curvePxPts,
      stroke: { width: 2, color: this.indiffColor },
    }

    // 組裝 drawables：這就是 View 的「唯一輸入」（這就是 drawables.ts 的用途）
    const drawables: Drawable[] = [
      budgetLine,
      indiffCurve  // 需要 特別指出 indiffCurve 時，再添加
    ];

    // Opt 可顯示/隱藏 + 可控顏色
    if (this.showOpt) {
      // 最適點：point
      const optPoint: Drawable = {
          kind: "point",
          id: "opt",
          center: optPx,
          r: 4,
          fill: { color: this.optPointColor },
      }
      // 最適點標記：text
      const optText: Drawable = {
          kind: "text",
          id: "opt-label",
          pos: { x: optPx.x + 8, y: optPx.y - 8 },
          text: "Opt",
          fontSize: 12,
          fill: { color: this.optTextColor },
          draggable: true,
      }
      drawables.push(optPoint);
      drawables.push(optText);
    }


    // TEST: 額外加一個紅色點
    // drawables.push({
    //   kind: "point",
    //   id: "test",
    //   center: { x: 50, y: 50 },
    //   r: 6,
    //   fill: { color: "red" },
    // });


    // 方程式標籤: 可顯示/隱藏 + 字體大小 + 類 LaTeX
    if (this.showEquationLabels) {
      const equationFontSize = this.labelFontSize;

      // ---------------------------------------------------------
      //  utility equation（效用方程式）顯示  (固定左上角)
      // ---------------------------------------------------------
      const utilAnchor = this.findLabelAnchor(drawables, "utility-eq");
      if (utilAnchor) {
        const utilPos = this.resolveLabelPos("utility-eq", utilAnchor, 0, 0);
        drawables.push({
          kind: "text",
          id: "utility-eq",
          pos: utilPos,
          // 顯示一般式 + 目前 a 值（用純文字，SVG 不做上標）
          text: `U(x,y) = x^a y^(1-a),  a=${this.formatNum(p.a)}`,
          // text: "U(x,y)=x^α y^(1-α)",
          spans: this.buildUtilitySpans(p.a, equationFontSize),
          fontSize: equationFontSize,
          fill: { color: this.indiffColor },
          draggable: true,
        });
      }
      
      // ---------------------------------------------------------
      // budget equation
      // 方程式標籤（文字 drawable）
      // - 可拖曳 draggable: true
      // - 顏色 fill.color = 線段顏色
      // - 位置 = anchor + offset（如果使用者拖過就保留）
      // ---------------------------------------------------------
      // const tempDrawablesForAnchor = drawables.slice();  // 用來計算 anchor (目前已經有線/曲線)
      // const budgetAnchor = this.findLabelAnchor(tempDrawablesForAnchor, "budget-eq");
      const budgetAnchor = this.findLabelAnchor(drawables, "budget-eq");
      if (budgetAnchor) {
        const budgetPos = this.resolveLabelPos("budget-eq", budgetAnchor, 10, -10);
        drawables.push({
          kind: "text",
          id: "budget-eq",
          pos: budgetPos,
          text: `${this.formatNum(p.px)}x + ${this.formatNum(p.py)}y = ${this.formatNum(p.I)}`,
          // text: "p_x x + p_y y = I",
          spans: this.buildBudgetSpans(p.px, p.py, p.I, equationFontSize),
          fontSize: equationFontSize,
          fill: { color: this.budgetColor },
          draggable: true,
        });
      }

      // ---------------------------------------------------------
      // indifference equation（無異曲線方程）顯示 + 可拖曳 + 顏色同步
      // 以 Cobb-Douglas：U0 = x^a y^(1-a)
      // => y = (U0 / x^a)^(1/(1-a))
      // ---------------------------------------------------------
      const indiffAnchor = this.findLabelAnchor(drawables, "indiff-eq");
      if (indiffAnchor) {
        const indiffPos = this.resolveLabelPos("indiff-eq", indiffAnchor, 10, -10);
        drawables.push({
          kind: "text",
          id: "indiff-eq",
          pos: indiffPos,
          text: `y = (U0 / x^a)^(1/(1-a)),  U0=${this.formatNum(U0)}`,
          // text: "y=(U0/x^a)^(1/(1-a))",
          fontSize: equationFontSize,
          fill: { color: this.indiffColor },
          draggable: true,
        });
      }

      // ---------------------------------------------------------
      // 讓 opt-label 的「可拖曳偏移」真的生效：
      // - 我們在 drawables 最後再把 opt-label 的 pos 修正成 anchor + offset
      // - 這樣 Opt 文字可以被拖、且 opt 點移動時 anchor 也會跟著變
      // - 讓 opt-label 的 offset 生效 (如果 opt 有顯示)
      // ---------------------------------------------------------
      if (this.showOpt){
        const optAnchor = this.findLabelAnchor(drawables, "opt-label");
        if (optAnchor) {
          const optPos = this.resolveLabelPos("opt-label", optAnchor, 0, 0);

          let i = 0;
          while (i < drawables.length) {
            const d = drawables[i];
            if (d.kind === "text" && d.id === "opt-label") {
              // 直接覆蓋位置（不改其他屬性）
              (d as any).pos = optPos;
            }
            i += 1;
          }
        }
      }
    }

    // 回傳 SceneOutput
    return {
      width: plotSize.width,
      height: plotSize.height,
      drawables,
      xDomain: [0, xEconMax],
      yDomain: [0, yEconMax],
    };
  }
}
