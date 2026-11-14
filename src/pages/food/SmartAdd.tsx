// Logging by photo, sentence or barcode. Photo and sentence go to Claude (in the nutrition Edge Function); what comes back is
// only a suggestion: the person checks every component on the confirmation screen (grams, swap, delete, add) and only then
// it is saved. Barcodes are looked up in Open Food Facts and continue like a food from the search.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Plus, RefreshCw, ScanLine, Sparkles, Trash2, X } from 'lucide-react';
import { Badge, Button, Field, Input, Notice, Select, Spinner, Textarea } from '../../components/ui';
import { currentLang, useI18n } from '../../lib/i18n';
import * as napi from '../../lib/nutrition/api';
import { shrinkPhoto } from '../../lib/nutrition/image';
import { foodName, forGrams, SLOTS, sumNutrients, type Food, type Nutrients, type Slot } from '../../../supabase/functions/_shared/nutrition/items';
import { FoodSearch, NutrientLine } from './AddFood';
import { fmt, slotLabel } from './parts';

// ---------------------------------------------------------------------------
// Photo and text
// ---------------------------------------------------------------------------

export function PhotoStep({ userId, date, onResult, onManual }: { userId: string; date: string; onResult: (r: napi.AnalysisResult, photo: { path: string; url: string }) => void; onManual: () => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'shrink' | 'upload' | 'analyse' | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy('shrink');
    try {
      const blob = await shrinkPhoto(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError(t('food.photo.err.read'));
    } finally {
      setBusy(null);
    }
  };
  const analyse = async () => {
    if (!photo) return;
    setError(null);
    try {
      setBusy('upload');
      const path = await napi.uploadMealPhoto(userId, date, photo.blob);
      setBusy('analyse');
      // own address for the next screen: this one is released when the photo step closes
      onResult(await napi.analyzePhoto(path, note.trim()), { path, url: URL.createObjectURL(photo.blob) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} data-testid="photo-input" />
      {photo ? (
        <div className="relative overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <img src={photo.url} alt={t('food.photo.preview')} className="max-h-72 w-full object-cover" />
          <button type="button" onClick={() => setPhoto(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white" aria-label={t('food.photo.other')}><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={!!busy}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-10 text-slate-600 transition hover:border-brand hover:text-brand">
          {busy === 'shrink' ? <Spinner /> : <><Camera className="h-8 w-8" /><span className="text-sm font-medium">{t('food.photo.take')}</span><span className="text-xs text-slate-500">{t('food.photo.takeHint')}</span></>}
        </button>
      )}
      <Field label={t('food.photo.note')} hint={t('food.photo.noteHint')}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('food.photo.notePh')} maxLength={200} />
      </Field>
      {error && <ManualNotice error={error} onManual={onManual} />}
      <div className="flex justify-end">
        <Button onClick={analyse} disabled={!photo} loading={busy === 'upload' || busy === 'analyse'} icon={<Sparkles className="h-4 w-4" />}>
          {busy === 'analyse' ? t('food.ai.analysing') : t('food.photo.analyse')}
        </Button>
      </div>
      <p className="text-xs text-slate-500">{t('food.ai.privacy')}</p>
    </div>
  );
}

export function TextStep({ onResult, onManual }: { onResult: (r: napi.AnalysisResult) => void; onManual: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      onResult(await napi.parseMealText(text.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Field label={t('food.text.label')} hint={t('food.text.hint')}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('food.text.ph')} maxLength={500} autoFocus />
      </Field>
      {error && <ManualNotice error={error} onManual={onManual} />}
      <div className="flex justify-end">
        <Button onClick={go} disabled={text.trim().length < 2} loading={busy} icon={<Sparkles className="h-4 w-4" />}>{busy ? t('food.ai.analysing') : t('food.text.go')}</Button>
      </div>
    </div>
  );
}

function ManualNotice({ error, onManual }: { error: string; onManual: () => void }) {
  const { t } = useI18n();
  return (
    <Notice tone="error">
      <div>{error}</div>
      <button type="button" onClick={onManual} className="mt-1 font-semibold underline">{t('food.ai.manual')}</button>
    </Notice>
  );
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

interface Row {
  key: string;
  name: string;
  grams: number;
  confidence: number | null;
  food: napi.FoodDetail | null;
  estimate: napi.MatchedItem | null;
}

const confTone = (c: number) => (c >= 0.75 ? 'green' : c >= 0.5 ? 'amber' : 'red');

function rowNutrients(r: Row): Nutrients {
  if (r.food) return forGrams(r.food, r.food.micros, r.grams);
  const p = r.estimate!.per100;
  return forGrams({ ...p, fiber_g: null, sugar_g: null, sat_fat_g: null, sodium_mg: null, completeness: 0 }, {}, r.grams);
}

export function ConfirmMeal({ userId, date, slot0, result, photo, source, onSaved, onCancel }: {
  userId: string; date: string; slot0: Slot; result: napi.AnalysisResult; photo: { path: string; url: string } | null; source: 'photo' | 'text';
  onSaved: (name: string, slot: Slot) => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  const lang = currentLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState(result.meal_name);
  const [slot, setSlot] = useState<Slot>(slot0);
  const [swap, setSwap] = useState<string | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ids = result.items.map((i) => i.food?.id).filter((x): x is string => !!x);
      const details = await napi.fetchFoodDetails(await napi.fetchFoods(ids));
      setRows(result.items.map((i, k) => ({
        key: `${k}`, name: i.name_de, grams: i.estimated_grams, confidence: i.confidence,
        food: i.food ? details.get(i.food.id) ?? null : null, estimate: i,
      })));
    })().catch((e: Error) => setError(e.message));
  }, [result]);

  const total = useMemo(() => sumNutrients((rows ?? []).filter((r) => r.grams > 0).map(rowNutrients)), [rows]);
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const pickFood = async (f: Food) => {
    const d = (await napi.fetchFoodDetails([f])).get(f.id)!;
    if (swap === 'new') setRows((rs) => [...rs!, { key: `n${Date.now()}`, name: foodName(f, lang), grams: d.portions[0]?.grams ?? 100, confidence: null, food: d, estimate: null }]);
    else if (swap) update(swap, { food: d, name: foodName(f, lang) });
    setSwap(null);
  };

  const save = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const items = [];
      for (const r of rows.filter((x) => x.grams > 0)) {
        let food = r.food as Food | null;
        let nutrients = rowNutrients(r);
        if (!food && r.estimate) {
          // no database match: keep Claude's estimate as an own food, marked as an estimate
          food = await napi.saveEstimateFood(userId, r.estimate);
          nutrients = rowNutrients(r);
        }
        items.push({ name: r.food ? foodName(r.food, lang) : r.name, food_id: food?.id ?? null, grams: r.grams, amount: r.grams, unit_label: 'g', nutrients, source: (r.food ? 'db' : 'ai_estimate') as 'db' | 'ai_estimate' });
      }
      await napi.logMeal(userId, { date, slot, source, name: name.trim() || null, photo_path: photo?.path ?? null }, items);
      onSaved(name.trim() || items[0]?.name || '', slot);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !rows) return <Notice tone="error">{error}</Notice>;
  if (!rows) return <Spinner />;
  if (swap) {
    return (
      <div className="space-y-3">
        <div className="text-sm font-medium text-slate-700">{swap === 'new' ? t('food.confirm.addPart') : t('food.confirm.swapFor', { name: rows.find((r) => r.key === swap)?.name ?? '' })}</div>
        <FoodSearch userId={userId} onPick={(f) => void pickFood(f)} showRecent={swap === 'new'} />
        <Button variant="ghost" onClick={() => setSwap(null)}>{t('food.back')}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {photo && <img src={photo.url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" />}
        <div className="min-w-0 flex-1">
          <Field label={t('food.confirm.name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
      </div>
      {result.notes && <p className="text-xs text-slate-500"><Sparkles className="mr-1 inline h-3.5 w-3.5 text-brand" />{result.notes}</p>}
      {!rows.length && <Notice tone="warn">{t('food.confirm.none')}</Notice>}
      <ul className="space-y-2">
        {rows.map((r) => {
          const n = rowNutrients(r);
          const max = Math.max(500, Math.round((r.estimate?.estimated_grams ?? 100) * 2.5));
          return (
            <li key={r.key} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{r.food ? foodName(r.food, lang) : r.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {r.confidence !== null && <Badge tone={confTone(r.confidence)}>{t('food.confirm.conf', { pct: fmt(r.confidence * 100) })}</Badge>}
                    {r.food ? <span className="text-slate-500">{t('food.confirm.fromDb')}</span> : <Badge tone="amber">{t('food.source.ai')}</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setSwap(r.key)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label={t('food.confirm.swap')}><RefreshCw className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label={t('food.delete')}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input type="range" min={0} max={max} step={5} value={Math.min(r.grams, max)} onChange={(e) => update(r.key, { grams: Number(e.target.value) })} className="flex-1 accent-[var(--color-brand,#f97316)]" aria-label={t('food.amountG')} />
                <Input className="!w-20 text-right" inputMode="numeric" value={String(r.grams)} onChange={(e) => update(r.key, { grams: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) })} aria-label={t('food.amountG')} />
                <span className="text-xs text-slate-500">g</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{fmt(n.kcal ?? 0)} kcal · {t('food.macros.short', { c: fmt(n.carbs_g ?? 0), p: fmt(n.protein_g ?? 0), f: fmt(n.fat_g ?? 0) })}</div>
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setSwap('new')}>{t('food.confirm.addPart')}</Button>
      <NutrientLine n={total} />
      <Field label={t('food.slot')}>
        <Select value={slot} onChange={(e) => setSlot(e.target.value as Slot)}>{SLOTS.map((x) => <option key={x} value={x}>{slotLabel(x)}</option>)}</Select>
      </Field>
      <p className="text-xs text-slate-500">{t('food.confirm.hint')}</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onCancel}>{t('food.cancel')}</Button>
        <Button onClick={save} loading={busy} disabled={!rows.some((r) => r.grams > 0)} icon={<Check className="h-4 w-4" />}>{t('food.confirm.save')}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barcode
// ---------------------------------------------------------------------------

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Camera scanner: the browser's own BarcodeDetector where it exists (Chrome on Android), else ZXing (Safari). */
export function BarcodeStep({ onFood, onManual }: { onFood: (f: Food) => void; onManual: () => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'scanning' | 'nocamera' | 'looking'>('starting');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  const look = async (c: string) => {
    if (done.current) return;
    done.current = true;
    setState('looking');
    setError(null);
    try {
      onFood(await napi.foodByBarcode(c));
    } catch (e) {
      setError((e as Error).message);
      done.current = false;
      setState('scanning');
    }
  };

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        if (Native) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (cancelled) return stream.getTracks().forEach((x) => x.stop());
          const v = video.current!;
          v.srcObject = stream;
          await v.play();
          setState('scanning');
          const det = new Native({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          let live = true;
          stop = () => { live = false; stream.getTracks().forEach((x) => x.stop()); };
          const tick = async () => {
            if (!live) return;
            const hits = await det.detect(v).catch(() => []);
            if (hits[0]?.rawValue) void look(hits[0].rawValue);
            else setTimeout(tick, 250);
          };
          void tick();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromVideoDevice(undefined, video.current!, (res) => { if (res) void look(res.getText()); });
          if (cancelled) return controls.stop();
          stop = () => controls.stop();
          setState('scanning');
        }
      } catch {
        if (!cancelled) setState('nocamera');
      }
    })();
    return () => { cancelled = true; stop?.(); };
  }, []);

  return (
    <div className="space-y-4">
      {state !== 'nocamera' ? (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} className="h-64 w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-brand/80 shadow-[0_0_12px_rgba(249,115,22,0.8)]" />
          {state !== 'scanning' && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Spinner label={state === 'looking' ? t('food.barcode.looking') : t('food.barcode.starting')} /></div>}
        </div>
      ) : (
        <Notice tone="info">{t('food.barcode.noCamera')}</Notice>
      )}
      <div className="flex items-end gap-2">
        <Field label={t('food.barcode.manual')} className="flex-1"><Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="4001234567890" /></Field>
        <Button onClick={() => { done.current = false; void look(code); }} disabled={code.length < 8} icon={<ScanLine className="h-4 w-4" />}>{t('food.barcode.find')}</Button>
      </div>
      {error && <ManualNotice error={error} onManual={onManual} />}
      <p className="text-xs text-slate-500">{t('food.barcode.source')}</p>
    </div>
  );
}

