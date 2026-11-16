import { createRouter, createWebHashHistory } from "vue-router";
import { currentUser } from "./api";
import LoginView from "./views/LoginView.vue";
import ActivitiesView from "./views/ActivitiesView.vue";
import EditorView from "./views/EditorView.vue";
import RosterView from "./views/RosterView.vue";
import LegalView from "./views/LegalView.vue";
import ShopView from "./views/ShopView.vue";
import ProductCategoriesView from "./views/ProductCategoriesView.vue";
import UsersView from "./views/UsersView.vue";
import AdminAccountView from "./views/AdminAccountView.vue";
import TemplatesView from "./views/TemplatesView.vue";
import OperationsView from "./views/OperationsView.vue";
import RefundsView from "./views/RefundsView.vue";
import NotificationsView from "./views/NotificationsView.vue";
import ArticlesView from "./views/ArticlesView.vue";
import ArticleEditorView from "./views/ArticleEditorView.vue";
import SettingsView from "./views/SettingsView.vue";
import MembershipsView from "./views/MembershipsView.vue";
import ActivityOrdersView from "./views/ActivityOrdersView.vue";
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/login", component: LoginView },
    { path: "/", redirect: "/activities" },
    { path: "/activities", component: ActivitiesView },
    { path: "/shop", component: ShopView },
    { path: "/shop/categories", component: ProductCategoriesView },
    { path: "/users", component: UsersView },
    { path: "/memberships", component: MembershipsView },
    { path: "/activity-orders", component: ActivityOrdersView },
    { path: "/templates", component: TemplatesView },
    { path: "/waitlist", redirect: "/operations" },
    { path: "/operations", component: OperationsView },
    { path: "/refunds", component: RefundsView },
    { path: "/notifications", component: NotificationsView },
    { path: "/legal", component: LegalView },
    { path: "/articles", component: ArticlesView },
    { path: "/articles/new", component: ArticleEditorView },
    { path: "/articles/:id/edit", component: ArticleEditorView },
    { path: "/settings", component: SettingsView },
    { path: "/settings/admin-account", component: AdminAccountView },
    { path: "/activities/new", component: EditorView },
    { path: "/activities/:id/edit", component: EditorView },
    { path: "/activities/:id/registrations", component: RosterView },
    { path: "/:pathMatch(.*)*", redirect: "/activities" },
  ],
});
router.beforeEach((to) => {
  if (to.path !== "/login" && !currentUser.value) return "/login";
  if (to.path === "/login" && currentUser.value) return "/activities";
});
