import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { lumenContent } from './vite-plugin-lumen-content.ts';

export default defineConfig({
  plugins: [
    react(),
    lumenContent(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Lumen – MINT verstehen',
        short_name: 'Lumen',
        description: 'Freie, offene Lern-App für Mathe und Logik mit interaktiven Aufgaben.',
        lang: 'de',
        start_url: '.',
        display: 'standalone',
        background_color: '#fbf8f2',
        theme_color: '#1c1a3a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,ttf,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    // Lumen server (sync + Lux tutor) in development: npm run server
    proxy: { '/api': { target: 'http://localhost:8787', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  build: { target: 'es2022', sourcemap: true },
});
