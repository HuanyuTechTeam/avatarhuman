import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: resolve(currentDir, "web"),
    base: "./",
    publicDir: resolve(currentDir, "web/public"),
    build: {
        outDir: resolve(currentDir, "web/dist"),
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            input: {
                coze: resolve(currentDir, "web/cozechat-s.html"),
                langchain: resolve(currentDir, "web/langchain-s.html"),
            },
        },
    },
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve(currentDir, "web/src"),
        },
    },
});
