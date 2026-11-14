import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained dist/index.html: double-click to play, no server, no network.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: { port: 5173, strictPort: false },
  build: { target: 'es2022', assetsInlineLimit: 100_000_000 },
});
