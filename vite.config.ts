import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages hosts project sites at /<repository>/ instead of /.
// Its static server cannot rewrite SPA routes; the Pages build uses hash routes.
const pagesBase = process.env.PAGES_BASE;
const pagesBuild = pagesBase !== undefined;

export default defineConfig({
  base: pagesBase || '/',
  define: { __PAGES_BUILD__: JSON.stringify(pagesBuild) },
  plugins: [react(), ...(pagesBuild ? [] : [VitePWA({
    registerType: 'autoUpdate',
    manifest: false,
    workbox: {
      globPatterns: ['**/*.{html,js,css,svg,png,webp,woff2}'],
      navigateFallback: '/index.html',
      runtimeCaching: [{
        urlPattern: ({ url }) => url.hostname === 'images.unsplash.com',
        handler: 'CacheFirst',
        options: { cacheName: 'studio-images', expiration: { maxEntries: 50, maxAgeSeconds: 604800 } }
      }]
    },
    devOptions: { enabled: true }
  })])],
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
