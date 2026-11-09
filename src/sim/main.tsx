// Entry of the simulation: the real app on an in-memory database with a prepared situation (see scenarios.ts).
// Open it with `npm run sim` and pick a situation at the bottom of the page.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import '../index.css';
import { resetDb, db, setGarminMode, startSignedOut } from './fakeSupabase';
import { SCENARIOS, buildScenario, scenarioById } from './scenarios';

const params = new URLSearchParams(window.location.search);
const scenario = scenarioById(params.get('scenario'));
// ?bar=0 hides the situation panel (it covers the tab bar on a phone) and is remembered in this browser; ?bar=1 brings it back.
if (params.has('bar')) window.localStorage.setItem('maraplanna.sim.bar', params.get('bar') === '0' ? '0' : '1');
const showBar = window.localStorage.getItem('maraplanna.sim.bar') !== '0';
resetDb(buildScenario(scenario.id));
setGarminMode(params.get('garmin'));
if (params.get('signedout') === '1') startSignedOut();
// ?lang=de|en picks the language for this visit (the choice at the top right is remembered in the browser as usual).
if (params.get('lang') === 'de' || params.get('lang') === 'en') window.localStorage.setItem('maraplanna.lang', params.get('lang')!);
// A fresh start also forgets a saved setup draft of an earlier visit.
if (params.get('clean') !== '0') for (const k of Object.keys(window.localStorage)) if (k.startsWith('maraplanna.setup.')) window.localStorage.removeItem(k);
(window as unknown as { __sim: unknown }).__sim = { db, scenario: scenario.id };

// First visit: go to the page the situation is about. (Navigation inside the app keeps the scenario in the address.)
if (!params.has('scenario')) {
  window.history.replaceState(null, '', `${scenario.start}${scenario.start.includes('?') ? '&' : '?'}scenario=${scenario.id}`);
}

function SimBar() {
  const go = (id: string) => {
    const s = scenarioById(id);
    window.location.href = `${s.start}${s.start.includes('?') ? '&' : '?'}scenario=${s.id}`;
  };
  return (
    <div className="fixed bottom-3 left-3 z-[60] max-w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl ring-1 ring-white/10 backdrop-blur" data-testid="simbar">
      <div className="mb-1.5 flex items-center gap-2 font-semibold text-white">
        <span className="rounded-md bg-lime px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900">Simulation</span>
        <span>nothing is saved – reload to start over</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={scenario.id} onChange={(e) => go(e.target.value)} className="rounded-lg border-0 bg-white/10 px-2 py-1.5 text-white outline-none" aria-label="Situation">
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id} className="text-slate-900">{s.label}</option>
          ))}
        </select>
        <button className="rounded-lg bg-white/10 px-2.5 py-1.5 hover:bg-white/20" onClick={() => go(scenario.id)}>Reset</button>
      </div>
      <p className="mt-1.5 leading-snug text-slate-400">{scenario.about}</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {showBar && <SimBar />}
  </StrictMode>,
);
