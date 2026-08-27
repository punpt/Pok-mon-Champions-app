import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Champions Lab — Teambuilder VGC',
        short_name: 'Champions Lab',
        description:
          'Assistente de teambuilder de alto nivel para Pokemon Champions: ameacas por usage, sinergias, calculo de dano e otimizador de Stat Points.',
        theme_color: '#0b0f1a',
        background_color: '#0b0f1a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Os learnsets ficam fora do precache para a instalacao nao puxar 5 MB
        // de cara. Eles entram no cache em tempo de execucao, na primeira vez
        // que voce abre um seletor de golpes — e a partir dai valem offline.
        globIgnores: ['**/learnsets*.js'],
        runtimeCaching: [
          {
            urlPattern: /learnsets.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pkmn-learnsets',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Sprites do Showdown: cache longo, sao imutaveis por nome.
            urlPattern: /^https:\/\/play\.pokemonshowdown\.com\/sprites\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pkmn-sprites',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    // Sem manualChunks de proposito: o @pkmn/dex ja carrega os learnsets (~5 MB)
    // por import dinamico, e qualquer agrupamento manual anula esse corte e
    // joga tudo na primeira abertura.
    chunkSizeWarningLimit: 1200,
  },
});
