import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
  throw new Error("Target #app element not found");
}

export default mount(App, { target });