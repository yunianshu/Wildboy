// Markdown and imported WeChat fragments both arrive as structured server nodes.
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
