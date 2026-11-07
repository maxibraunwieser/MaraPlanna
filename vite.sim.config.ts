// The app on an in-memory database with prepared situations: `npm run sim`, then open http://localhost:5174/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'sim-supabase',
      enforce: 'pre',
      // Every import of the Supabase client of the app gets the in-memory stand-in.
      resolveId(source, importer) {
        if (!importer || importer.includes('node_modules')) return null;
        if (/(^|\/)supabase(\.ts)?$/.test(source)) return path.resolve(here, 'src/sim/fakeSupabase.ts');
        return null;
      },
      // All pages of the single-page app are served by sim.html.
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const url = req.url ?? '';
          if (!url.startsWith('/@') && !url.startsWith('/src') && !url.startsWith('/node_modules') && !url.startsWith('/sim.html') && !/\.[a-z0-9]+(\?|$)/i.test(url)) req.url = '/sim.html';
          next();
        });
      },
    },
  ],
  server: { port: 5174, strictPort: true },
});
