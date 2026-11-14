import { uploadImage } from "../../utils/content";
import { request, isSessionCurrent, mediaUrl, ApiError } from "../../utils/api";
import { Activity } from "../../utils/models";
import { message, safeId, categories } from "../../utils/domain";
import {
  requireAdmin,
  emptyForm,
  formFromActivity,
  buildInput,
  validateForm,
  presets,
  EditForm,
} from "../admin-editor/shared";
const UNCERTAIN_MESSAGE =
  "保存结果尚不确定，请返回管理列表核对，避免重复创建。";
import { enterPage } from "../../utils/page-motion";

export function parseActivityPrice(value: string): number {
  const amount = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amount))
    throw new Error("价格须为非负金额，最多两位小数");
  const [whole, fraction = ""] = amount.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100000000)
    throw new Error("价格须在 0–1000000 元之间");
  return cents;
}

Page({
  data: {
    pageMotionClass: "",
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
    price: "0.00",
    priceCents: 0,
    priceDirty: false,
    form: emptyForm(),
    cover: presets[1],
    presets,
    categories,
    categoryIndex: 0,
    section: 0,
    sections: ["基本信息", "时间与地点", "简介与详情"],
  },
  _uploading: false,
  _savingPrice: false,
  _alive: true,
  _epoch: 0,
  _visible: true as boolean,
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
    enterPage(this);
    this._visible = true;
    if (!this._invalid) void this.load(false);
  },
  onHide() {
    this._visible = false;
    const savingPrice = this._savingPrice;
    if (savingPrice) {
      this._epoch++;
      this._savingPrice = false;
      this._loaded = false;
    }
    // A creation still in flight turns uncertain here: the server may commit
    // while the page is hidden, so only the admin list can verify the outcome.
    this.setData({
      authorized: false,
      busy: false,
      confirming: false,
      publishConfirmed: false,
      ...(this.data.busy && !this.data.id ? { uncertain: true } : {}),
    });
  },
  onUnload() {
    this._alive = false;
    this._epoch++;
  },
  // Re-arms or clears this page's leave protection. Called only while this
  // page is visible so a hidden page can never clear another page's warning.
  rearmLeave() {
    if (this._visible === false) return;
    if (
      typeof wx.enableAlertBeforeUnload !== "function" ||
      typeof wx.disableAlertBeforeUnload !== "function"
    )
      return;
    if ((this.data.dirty || this.data.priceDirty) && !this.data.conflict && !this.data.uncertain)
      wx.enableAlertBeforeUnload({ message: "修改尚未保存，离开将丢失修改" });
    else wx.disableAlertBeforeUnload();
  },
  sectionChange(e: WechatMiniprogram.TouchEvent) {
    const section = Number(e.currentTarget.dataset.section);
    if (!Number.isInteger(section) || section < 0 || section > 2) return;
    this.setData({ section });
  },
  previousSection() {
    if (this.data.section > 0)
      this.setData({ section: this.data.section - 1 });
  },
  nextSection() {
    if (this.data.section < 2)
      this.setData({ section: this.data.section + 1 });
  },
  revealProblem(check: { section: number; error: string } | null): boolean {
    if (!check) return false;
    this.setData({ error: check.error, section: check.section });
    if (typeof wx.pageScrollTo === "function")
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    return true;
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
        this.setData({ form: emptyForm(), dirty: false, uncertain: false, price: "0.00", priceCents: 0, priceDirty: false });
        this._loaded = false;
      }
      if (this._loaded && !force && same) {
        // Returning to an untouched editor only revalidates the session and
        // restores this page's own leave protection for its current draft.
        this.rearmLeave();
        return;
      }
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
          price: (a.priceCents / 100).toFixed(2),
          priceCents: a.priceCents,
          priceDirty: false,
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
    this.rearmLeave();
  },
  priceInput(e: WechatMiniprogram.Input) {
    if (!this.data.authorized || this.data.busy || this.data.confirming || this.data.status !== "DRAFT" || this.data.registeredCount > 0) return;
    this.setData({ price: e.detail.value, priceDirty: true, error: "" });
    this.rearmLeave();
  },
  async savePrice() {
    const { id, version, authorized, busy, loading, conflict, uncertain, status, registeredCount, price } = this.data;
    if (!id || !authorized || busy || loading || conflict || uncertain || status !== "DRAFT" || registeredCount !== 0 || !isSessionCurrent(this._session)) return;
    let priceCents: number;
    try {
      priceCents = parseActivityPrice(price);
    } catch (error) {
      this.setData({ error: message(error), section: 0 });
      return;
    }
    const n = this._epoch, session = this._session;
    const current = () => this._alive && this._visible !== false && n === this._epoch && isSessionCurrent(session);
    this._savingPrice = true;
    this.setData({ busy: true, error: "" });
    try {
      const checked = await requireAdmin();
      if (!current() || checked !== session) return;
      const a = await request<Activity>(`/admin/activities/${id}/price`, "POST", { priceCents, version });
      if (!current()) return;
      if (!a || a.id !== id || a.priceCents !== priceCents || !Number.isSafeInteger(a.version) || a.version < version)
        throw new Error("价格保存结果未确认");
      this.setData({ price: (a.priceCents / 100).toFixed(2), priceCents: a.priceCents, priceDirty: false, version: a.version, status: a.status, registeredCount: a.registeredCount });
      this.rearmLeave();
      wx.showToast({ title: "价格已保存", icon: "success" });
    } catch (error) {
      if (!this._alive || n !== this._epoch) return;
      const denied = !isSessionCurrent(session) || (error instanceof ApiError && [401, 403].includes(error.status));
      const conflict = !denied && (!(error instanceof ApiError) || error.status === 409 || error.status === 0 || error.status >= 500);
      this.setData({ authorized: !denied, conflict,
        error: conflict ? "价格或保存结果待核对，请重新读取活动后再操作" : message(error),
        ...(denied ? { form: emptyForm(), dirty: false, price: "0.00", priceCents: 0, priceDirty: false } : {}) });
      this.rearmLeave();
    } finally {
      if (n === this._epoch && this._alive) {
        this._savingPrice = false;
        this.setData({ busy: false });
      }
    }
  },
  identityChange(e: WechatMiniprogram.SwitchChange) {
    // A queued identity switch must never touch a form that is saving or
    // whose authority is gone.
    if (this.data.busy || !this.data.authorized) return;
    this.setData({ "form.identityRequired": e.detail.value, dirty: true });
    this.rearmLeave();
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
  editContent() {
    if (this.data.id && this.data.authorized && !this.data.busy)
      wx.navigateTo({
        url: `/pages/admin-content/index?id=${this.data.id}&kind=activity`,
      });
  },
  async uploadCover() {
    if (!this.data.authorized || this.data.busy) return;
    if (this._uploading) return;
    this._uploading = true;
    const session = this._session;
    this.setData({ error: "" });
    try {
      const url = await uploadImage();
      // The result is kept even when the page hid mid-upload, but the leave
      // warning is only re-armed by this page while it is visible again.
      if (this._alive && isSessionCurrent(session)) {
        this.setData({
          "form.coverUrl": url,
          dirty: true,
          cover: mediaUrl(url),
        });
        if (this._visible !== false && typeof wx.enableAlertBeforeUnload === "function")
          wx.enableAlertBeforeUnload({ message: "有未保存修改" });
      }
    } catch (e) {
      if (
        this._alive &&
        isSessionCurrent(session) &&
        !message(e).includes("cancel")
      )
        this.setData({ error: message(e) });
    } finally {
      this._uploading = false;
    }
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
  // Shared write path for save / publish / save-and-edit-content. Returns the
  // saved activity, or null when the outcome is unknown or the write failed.
  async write(publish: boolean): Promise<Activity | null> {
    const n = this._epoch,
      session = this._session;
    this.setData({ busy: true, error: "" });
    let sent = false;
    try {
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(session)) return null;
      const creating = !this.data.id;
      const input = buildInput(this.data.form, this.data.registeredCount);
      // The request may reach the server and still fail observably, so the
      // uncertainty window opens the moment the write is sent.
      sent = true;
      let result = await request<Activity>(
        creating ? "/admin/activities" : `/admin/activities/${this.data.id}`,
        creating ? "POST" : "PUT",
        creating ? input : { ...input, version: this.data.version },
      );
      if (n !== this._epoch || !isSessionCurrent(session)) return null;
      if (publish) {
        result = await request<Activity>(
          `/admin/activities/${result.id}/publish`,
          "POST",
          { version: result.version },
        );
        if (n !== this._epoch || !isSessionCurrent(session)) return null;
      }
      // An uncertain creation keeps its draft until the admin list verifies it.
      if (this.data.uncertain) return null;
      this._loaded = true;
      this.setData({
        id: result.id,
        version: result.version,
        status: result.status,
        dirty: false,
      });
      this.rearmLeave();
      return result;
    } catch (error) {
      if (n !== this._epoch) return null;
      const denied =
        !isSessionCurrent(session) ||
        (error instanceof ApiError &&
          (error.status === 401 || error.status === 403));
      const conflict = error instanceof ApiError && error.status === 409;
      // Uncertainty requires a request that actually left: only then can the
      // server have applied it without this page knowing the outcome.
      const uncertain =
        sent &&
        !this.data.id &&
        !conflict &&
        !denied &&
        (!(error instanceof ApiError) ||
          error.status === 0 ||
          error.status >= 500);
      this.setData({
        error: conflict
          ? "活动已被修改或报名人数变化。请重新读取后再编辑，不会覆盖他人修改。"
          : uncertain
            ? UNCERTAIN_MESSAGE
            : message(error),
        conflict,
        uncertain,
        ...(denied
          ? { authorized: false, dirty: false, form: emptyForm() }
          : {}),
      });
      if (denied && typeof wx.disableAlertBeforeUnload === "function")
        wx.disableAlertBeforeUnload();
      return null;
    } finally {
      if (n === this._epoch) this.setData({ busy: false });
    }
  },
  blockedByUncertain(): boolean {
    if (this.data.uncertain) {
      this.setData({ error: UNCERTAIN_MESSAGE });
      return true;
    }
    return false;
  },
  async save(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.conflict) return;
    if (this.blockedByUncertain()) return;
    if (!this.data.authorized || !isSessionCurrent(this._session)) return;
    const publish = e?.currentTarget?.dataset?.action === "publish";
    if (publish) {
      try {
        if (parseActivityPrice(this.data.price) !== this.data.priceCents)
          throw new Error("价格尚未保存，请先保存草稿及价格后再发布");
      } catch (error) {
        this.revealProblem({ section: 0, error: message(error) });
        return;
      }
    }
    if (
      this.revealProblem(
        validateForm(this.data.form, this.data.registeredCount),
      )
    )
      return;
    if (publish && !this.data.publishConfirmed) {
      this.setData({ confirming: true, publishConfirmed: false });
      return;
    }
    if (publish) this.setData({ confirming: false, publishConfirmed: false });
    const saved = await this.write(publish);
    if (saved && this._visible !== false)
      wx.showToast({
        title: publish ? "活动已发布" : "保存成功",
        icon: "success",
      });
  },
  async saveAndEditContent() {
    if (this.data.busy || this.data.conflict) return;
    if (this.blockedByUncertain()) return;
    if (!this.data.authorized || !isSessionCurrent(this._session)) return;
    // Hidden fields still validate first; a failing field reveals its section
    // instead of navigating to the content editor.
    if (
      this.revealProblem(
        validateForm(this.data.form, this.data.registeredCount),
      )
    )
      return;
    const saved = await this.write(false);
    if (saved && this._visible !== false)
      wx.navigateTo({
        url: `/pages/admin-content/index?id=${saved.id}&kind=activity`,
      });
  },
});
