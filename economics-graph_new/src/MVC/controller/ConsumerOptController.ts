// src/mvc/controller/ConsumerOptController.ts

// 1) SceneOutput / Drawable：這是 View 會吃的「畫圖資料規格」
//    - SceneOutput: {width, height, drawables, xDomain, yDomain}
//    - Drawable: line/polyline/point/text 之一
//    Controller 產生 SceneOutput，View 只負責 render。
import type { SceneOutput, Drawable } from "../../core/drawables";

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


  // ---------------------------
  // 建構子：注入依賴（Dependency Injection）
  // ---------------------------
  constructor(args: {
    innerW: number;
    innerH: number;
    model: ConsumerOptModel;
  }) {
    // 內容區寬高（畫圖區）
    this.innerW = args.innerW;
    this.innerH = args.innerH;

    // 注入 model
    this.model = args.model;

    // 初始沒有訂閱者
    this.listeners = [];

    // 初始 scene 尚未生成（lazy build）
    this.lastScene = null;

    // 初始 viewport 尚未生成（lazy build）
    this.lastViewport = null;
  }

  // ---------------------------
  // 訂閱 / 取消訂閱：View 用
  // ---------------------------

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

  // 拖曳互動：View 回報被拖曳的 point（以像素座標回報）
  // - id: 哪一個點（你的 drawables 中 point 的 id）
  // - pixel: 使用者當下拖曳的局部座標（在內容區 <g> 裡）
  onPointDrag(id: string, pixel: { x: number; y: number }) {
    // Debug
    // console.log("[Controller] onPointDrag", id, pixel);
    
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

  // =========================================================
  // Internals（Controller 內部工具方法）
  // =========================================================

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

  // buildScene：把 model 的參數轉成 SceneOutput
  //
  // 這步「等價於你舊架構的 ConsumerOptScene.build()」
  // 但 MVC/OOP 版本把它放進 controller（或你也可以拆成 SceneBuilder class）
  private buildScene(): SceneOutput {
    // 取得 model 當前參數（I, px, py, a）
    const p = this.model.getModelParams();

    // 決定經濟座標最大範圍（多留 20% 邊界）
    const xEconMax = (p.I / p.px) * 1.2;
    const yEconMax = (p.I / p.py) * 1.2;

    // 建立 viewport：經濟座標 -> 像素座標
    const vp = new Viewport(this.innerW, this.innerH, [0, xEconMax], [0, yEconMax]);
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

    // 組裝 drawables：這就是 View 的「唯一輸入」（這就是 drawables.ts 的用途）
    const drawables: Drawable[] = [
      // 預算線：line
      {
        kind: "line",
        id: "budget",
        a: vp.econToPixelMapping(budget.p1), // 端點轉成像素座標
        b: vp.econToPixelMapping(budget.p2),
        stroke: { width: 2, color: "currentColor" },
      },
      // 無異曲線：polyline
      {
        kind: "polyline",
        id: "indiff",
        points: curvePxPts,
        stroke: { width: 2, color: "currentColor" },
      },
      // 最適點：point
      {
        kind: "point",
        id: "opt",
        center: optPx,
        r: 4,
        fill: { color: "currentColor" },
      },
      // 最適點標記：text
      {
        kind: "text",
        id: "opt-label",
        pos: { x: optPx.x + 8, y: optPx.y - 8 },
        text: "Opt",
        fontSize: 12,
      },
    ];

    // TEST: 額外加一個紅色點
    // drawables.push({
    //   kind: "point",
    //   id: "test",
    //   center: { x: 50, y: 50 },
    //   r: 6,
    //   fill: { color: "red" },
    // });


    // 回傳 SceneOutput
    return {
      width: this.innerW,
      height: this.innerH,
      drawables,
      xDomain: [0, xEconMax],
      yDomain: [0, yEconMax],
    };
  }
}
