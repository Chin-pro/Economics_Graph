Model：consumer.ts

Model→View 的轉換：Viewport.ts、ConsumerOptScene.ts

ViewModel / 契約：drawables.ts

View：SvgScene.tsx、Axes.tsx、ConsumerOptGraph.tsx（主要是 View）

Controller（還沒做出來）：未來會是 onChange/onMouse... 或 InteractionController.ts


```mermaid
flowchart LR
  %% ========== Actors ==========
  user([User])
  dev([Developer])

  %% ========== System boundary ==========
  subgraph SYS[Economics Graph Module]
    UC01((UC-01 Render Consumer Opt Graph))
    UC02((UC-02 Render Axes))

    UC01 -->|<<include>>| UC02
  end

  %% ========== Associations ==========
  user --- UC01
  dev --- UC01

```