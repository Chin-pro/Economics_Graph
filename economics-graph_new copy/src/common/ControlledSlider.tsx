// src/common/ControlledSlider.tsx
// 這個檔案定義一個「可重複使用的 Slider 元件」
// - 外觀：我們用 div 自己畫（track / fill / thumb / tooltip）
// - 互動：仍用原生 <input type="range"> 處理（但設成透明）
// - 受控：value 完全由外部傳入；變更用 onChange 回報給外部

import React from "react";
// 這裡 import React 的目的：
// 1) 讓 TS 能識別 JSX 語法（某些設定仍需要）
// 2) 使用 React 的型別（例如 React.ChangeEvent）

// ------------------------------------------------------------
// Props 型別：定義「外部可以傳進這個 Slider 的參數」
// ------------------------------------------------------------
type Props = {
  label: string;
  // label：顯示用文字，例如 "Income I" 或 "a (x exponent)"
  // 作用：讓 UI 顯示「這個 slider 在控制什麼」

  value: number;
  // value：當前 slider 的值（受控組件的核心之一）
  // 作用：決定
  // 1) 原生 input 的 value（實際互動值）
  // 2) 我們自己畫的 thumb/fill/tooltip 的位置與顯示

  min: number;
  // min：可選最小值
  // 作用：
  // 1) 原生 input 的最小值（使用者拖不到更小）
  // 2) 用於計算 pct（value 在軌道中的比例）

  max: number;
  // max：可選最大值
  // 作用：同 min（上界）

  step?: number;
  // step：每次跳動的最小單位（可選）
  // 例如 a 用 0.01；Income 用 1
  // 不一定每個 slider 都需要，所以標成可選（?）

  onChange: (next: number) => void;
  // onChange：受控組件的核心之二
  // 作用：當使用者拖動滑桿時，把「新值」回報給外部
  // 外部（例如 AppView）收到 next 後，負責 setState + 通知 controller
};

// ------------------------------------------------------------
// ControlledSlider 元件本體（function component）
// ------------------------------------------------------------
export function ControlledSlider(props: Props) {
  // 將 props 解構（destructure）成單獨變數，寫起來更乾淨
  const { label, value, min, max, step, onChange } = props;

  // ----------------------------------------------------------
  // 1) 計算 thumb 在軌道中的位置比例 pct（0~1）
  // ----------------------------------------------------------

  let pct = 0;
  // pct = percentage（比例）
  // 你可以把它想成「目前值在整個範圍[min,max]中的相對位置」
  // 例如：
  // - value=min => pct=0（最左）
  // - value=max => pct=1（最右）
  // - value 在中間 => pct 在 0~1

  const denom = max - min;
  // denom = 分母（range 的寬度）
  // 用於避免你直接除以 (max-min) 時，發生 max=min 的除以 0

  if (denom > 0) {
    pct = (value - min) / denom;
    // 這是標準線性映射公式：
    // 把 value 從 [min,max] 映射到 [0,1]
    //
    // 例：
    // min=0.1 max=0.9 value=0.5
    // denom=0.8
    // pct=(0.5-0.1)/0.8=0.5 => 正中間
  }

  // ----------------------------------------------------------
  // 2) clamp：把 pct 限制在 0~1（防呆）
  // ----------------------------------------------------------
  // 為什麼要 clamp？
  // - 把一個數字強制卡在 [最小值, 最大值] 之間，不讓它超出去
  // - 受控組件的 value 來自外部
  // - 外部有可能傳進超出範圍的值（例如 value=999）
  // 若不 clamp，thumb 會跑出軌道外（UI 變形）

  if (pct < 0) {
    pct = 0;
  }
  if (pct > 1) {
    pct = 1;
  }

  const leftPercent = `${pct * 100}%`;
  // leftPercent：把 0~1 的比例轉成 CSS 可用的百分比字串
  // 例如 pct=0.5 => "50%"
  // 這會用在：
  // - fill 寬度
  // - thumb 的 left
  // - tooltip 的 left
  // 
  // 等價於: "const leftPercent = String(pct * 100) + "%";"

  // ----------------------------------------------------------
  // 3) handleChange：處理原生 input 的 onChange 事件
  // ----------------------------------------------------------
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // e 是事件物件（event object）
    // 這裡用 React.ChangeEvent<HTMLInputElement> 的目的 (TS 型別註記)：
    // - 告訴 TypeScript：e.currentTarget 是 HTMLInputElement
    // - 因此 e.currentTarget.value 是 string（HTML 規格就是 string）

    const next = Number(e.currentTarget.value);
    // 為什麼要 Number(...)？
    // - 即使 input 是 range，e.currentTarget.value 仍然是「字串」
    //   例如 "0.53"
    // - 但你外部希望接到 number 才能計算/存到 state
    // - 所以要轉型成 number

    onChange(next);
    // 受控組件的關鍵：元件自己「不保存」value
    // 它只把 next 回報給外部 (交給 Parent Component 進行渲染)
    // 外部 setState 後再把新的 value 傳回來
  }

  // ----------------------------------------------------------
  // 4) render：畫出 slider（外觀 + 透明 input）
  // ----------------------------------------------------------
  return (
    // 回傳 JSX Element Tree
    // slider 的設計邏輯: track(底) + fill(疊) + thumb(疊) + tooltip(疊) + input(最上層透明疊)
    // 外觀容器（relative, height 28）
    //   - track 容器（relative, height 8） ← 就在這裡加
    //     - fill（absolute）
    //     - thumb（absolute）
    //     - tooltip（absolute）
    //   - 透明 input（absolute, inset 0）
    <div style={{ width: 260 }}>
      {/* 顯示 label 與目前 value（純顯示，不負責互動） */}
      <div style={{ marginBottom: 8, fontSize: 14 }}>
        <span>{label}: </span>
        <span style={{ fontFamily: "inherit" }}>{value}</span>
        {/* inherit 將字體繼承自 index.css 來統一設定 */}
      </div>

      {/* 外觀容器 (實際看到的 slider)：用 relative 讓子元素能 absolute 定位 */}
      <div
        style={{
          position: "relative",
          height: 28,
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* track 容器：你自己畫的軌道 */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 8,
            borderRadius: 999,
            background: "rgba(255,255,255,0.12)",
            outline: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {/* fill：已走過的部分（從 0 到目前 leftPercent）(表示軌道上目前值走到哪「亮起來」的那段) */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: leftPercent,
              borderRadius: 999,  // 將邊角設為最大圓角
              background: "rgba(255,255,255,0.55)",
            }}
          />
            
          {/* thumb：滑塊（用 leftPercent 定位）*/}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: leftPercent,
              transform: "translate(-50%, -50%)",
              // translate(-50%, -50%) 的目的：
              // left 指的是「thumb 左上角」的位置
              // 但我們希望 left 指的是「thumb 中心」
              // 所以往左移半個寬、往上移半個高

              width: 18,
              height: 18,
              borderRadius: 999,
              background: "white",
              boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
            }}
          />

          {/* tooltip：顯示值（純顯示，可移除） */}
          <div
            style={{
              position: "absolute",
              left: leftPercent,
              top: -26,
              transform: "translateX(-50%)",
              // 讓 tooltip 的中心對齊 thumb 的中心

              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 12,
              background: "rgba(0,0,0,0.65)",
              color: "white",
              pointerEvents: "none",
              // pointerEvents: "none" 的目的：
              // tooltip 不要擋到滑鼠事件（不然拖曳會被 tooltip 截走）

              fontFamily: "monospace",
            }}
          >
            {value}
          </div>
          {/* 測試文字
          <span style={{ fontSize: 12, marginLeft: 6 }}>TEST</span> */}

        </div>

        {/* 透明 input：真正處理互動的核心元件 */}
        <input
          type="range"
          // HTML 原生 slider 元素

          aria-label={label}
          // aria-label：無障礙用途，讓螢幕閱讀器知道這個 slider 在控制什麼

          min={min}
          max={max}
          step={step}
          // min/max/step：不是「為了外觀」而放，而是：
          // 1) 限制使用者能選到的值（UI 護欄）
          // 2) 決定鍵盤左右鍵、拖曳時的步進

          value={value}
          // 受控組件：input 的 value 永遠以外部傳入的 value 為準

          onChange={handleChange}
          // input 發生變動 -> 呼叫 handleChange -> onChange(next) 回報外部

          style={{
            position: "absolute",
            inset: 0,
            // inset: 0 等價於：top:0; right:0; bottom:0; left:0;
            // 讓透明 input 完整覆蓋整個外觀容器，任何地方都能拖

            width: "100%",
            height: "100%",
            opacity: 0,
            // opacity:0 讓 input 看不到，但仍然存在、仍可互動

            cursor: "pointer",      // 滑鼠移上去仍顯示手指
          }}
        />
      </div>
    </div>
  );
}
