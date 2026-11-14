-- Nutrition (Essen tab), phases 1-3: food database, diary, water and weight, daily targets that follow the training.
-- Run with `supabase db push`, or paste into Dashboard -> SQL Editor.
--
-- Reference tables (nutrients, nutrient_references, nutrition_rules, nutrition_day_rules) are readable by every signed-in
-- user and written only by migrations or the owner in the SQL editor: every limit the app uses lives here, not in code.
-- Food rows with user_id null are the shared database (USDA import, Open Food Facts cache); rows with a user_id are the
-- person's own foods and AI estimates. Everything else belongs to one user and is protected by row level security.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Nutrients and reference values
-- ---------------------------------------------------------------------------
create table if not exists public.nutrients (
  code text primary key,
  name_de text not null,
  name_en text not null,
  unit text not null,
  category text not null check (category in ('macro', 'micro', 'other')),
  -- Key nutrient for endurance athletes (shown first, gap analysis looks at these first)
  endurance_key boolean not null default false,
  sort integer not null default 100
);

create table if not exists public.nutrient_references (
  id bigint generated always as identity primary key,
  nutrient_code text not null references public.nutrients (code) on delete cascade,
  sex text not null check (sex in ('male', 'female', 'any')),
  age_min integer not null default 19,
  age_max integer,
  -- Daily intake to aim for (D-A-CH recommendation, estimate or guide value)
  target numeric not null,
  kind text not null check (kind in ('recommendation', 'estimate', 'guide')),
  -- Tolerable upper intake level (EFSA); null = none defined or not applicable to food intake (see upper_note)
  upper_limit numeric,
  upper_note text,
  -- Extra for endurance athletes in percent of the target: an approximation, shown as such
  athlete_extra_pct numeric not null default 0,
  athlete_note text,
  source text not null
);
create index if not exists nutrient_references_code on public.nutrient_references (nutrient_code);

-- ---------------------------------------------------------------------------
-- Foods
-- ---------------------------------------------------------------------------
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  -- null = shared database; otherwise the person's own food or AI estimate
  user_id uuid references auth.users (id) on delete cascade,
  source text not null check (source in ('usda', 'off', 'bls', 'custom', 'ai_estimate')),
  external_id text,
  name_de text,
  name_en text,
  brand text,
  barcode text,
  category text,
  -- Per 100 g
  kcal numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric,
  sugar_g numeric,
  sat_fat_g numeric,
  sodium_mg numeric,
  -- Share (0..1) of the tracked micronutrients the source has a value for (missing is not zero)
  completeness numeric not null default 0,
  -- NOVA group 1-4 when known (Open Food Facts): processed food share
  nova smallint check (nova between 1 and 4),
  search_simple tsvector generated always as (
    to_tsvector('simple', coalesce(name_de, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(brand, ''))
  ) stored,
  search_stem tsvector generated always as (
    to_tsvector('german', coalesce(name_de, '')) || to_tsvector('english', coalesce(name_en, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Shared imports are upserted by (source, external_id); own foods have no external id (nulls never collide).
create unique index if not exists foods_source_external on public.foods (source, external_id);
create unique index if not exists foods_barcode_shared on public.foods (barcode) where user_id is null and barcode is not null;
create index if not exists foods_user on public.foods (user_id) where user_id is not null;
create index if not exists foods_search_simple on public.foods using gin (search_simple);
create index if not exists foods_search_stem on public.foods using gin (search_stem);
create index if not exists foods_name_trgm on public.foods using gin ((lower(coalesce(name_de, '') || ' ' || coalesce(name_en, ''))) extensions.gin_trgm_ops);

create table if not exists public.food_nutrients (
  food_id uuid not null references public.foods (id) on delete cascade,
  nutrient_code text not null references public.nutrients (code) on delete cascade,
  -- Amount per 100 g in the nutrient's unit
  amount numeric not null,
  primary key (food_id, nutrient_code)
);

create table if not exists public.food_portions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  label_de text,
  label_en text not null,
  grams numeric not null check (grams > 0),
  sort integer not null default 0
);
create index if not exists food_portions_food on public.food_portions (food_id);

create table if not exists public.food_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id uuid not null references public.foods (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  servings numeric not null default 1 check (servings > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipes_user on public.recipes (user_id);

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id uuid not null references public.foods (id) on delete cascade,
  grams numeric not null check (grams > 0),
  sort integer not null default 0
);
create index if not exists recipe_items_recipe on public.recipe_items (recipe_id);

-- ---------------------------------------------------------------------------
-- Diary
-- ---------------------------------------------------------------------------
create table if not exists public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  time time,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'during_workout', 'post_workout')),
  source text not null check (source in ('photo', 'text', 'barcode', 'search', 'quick_add', 'copy', 'recipe')),
  name text,
  photo_path text,
  workout_id uuid references public.planned_workouts (id) on delete set null,
  activity_id uuid references public.activities (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists meal_entries_user_date on public.meal_entries (user_id, date desc);

-- One food (or recipe portion, or quick add) of a meal. The nutrients are a snapshot at the time of logging, so later
-- corrections of the food database do not rewrite the past.
create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_entry_id uuid not null references public.meal_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  food_id uuid references public.foods (id) on delete set null,
  recipe_id uuid references public.recipes (id) on delete set null,
  name text not null,
  grams numeric,
  -- What the person entered: e.g. 2 x "Stück" (grams holds the conversion)
  amount numeric,
  unit_label text,
  kcal numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric,
  sugar_g numeric,
  sat_fat_g numeric,
  sodium_mg numeric,
  -- { nutrient_code: amount } for the micronutrients the food has values for
  micros jsonb not null default '{}'::jsonb,
  completeness numeric not null default 0,
  source text not null default 'db' check (source in ('db', 'ai_estimate', 'quick_add')),
  created_at timestamptz not null default now()
);
create index if not exists meal_items_user_date on public.meal_items (user_id, date desc);
create index if not exists meal_items_entry on public.meal_items (meal_entry_id);

create table if not exists public.water_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  ml integer not null check (ml > 0 and ml <= 5000),
  created_at timestamptz not null default now()
);
create index if not exists water_entries_user_date on public.water_entries (user_id, date desc);

create table if not exists public.body_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  weight_kg numeric not null check (weight_kg between 25 and 300),
  body_fat_pct numeric check (body_fat_pct between 2 and 70),
  source text not null default 'manual' check (source in ('manual', 'garmin')),
  created_at timestamptz not null default now(),
  unique (user_id, date, source)
);
create index if not exists body_weight_user_date on public.body_weight_entries (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Profile, rules, targets
-- ---------------------------------------------------------------------------
create table if not exists public.nutrition_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal text not null default 'maintain' check (goal in ('maintain', 'lose', 'gain')),
  -- Everyday activity without sport (DGE PAL levels, see nutrition_rules pal_*)
  activity_level text not null default 'light' check (activity_level in ('sedentary', 'light', 'moderate', 'heavy')),
  diet text not null default 'omnivore' check (diet in ('omnivore', 'pescetarian', 'vegetarian', 'vegan')),
  intolerances text[] not null default '{}',
  dislikes text[] not null default '{}',
  supplements text[] not null default '{}',
  -- Usual training start per weekday ("0".."6" Monday-based -> "HH:MM"); empty = taken from the Garmin history
  training_times jsonb not null default '{}'::jsonb,
  race_start_time time,
  -- Manual targets that replace the computed ones: { kcal, protein_g, carbs_g, fat_g }
  overrides jsonb not null default '{}'::jsonb,
  notifications jsonb not null default '{}'::jsonb,
  timezone text,
  updated_at timestamptz not null default now()
);

-- Single values of the target calculation (energy, fluids, limits). Change them here, not in code.
create table if not exists public.nutrition_rules (
  key text primary key,
  value numeric not null,
  unit text,
  note text
);

-- Carbohydrate, protein, fat and fibre per type of day (g per kg body weight; fibre per 1000 kcal).
create table if not exists public.nutrition_day_rules (
  day_type text primary key check (day_type in ('rest', 'easy', 'strength', 'hard', 'long_run', 'race', 'carb_loading')),
  carbs_min_gkg numeric not null,
  carbs_max_gkg numeric not null,
  protein_min_gkg numeric not null,
  protein_max_gkg numeric not null,
  fat_min_gkg numeric not null,
  fiber_per_1000kcal numeric not null,
  -- Order for "harder day": a strength + run day moves one step up
  level integer not null,
  deficit_allowed boolean not null default true,
  note text
);

create table if not exists public.nutrition_daily_targets (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  day_type text not null,
  kcal integer not null,
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  fiber_g integer not null,
  water_ml integer not null,
  sodium_mg integer not null,
  -- How the numbers came about (BMR, PAL, training kcal estimated or from Garmin, goal adjustment, ranges, warnings)
  basis jsonb not null,
  -- Hash of everything the numbers depend on: a change of plan, activity, weight, profile or rules recomputes the day
  inputs_hash text not null,
  version integer not null default 1,
  computed_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Daily energy from Garmin (used for past days instead of the estimate)
alter table public.daily_metrics add column if not exists total_kcal integer;
alter table public.daily_metrics add column if not exists active_kcal integer;
alter table public.daily_metrics add column if not exists bmr_kcal integer;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.nutrients enable row level security;
alter table public.nutrient_references enable row level security;
alter table public.foods enable row level security;
alter table public.food_nutrients enable row level security;
alter table public.food_portions enable row level security;
alter table public.food_favorites enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.meal_entries enable row level security;
alter table public.meal_items enable row level security;
alter table public.water_entries enable row level security;
alter table public.body_weight_entries enable row level security;
alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_rules enable row level security;
alter table public.nutrition_day_rules enable row level security;
alter table public.nutrition_daily_targets enable row level security;

drop policy if exists "read nutrients" on public.nutrients;
create policy "read nutrients" on public.nutrients for select to authenticated using (true);
drop policy if exists "read nutrient references" on public.nutrient_references;
create policy "read nutrient references" on public.nutrient_references for select to authenticated using (true);
drop policy if exists "read nutrition rules" on public.nutrition_rules;
create policy "read nutrition rules" on public.nutrition_rules for select to authenticated using (true);
drop policy if exists "read nutrition day rules" on public.nutrition_day_rules;
create policy "read nutrition day rules" on public.nutrition_day_rules for select to authenticated using (true);

drop policy if exists "read shared and own foods" on public.foods;
create policy "read shared and own foods" on public.foods for select to authenticated using (user_id is null or user_id = auth.uid());
drop policy if exists "insert own foods" on public.foods;
create policy "insert own foods" on public.foods for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update own foods" on public.foods;
create policy "update own foods" on public.foods for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete own foods" on public.foods;
create policy "delete own foods" on public.foods for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read food nutrients" on public.food_nutrients;
create policy "read food nutrients" on public.food_nutrients for select to authenticated
  using (exists (select 1 from public.foods f where f.id = food_id and (f.user_id is null or f.user_id = auth.uid())));
drop policy if exists "write own food nutrients" on public.food_nutrients;
create policy "write own food nutrients" on public.food_nutrients for all to authenticated
  using (exists (select 1 from public.foods f where f.id = food_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.foods f where f.id = food_id and f.user_id = auth.uid()));

drop policy if exists "read food portions" on public.food_portions;
create policy "read food portions" on public.food_portions for select to authenticated
  using (exists (select 1 from public.foods f where f.id = food_id and (f.user_id is null or f.user_id = auth.uid())));
drop policy if exists "write own food portions" on public.food_portions;
create policy "write own food portions" on public.food_portions for all to authenticated
  using (exists (select 1 from public.foods f where f.id = food_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.foods f where f.id = food_id and f.user_id = auth.uid()));

drop policy if exists "own favorites" on public.food_favorites;
create policy "own favorites" on public.food_favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own recipes" on public.recipes;
create policy "own recipes" on public.recipes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own recipe items" on public.recipe_items;
create policy "own recipe items" on public.recipe_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own meal entries" on public.meal_entries;
create policy "own meal entries" on public.meal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own meal items" on public.meal_items;
create policy "own meal items" on public.meal_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own water entries" on public.water_entries;
create policy "own water entries" on public.water_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own body weight" on public.body_weight_entries;
create policy "own body weight" on public.body_weight_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own nutrition profile" on public.nutrition_profiles;
create policy "own nutrition profile" on public.nutrition_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Targets are written by the nutrition Edge Function (service role); the person reads them.
drop policy if exists "read own targets" on public.nutrition_daily_targets;
create policy "read own targets" on public.nutrition_daily_targets for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Search and summaries
-- ---------------------------------------------------------------------------
-- Foods matching what the person types: prefix match on every word (works while typing), German/English word stems, and
-- trigram similarity for typos. Own foods come first, then the best match, then shorter names.
create or replace function public.search_foods(q text, lim integer default 30)
returns setof public.foods
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  words text[];
  prefix tsquery;
  clean text := lower(trim(coalesce(q, '')));
begin
  if length(clean) < 2 then
    return;
  end if;
  select array_agg(w) into words
    from regexp_split_to_table(regexp_replace(clean, '[^[:alnum:]äöüß ]', ' ', 'g'), '\s+') as w
    where length(w) > 0;
  if words is null then
    return;
  end if;
  prefix := to_tsquery('simple', array_to_string(array(select quote_literal(w) || ':*' from unnest(words) as w), ' & '));
  return query
    select f.*
    from public.foods f
    where f.search_simple @@ prefix
       or f.search_stem @@ (websearch_to_tsquery('german', clean) || websearch_to_tsquery('english', clean))
       or word_similarity(clean, lower(coalesce(f.name_de, '') || ' ' || coalesce(f.name_en, ''))) > 0.45
    order by
      (f.user_id is not null) desc,
      -- the plain food first: "Haferflocken" before "Haferflocken-Mix, Kirsch-Pistazie", "Banane, roh" before "Bananenchips"
      (lower(split_part(coalesce(f.name_de, ''), ',', 1)) = clean or lower(split_part(coalesce(f.name_en, ''), ',', 1)) = clean) desc,
      (lower(coalesce(f.name_de, '')) like clean || '%' or lower(coalesce(f.name_en, '')) like clean || '%') desc,
      -- among names that start with what was typed, the shorter one (while typing "hafer": Haferflocken first)
      case when lower(coalesce(f.name_de, '')) like clean || '%' then length(f.name_de) end asc nulls last,
      ts_rank(f.search_simple, prefix) + word_similarity(clean, lower(coalesce(f.name_de, '') || ' ' || coalesce(f.name_en, ''))) desc,
      length(coalesce(f.name_de, f.name_en, '')) asc
    limit greatest(1, least(lim, 100));
end;
$$;

-- Sum of what was eaten per day (only the person's own rows: the view runs with the caller's rights).
create or replace view public.daily_nutrition_summary with (security_invoker = true) as
  select user_id, date,
    sum(kcal) as kcal, sum(protein_g) as protein_g, sum(carbs_g) as carbs_g, sum(fat_g) as fat_g,
    sum(fiber_g) as fiber_g, sum(sugar_g) as sugar_g, sum(sodium_mg) as sodium_mg, count(*) as items
  from public.meal_items
  group by user_id, date;

-- ---------------------------------------------------------------------------
-- Seed: nutrients
-- ---------------------------------------------------------------------------
insert into public.nutrients (code, name_de, name_en, unit, category, endurance_key, sort) values
  ('kcal', 'Energie', 'Energy', 'kcal', 'macro', false, 1),
  ('protein', 'Eiweiß', 'Protein', 'g', 'macro', false, 2),
  ('carbs', 'Kohlenhydrate', 'Carbohydrates', 'g', 'macro', false, 3),
  ('fat', 'Fett', 'Fat', 'g', 'macro', false, 4),
  ('fiber', 'Ballaststoffe', 'Fibre', 'g', 'macro', false, 5),
  ('sugar', 'Zucker', 'Sugar', 'g', 'macro', false, 6),
  ('sat_fat', 'Gesättigte Fettsäuren', 'Saturated fat', 'g', 'macro', false, 7),
  ('iron', 'Eisen', 'Iron', 'mg', 'micro', true, 10),
  ('vit_d', 'Vitamin D', 'Vitamin D', 'µg', 'micro', true, 11),
  ('calcium', 'Calcium', 'Calcium', 'mg', 'micro', true, 12),
  ('magnesium', 'Magnesium', 'Magnesium', 'mg', 'micro', true, 13),
  ('sodium', 'Natrium', 'Sodium', 'mg', 'micro', true, 14),
  ('potassium', 'Kalium', 'Potassium', 'mg', 'micro', true, 15),
  ('zinc', 'Zink', 'Zinc', 'mg', 'micro', true, 16),
  ('vit_b12', 'Vitamin B12', 'Vitamin B12', 'µg', 'micro', true, 17),
  ('folate', 'Folat', 'Folate', 'µg', 'micro', true, 18),
  ('vit_c', 'Vitamin C', 'Vitamin C', 'mg', 'micro', false, 20),
  ('vit_a', 'Vitamin A', 'Vitamin A', 'µg', 'micro', false, 21),
  ('vit_e', 'Vitamin E', 'Vitamin E', 'mg', 'micro', false, 22),
  ('vit_k', 'Vitamin K', 'Vitamin K', 'µg', 'micro', false, 23),
  ('vit_b1', 'Vitamin B1', 'Thiamin', 'mg', 'micro', false, 24),
  ('vit_b2', 'Vitamin B2', 'Riboflavin', 'mg', 'micro', false, 25),
  ('vit_b6', 'Vitamin B6', 'Vitamin B6', 'mg', 'micro', false, 26),
  ('iodine', 'Jod', 'Iodine', 'µg', 'micro', false, 27),
  ('selenium', 'Selen', 'Selenium', 'µg', 'micro', false, 28),
  ('epa_dha', 'Omega-3 (EPA + DHA)', 'Omega-3 (EPA + DHA)', 'mg', 'micro', false, 29)
on conflict (code) do update set name_de = excluded.name_de, name_en = excluded.name_en, unit = excluded.unit,
  category = excluded.category, endurance_key = excluded.endurance_key, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- Seed: reference values for adults
--   Targets: DGE/ÖGE reference values (dge.de/wissenschaft/referenzwerte, read 2026-11-14; "Stand Ableitung" in source).
--   Upper limits: EFSA, Overview on Tolerable Upper Intake Levels, version 11 (August 2025).
--   Athlete extras: approximations, marked as such in athlete_note.
-- ---------------------------------------------------------------------------
delete from public.nutrient_references;
insert into public.nutrient_references (nutrient_code, sex, age_min, age_max, target, kind, upper_limit, upper_note, athlete_extra_pct, athlete_note, source) values
  -- Iron: men 11; women 16 before menopause, 14 after (approximated by age 51), 14 from 65. UL: EFSA safe level 40 mg.
  ('iron', 'male', 19, null, 11, 'recommendation', 40, 'EFSA safe level of intake', 30, 'Ausdauersport erhöht den Eisenbedarf (Schätzungen bis ca. 70 %); 30 % ist eine vorsichtige Annäherung.', 'DGE 2023; EFSA 2024'),
  ('iron', 'female', 19, 50, 16, 'recommendation', 40, 'EFSA safe level of intake; 11 mg without menstruation', 30, 'Ausdauersport erhöht den Eisenbedarf (Schätzungen bis ca. 70 %); 30 % ist eine vorsichtige Annäherung.', 'DGE 2023; EFSA 2024'),
  ('iron', 'female', 51, null, 14, 'recommendation', 40, 'EFSA safe level of intake', 30, 'Ausdauersport erhöht den Eisenbedarf (Schätzungen bis ca. 70 %); 30 % ist eine vorsichtige Annäherung.', 'DGE 2023; EFSA 2024'),
  ('vit_d', 'any', 19, null, 20, 'estimate', 100, null, 0, null, 'DGE 2012 (bei fehlender Eigensynthese); EFSA 2023'),
  ('calcium', 'any', 19, null, 1000, 'recommendation', 2500, null, 0, null, 'DGE 2013; EFSA 2012'),
  ('magnesium', 'male', 19, null, 350, 'estimate', null, 'EFSA UL 250 mg applies only to supplements and fortified foods', 0, null, 'DGE 2021'),
  ('magnesium', 'female', 19, null, 300, 'estimate', null, 'EFSA UL 250 mg applies only to supplements and fortified foods', 0, null, 'DGE 2021'),
  ('sodium', 'any', 19, null, 1500, 'estimate', null, null, 0, 'Zuschlag je Trainingsstunde im Flüssigkeitsziel (nutrition_rules)', 'DGE 2016'),
  ('potassium', 'any', 19, null, 4000, 'estimate', null, null, 0, null, 'DGE 2016'),
  -- Zinc depends on phytate intake; the medium level is used (men 11/14/16, women 7/8/10 for low/medium/high).
  ('zinc', 'male', 19, null, 14, 'recommendation', 25, null, 0, null, 'DGE 2019 (mittlere Phytatzufuhr); EFSA/SCF 2002'),
  ('zinc', 'female', 19, null, 8, 'recommendation', 25, null, 0, null, 'DGE 2019 (mittlere Phytatzufuhr); EFSA/SCF 2002'),
  ('vit_b12', 'any', 19, null, 4, 'estimate', null, null, 0, null, 'DGE 2018'),
  ('folate', 'any', 19, null, 300, 'recommendation', null, 'EFSA UL 1000 µg applies only to synthetic folic acid', 0, null, 'DGE 2015 (Folat-Äquivalente)'),
  ('vit_c', 'male', 19, null, 110, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_c', 'female', 19, null, 95, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_a', 'male', 19, 64, 850, 'recommendation', null, 'EFSA UL 3000 µg applies only to preformed retinol', 0, null, 'DGE 2020'),
  ('vit_a', 'male', 65, null, 800, 'recommendation', null, 'EFSA UL 3000 µg applies only to preformed retinol', 0, null, 'DGE 2020'),
  ('vit_a', 'female', 19, null, 700, 'recommendation', null, 'EFSA UL 3000 µg applies only to preformed retinol', 0, null, 'DGE 2020'),
  ('vit_e', 'any', 19, null, 8, 'estimate', 300, null, 0, null, 'DGE 2024; SCF 2003'),
  ('vit_k', 'male', 19, 50, 70, 'estimate', null, null, 0, null, 'DGE 2000'),
  ('vit_k', 'male', 51, null, 80, 'estimate', null, null, 0, null, 'DGE 2000'),
  ('vit_k', 'female', 19, 50, 60, 'estimate', null, null, 0, null, 'DGE 2000'),
  ('vit_k', 'female', 51, null, 65, 'estimate', null, null, 0, null, 'DGE 2000'),
  ('vit_b1', 'male', 19, 24, 1.3, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_b1', 'male', 25, 64, 1.2, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_b1', 'male', 65, null, 1.1, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_b1', 'female', 19, null, 1.0, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_b2', 'male', 19, 50, 1.4, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_b2', 'male', 51, null, 1.3, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_b2', 'female', 19, 50, 1.1, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_b2', 'female', 51, null, 1.0, 'recommendation', null, null, 0, null, 'DGE 2015'),
  ('vit_b6', 'male', 19, null, 1.6, 'recommendation', 12, null, 0, null, 'DGE 2019; EFSA 2023'),
  ('vit_b6', 'female', 19, null, 1.4, 'recommendation', 12, null, 0, null, 'DGE 2019; EFSA 2023'),
  ('iodine', 'any', 19, null, 150, 'recommendation', 600, null, 0, null, 'DGE 2025; SCF 2003'),
  ('selenium', 'male', 19, null, 70, 'estimate', 255, null, 0, null, 'DGE 2015; EFSA 2023'),
  ('selenium', 'female', 19, null, 60, 'estimate', 255, null, 0, null, 'DGE 2015; EFSA 2023'),
  -- No DGE value for adults; EFSA adequate intake for EPA + DHA.
  ('epa_dha', 'any', 19, null, 250, 'estimate', null, null, 0, null, 'EFSA 2010 (Adequate Intake EPA + DHA)'),
  ('fiber', 'any', 19, null, 30, 'guide', null, null, 0, null, 'DGE Richtwert');

-- ---------------------------------------------------------------------------
-- Seed: rules of the target calculation
-- ---------------------------------------------------------------------------
insert into public.nutrition_rules (key, value, unit, note) values
  ('pal_sedentary', 1.4, 'PAL', 'DGE: ausschließlich sitzend, wenig Freizeitbewegung (ohne Sport)'),
  ('pal_light', 1.6, 'PAL', 'DGE: überwiegend sitzend, zeitweise gehend/stehend (ohne Sport)'),
  ('pal_moderate', 1.8, 'PAL', 'DGE: überwiegend gehend/stehend (ohne Sport)'),
  ('pal_heavy', 2.0, 'PAL', 'DGE: körperlich anstrengende Arbeit (ohne Sport)'),
  ('run_kcal_per_kg_km', 1.0, 'kcal/kg/km', 'Laufen kostet etwa 1 kcal je kg und km'),
  ('run_met_easy', 9, 'MET', 'Laufen ohne geplante Strecke, ruhig'),
  ('run_met_hard', 11, 'MET', 'Laufen ohne geplante Strecke, Intervall/Tempo'),
  ('strength_met', 5, 'MET', 'Krafttraining'),
  ('mobility_met', 3, 'MET', 'Mobility, Core'),
  ('other_met', 7, 'MET', 'Rad, Schwimmen, Sonstiges'),
  ('long_run_min_minutes', 90, 'min', 'Ab dieser Dauer zählt ein langer Lauf als Long-Run-Tag'),
  ('lose_deficit_kcal', 400, 'kcal', 'Defizit beim Ziel Abnehmen'),
  ('max_deficit_kcal', 500, 'kcal', 'Größtes erlaubtes Defizit pro Tag'),
  ('gain_surplus_kcal', 250, 'kcal', 'Überschuss beim Ziel Aufbauen'),
  ('no_deficit_days_before_race', 21, 'days', 'In den letzten Wochen vor dem Rennen kein Defizit'),
  ('min_kcal_abs', 1500, 'kcal', 'Untergrenze des Tagesziels'),
  ('min_kcal_bmr_factor', 1.0, 'x BMR', 'Das Tagesziel liegt nie unter dem Grundumsatz'),
  ('fat_max_energy_pct', 35, '%', 'Höchstens dieser Anteil der Energie aus Fett (sonst mehr Kohlenhydrate)'),
  ('carb_loading_days', 2, 'days', 'Tage Carb-Loading vor dem Rennen'),
  ('carb_loading_min_race_minutes', 90, 'min', 'Carb-Loading nur für Rennen ab dieser erwarteten Dauer'),
  ('water_ml_per_kg', 35, 'ml/kg', 'Grundbedarf Flüssigkeit'),
  ('water_ml_per_training_hour', 600, 'ml/h', 'Zuschlag je Trainingsstunde (ACSM: 0,4-0,8 l/h)'),
  ('sodium_base_mg', 1500, 'mg', 'DGE-Schätzwert Natrium'),
  ('sodium_mg_per_training_hour', 500, 'mg/h', 'Zuschlag je Trainingsstunde bei Einheiten ab 60 min (ACSM: 300-600 mg/h)'),
  ('sodium_min_session_minutes', 60, 'min', 'Ab dieser Dauer zählt der Natrium-Zuschlag'),
  ('ea_low_kcal_per_kg_ffm', 30, 'kcal/kg FFM', 'Energieverfügbarkeit darunter gilt als niedrig'),
  ('ea_window_days', 7, 'days', 'Betrachtete Tage für die Energieverfügbarkeit'),
  ('ea_low_days', 3, 'days', 'So viele niedrige Tage im Zeitraum lösen den Hinweis aus')
on conflict (key) do update set value = excluded.value, unit = excluded.unit, note = excluded.note;

insert into public.nutrition_day_rules (day_type, carbs_min_gkg, carbs_max_gkg, protein_min_gkg, protein_max_gkg, fat_min_gkg, fiber_per_1000kcal, level, deficit_allowed, note) values
  ('rest', 3, 5, 1.6, 2.0, 0.8, 14, 0, true, 'Ruhetag'),
  ('easy', 5, 7, 1.6, 2.2, 0.8, 14, 1, true, 'Lockerer Lauf'),
  ('strength', 5, 7, 1.6, 2.2, 0.8, 14, 1, true, 'Krafttraining'),
  ('hard', 6, 8, 1.6, 2.0, 0.8, 10, 2, false, 'Intervall / Tempo / Schwelle'),
  ('long_run', 8, 10, 1.6, 2.0, 0.8, 10, 3, false, 'Long Run ab long_run_min_minutes'),
  ('race', 8, 10, 1.6, 2.0, 0.8, 7, 4, false, 'Renntag'),
  ('carb_loading', 10, 12, 1.6, 1.6, 0.6, 7, 5, false, 'Carb-Loading vor dem Rennen')
on conflict (day_type) do update set carbs_min_gkg = excluded.carbs_min_gkg, carbs_max_gkg = excluded.carbs_max_gkg,
  protein_min_gkg = excluded.protein_min_gkg, protein_max_gkg = excluded.protein_max_gkg, fat_min_gkg = excluded.fat_min_gkg,
  fiber_per_1000kcal = excluded.fiber_per_1000kcal, level = excluded.level, deficit_allowed = excluded.deficit_allowed, note = excluded.note;
