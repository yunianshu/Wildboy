// Set your owned HTTPS API origin before production. Never put AppSecret here.
// Two transports are supported:
// - "request": a filed HTTPS origin called with wx.request (needs ICP filing).
// - "anyservice": Tencent CloudBase AnyService called with wx.cloud.callContainer;
//   no domain name or ICP filing is required. See docs/anyservice.md.
export type ApiMode = "request" | "anyservice";
export const config: {
  apiOrigin: string;
  apiMode: ApiMode;
  anyServiceEnvId: string;
  anyServiceName: string;
  devLogin: boolean;
} = {
  apiOrigin: "https://api.example.invalid",
  apiMode: "anyservice",
  anyServiceEnvId: "magic-stoat-d0gklwuq0d9881bc5",
  anyServiceName: "wildboyapi",
  // Trial phase: the server runs the dev profile without WeChat credentials,
  // so develop-env previews log in through /auth/dev-login (server-gated to
  // the dev profile). Turn off once WECHAT_APP_ID/SECRET are configured.
  devLogin: true,
};
