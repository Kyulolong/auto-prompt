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
  plugins: [react(), crossOriginIsolation],
  // vosk-browser is a UMD module (its worker+wasm are inlined as a base64 blob,
  // so there are no external assets to break). Pre-bundle it so its named
  // exports (createModel) survive ESM interop in the browser — excluding it
  // makes the browser get the bare UMD, where createModel is undefined.
  optimizeDeps: { include: ["vosk-browser"] },
  worker: { format: "es" },
});
