import { request, isSessionCurrent, ApiError } from "../../utils/api";
import { requireAdmin } from "../admin-editor/shared";
import { message } from "../../utils/domain";
type Kind = "PRIVACY" | "TERMS";
type LegalDocument = {
  kind: Kind;
  version: number;
  title: string;
  content: string;
  publishedAt: string;
};
type LegalState = {
  kind: Kind;
  draft: { title: string; content: string; revision: number };
  published: LegalDocument | null;
};
Page({
  data: {
    kind: "PRIVACY" as Kind,
    label: "隐私政策",
    authorized: false,
    loading: false,
    busy: false,
    error: "",
    notice: "",
    title: "",
    content: "",
    revision: 0,
    published: null as LegalDocument | null,
    history: [] as LegalDocument[],
    selected: null as LegalDocument | null,
    dirty: false,
    preview: false,
    conflict: false,
  },
  _epoch: 0,
  _session: -1,
  _savedTitle: "",
  _savedContent: "",
  onShow() {
    void this.load(false);
  },
  onHide() {
    this.setData({
      authorized: false,
      loading: false,
      busy: false,
      history: [],
      selected: null,
      preview: false,
    });
  },
  onUnload() {
    this._epoch++;
    this.alert(false);
  },
  alert(enabled: boolean) {
    if (enabled && wx.canIUse("enableAlertBeforeUnload"))
      wx.enableAlertBeforeUnload({ message: "协议修改尚未保存，确定离开？" });
    else if (!enabled && wx.canIUse("disableAlertBeforeUnload"))
      wx.disableAlertBeforeUnload();
  },
  clear() {
    this._epoch++;
    this._savedTitle = "";
    this._savedContent = "";
    this.alert(false);
    this.setData({
      authorized: false,
      loading: false,
      busy: false,
      title: "",
      content: "",
      revision: 0,
      published: null,
      history: [],
      selected: null,
      dirty: false,
      preview: false,
      conflict: false,
    });
  },
  live(n: number, session: number) {
    return n === this._epoch && isSessionCurrent(session);
  },
  fail(e: unknown) {
    if (
      !isSessionCurrent(this._session) ||
      (e instanceof ApiError && (e.status === 401 || e.status === 403))
    ) {
      this.clear();
      this.setData({ error: "管理身份已失效，请重新验证。" });
      return;
    }
    const conflict = e instanceof ApiError && e.status === 409;
    this.setData({
      conflict,
      error: conflict
        ? "版本已更新。当前输入已保留，请复制需要的内容，再重新加载；不会自动覆盖。"
        : message(e),
    });
  },
  async load(force = false) {
    const n = ++this._epoch;
    this.setData({ loading: true, error: "", notice: "" });
    try {
      const session = await requireAdmin();
      if (n !== this._epoch) return;
      const identityChanged = this._session !== session;
      this._session = session;
      const [state, history] = await Promise.all([
        request<LegalState>(`/admin/legal/${this.data.kind}`),
        request<LegalDocument[]>(`/admin/legal/${this.data.kind}/versions`),
      ]);
      if (!this.live(n, session)) return;
      if (!this.data.dirty || force || identityChanged) {
        this._savedTitle = state.draft.title;
        this._savedContent = state.draft.content;
        this.alert(false);
        this.setData({
          title: state.draft.title,
          content: state.draft.content,
          revision: state.draft.revision,
          dirty: false,
          conflict: false,
        });
      } else if (this.data.revision !== state.draft.revision) {
        this.setData({
          conflict: true,
          error: "草稿已在别处更新。请先复制需要的输入，再重新加载。",
        });
      }
      this.setData({ authorized: true, published: state.published, history });
    } catch (e) {
      if (n === this._epoch) this.fail(e);
    } finally {
      if (n === this._epoch) this.setData({ loading: false, busy: false });
    }
  },
  input(e: WechatMiniprogram.Input) {
    if (!this.data.authorized || this.data.busy) return;
    const field = e.currentTarget.dataset.field;
    if (field !== "title" && field !== "content") return;
    this.setData({ [field]: e.detail.value });
    const dirty =
      this.data.title !== this._savedTitle ||
      this.data.content !== this._savedContent;
    this.setData({ dirty });
    this.alert(dirty);
  },
  async switchKind(e: WechatMiniprogram.TouchEvent) {
    const kind = e.currentTarget.dataset.kind as Kind;
    if (
      !["PRIVACY", "TERMS"].includes(kind) ||
      kind === this.data.kind ||
      this.data.busy ||
      this.data.loading
    )
      return;
    const n = this._epoch;
    if (this.data.dirty) {
      const answer = await wx.showModal({
        title: "切换协议？",
        content: "当前修改尚未保存，切换将丢弃输入。",
      });
      if (!answer.confirm || n !== this._epoch) return;
    }
    this.clear();
    this.setData({ kind, label: kind === "PRIVACY" ? "隐私政策" : "用户协议" });
    await this.load(true);
  },
  async reload() {
    if (this.data.busy || this.data.loading) return;
    const n = this._epoch;
    if (this.data.dirty || this.data.conflict) {
      const answer = await wx.showModal({
        title: "重新加载？",
        content: "将丢弃当前未保存输入，请先复制需要保留的内容。",
      });
      if (!answer.confirm || n !== this._epoch) return;
    }
    await this.load(true);
  },
  valid() {
    const title = this.data.title.trim(),
      content = this.data.content.trim();
    if (
      !title ||
      title.length > 120 ||
      content.length < 10 ||
      content.length > 50000 ||
      /<\/?[a-z][^>]*>/i.test(content)
    ) {
      this.setData({
        error: "标题须为 1–120 字，正文须为 10–50000 字纯文本，不支持 HTML。",
      });
      return false;
    }
    return true;
  },
  async save() {
    if (
      this.data.busy ||
      this.data.loading ||
      !this.data.authorized ||
      this.data.conflict ||
      !this.valid()
    )
      return;
    const n = this._epoch,
      session = this._session,
      kind = this.data.kind;
    this.setData({ busy: true, error: "", notice: "" });
    try {
      await requireAdmin();
      if (!this.live(n, session)) return;
      await request(`/admin/legal/${kind}/draft`, "PUT", {
        title: this.data.title.trim(),
        content: this.data.content.trim(),
        revision: this.data.revision,
      });
      if (!this.live(n, session)) return;
      await this.load(true);
      if (isSessionCurrent(session) && this.data.authorized)
        this.setData({ notice: "草稿已保存，线上协议尚未改变。" });
    } catch (e) {
      if (n === this._epoch) this.fail(e);
    } finally {
      if (n === this._epoch) this.setData({ busy: false });
    }
  },
  async publish() {
    if (
      this.data.busy ||
      this.data.loading ||
      !this.data.authorized ||
      this.data.dirty ||
      this.data.conflict ||
      !this.valid()
    )
      return;
    const n = this._epoch,
      session = this._session,
      revision = this.data.revision,
      kind = this.data.kind;
    this.setData({ busy: true, error: "", notice: "" });
    try {
      const answer = await wx.showModal({
        title: "确认发布新版本？",
        content:
          "发布后立即生效，用户需重新确认。旧版本与同意记录保留。请确认内容已由运营方审核。",
        confirmText: "确认发布",
      });
      if (!answer.confirm || !this.live(n, session)) return;
      await requireAdmin();
      if (!this.live(n, session)) return;
      await request(`/admin/legal/${kind}/publish`, "POST", { revision });
      if (!this.live(n, session)) return;
      await this.load(true);
      if (isSessionCurrent(session) && this.data.authorized)
        this.setData({ notice: "新版本已发布，用户需重新确认。" });
    } catch (e) {
      if (n === this._epoch) this.fail(e);
    } finally {
      if (n === this._epoch) this.setData({ busy: false });
    }
  },
  togglePreview() {
    if (this.data.authorized)
      this.setData({ preview: !this.data.preview, selected: null });
  },
  viewHistory(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.authorized) return;
    const version = Number(e.currentTarget.dataset.version);
    const selected = this.data.history.find((x) => x.version === version);
    if (selected) this.setData({ selected, preview: false });
  },
  closeHistory() {
    this.setData({ selected: null });
  },
  login() {
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
});
