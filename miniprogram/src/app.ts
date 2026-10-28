import { config } from "./config";

App({
  onLaunch() {
    // AnyService calls go through wx.cloud.callContainer, which needs the
    // CloudBase environment to be initialised once per launch.
    if (config.apiMode === "anyservice" && config.anyServiceEnvId)
      wx.cloud.init({ env: config.anyServiceEnvId, traceUser: true });
  },
});
