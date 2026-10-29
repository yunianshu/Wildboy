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
Page({
  visible: false,
  mutation: 0,
  data: {
    selecting: false,
    selectedId: "",
    session: -1,
    loggedIn: false,
    items: [] as ShippingAddress[],
    loading: false,
    busy: false,
    error: "",
    currentDefault: false,
    editing: false,
    editingId: "",
    draft: empty(),
  },
  onLoad(options: Record<string, string>) {
    this.setData({
      selecting: options.select === "1",
      selectedId: options.selected || "",
    });
  },
  onShow() {
    this.visible = true;
    if (this.data.session !== sessionVersion()) {
      this.mutation++;
      this.setData({
        session: sessionVersion(),
        selectedId: "",
        busy: false,
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
    this.setData({
      items: [],
      editing: false,
      editingId: "",
      draft: empty(),
      error: "",
    });
  },
  onUnload() {
    this.visible = false;
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
    if (this.data.busy || !hasSession()) return;
    this.setData({
      editing: true,
      editingId: "",
      currentDefault: false,
      draft: empty(),
      error: "",
    });
  },
  edit(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
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
    });
  },
  cancel() {
    if (this.data.busy) return;
    this.setData({ editing: false, editingId: "", draft: empty(), error: "" });
  },
  input(event: WechatMiniprogram.Input) {
    if (this.data.busy || !this.data.editing) return;
    const field = event.currentTarget.dataset.field;
    if (["recipientName", "phone", "address"].includes(field))
      this.setData({
        draft: { ...this.data.draft, [field]: event.detail.value },
        error: "",
      });
  },
  defaultChange(event: WechatMiniprogram.SwitchChange) {
    if (!this.data.busy && !this.data.currentDefault)
      this.setData({
        draft: { ...this.data.draft, isDefault: event.detail.value },
      });
  },
  async save() {
    if (this.data.busy || !this.data.editing || !hasSession()) return;
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
      request(`/me/addresses/${encodeURIComponent(id)}`, "DELETE"),
    );
  },
  async mutate(action: () => Promise<unknown>) {
    const session = sessionVersion();
    const operation = ++this.mutation;
    this.setData({ busy: true, error: "" });
    try {
      await action();
      if (isSessionCurrent(session) && operation === this.mutation) {
        this.setData({ editing: false, editingId: "", draft: empty() });
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
