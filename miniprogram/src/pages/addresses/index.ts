import {
  request,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { ShippingAddress } from "../../utils/models";
import { message, RequestEpoch } from "../../utils/domain";
import { validateShippingAddress } from "../../utils/addresses";
const epoch = new RequestEpoch();
const empty = () => ({
  recipientName: "",
  phone: "",
  address: "",
  isDefault: false,
});
import { enterPage } from "../../utils/page-motion";

Page({
  visible: false,
  mutation: 0,
  data: {
    pageMotionClass: "",
    selecting: false,
    selectedId: "",
    session: -1,
    loggedIn: false,
    items: [] as ShippingAddress[],
    loading: false,
    busy: false,
    locating: false,
    error: "",
    locationError: "",
    currentDefault: false,
    editing: false,
    editingId: "",
    draft: empty(),
  },
  onLoad(options: Record<string, string>) {
    this.setData({
      selecting: options.select === "1",
      selectedId: options.selected || "",
      session: sessionVersion(),
    });
  },
  onShow() {
    enterPage(this);
    this.visible = true;
    if (this.data.session !== sessionVersion()) {
      this.mutation++;
      this.setData({
        session: sessionVersion(),
        selectedId: "",
        busy: false,
        locating: false,
        locationError: "",
        editing: false,
        editingId: "",
        draft: empty(),
      });
    }
    void this.load();
  },
  onHide() {
    this.visible = false;
    epoch.invalidate();
    // The native map can hide this page until the user returns to the form.
    if (this.data.locating && isSessionCurrent(this.data.session)) {
      this.setData({ items: [] });
      return;
    }
    this.setData({
      items: [],
      editing: false,
      editingId: "",
      draft: empty(),
      error: "",
      locationError: "",
    });
  },
  onUnload() {
    this.visible = false;
    this.mutation++;
    epoch.invalidate();
    this.setData({ items: [], draft: empty() });
  },
  async load() {
    const n = epoch.next();
    const session = sessionVersion();
    this.setData({
      loggedIn: hasSession(),
      loading: hasSession(),
      error: "",
      items: [],
    });
    if (!hasSession()) return;
    try {
      const result = await request<{ items: ShippingAddress[] }>(
        "/me/addresses",
      );
      if (epoch.valid(n) && isSessionCurrent(session))
        this.setData({ items: result.items });
    } catch (error) {
      if (epoch.valid(n))
        this.setData({
          error: message(error),
          loggedIn: hasSession(),
          items: [],
        });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  add() {
    if (this.data.busy || this.data.locating || !hasSession()) return;
    this.setData({
      editing: true,
      editingId: "",
      currentDefault: false,
      draft: empty(),
      error: "",
      locationError: "",
    });
  },
  edit(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.locating) return;
    const item = this.data.items.find(
      (item) => item.id === event.currentTarget.dataset.id,
    );
    if (!item) return;
    this.setData({
      editing: true,
      editingId: item.id,
      currentDefault: item.isDefault,
      draft: {
        recipientName: item.recipientName,
        phone: item.phone,
        address: item.address,
        isDefault: item.isDefault,
      },
      error: "",
      locationError: "",
    });
  },
  cancel() {
    if (this.data.busy || this.data.locating) return;
    this.setData({ editing: false, editingId: "", draft: empty(), error: "", locationError: "" });
  },
  input(event: WechatMiniprogram.Input) {
    if (this.data.busy || !this.data.editing) return;
    const field = event.currentTarget.dataset.field;
    if (["recipientName", "phone", "address"].includes(field))
      this.setData({
        draft: { ...this.data.draft, [field]: event.detail.value },
        error: "",
        ...(field === "address" ? { locationError: "" } : {}),
      });
  },
  defaultChange(event: WechatMiniprogram.SwitchChange) {
    if (!this.data.busy && !this.data.currentDefault)
      this.setData({
        draft: { ...this.data.draft, isDefault: event.detail.value },
      });
  },
  async fillFromLocation() {
    if (
      !this.visible || !this.data.editing || this.data.busy ||
      this.data.locating || !isSessionCurrent(this.data.session) || !hasSession()
    ) return;
    const session = this.data.session;
    const operation = ++this.mutation;
    const previousAddress = this.data.draft.address;
    this.setData({ locating: true, error: "", locationError: "" });
    try {
      const place = await wx.chooseLocation({});
      if (operation !== this.mutation || !isSessionCurrent(session)) return;
      if (this.data.draft.address !== previousAddress) return;
      const address = typeof place?.address === "string" ? place.address.trim() : "";
      if (address.length < 5 || address.length > 300) {
        this.setData({ locationError: "地图未返回完整地址，请手动填写。" });
        return;
      }
      this.setData({ draft: { ...this.data.draft, address } });
    } catch (error) {
      if (operation !== this.mutation || !isSessionCurrent(session)) return;
      const detail = (error as { errMsg?: string } | null)?.errMsg ?? "";
      if (/cancel/i.test(detail)) return;
      this.setData({
        locationError: /auth deny/i.test(detail)
          ? "可在微信小程序设置中允许位置信息，也可以手动填写。"
          : "暂时无法从地图获取地址，请手动填写。",
      });
    } finally {
      if (operation === this.mutation) this.setData({ locating: false });
    }
  },
  async save() {
    if (this.data.busy || this.data.locating || !this.data.editing || !hasSession()) return;
    const draft = {
      ...this.data.draft,
      recipientName: this.data.draft.recipientName.trim(),
      phone: this.data.draft.phone.trim(),
      address: this.data.draft.address.trim(),
    };
    const invalid = validateShippingAddress(draft);
    if (invalid) {
      this.setData({ error: invalid });
      return;
    }
    const id = this.data.editingId;
    await this.mutate(async () =>
      request<ShippingAddress>(
        id ? `/me/addresses/${encodeURIComponent(id)}` : "/me/addresses",
        id ? "PUT" : "POST",
        draft,
      ),
      this.data.selecting,
    );
  },
  async remove(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
    const id = event.currentTarget.dataset.id;
    if (!this.data.items.some((item) => item.id === id)) return;
    const session = sessionVersion();
    let answer;
    try {
      answer = await wx.showModal({
        title: "删除这个地址？",
        content: "已下单的收货信息不受影响。",
      });
    } catch (error) {
      if (this.visible && isSessionCurrent(session))
        this.setData({ error: message(error) });
      return;
    }
    if (
      !answer.confirm ||
      !isSessionCurrent(session) ||
      !this.visible ||
      this.data.busy
    )
      return;
    await this.mutate(async () =>
      request<void>(`/me/addresses/${encodeURIComponent(id)}`, "DELETE"),
    );
  },
  async mutate(action: () => Promise<ShippingAddress | void>, selectSaved = false) {
    const session = sessionVersion();
    const operation = ++this.mutation;
    this.setData({ busy: true, error: "" });
    try {
      const saved = await action();
      if (isSessionCurrent(session) && operation === this.mutation) {
        this.setData({ editing: false, editingId: "", draft: empty() });
        if (this.visible && selectSaved && saved?.id) {
          this.getOpenerEventChannel?.().emit?.("addressSelected", { id: saved.id });
          wx.navigateBack();
          return;
        }
        if (this.visible) await this.load();
      }
    } catch (error) {
      if (this.visible && operation === this.mutation) {
        if (!hasSession())
          this.setData({
            loggedIn: false,
            items: [],
            editing: false,
            editingId: "",
            draft: empty(),
            error: message(error),
          });
        else if (isSessionCurrent(session))
          this.setData({ error: message(error) });
      }
    } finally {
      if (operation === this.mutation) this.setData({ busy: false });
    }
  },
  select(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.selecting ||
      this.data.busy ||
      !isSessionCurrent(this.data.session)
    )
      return;
    const id = event.currentTarget.dataset.id;
    if (!this.data.items.some((item) => item.id === id)) return;
    this.getOpenerEventChannel?.().emit?.("addressSelected", { id });
    wx.navigateBack();
  },
});
