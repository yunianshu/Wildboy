import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./styles/tokens.css";
import "./style.css";
import "./styles/slate.css";
import "./styles/select.css";
createApp(App).use(router).mount("#app");
