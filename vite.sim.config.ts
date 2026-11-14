// The app on an in-memory database with prepared situations: `npm run sim`, then open http://localhost:5174/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AiError, analyzeMeal } from './supabase/functions/_shared/nutrition/ai.ts';
import { OFF_USER_AGENT, offUrl } from './supabase/functions/_shared/nutrition/off.ts';

// The meal analysis of the simulation calls Claude from this local server, with the key of the environment variable
// ANTHROPIC_API_KEY of the process that started `npm run sim` (never in a file, never in the browser). Without it the
// simulation answers "not set up", like the real function without its secret.
const readBody = (req: IncomingMessage) => new Promise<string>((ok, bad) => {
  let s = '';
  req.on('data', (c) => (s += c));
  req.on('end', () => ok(s));
  req.on('error', bad);
});
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};
async function simAi(req: IncomingMessage, res: ServerResponse) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return send(res, 503, { error: 'ANTHROPIC_API_KEY is not set for npm run sim.', code: 'not_configured' });
  try {
    const body = JSON.parse(await readBody(req));
    const model = body.image ? process.env.CLAUDE_VISION_MODEL ?? 'claude-sonnet-5-5' : process.env.CLAUDE_TEXT_MODEL ?? 'claude-haiku-5-5';
    const out = await analyzeMeal(fetch, { apiKey: key, model, image: body.image, text: body.text, note: body.note });
    send(res, 200, { ...out, model });
  } catch (e) {
    send(res, e instanceof AiError ? e.status : 500, { error: (e as Error).message });
  }
}
async function simOff(req: IncomingMessage, res: ServerResponse) {
  const code = new URL(req.url ?? '', 'http://x').searchParams.get('code') ?? '';
  try {
    const r = await fetch(offUrl(code), { headers: { 'User-Agent': OFF_USER_AGENT } });
    send(res, 200, r.ok ? await r.json() : null);
  } catch (e) {
    send(res, 502, { error: (e as Error).message });
  }
}

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
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/__sim/ai') && req.method === 'POST') return void simAi(req, res);
          if (req.url?.startsWith('/__sim/off')) return void simOff(req, res);
          next();
        });
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
