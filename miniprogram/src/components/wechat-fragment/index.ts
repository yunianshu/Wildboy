import { prepareWechatNodes, WechatRichTextNode } from "../../utils/wechat-rich-text";

Component({
  properties: {
    activityLayout: Boolean,
    nodes: {
      type: Array,
      value: [],
    },
  },
  observers: {
    'nodes, activityLayout'(nodes: WechatRichTextNode[], activityLayout: boolean) {
      this.setData({ renderNodes: prepareWechatNodes(nodes, activityLayout) });
    },
  },
  data: { renderNodes: [] as WechatRichTextNode[] },
});
