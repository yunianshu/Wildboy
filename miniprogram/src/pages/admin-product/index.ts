import { uploadImage } from "../../utils/content";
import { request, isSessionCurrent, mediaUrl, ApiError } from "../../utils/api";
import { Product } from "../../utils/models";
import { message, safeId } from "../../utils/domain";
import { requireAdmin, presets } from "../admin-editor/shared";
import {
  emptyProduct,
  productForm,
  productInput,
  categoryInput,
  ProductDraft,
} from "../../utils/admin-shop";
type AdminCategory = {
  id: string;
  name: string;
  sortOrder: number;
  version: number;
  productCount: number;
};
const UNCERTAIN_CREATE =
  "创建结果暂时无法确认，请先返回商品列表核对，不要重复创建。";
const UNCERTAIN_CATEGORY =
  "分类创建结果尚不确定，请先重新加载分类列表核对，避免重复创建。";
const CATEGORY_BLOCKED_SAVE =
  "商品保存前需要成功加载分类列表，请先在分类区重试到成功加载分类。";
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
    authorized: false,
    authRequired: false,
    loading: false,
    saving: false,
    loadFailed: false,
    uncertainCreate: false,
    pendingSave: false,
    pendingConfirmed: false,
    error: "",
    id: "",
    version: 0,
    form: emptyProduct() as ProductDraft,
    dirty: false,
    conflict: false,
    coverPreview: "",
    presets,
    statusLabels: ["下架", "上架"],
    statusIndex: 0,
    categoryName: "",
    categories: [] as AdminCategory[],
    categoriesError: "",
    categoryManagerOpen: false,
    categoryMode: "new" as "new" | "edit",
    categoryForm: { name: "", sortOrder: "0" },
    categoryVersion: 0,
    categoryDirty: false,
    categoryConflict: false,
    categoryUncertain: false,
    categoryError: "",
  },
  _uploading: false,
  _alive: true,
  _epoch: 0,
  _visible: true as boolean,
  _session: -1,
  _loaded: false,
  _loadedCategories: false,
  _invalid: false,
  _originalTouched: false,
  _categoryId: "",
  _categorySaving: false,
  _authority: 0,
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
    enterPage(this);
    this._visible = true;
    void this.load();
  },
  onHide() {
    this._visible = false;
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
  // Revoked authority clears both drafts and every pending confirmation; the
  // counter invalidates reads that were already in flight.
  revoke() {
    this._authority++;
    this._loaded = false;
    this._loadedCategories = false;
    this._originalTouched = true;
    this.setData({
      authorized: false,
      authRequired: true,
      loading: false,
      saving: false,
      form: emptyProduct() as ProductDraft,
      dirty: false,
      conflict: false,
      pendingSave: false,
      pendingConfirmed: false,
      uncertainCreate: false,
      categoryForm: { name: "", sortOrder: "0" },
      categoryDirty: false,
      categoryConflict: false,
      categoryUncertain: false,
      categoryError: "",
      categoryManagerOpen: false,
    });
    this.armLeave();
  },
  // Leave protection belongs to the page currently on screen: a hidden page
  // never enables or disables the warning.
  armLeave() {
    if (this._visible === false) return;
    if (
      typeof wx.enableAlertBeforeUnload !== "function" ||
      typeof wx.disableAlertBeforeUnload !== "function"
    )
      return;
    if (
      (this.data.dirty || this.data.categoryDirty) &&
      !this.data.conflict &&
      !this.data.categoryConflict
    )
      wx.enableAlertBeforeUnload({ message: "商品或分类修改尚未保存" });
    else wx.disableAlertBeforeUnload();
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
        this._loadedCategories = false;
        this._originalTouched = true;
        this.setData({
          form: emptyProduct() as ProductDraft,
          dirty: false,
          conflict: false,
          pendingSave: false,
          pendingConfirmed: false,
          uncertainCreate: false,
        });
        this.armLeave();
      }
      this._session = s;
      const firstLoad = !this._loaded;
      const authority = this._authority;
      let fetched = false;
      if (this.data.id && (!this._loaded || force)) {
        fetched = true;
        const all = await request<Product[]>("/admin/shop/products");
        // A permission revoked by a simultaneous read invalidates this reload.
        if (
          n !== this._epoch ||
          !isSessionCurrent(s) ||
          authority !== this._authority
        )
          return;
        const p = all.find((x) => x.id === this.data.id);
        if (!p) throw new Error("商品不存在，请返回列表");
        this._originalTouched = true;
        this.setData({
          form: productForm(p),
          version: p.version,
          statusIndex: p.status === "ON_SALE" ? 1 : 0,
          categoryName: p.categoryName || "",
          coverPreview: mediaUrl(p.imageUrl),
          dirty: false,
          conflict: false,
          pendingSave: false,
          pendingConfirmed: false,
          uncertainCreate: false,
          loadFailed: false,
        });
        this.armLeave();
      }
      this._loaded = true;
      this.setData({ authorized: true, authRequired: false, loadFailed: false });
      if (!fetched) this.armLeave();
      if (firstLoad) await this.loadCategories();
    } catch (e) {
      if (n === this._epoch) {
        const denied =
          !isSessionCurrent(this._session) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403));
        this.setData({
          error: message(e),
          authorized: false,
          ...(this.data.id ? { loadFailed: true } : {}),
        });
        if (denied) this.revoke();
      }
    } finally {
      if (n === this._epoch) this.setData({ loading: false });
    }
  },
  async loadCategories() {
    try {
      const list = await request<AdminCategory[]>("/admin/shop/categories");
      if (!isSessionCurrent(this._session)) return;
      if (!Array.isArray(list)) {
        this.setData({ categories: [], categoriesError: "" });
        return;
      }
      const categories = list.filter(
        (c) =>
          c &&
          typeof c.id === "string" &&
          c.id &&
          typeof c.name === "string",
      );
      this._loadedCategories = true;
      this.setData({
        categories,
        categoriesError: "",
        categoryName:
          categories.find((c) => c.id === this.data.form.categoryId)?.name ||
          this.data.categoryName,
      });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        this.revoke();
        return;
      }
      if (!isSessionCurrent(this._session)) return;
      // A failed category read never hides an already loaded product.
      this.setData({ categoriesError: message(e) });
    }
  },
  retryLoad() {
    return this.load();
  },
  alert(on: boolean) {
    if (on) this.armLeave();
    else if (typeof wx.disableAlertBeforeUnload === "function")
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
    if (
      !["name", "description", "imageUrl", "price", "originalPrice", "stock"].includes(
        key,
      )
    )
      return;
    const value = String(e.detail.value);
    const patch: Record<string, unknown> = {
      [`form.${key}`]: value,
      dirty: true,
      pendingSave: false,
      pendingConfirmed: false,
    };
    if (key === "imageUrl") patch.coverPreview = mediaUrl(value);
    // A new product keeps its original price following the current price until
    // the original price field is edited explicitly.
    if (key === "price" && !this.data.id && !this._originalTouched)
      patch["form.originalPrice"] = value;
    if (key === "originalPrice") this._originalTouched = true;
    this.setData(patch);
    this.armLeave();
  },
  preset(e: WechatMiniprogram.TouchEvent) {
    const url = String(e.currentTarget.dataset.url);
    if (
      this.data.authorized &&
      !this.data.saving &&
      isSessionCurrent(this._session) &&
      presets.includes(url)
    ) {
      this.setData({
        "form.imageUrl": url,
        coverPreview: mediaUrl(url),
        dirty: true,
        pendingSave: false,
        pendingConfirmed: false,
      });
      this.armLeave();
    }
  },
  chooseStatus(e: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.authorized ||
      this.data.saving ||
      !isSessionCurrent(this._session)
    )
      return;
    const index = Number(e.currentTarget.dataset.index);
    if (index !== 0 && index !== 1) return;
    this.setData({
      statusIndex: index,
      "form.status": index ? "ON_SALE" : "OFF_SHELF",
      dirty: true,
      pendingSave: false,
      pendingConfirmed: false,
    });
    this.armLeave();
  },
  chooseCategory(e: WechatMiniprogram.PickerChange) {
    if (
      !this.data.authorized ||
      this.data.saving ||
      !isSessionCurrent(this._session)
    )
      return;
    const index = Number(e.detail.value);
    const found = this.data.categories[index];
    if (!Number.isInteger(index) || !found) return;
    if (this.data.form.categoryId === found.id) return;
    this.setData({
      "form.categoryId": found.id,
      categoryName: found.name,
      dirty: true,
      pendingSave: false,
      pendingConfirmed: false,
    });
    this.armLeave();
  },
  editContent() {
    if (this.data.id && this.data.authorized && !this.data.saving)
      wx.navigateTo({
        url: `/pages/admin-content/index?id=${this.data.id}&kind=product`,
      });
  },
  async uploadCover() {
    if (!this.data.authorized || this.data.saving) return;
    if (this._uploading) return;
    this._uploading = true;
    const session = this._session;
    this.setData({ error: "" });
    try {
      const url = await uploadImage();
      // The local image is kept even when the page hid mid-upload; only this
      // visible page re-arms its own leave protection.
      if (this._alive && isSessionCurrent(session)) {
        this.setData({
          "form.imageUrl": url,
          coverPreview: mediaUrl(url),
          dirty: true,
          pendingSave: false,
          pendingConfirmed: false,
        });
        this.armLeave();
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
    if (this.data.saving) return;
    const n = this._epoch;
    if (this.data.dirty || this.data.conflict) {
      const answer = await wx.showModal({
        title: "放弃本地修改？",
        content: "重新加载服务器上的商品，会丢弃尚未保存的内容。",
      });
      if (!answer.confirm || n !== this._epoch) return;
    }
    if (this._visible === false) return;
    await this.load(true);
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
      !this.data.authorized ||
      !isSessionCurrent(this._session)
    )
      return;
    if (this.data.conflict) return;
    if (this.data.uncertainCreate) {
      this.setData({ error: UNCERTAIN_CREATE });
      return;
    }
    if (this.data.categoriesError) {
      this.setData({ error: CATEGORY_BLOCKED_SAVE });
      return;
    }
    let body: ReturnType<typeof productInput>;
    try {
      body = productInput(
        this.data.form,
        this.data.id ? this.data.version : undefined,
      );
    } catch (e) {
      this.setData({ error: message(e) });
      return;
    }
    if (!this.data.pendingSave || !this.data.pendingConfirmed) {
      this.setData({ pendingSave: true, pendingConfirmed: false, error: "" });
      return;
    }
    const n = this._epoch,
      s = this._session,
      creating = !this.data.id;
    this.setData({
      saving: true,
      error: "",
      pendingSave: false,
      pendingConfirmed: false,
    });
    // Preserve uncertainty across hide/show: the server may commit while this
    // page is hidden, so only a verified list response clears it.
    if (creating) this.setData({ uncertainCreate: true });
    try {
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      const p = await request<Product>(
        this.data.id
          ? `/admin/shop/products/${this.data.id}`
          : "/admin/shop/products",
        this.data.id ? "PUT" : "POST",
        body,
      );
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      // A hidden creation stays uncertain until the list verifies the outcome.
      if (creating && this._visible === false) return;
      this._originalTouched = true;
      this.setData({
        id: p.id,
        uncertainCreate: false,
        version: p.version,
        form: productForm(p),
        statusIndex: p.status === "ON_SALE" ? 1 : 0,
        categoryName: p.categoryName || this.data.categoryName,
        coverPreview: mediaUrl(p.imageUrl),
        dirty: false,
        conflict: false,
      });
      this.armLeave();
      if (this._visible !== false)
        wx.showToast({ title: "已保存", icon: "success" });
    } catch (e) {
      if (n === this._epoch) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          this.revoke();
          return;
        }
        if (
          creating &&
          (!(e instanceof ApiError) || e.status === 0 || e.status >= 500)
        ) {
          this.setData({ uncertainCreate: true, error: UNCERTAIN_CREATE });
          return;
        }
        if (creating) this.setData({ uncertainCreate: false });
        if (e instanceof ApiError && e.status === 409) {
          this.setData({
            conflict: true,
            error:
              "商品或库存已变化。本地修改已保留，请核对后重新加载，不会覆盖新数据。",
          });
          return;
        }
        this.setData({ error: message(e) });
      }
    } finally {
      if (n === this._epoch) this.setData({ saving: false });
    }
  },
  // ---- Category manager -------------------------------------------------
  toggleCategoryManager() {
    // An unresolved creation must be reconciled through the list first.
    if (this.data.categoryUncertain || this._categorySaving) return;
    this.setData({
      categoryManagerOpen: !this.data.categoryManagerOpen,
      categoryError: "",
    });
  },
  newCategory() {
    if (!this.data.authorized || this.data.saving) return;
    this._categoryId = "";
    this.setData({
      categoryMode: "new",
      categoryForm: { name: "", sortOrder: "0" },
      categoryVersion: 0,
      categoryDirty: false,
      categoryConflict: false,
      categoryError: "",
      categoryUncertain: false,
    });
  },
  chooseManagedCategory(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    const found = this.data.categories[index];
    if (!Number.isInteger(index) || !found) return;
    this._categoryId = found.id;
  },
  editCategory() {
    if (!this.data.authorized || this.data.saving) return;
    // Defaults to the product's own category so the managed id is never guessed.
    const target = this.data.categories.find(
      (c) => c.id === (this._categoryId || this.data.form.categoryId),
    );
    if (!target) {
      this.setData({ categoryError: "请先选择要编辑的分类" });
      return;
    }
    this._categoryId = target.id;
    this.setData({
      categoryManagerOpen: true,
      categoryMode: "edit",
      categoryForm: { name: target.name, sortOrder: String(target.sortOrder) },
      categoryVersion: target.version,
      categoryDirty: false,
      categoryConflict: false,
      categoryError: "",
      categoryUncertain: false,
    });
  },
  categoryInput(e: WechatMiniprogram.Input) {
    const field = String(e.currentTarget.dataset.field);
    if (field !== "name" && field !== "sortOrder") return;
    this.setData({
      [`categoryForm.${field}`]: String(e.detail.value),
      categoryDirty: true,
      categoryError: "",
    });
  },
  applyCategory(saved: AdminCategory, editing: boolean) {
    const categories = this.data.categories
      .filter((c) => c.id !== saved.id)
      .concat({ ...saved })
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const patch: Record<string, unknown> = {
      categories,
      categoriesError: "",
      categoryUncertain: false,
      categoryError: "",
    };
    if (editing) {
      patch.categoryForm = {
        name: saved.name,
        sortOrder: String(saved.sortOrder),
      };
      patch.categoryVersion = saved.version;
      patch.categoryDirty = false;
      patch.categoryConflict = false;
      if (this.data.form.categoryId === saved.id)
        patch.categoryName = saved.name;
    } else {
      patch.categoryForm = { name: "", sortOrder: "0" };
      patch.categoryDirty = false;
      patch.categoryConflict = false;
      patch.categoryManagerOpen = false;
      // The created category is authoritative: select it for the draft.
      if (this.data.form.categoryId !== saved.id) {
        patch["form.categoryId"] = saved.id;
        patch.categoryName = saved.name;
        patch.dirty = true;
        patch.pendingSave = false;
        patch.pendingConfirmed = false;
      }
    }
    this.setData(patch);
    this.armLeave();
    if (!editing && this._visible !== false)
      wx.showToast({ title: "分类已创建", icon: "success" });
  },
  async saveCategory() {
    if (
      this._categorySaving ||
      !this.data.authorized ||
      !isSessionCurrent(this._session)
    )
      return;
    if (this.data.categoryConflict) return;
    if (this.data.categoryUncertain) {
      this.setData({ categoryError: UNCERTAIN_CATEGORY });
      return;
    }
    const editing = this.data.categoryMode === "edit" && !!this._categoryId;
    let body: ReturnType<typeof categoryInput>;
    try {
      body = categoryInput(
        this.data.categoryForm,
        editing ? this.data.categoryVersion : undefined,
      );
    } catch (e) {
      this.setData({ categoryError: message(e) });
      return;
    }
    const n = this._epoch,
      session = this._session,
      targetId = this._categoryId;
    this._categorySaving = true;
    this.setData({ categoryError: "" });
    try {
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(session)) {
        this.revoke();
        return;
      }
      if (!editing) this.setData({ categoryUncertain: true });
      const saved = await request<AdminCategory>(
        editing
          ? `/admin/shop/categories/${targetId}`
          : "/admin/shop/categories",
        editing ? "PUT" : "POST",
        body,
      );
      if (n !== this._epoch || !isSessionCurrent(session)) return;
      if (!editing && this._visible === false) return;
      this.applyCategory(saved, editing);
    } catch (e) {
      if (n !== this._epoch) return;
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        this.revoke();
        return;
      }
      if (!editing) {
        if (
          !(e instanceof ApiError) ||
          e.status === 0 ||
          e.status >= 500
        ) {
          this.setData({ categoryUncertain: true, categoryError: UNCERTAIN_CATEGORY });
          return;
        }
        if (e.code === "CATEGORY_NAME_EXISTS") {
          // A known duplicate stays correctable: no stale-version lock.
          this.setData({
            categoryUncertain: false,
            categoryError: "分类名称已存在，请换个名称后再保存。",
          });
          return;
        }
      }
      if (e instanceof ApiError && e.status === 409) {
        this.setData({
          categoryConflict: true,
          categoryError: "分类已被他人修改，请重新加载分类后再编辑。",
        });
        return;
      }
      this.setData({ categoryError: message(e) });
    } finally {
      this._categorySaving = false;
      if (n === this._epoch) this.setData({ saving: false });
    }
  },
  async reloadCategory() {
    if (this._categorySaving || this.data.saving) return;
    const n = this._epoch;
    if (
      this.data.categoryDirty ||
      this.data.categoryConflict ||
      this.data.categoryUncertain
    ) {
      const answer = await wx.showModal({
        title: "重新加载分类？",
        content: "将丢弃未保存的分类修改，以服务器最新数据为准。",
      });
      if (!answer.confirm || n !== this._epoch) return;
    }
    if (this._visible === false) return;
    try {
      const list = await request<AdminCategory[]>("/admin/shop/categories");
      if (
        n !== this._epoch ||
        !isSessionCurrent(this._session) ||
        (this._visible as boolean) === false
      )
        return;
      if (!Array.isArray(list)) throw new Error("分类数据异常，请稍后重试");
      const categories = list.filter(
        (c) => c && typeof c.id === "string" && c.id && typeof c.name === "string",
      );
      this._loadedCategories = true;
      const patch: Record<string, unknown> = {
        categories,
        categoriesError: "",
        categoryName:
          categories.find((c) => c.id === this.data.form.categoryId)?.name ||
          this.data.categoryName,
      };
      if (this.data.categoryUncertain) {
        // Reconcile an uncertain creation against the latest list by its name.
        const attempted = this.data.categoryForm.name.trim();
        const found = categories.find((c) => c.name === attempted);
        if (found) {
          patch.categoryUncertain = false;
          patch.categoryForm = { name: "", sortOrder: "0" };
          patch.categoryDirty = false;
          patch.categoryConflict = false;
          if (this.data.form.categoryId !== found.id) {
            patch["form.categoryId"] = found.id;
            patch.categoryName = found.name;
            patch.dirty = true;
            patch.pendingSave = false;
          }
        } else {
          // Nothing matches: keep the draft and require explicit review.
          patch.categoryUncertain = false;
          patch.categoryDirty = true;
        }
      } else if (this.data.categoryConflict || this.data.categoryMode === "edit") {
        const target = categories.find((c) => c.id === this._categoryId) || null;
        if (target) {
          patch.categoryForm = {
            name: target.name,
            sortOrder: String(target.sortOrder),
          };
          patch.categoryVersion = target.version;
          patch.categoryConflict = false;
        }
      }
      this.setData(patch);
      this.armLeave();
    } catch (e) {
      if (!isSessionCurrent(this._session)) return;
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        this.revoke();
        return;
      }
      // A failed reload keeps both drafts and the conflict untouched.
    }
  },
});
