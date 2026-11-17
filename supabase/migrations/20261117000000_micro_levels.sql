-- Nutrition: thresholds of the micronutrient scale (Essen tab). Paste into Dashboard -> SQL Editor or `supabase db push`.
-- Percent of the person's daily reference value (D-A-CH, plus the athlete extra) for the levels of the day, the share of the
-- eaten energy that must have a value before a nutrient is rated at all, and what one meal counts as much / some.

insert into public.nutrition_rules (key, value, unit, note) values
  ('micro_level_very_good', 100, '% of reference', 'Mikronährstoff sehr gut erreicht'),
  ('micro_level_good', 75, '% of reference', 'Mikronährstoff gut erreicht'),
  ('micro_level_fair', 50, '% of reference', 'Mikronährstoff mäßig erreicht'),
  ('micro_level_low', 25, '% of reference', 'Darunter: sehr wenig'),
  ('micro_min_coverage', 50, '% of eaten energy', 'So viel der gegessenen Energie muss Werte für den Nährstoff haben, sonst keine Bewertung'),
  ('meal_micro_much', 33, '% of daily reference', 'Eine Mahlzeit liefert viel davon'),
  ('meal_micro_some', 15, '% of daily reference', 'Eine Mahlzeit liefert etwas davon')
on conflict (key) do update set value = excluded.value, unit = excluded.unit, note = excluded.note;
