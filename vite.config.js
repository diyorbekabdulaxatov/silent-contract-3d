import { defineConfig } from 'vite';

// The source runs without a build: index.html maps "three" to a pinned CDN copy through an
// import map. The production build bundles three from node_modules instead, so the import map
// is removed here and the app works offline (as it must inside the Android app).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0
  },
  plugins: [
    {
      name: 'strip-import-map',
      transformIndexHtml(html) {
        return html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
      }
    }
  ]
});
