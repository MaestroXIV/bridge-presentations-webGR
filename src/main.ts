import { createApp } from "vue";
import App from "./presentations/App.vue";
import StudioApp from "./studio/StudioApp.vue";
import { isPresenterUrl } from "./studio/handoff";
import DebugAppLayout from "./presentations/components/debug/DebugAppLayout.vue";

const debug = import.meta.env.VITE_UI_DEBUG === "true";
if (debug) console.info("UI debug mode enabled");
let useDebugApp = debug;
useDebugApp = false;
const debugApp = DebugAppLayout

// ?mode=presenter opens the recording presenter instead of the editor
const app = createApp(isPresenterUrl() ? StudioApp : useDebugApp ? debugApp : App);
app.provide("debug", debug);
app.mount("#app");



