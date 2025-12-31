# AE LMS Graphing Module — Consumer Opt (MVC + Scene/Drawable) @December 31, 2025

> 一個用於「經濟學教學」的互動式繪圖模組：控制參數即時重算並繪製 **預算線、無異曲線、最適點 Opt**，支援在圖上拖曳 Opt 與方程式標籤，並可匯出符合論文圖片需求的 SVG。

---

## TL;DR

- 架構：**MVC（Model / Controller / View） + Scene/Drawable 渲染契約**
- View **只負責渲染與互動事件**，不做經濟計算
- Model **只負責經濟計算**，不碰 SVG 渲染細節
- Controller **協調互動與狀態**，產生 Scene 並通知 View
- Scene/Drawable 是 **Single Source of Truth（渲染唯一真相）**  
  未來改用 D3 / Canvas / WebGL，只需要替換 Renderer

> Model（經濟計算） → SceneBuilder（把結果轉成 Drawables） → View（把 Drawables 渲染成 SVG）

---

## Features

- 即時互動繪圖
  - 預算線（Budget line）
  - 無異曲線（Indifference curve）
  - 最適點（Opt point）
- 可拖曳互動
  - 拖曳 Opt（回推參數或更新狀態）
  - 拖曳方程式標籤（含拖曳範圍限制，避免拖出繪圖區後無法再點到）
- 前端控制面板（UI Options）
  - 顯示/隱藏：方程式標籤、Opt、x/y 軸變數名、圖片標題
  - 可調整：標籤字體大小、標題字體大小
- 匯出
  - 自訂匯出檔名
  - 圖內可包含標題文字（符合期刊圖表風格）
  - 目標：SVG（可再轉 PDF / PNG）

---

## Data Flow & Interaction Flow
### 參數更新 (Slider/UI)
- User 在 `ControlsPanel` 變更參數
- AppView 呼叫 `ConsumerOptController.onXXXChange(...)`
- Controller 更新 `model`，然後重建 `Scene` (透過 `SceneBuilder`)
- Controller `notify` View，View 重新渲染 SVG

### 拖曳互動 (Opt point / 文字標籤)
- 使用者在 SVG 上 pointer down / move
- SvgSceneView 做 hit-test，決定拖的是 point 或 text
- 拖曳過程回呼給 ConsumerOptController：
    - 拖 opt → 轉換成 econ 座標，更新 a（或其他策略）
    - 拖 text → 記錄 offset，並做 clamp（限制在 plot 區域內）
- Controller 重新 build scene → View 更新

---

## Layer Responsibilities (SRP)
### A. App Layer（組裝與 UI 狀態）
- 只負責把 MVC 組起來，以及把 UI state 轉成對 controller/view 的呼叫
- 不做經濟計算，不畫圖
### B. MVC Layer（商業邏輯 + 互動協調 + 視覺輸出規格）
- Model：經濟邏輯、計算（budget/opt/curve）
- Controller：互動事件入口、狀態協調、通知 View
- SceneBuilder：把 model 的計算結果變成 drawables（line/polyline/point/text）
- View：把 drawables 渲染成 SVG，處理 pointer 事件並回報 controller

### C. Core Layer（跨功能共用的「渲染規格」與「座標映射」）
- 定義 drawables 規格、viewport mapping、layout constants
- 不依賴具體 business

---

## Tech Stack

- React + TypeScript
- SVG Renderer（現階段）
- 可擴充：D3（2D）、MathBox（3D）、mathjs、KaTeX（規劃中）

---


## Quick Start
```bash
pnpm install
pnpm dev
```


## File Structure
```plaintext
src/
  app/
    AppView.tsx                       # Composition root：組裝 model/controller + 連接 UI
    ConsumerOptControlsPanel.tsx      # 控制面板（純 UI）
  common/
    ControlledSlider.tsx
    mathjaxSvg.ts
  core/
    drawables.ts
    layout.ts
    types.ts
    Viewport.ts
  MVC/
    controller/
      ConsumerOptController.ts        # [REFAC] 變薄：事件處理 + notify + options
      ConsumerOptSceneBuilder.ts      # [NEW] 只負責 buildScene()
      consumerOptLabel.ts             # [NEW] label anchor/offset/clamp
      consumerOptEquation.ts          # [NEW] spans/format
      consumerOptPlotSize.ts          # [NEW] plot 尺寸計算（px/py aspect）
      types.ts                        # [NEW] Controller/View options 型別集中
    model/
      ConsumerOptModel.ts
    view/
      axesTicks.tsx
      AxesView.tsx
      ConsumerOptGraphView.tsx
      SvgSceneView.tsx
```

---
---


# File-by-File Responsibilities
`src/app/`
----------

### `AppView.tsx` — Composition Root / Glue Layer

**角色：** 應用程式最上層 View（組裝者）  
**負責：**

- 建立 `ConsumerOptModel`、`ConsumerOptController`
- 保存「UI 控制面板的 state」（ticks、顯示/隱藏、字體大小、標題、匯出檔名…）
- 把 state 轉成 props 傳入 `ConsumerOptControlsPanel` 與 `ConsumerOptGraphView`
- 收到 slider 更新 → 呼叫 controller 的 `onIncomeChange/onAlphaChange/onPxChange/onPyChange`
- 收到 view-options 更新 → 呼叫 `controller.setViewOptions(patch)`
- 呼叫 `graphRef.exportSvg(...)` 進行匯出

**不負責：**

- 不做經濟計算
- 不產生 drawables
- 不做 pointer hit-test

---

### `ConsumerOptControlsPanel.tsx` — Pure UI Controls Panel

**角色：** 控制面板（純 UI）  
**負責：**

- 呈現各種 UI 控制項：checkbox、slider、input、color picker
- 將使用者操作轉換成 `onChange` 回呼（交給 AppView 處理）

**不負責：**

- 不知道 model / controller / scene
- 不包含任何經濟邏輯與繪圖邏輯

---

`src/common/`
-------------

### `ControlledSlider.tsx` — Reusable Slider Component

**角色：** 可重用的受控 slider  
**負責：**

- UI 外觀（track/fill/thumb）
- 回報 `onChange(value)`（value 由外部 state 控制）

---

### `mathjaxSvg.ts`

**角色：**（可選）數學式渲染工具  
**負責：**

- 若你未來用 MathJax 把方程式輸出成 SVG path，可以放在這裡
- 目前可作為擴充點：把 equation label 從 `tspan` 升級為 MathJax SVG

---

`src/core/`
-----------

### `drawables.ts` — Rendering Contract (Single Source of Truth)

**角色：** Drawable/Scene 的型別規格  
**負責：**

- 定義 `Drawable` 的 union（line/polyline/point/text…）
- 定義 `SceneOutput`（width/height/drawables/domains）
- 定義 `TextSpan`（tspan 的 baselineShift/fontSize）

**重要性：**

- 這是「View 渲染唯一依據」
- 也是你未來替換 D3/Canvas 的核心契約

---

### `Viewport.ts` — Coordinate Mapping

**角色：** 經濟座標 ↔ 像素座標映射  
**負責：**

- `econToPixelMapping`：將 (x,y) 轉成 SVG plot 內像素
- `pixelToEconMapping`：拖曳回來的像素 → econ 座標（用於更新 model）

---

### `layout.ts` — Layout Constants & Helpers

**角色：** SVG 尺寸與 margin 常數  
**負責：**

- `SVG_WIDTH/SVG_HEIGHT/SVG_MARGIN`
- `computeInnerAvailSize()`（內部繪圖區域可用大小）

---

### `types.ts`

**角色：** core 的共用型別（如 Margin）  
**負責：**

- 提供 View 間共享的型別，避免重複定義

---

`src/MVC/controller/`
---------------------

### `ConsumerOptController.ts` — Interaction Coordinator / State Orchestrator

**角色：** Controller（互動入口 + 協調者）  
**負責：**

- 提供事件入口：
  - slider：`onIncomeChange/onAlphaChange/onPxChange/onPyChange`
  - drag：`onPointDrag/onTextDrag`
- 管理 view options（顯示/隱藏、顏色、字體）
- 管理 labelOffsets（拖曳後偏移量）
- 呼叫 `ConsumerOptSceneBuilder.build(...)` 取得 scene + viewport
- cache `lastScene/lastViewport`
- `subscribe/unsubscribe/notify` 推動 view 更新

**不負責：**

- 不寫 drawables 細節（由 SceneBuilder 負責）
- 不做 equation spans 格式化（由 equation module 負責）
- 不做 plot 尺寸幾何推導（由 plotSize module 負責）

---

### `ConsumerOptSceneBuilder.ts` — Scene Builder (Model → Drawables)

**角色：** 將經濟模型輸出「翻譯」成渲染規格  
**負責：**

- 讀取 model params（I/a/px/py）與計算結果（budget/opt/curve）
- 建立 `Viewport` 與 plot size
- 生成 drawables：
  - budget line（line）
  - indifference curve（polyline）
  - opt point（point）
  - equation labels（text + spans）
- 套用 view options（顏色、是否顯示）
- 使用 labelOffsets 來決定文字位置

**設計意義：**

- sceneBuilder 是最重要的「解耦點」
- 未來你要加 CES、Leontief、Quasilinear，只要新增另一個 builder

---

### `consumerOptLabel.ts` — Label Geometry (Anchor / Offset / Clamp)

**角色：** 文字標籤的幾何規則  
**負責：**

- `findLabelAnchor(drawables, id)`：找 label 的 anchor（budget 中點 / curve 中點 / opt 附近 / 左上）
- `resolveLabelPos(...)`：anchor + offset → 最終 label 位置
- `clampToPlot(...)`：限制拖曳範圍在 plot 區域內（避免拖出後點不到）

---

### `consumerOptEquation.ts` — Equation Formatting & Spans

**角色：** 方程式文字與 tspan 排版  
**負責：**

- 數字格式化 `formatNum`
- 生成不同 label 的 spans：
  - utility：`x^α y^(1-α)`
  - budget：`p_x x + p_y y = I`
  - indiff：`y = (U0 / x^a)^(1/(1-a))`
- 控制上下標字體大小比例

---

### `consumerOptPlotSize.ts` — Plot Geometry (Aspect Ratio from px/py)

**角色：** plot 內部寬高計算  
**負責：**

- 根據可用的 inner box + 價格比 `py/px` 決定 plot 的 aspect ratio
- 防止極端比例（避免 plot 變成極扁的條狀）

---

### `types.ts` (controller folder)

**角色：** ViewOptions / Controller options 型別集中  
**負責：**

- `ConsumerViewOptions`：show/hide、顏色、字體大小等 view-side configs
- 可作為 controller API 的穩定契約

---

`src/MVC/model/`
----------------

### `ConsumerOptModel.ts` — Economic Model (Business Logic)

**角色：** 經濟計算核心（唯一真實來源）  
**負責：**

- 保存 econ params（I/a/px/py）
- 提供 setter（setIncome/setAlpha/setPrices）
- 提供計算方法：
  - budget line endpoints
  - optimum (Opt)
  - utility at point
  - indifference curve points

**不負責：**

- 不知道 Viewport / SVG / drawables
- 不處理 UI 或事件

---

`src/MVC/view/`
---------------

### `ConsumerOptGraphView.tsx` — Graph Container View

**角色：** Graph 的 View 層容器  
**負責：**

- subscribe controller，取得 scene + viewport
- 計算 `plotOffset`（置中 plot）
- render：
  - `AxesView`（座標軸/刻度/標籤）
  - `SvgSceneView`（實際 drawables）
- `exportSvg(fileName)`：序列化當前 SVG

---

### `SvgSceneView.tsx` — Renderer + Pointer Interaction

**角色：** 將 drawables 渲染成 SVG 元素，並處理拖曳互動  
**負責：**

- render drawables → `<line/> <polyline/> <circle/> <text/>`
- `tspan` spans 支援（上標/下標）
- pointer events：
  - hit-test point/text
  - pointer capture
  - move 回報 local pixel 給 controller

**不負責：**

- 不做 econ 計算
- 不做 viewport mapping（只處理 local pixel）

---

### `AxesView.tsx` — Axes Renderer

**角色：** 座標軸與刻度渲染  
**負責：**

- 根據 viewport + ticks，畫 x/y 軸、tick lines、tick labels
- 顯示 `xLabel/yLabel`（可開關）

---

### `axesTicks.tsx` — Tick Helpers

**角色：** 刻度生成/顯示策略（工具）  
**負責：**

- tick 數值計算
- `TickVisibility`（顯示刻度線/刻度文字）
