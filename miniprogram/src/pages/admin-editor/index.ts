import { request, isSessionCurrent, mediaUrl, ApiError } from "../../utils/api";
import { Activity } from "../../utils/models";
import { message, safeId, categories } from "../../utils/domain";
import {
  requireAdmin,
  emptyForm,
  formFromActivity,
  buildInput,
  presets,
  EditForm,
} from "../admin-editor/shared";
Page({
  data: {
    id: "",
    authorized: false,
    loading: false,
    busy: false,
    confirming: false,
    publishConfirmed: false,
    error: "",
    conflict: false,
    uncertain: false,
    dirty: false,
    status: "DRAFT",
    version: 0,
    registeredCount: 0,
    form: emptyForm(),
    cover: presets[1],
    presets,
    categories,
    categoryIndex: 0,
  },
  _epoch: 0,
  _session: -1,
  _loaded: false,
  _invalid: false,
  onLoad(query: Record<string, string>) {
    if (query.id && !safeId(query.id)) {
      this._invalid = true;
      this.setData({ error: "活动编号无效" });
      return;
    }
    this.setData({ id: safeId(query.id) });
  },
  onShow() {
    if (!this._invalid) void this.load(false);
  },
  onHide() {
    this.setData({
      authorized: false,
      busy: false,
      confirming: false,
      publishConfirmed: false,
      ...(this.data.busy && !this.data.id ? { uncertain: true } : {}),
    });
  },
  onUnload() {
    this._epoch++;
  },
  async load(force = false) {
    const n = ++this._epoch;
    this.setData({ loading: true, error: "" });
    try {
      const session = await requireAdmin();
      if (n !== this._epoch) return;
      const same = session === this._session;
      this._session = session;
      this.setData({ authorized: true });
      if (!same && this._loaded) {
        this.setData({ form: emptyForm(), dirty: false, uncertain: false });
        this._loaded = false;
      }
      if (this._loaded && !force && same) return;
      if (this.data.id) {
        const a = await request<Activity>(`/admin/activities/${this.data.id}`);
        if (n !== this._epoch || !isSessionCurrent(session)) return;
        if (a.status === "CANCELLED" || Date.parse(a.startAt) <= Date.now()) {
          this.setData({
            authorized: false,
            error: "活动已取消或已经开始，不能编辑",
          });
          return;
        }
        const form = formFromActivity(a);
        this.setData({
          form,
          status: a.status,
          version: a.version,
          registeredCount: a.registeredCount,
          cover: mediaUrl(a.coverUrl),
          categoryIndex: categories.findIndex((x) => x.code === a.category),
        });
      }
      if (n !== this._epoch || !isSessionCurrent(session)) return;
      this._loaded = true;
      this.setData({ dirty: false, conflict: false, uncertain: false });
      if (typeof wx.disableAlertBeforeUnload === "function")
        wx.disableAlertBeforeUnload();
    } catch (e) {
      if (n === this._epoch) {
        const denied =
          !isSessionCurrent(this._session) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403));
        this.setData({
          error: message(e),
          authorized: false,
          ...(denied ? { form: emptyForm(), dirty: false } : {}),
        });
        if (denied && typeof wx.disableAlertBeforeUnload === "function")
          wx.disableAlertBeforeUnload();
      }
    } finally {
      if (n === this._epoch) this.setData({ loading: false });
    }
  },
  markDirty() {
    this.setData({ dirty: true, error: "" });
    if (typeof wx.enableAlertBeforeUnload === "function")
      wx.enableAlertBeforeUnload({ message: "修改尚未保存，离开将丢失修改" });
  },
  input(e: WechatMiniprogram.Input) {
    if (this.data.busy || !this.data.authorized) return;
    const field = String(e.currentTarget.dataset.field);
    if (!Object.prototype.hasOwnProperty.call(this.data.form, field)) return;
    this.setData({ [`form.${field}`]: e.detail.value });
    if (field === "coverUrl") this.setData({ cover: mediaUrl(e.detail.value) });
    this.markDirty();
  },
  chooseDate(e: WechatMiniprogram.PickerChange) {
    if (this.data.busy || !this.data.authorized) return;
    const field = String(e.currentTarget.dataset.field);
    if (
      ![
        "startDate",
        "startTime",
        "endDate",
        "endTime",
        "deadlineDate",
        "deadlineTime",
      ].includes(field)
    )
      return;
    this.setData({ [`form.${field}`]: String(e.detail.value) });
    this.markDirty();
  },
  category(e: WechatMiniprogram.PickerChange) {
    if (this.data.busy || !this.data.authorized) return;
    const index = Number(e.detail.value);
    if (!categories[index]) return;
    this.setData({
      categoryIndex: index,
      "form.category": categories[index].code,
    });
    this.markDirty();
  },
  coverPreset(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || !this.data.authorized) return;
    const path = String(e.currentTarget.dataset.path);
    if (!presets.includes(path)) return;
    this.setData({ "form.coverUrl": path, cover: path });
    this.markDirty();
  },
  async reload() {
    if (this.data.busy) return;
    const n = this._epoch;
    const m = await wx.showModal({
      title: "重新读取活动？",
      content: "将丢弃本页未保存的修改，以服务器最新数据为准。",
    });
    if (m.confirm && n === this._epoch) await this.load(true);
  },
  retry() {
    void this.load(false);
  },
  login() {
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
  list() {
    wx.redirectTo({ url: "/pages/admin-activities/index" });
  },
  cancelPublish() {
    this.setData({ confirming: false, publishConfirmed: false });
  },
  confirmPublish() {
    this.setData({ publishConfirmed: true });
    return this.save({
      currentTarget: { dataset: { action: "publish" } },
    } as unknown as WechatMiniprogram.TouchEvent);
  },
  async save(e: WechatMiniprogram.TouchEvent) {
    if (
      this.data.busy ||
      !this.data.authorized ||
      this.data.conflict ||
      this.data.uncertain ||
      !isSessionCurrent(this._session)
    )
      return;
    const publish = e.currentTarget.dataset.action === "publish";
    let input: ReturnType<typeof buildInput>;
    try {
      input = buildInput(this.data.form, this.data.registeredCount);
    } catch (error) {
      this.setData({ error: message(error) });
      return;
    }
    if (publish && !this.data.publishConfirmed) {
      this.setData({ confirming: true, publishConfirmed: false });
      return;
    }
    if (publish) this.setData({ confirming: false, publishConfirmed: false });
    const n = this._epoch,
      session = this._session;
    this.setData({ busy: true, error: "" });
    try {
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(session)) return;
      const a = await request<Activity>(
        this.data.id
          ? `/admin/activities/${this.data.id}`
          : "/admin/activities",
        this.data.id ? "PUT" : "POST",
        { ...input, ...(this.data.id ? { version: this.data.version } : {}) },
      );
      if (n !== this._epoch || !isSessionCurrent(session)) return;
      this.setData({
        id: a.id,
        version: a.version,
        status: a.status,
        dirty: false,
      });
      this._loaded = true;
      if (typeof wx.disableAlertBeforeUnload === "function")
        wx.disableAlertBeforeUnload();
      if (publish) {
        const result = await request<Activity>(
          `/admin/activities/${a.id}/publish`,
          "POST",
          { version: a.version },
        );
        if (n !== this._epoch || !isSessionCurrent(session)) return;
        this.setData({ version: result.version, status: result.status });
      }
      wx.showToast({
        title: publish ? "活动已发布" : "保存成功",
        icon: "success",
      });
    } catch (error) {
      if (n !== this._epoch) return;
      const denied =
        !isSessionCurrent(session) ||
        (error instanceof ApiError &&
          (error.status === 401 || error.status === 403));
      const conflict = error instanceof ApiError && error.status === 409;
      const uncertain =
        !denied && !(error instanceof ApiError) && !this.data.id;
      this.setData({
        error: conflict
          ? "活动已被修改或报名人数变化。请重新读取后再编辑，不会覆盖他人修改。"
          : uncertain
            ? "保存结果尚不确定，请返回管理列表核对，避免重复创建。"
            : message(error),
        conflict,
        uncertain,
        ...(denied
          ? { authorized: false, dirty: false, form: emptyForm() }
          : {}),
      });
      if (denied && typeof wx.disableAlertBeforeUnload === "function")
        wx.disableAlertBeforeUnload();
    } finally {
      if (n === this._epoch) this.setData({ busy: false });
    }
  },
});
