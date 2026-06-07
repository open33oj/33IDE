import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  base: './',
  build: {
    target: ['es2022', 'chrome100', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    modulePreload: false,
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || '0.9.1'),
    'import.meta.env.VITE_EDITION': JSON.stringify(process.env.VITE_EDITION || 'basic'),
    'import.meta.env.VITE_FEATURE_CPH': JSON.stringify(process.env.VITE_FEATURE_CPH || 'false'),
    'import.meta.env.VITE_FEATURE_BROWSER': JSON.stringify(process.env.VITE_FEATURE_BROWSER || 'false'),
    'import.meta.env.VITE_FEATURE_AI_TRANSLATE': JSON.stringify(process.env.VITE_FEATURE_AI_TRANSLATE || 'false'),
    'import.meta.env.VITE_FEATURE_AI_SUGGEST': JSON.stringify(process.env.VITE_FEATURE_AI_SUGGEST || 'false'),
  },
});
