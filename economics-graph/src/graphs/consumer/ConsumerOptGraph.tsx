/* ConsumerOptGraph.tsx */
//   - 某一張圖的 React 元件 (固定尺寸、margin、呼叫 scene)

// 從 REACT 套件匯入 hook useMemo
import { useMemo } from "react";

// 匯入 TypeScript 型別
import type { Margin } from "../common/types";  // 匯入 Margin 元件: 通常是 {top, right, bottom, left}
import { Axes } from "../common/Axes";  // 匯入 Axes 元件: 用來畫座標軸
import { ConsumerOptScene } from "./ConsumerOptScene";  // 匯入 ConsumerOptScene class: 負責將經濟參數轉成 SceneOutput (drawables)
import { SvgScene } from "../renderers/SvgScene";  // 匯入 SvgSene renderer: 它會把 SceneOutput.drawables 轉成 SVG 元素畫出來

// 匯出 REACT 元件 (REACT function component)
export function ConsumerOptGraph(props: {  // 在參數上寫 props 的型別
  I: number;
  px: number;
  py: number;
  a: number;

  // ✅ 新增：讓外部（App）能被通知 a 改變
  onAChange?: (nextA: number) => void;  // "?": 代表這個 component 可以收到 onAChange，也可以不傳入，部會造成型別錯誤
}) {
  // 固定 SVG 外框大小
  const W = 520;
  const H = 360;

  // 設定 margin 與 inner 尺寸
  //   - margin 表示你要留白給座標軸、刻度、文字
  //   - ": Margin": 型別註記，確保你有 top/right/bottom/left
  const margin: Margin = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  // 建立 SceneOutput (核心計算)
  const sceneOutput = useMemo(() => {
    const scene = new ConsumerOptScene(innerW, innerH);  // 建立一個 scene instance，把 innerW/innerH 注入，將經濟模型結果組裝成 drawables
    return scene.build({ I: props.I, px: props.px, py: props.py, a: props.a });  // 呼叫 build，傳入參數物件，回傳 SceneOutput，賦值給 sceneOutput
  }, [innerW, innerH, props.I, props.px, props.py, props.a]);  // 這個參數是依賴陣列，凡畫布寬高或任何參數改變，就必須重新計算場景

  // 回傳 JSX: 繪 SVG
  // 大括號 "{}" 表示「這裡是 JavaScripts 表達式」
  return (  // REACT 物件回傳 JSX
    <svg width={W} height={H} style={{ border: "1px solid #ddd" }}>  // 建立 SVG 畫布 (容器)
      <Axes width={innerW} height={innerH} margin={margin} />
      <g transform={`translate(${margin.left},${margin.top})`}>
        <SvgScene scene={sceneOutput} />
      </g>
    </svg>
  );
}
