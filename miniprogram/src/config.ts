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
  devLogin: false,
};
