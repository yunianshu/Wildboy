import { createRouter, createWebHashHistory } from "vue-router";
import { currentUser } from "./api";
import LoginView from "./views/LoginView.vue";
import ActivitiesView from "./views/ActivitiesView.vue";
import BoardingPointSettingsView from "./views/BoardingPointSettingsView.vue";
import EditorView from "./views/EditorView.vue";
import RosterView from "./views/RosterView.vue";
import LegalView from "./views/LegalView.vue";
import ShopView from "./views/ShopView.vue";
import ProductContentView from "./views/ProductContentView.vue";
import UsersView from "./views/UsersView.vue";
import AdminAccountView from "./views/AdminAccountView.vue";
import OperationsView from "./views/OperationsView.vue";
import RefundsView from "./views/RefundsView.vue";
import NotificationsView from "./views/NotificationsView.vue";
import ArticlesView from "./views/ArticlesView.vue";
import ArticleEditorView from "./views/ArticleEditorView.vue";
import HomeLayoutView from "./views/HomeLayoutView.vue";
import SettingsView from "./views/SettingsView.vue";
import MembershipsView from "./views/MembershipsView.vue";
import ActivityOrdersView from "./views/ActivityOrdersView.vue";
import ShippingReportsView from "./views/ShippingReportsView.vue";
import MediaLibraryView from "./views/MediaLibraryView.vue";
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/login", component: LoginView },
    { path: "/", redirect: "/activities" },
    { path: "/activities", component: ActivitiesView },
    { path: "/boarding-points", component: BoardingPointSettingsView },
    { path: "/shop", component: ShopView },
    {
      path: "/shop/categories",
      redirect: (to) => ({
        path: "/shop",
        query: { ...to.query, tab: "products", manageCategories: "1" },
      }),
    },
    { path: "/shop/products/:id/edit", component: ProductContentView },
    { path: "/shop/products/:id/content", component: ProductContentView },
    { path: "/users", component: UsersView },
    { path: "/memberships", component: MembershipsView },
    { path: "/activity-orders", component: ActivityOrdersView },
    { path: "/waitlist", redirect: "/operations" },
    { path: "/operations", component: OperationsView },
    {
      path: "/operations/exceptions",
      component: OperationsView,
      props: { section: "exceptions" },
    },
    {
      path: "/operations/audit",
      component: OperationsView,
      props: { section: "audit" },
    },
    { path: "/refunds", component: RefundsView },
    { path: "/shipping-reports", component: ShippingReportsView },
    { path: "/notifications", component: NotificationsView },
    { path: "/legal", component: LegalView },
    { path: "/articles", component: ArticlesView },
    { path: "/articles/new", component: ArticleEditorView },
    { path: "/articles/:id/edit", component: ArticleEditorView },
    { path: "/media", component: MediaLibraryView },
    { path: "/home-layout", component: HomeLayoutView },
    { path: "/settings", component: SettingsView },
    { path: "/settings/admin-account", component: AdminAccountView },
    { path: "/activities/new", component: EditorView },
    { path: "/activities/:id/edit", component: EditorView },
    { path: "/activities/:id/registrations", component: RosterView },
    { path: "/:pathMatch(.*)*", redirect: "/activities" },
  ],
});
router.beforeEach((to) => {
  if (to.path !== "/login" && !currentUser.value)
    return { path: "/login", query: { redirect: to.fullPath } };
  if (to.path === "/login" && currentUser.value) return "/activities";
});
