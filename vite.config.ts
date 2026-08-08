import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// COOP/COEP headers enable SharedArrayBuffer, which lets vosk-browser run its
// WASM recognizer with threads. Harmless for the Web Speech engine.
const crossOriginIsolation = {
  name: "cross-origin-isolation",
  configureServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
};

export default defineConfig({
  // The app is mounted at kyulolong.com/prompt, but Traefik strips the /prompt
  // prefix before the container sees it — so the container has no way to learn
  // where it's hosted, and the browser ends up asking for /assets/… and getting
  // the homepage's 404. Baking the prefix in fixes it at the only layer that
  // does know. There's no router here (one screen), so a fixed base is the whole
  // solution: no trailing-slash redirect, no extra Traefik labels. The cost is
  // that local dev now lives at localhost:5173/prompt/.
  base: "/prompt/",
  plugins: [react(), crossOriginIsolation],
  // vosk-browser is a UMD module (its worker+wasm are inlined as a base64 blob,
  // so there are no external assets to break). Pre-bundle it so its named
  // exports (createModel) survive ESM interop in the browser — excluding it
  // makes the browser get the bare UMD, where createModel is undefined.
  optimizeDeps: { include: ["vosk-browser"] },
  worker: { format: "es" },
});
