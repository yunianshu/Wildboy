import { uploadImage } from "../../utils/content";
import { request, isSessionCurrent, ApiError } from "../../utils/api";
import { Product } from "../../utils/models";
import { message, safeId } from "../../utils/domain";
import { requireAdmin, presets } from "../admin-editor/shared";
import {
  emptyProduct,
  productForm,
  productInput,
} from "../../utils/admin-shop";
Page({
  data: {
    authorized: false,
    loading: false,
    saving: false,
    uncertainCreate: false,
    pendingSave: false,
    pendingConfirmed: false,
    error: "",
    id: "",
    version: 0,
    form: emptyProduct(),
    dirty: false,
    presets,
    statusLabels: ["下架", "上架"],
    statusIndex: 0,
  },
  _uploading: false,
  _alive: true,
  _epoch: 0,
  _session: -1,
  _loaded: false,
  _invalid: false,
  onLoad(options: Record<string, string>) {
    if (options.id) {
      const id = safeId(options.id);
      if (!id) {
        this._invalid = true;
        this.setData({ error: "商品链接无效" });
        return;
      }
      this.setData({ id });
    }
  },
  onShow() {
    void this.load();
  },
  onHide() {
    this._epoch++;
    this.setData({
      authorized: false,
      loading: false,
      saving: false,
      pendingSave: false,
      pendingConfirmed: false,
    });
  },
  onUnload() {
    this._alive = false;
    this._epoch++;
  },
  async load(force = false) {
    if (this._invalid) return;
    const n = ++this._epoch;
    this.setData({ loading: true, error: "" });
    try {
      const s = await requireAdmin();
      if (n !== this._epoch) return;
      if (this._session !== -1 && this._session !== s) {
        this._loaded = false;
        this.setData({ form: emptyProduct(), dirty: false });
        this.alert(false);
      }
      this._session = s;
      if (this.data.id && (!this._loaded || force)) {
        const all = await request<Product[]>("/admin/shop/products");
        if (n !== this._epoch || !isSessionCurrent(s)) return;
        const p = all.find((x) => x.id === this.data.id);
        if (!p) throw new Error("商品不存在，请返回列表");
        this.setData({
          form: productForm(p),
          version: p.version,
          statusIndex: p.status === "ON_SALE" ? 1 : 0,
          dirty: false,
        });
        this.alert(false);
      }
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      this._loaded = true;
      this.setData({ authorized: true });
    } catch (e) {
      if (n === this._epoch) {
        this.setData({ error: message(e), authorized: false });
        if (
          !isSessionCurrent(this._session) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403))
        ) {
          this._loaded = false;
          this.setData({ form: emptyProduct(), dirty: false });
          this.alert(false);
        }
      }
    } finally {
      if (n === this._epoch) this.setData({ loading: false });
    }
  },
  alert(on: boolean) {
    if (on && typeof wx.enableAlertBeforeUnload === "function")
      wx.enableAlertBeforeUnload({ message: "商品修改尚未保存" });
    else if (!on && typeof wx.disableAlertBeforeUnload === "function")
      wx.disableAlertBeforeUnload();
  },
  input(e: WechatMiniprogram.Input) {
    if (
      !this.data.authorized ||
      this.data.saving ||
      !isSessionCurrent(this._session)
    )
      return;
    const key = String(e.currentTarget.dataset.field);
    if (!["name", "description", "imageUrl", "price", "stock"].includes(key))
      return;
    this.setData({ [`form.${key}`]: e.detail.value, dirty: true });
    this.alert(true);
  },
  preset(e: WechatMiniprogram.TouchEvent) {
    const url = String(e.currentTarget.dataset.url);
    if (
      this.data.authorized &&
      !this.data.saving &&
      isSessionCurrent(this._session) &&
      presets.includes(url)
    ) {
      this.setData({ "form.imageUrl": url, dirty: true });
      this.alert(true);
    }
  },
  status(e: WechatMiniprogram.PickerChange) {
    if (
      !this.data.authorized ||
      this.data.saving ||
      !isSessionCurrent(this._session)
    )
      return;
    const i = Number(e.detail.value);
    if (i !== 0 && i !== 1) return;
    this.setData({
      statusIndex: i,
      "form.status": i ? "ON_SALE" : "OFF_SHELF",
      dirty: true,
    });
    this.alert(true);
  },
  editContent() { if (this.data.id && this.data.authorized && !this.data.saving) wx.navigateTo({url:`/pages/admin-content/index?id=${this.data.id}&kind=product`}); },
  async uploadCover() {
    if (!this.data.authorized || this.data.saving) return;
    if(this._uploading)return;
    this._uploading=true;
    const session=this._session;
    this.setData({error:""});
    try { const url=await uploadImage(); if(this._alive && isSessionCurrent(session)) {
      this.setData({"form.imageUrl":url,dirty:true});
      wx.enableAlertBeforeUnload({message:"有未保存修改"});
    } } catch(e) { if(this._alive && isSessionCurrent(session) && !message(e).includes("cancel")) this.setData({error:message(e)}); } finally {this._uploading=false;}
  },
  async reload() {
    if (this.data.saving) return;
    if (this.data.dirty) {
      const answer = await wx.showModal({
        title: "放弃本地修改？",
        content: "重新加载服务器上的商品，会丢弃尚未保存的内容。",
      });
      if (!answer.confirm) return;
    }
    void this.load(true);
  },
  login() {
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
  cancelSave() {
    this.setData({ pendingSave: false, pendingConfirmed: false });
  },
  confirmSave() {
    if (!this.data.pendingSave) return;
    this.setData({ pendingConfirmed: true });
    return this.save();
  },
  backToProducts() {
    wx.navigateBack();
  },
  async save() {
    if (
      this.data.saving ||
      this.data.uncertainCreate ||
      !this.data.authorized ||
      !isSessionCurrent(this._session)
    )
      return;
    const n = this._epoch,
      s = this._session;
    this.setData({ saving: true, error: "" });
    let creating = false;
    try {
      const body = productInput(
        this.data.form,
        this.data.id ? this.data.version : undefined,
      );
      if (!this.data.pendingSave || !this.data.pendingConfirmed) {
        this.setData({ pendingSave: true, pendingConfirmed: false });
        return;
      }
      this.setData({ pendingSave: false, pendingConfirmed: false });
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      creating = !this.data.id;
      // Preserve uncertainty across hide/show: the server may commit while this page is hidden.
      if (creating) this.setData({ uncertainCreate: true });
      const p = await request<Product>(
        this.data.id
          ? `/admin/shop/products/${this.data.id}`
          : "/admin/shop/products",
        this.data.id ? "PUT" : "POST",
        body,
      );
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      this.setData({
        id: p.id,
        uncertainCreate: false,
        version: p.version,
        form: productForm(p),
        statusIndex: p.status === "ON_SALE" ? 1 : 0,
        dirty: false,
      });
      this.alert(false);
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (e) {
      if (n === this._epoch) {
        if (creating && (!(e instanceof ApiError) || e.status >= 500)) {
          this.setData({
            uncertainCreate: true,
            error: "创建结果暂时无法确认，请先返回商品列表核对，不要重复创建。",
          });
          return;
        }
        if (creating) this.setData({ uncertainCreate: false });
        const denied =
          !isSessionCurrent(s) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403));
        this.setData({
          error:
            e instanceof ApiError && e.status === 409
              ? "商品或库存已变化。本地修改已保留，请核对后重新加载，不会覆盖新数据。"
              : message(e),
          ...(denied
            ? { authorized: false, form: emptyProduct(), dirty: false }
            : {}),
        });
        if (denied) {
          this._loaded = false;
          this.alert(false);
        }
      }
    } finally {
      if (n === this._epoch) this.setData({ saving: false });
    }
  },
});
