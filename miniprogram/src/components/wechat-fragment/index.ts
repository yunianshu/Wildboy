import { prepareWechatNodes, WechatRichTextNode } from "../../utils/wechat-rich-text";

Component({
  properties: {
    nodes: {
      type: Array,
      value: [],
      observer(value: WechatRichTextNode[]) {
        this.setData({ renderNodes: prepareWechatNodes(value) });
      },
    },
  },
  data: { renderNodes: [] as WechatRichTextNode[] },
});
