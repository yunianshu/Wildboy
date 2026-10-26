import { request } from "../../utils/api";
import { LegalCurrent, LegalDocument, versionsOf } from "../../utils/legal";
import { message } from "../../utils/domain";
Page({
  data: {
    document: null as LegalDocument | null,
    kind: "PRIVACY",
    version: 0,
    loading: true,
    error: "",
  },
  _epoch: 0,
  onLoad(o) {
    const kind =
      o.kind === undefined || o.kind === "PRIVACY"
        ? "PRIVACY"
        : o.kind === "TERMS"
          ? "TERMS"
          : "";
    const version = o.version === undefined ? 0 : Number(o.version);
    if (
      !kind ||
      !Number.isInteger(version) ||
      version < 0 ||
      (o.version !== undefined && version < 1)
    ) {
      this.setData({ loading: false, error: "协议链接无效" });
      return;
    }
    this.setData({ kind, version });
    void this.load();
  },
  onUnload() {
    this._epoch++;
  },
  async load() {
    const n = ++this._epoch;
    this.setData({ loading: true, error: "", document: null });
    try {
      let document: LegalDocument | null;
      if (this.data.version)
        document = await request<LegalDocument>(
          `/legal/${this.data.kind}/versions/${this.data.version}`,
        );
      else {
        const current = await request<LegalCurrent>("/legal/current");
        document =
          this.data.kind === "TERMS" ? current?.terms : current?.privacy;
      }
      if (
        !document ||
        document.kind !== this.data.kind ||
        !document.content?.trim() ||
        !Number.isInteger(document.version) ||
        (this.data.version && document.version !== this.data.version)
      )
        throw new Error("该协议尚未发布，请稍后再试");
      if (n !== this._epoch) return;
      this.setData({ document });
      if (typeof this.getOpenerEventChannel === "function")
        this.getOpenerEventChannel()?.emit?.("legalDocumentLoaded", {
          kind: document.kind,
          version: document.version,
        });
    } catch (e) {
      if (n === this._epoch) this.setData({ error: message(e) });
    } finally {
      if (n === this._epoch) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
});
