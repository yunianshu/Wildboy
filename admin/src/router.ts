import { createRouter, createWebHashHistory } from "vue-router";
import { currentUser } from "./api";
import LoginView from "./views/LoginView.vue";
import ActivitiesView from "./views/ActivitiesView.vue";
import EditorView from "./views/EditorView.vue";
import RosterView from "./views/RosterView.vue";
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/login", component: LoginView },
    { path: "/", redirect: "/activities" },
    { path: "/activities", component: ActivitiesView },
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
