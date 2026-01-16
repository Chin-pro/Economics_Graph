// src/features/consumerOpt/module.ts
// ------------------------------------------------------------
// ConsumerOpt FeatureModule (Step 1: 先把介面釘死，不改功能)
// ------------------------------------------------------------

import React from "react";

import type { FeatureInitBase, FeatureModule, FeatureRootProps } from "../types";

import type { ConsumerParams } from "./model/ConsumerOptModel";
import { ConsumerOptController } from "./controller/ConsumerOptController";
import { ConsumerOptModel } from "./model/ConsumerOptModel";
import { ConsumerOptRoot } from "./ui/ConsumerOptRoot";

// ConsumerOptInit：讓 app 可選擇覆蓋初始參數
export type ConsumerOptInit = FeatureInitBase & {
  initialParams?: ConsumerParams;
};

// feature 層預設 initial（避免反向依賴 app/controlPanel）
const DEFAULT_INITIAL_PARAMS: ConsumerParams = {
  I: 20,
  exponent: 0.5,
  px: 1,
  py: 1,
};

export const consumerOptModule: FeatureModule<ConsumerOptController, ConsumerOptInit> = {
  id: "consumerOpt",
  createController(init: ConsumerOptInit): ConsumerOptController {
    const initial = init.initialParams ? init.initialParams : DEFAULT_INITIAL_PARAMS;

    const model = new ConsumerOptModel(initial);

    const controller = new ConsumerOptController({
      innerAvailWidth: init.innerAvailWidth,
      innerAvailHeight: init.innerAvailHeight,
      model: model,
    });

    return controller;
  },

  // ----------------------------------------------------------
  // Root（Step 2.5）
  // - App 不知道 consumerOpt 的 UI 組成；由 feature 自己提供 Root UI
  // - 這裡用 adapter 把 FeatureController cast 回 ConsumerOptController
  // ----------------------------------------------------------
  Root(props: FeatureRootProps) {
    const c = props.controller as ConsumerOptController;
    return React.createElement(ConsumerOptRoot, { controller: c });
  },
};
