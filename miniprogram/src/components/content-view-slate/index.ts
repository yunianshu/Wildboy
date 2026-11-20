Component({
  properties: { blocks: { type: Array, value: [] }, previewImages: Boolean },
  methods: {
    previewImage(event: WechatMiniprogram.TouchEvent) {
      if (!this.properties.previewImages) return;
      const urls = (this.properties.blocks as { type: string; url?: string }[])
        .filter((block) => block.type === "image" && block.url).map((block) => block.url!);
      const current = event.currentTarget.dataset.url;
      if (urls.includes(current)) wx.previewImage({ current, urls });
    },
  },
});
