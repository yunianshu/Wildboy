/**
 * miniprogram-api-typings@4.1.0 尚未声明 wx.openBusinessView（半屏/全屏打开微信业务组件，
 * 基础库 ≥2.6.0）。此处按官方文档补齐声明，供订单详情页调用 weappOrderConfirm 确认收货组件。
 */
declare namespace WechatMiniprogram {
  interface WxOpenBusinessViewResult {
    errCode?: number;
    errMsg?: string;
    /** 业务组件回传结果；weappOrderConfirm 在此携带 status: success/fail/cancel。 */
    extraData?: { status?: string; [key: string]: unknown };
  }

  interface WxOpenBusinessViewOption {
    /** 业务组件标识，如 weappOrderConfirm（小程序确认收货）。 */
    businessType: string;
    /** 传给业务组件的数据；weappOrderConfirm 使用 transaction_id 或 merchant_id+merchant_trade_no。 */
    extraData?: Record<string, string>;
    success?: (res: WxOpenBusinessViewResult) => void;
    fail?: (res: WxOpenBusinessViewResult) => void;
    complete?: () => void;
  }

  interface WxOpenOfficialAccountArticleOption {
    url: string;
    success?: (res: { errMsg?: string }) => void;
    fail?: (res: { errMsg?: string; errCode?: number }) => void;
    complete?: () => void;
  }

  interface Wx {
    openBusinessView(option: WxOpenBusinessViewOption): void;
    openOfficialAccountArticle?(option: WxOpenOfficialAccountArticleOption): void;
  }
}
