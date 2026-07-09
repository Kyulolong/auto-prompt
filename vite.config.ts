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
  // vosk-browser ships prebuilt wasm; don't let Vite try to pre-bundle it.
  optimizeDeps: { exclude: ["vosk-browser"] },
  worker: { format: "es" },
});
