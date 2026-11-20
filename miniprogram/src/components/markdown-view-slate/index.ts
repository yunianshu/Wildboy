// 文章 Markdown 结构化节点渲染：仅原生组件，不使用 rich-text/web-view。
// 节点由服务端 commonmark 解析生成（type: heading|paragraph|image|list|
// code|table|hr；引文块带 quote 标记扁平输出；行内 spans: text|bold|italic|code|link）。
Component({
  properties: { nodes: { type: Array, value: [] }, previewImages: Boolean },
  methods: {
    previewImage(event: WechatMiniprogram.TouchEvent) {
      if (!this.properties.previewImages) return;
      const urls = (this.properties.nodes as { type: string; url?: string }[])
        .filter((node) => node.type === "image" && node.url).map((node) => node.url!);
      const current = event.currentTarget.dataset.url;
      if (urls.includes(current)) wx.previewImage({ current, urls });
    },
  },
});
