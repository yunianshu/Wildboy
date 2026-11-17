Component({
  options: { multipleSlots: true, styleIsolation: "apply-shared" },
  properties: {
    title: { type: String, value: "" },
    busy: { type: Boolean, value: false },
    maskClosable: { type: Boolean, value: true },
  },
  methods: {
    close() {
      if (!this.data.busy) this.triggerEvent("close");
    },
    maskTap() {
      if (this.data.maskClosable) this.close();
    },
    stopEvent() {},
  },
});
