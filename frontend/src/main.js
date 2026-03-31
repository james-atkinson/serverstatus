import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

const theme = localStorage.getItem("theme") || "dark";
document.documentElement.dataset.theme = theme;

createApp(App).mount("#app");
