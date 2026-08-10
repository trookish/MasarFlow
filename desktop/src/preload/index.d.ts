import type { MasarFlowApi } from "./index";

declare global {
  interface Window {
    masarFlow: MasarFlowApi;
  }
}

export {};
