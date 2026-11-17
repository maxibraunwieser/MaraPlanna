// A meal on its own page: everything that was eaten for one meal of a day, its macros and what it contributes to the
// micronutrients. Opened from the diary by tapping a meal.

import { useMemo, useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Notice, Spinner } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { fmtDay } from '../../lib/format';
import { SLOTS, sumNutrients, type MealItem, type Slot } from '../../../supabase/functions/_shared/nutrition/items';
import { ageOn, type Person } from '../../../supabase/functions/_shared/nutrition/micros';
import { MealDetail } from './Micros';
import { EditItem } from './Diary';
import { fmt, slotLabel, useNutritionDay } from './parts';

export function MealPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { today, profile } = useData();
  const [params] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today;
  const slot = ((SLOTS as readonly string[]).includes(params.get('slot') ?? '') ? params.get('slot') : 'breakfast') as Slot;
  const day = useNutritionDay(user!.id, date, today);
  const [editing, setEditing] = useState<MealItem | null>(null);
  const person: Person | null = useMemo(() => {
    const a = profile?.onboarding;
    const age = ageOn(a?.setup?.birthDate ?? null, date, a?.age ?? null);
    return age === null ? null : { sex: a?.sex === 'male' || a?.sex === 'female' ? a.sex : null, age };
  }, [profile, date]);

  const entries = day.entries.filter((e) => e.date === date && e.slot === slot);
  const items = day.items.filter((i) => i.date === date && entries.some((e) => e.id === i.meal_entry_id));
  const kcal = sumNutrients(items).kcal ?? 0;
  const target = day.targets.find((x) => x.date === date) ?? null;
  const back = () => navigate(`/food?date=${date}`);

  return (
    <div className="space-y-6 pb-24">
      <header className="flex items-center gap-2">
        <button type="button" onClick={back} aria-label={t('food.back')} className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-90">
          <ChevronLeft className="h-7 w-7" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-3xl font-bold tracking-tight text-slate-900">{slotLabel(slot)}</h1>
          <p className="text-sm text-slate-500">
            {fmtDay(date, today, { weekday: 'long', day: 'numeric', month: 'long' })}
            {items.length > 0 && ` · ${fmt(kcal)} kcal`}
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/food/add?date=${date}&slot=${slot}`)}>{t('food.add')}</Button>
      </header>

      {day.loading && !day.items.length ? <Spinner /> : day.error ? <Notice tone="error">{day.error}</Notice> : !items.length ? (
        <p className="py-10 text-center text-sm text-slate-500">{t('food.slot.empty')}</p>
      ) : (
        <MealDetail
          slot={slot} entries={entries} items={items} refs={day.refs} nutrients={day.nutrients} rules={day.rules} person={person}
          sodiumTarget={target?.sodium_mg ?? null} onEditItem={setEditing} onChanged={() => void day.reload()} onClose={back}
        />
      )}
      {editing && <EditItem item={editing} onClose={() => setEditing(null)} onChanged={() => void day.reload()} />}
    </div>
  );
}
