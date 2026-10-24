import { defineConfig } from 'vite';

// base relative : fonctionne sur GitHub Pages (sous-chemin /<repo>/), Netlify et Cloudflare Pages.
export default defineConfig({
  base: './',
});
