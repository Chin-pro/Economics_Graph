/* App.tsx */
//  - 全域入口 UI + state (I、a、...) + slider 事件

import { useState } from "react";
import { ConsumerOptGraph } from "./graphs/consumer/ConsumerOptGraph";
import "./App.css";

export default function App() {
  const [I, setI] = useState(20);
  const [a, setA] = useState(0.5);

  const px = 1;
  const py = 1;

  return (
    <div style={{ padding: 16 }}>
      <h2>Consumer Optimum (Cobb-Douglas)</h2>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div>
          <div style={{ marginBottom: 12 }}>
            <label>
              Income I: {I}
              <input
                type="range"
                min={5}
                max={60}
                value={I}
                onChange={(e) => setI(Number(e.target.value))}
              />
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>
              a (x exponent): {a.toFixed(2)}
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.01}
                value={a}
                onChange={(e) => setA(Number(e.target.value))}
              />
            </label>
          </div>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            px = {px}, py = {py}
          </div>
        </div>

        <ConsumerOptGraph I={I} px={px} py={py} a={a} onAChange={setA} />
      </div>
    </div>
  );
}
