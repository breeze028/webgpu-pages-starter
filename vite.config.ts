import { defineConfig } from "vite";
import { pagesBase } from "./src/pages-base.ts";

export default defineConfig({
  base: pagesBase(process.env),
  build: { target: "es2022" },
});
