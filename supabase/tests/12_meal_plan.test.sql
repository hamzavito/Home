-- Madplan og opskrifter: isolation mellem husstande, gem opskrift, kopiér uge,
-- indkøbsliste uden dubletter og madbudget-kategori
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1');
insert into public.budget_categories (id, household_id, name, icon, created_by) values
  ('44444444-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Dagligvarer', 'cart', '00000000-0000-0000-0000-0000000000a1'),
  ('44444444-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Mad', 'cart', '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- ---------------------------------------------------------------- opskrifter
do $$
declare rid uuid; ok boolean;
begin
  rid := public.save_recipe(null,
    '{"name":" Kylling i karry ","servings":4,"prep_minutes":40,"category":"Kylling","tags":["Børnevenlig","Hurtig"],"steps":"Steg kyllingen.","is_favorite":true}',
    '[{"name":"Kyllingebryst","amount_milli":700000,"unit":"g"},{"name":"Løg","amount_milli":2000,"unit":"stk"},{"name":"Salt","note":"efter smag"},{"name":"  "}]');
  assert (select name from public.recipes where id = rid) = 'Kylling i karry', 'navn trimmet';
  assert (select tags from public.recipes where id = rid) = array['Børnevenlig', 'Hurtig'], 'tags gemt';
  assert (select created_by from public.recipes where id = rid) = '00000000-0000-0000-0000-0000000000a1', 'oprettet af';
  assert (select count(*) from public.recipe_ingredients where recipe_id = rid) = 3, 'tomme ingredienser springes over';
  assert (select array_agg(name order by sort_order) from public.recipe_ingredients where recipe_id = rid) = array['Kyllingebryst', 'Løg', 'Salt'], 'rækkefølge';

  -- Redigering erstatter ingredienserne
  perform public.save_recipe(rid, '{"name":"Kylling i karry","servings":6,"tags":[]}', '[{"name":"Kyllingebryst","amount_milli":1000000,"unit":"g"}]');
  assert (select servings from public.recipes where id = rid) = 6, 'portioner ændret';
  assert (select count(*) from public.recipe_ingredients where recipe_id = rid) = 1, 'ingredienser erstattet';

  -- Ugyldig enhed og for lange tags afvises
  begin
    perform public.save_recipe(null, '{"name":"X"}', '[{"name":"Mel","amount_milli":1000,"unit":"kop"}]');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'ukendt enhed afvist';
  begin
    perform public.save_recipe(null, '{"name":"X","tags":[" mellemrum "]}', '[]');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'tag med mellemrum omkring afvist';

  -- Opskrifter kan ikke slettes (kun arkiveres)
  begin
    delete from public.recipes where id = rid;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'sletning af opskrift ikke tilladt';
  update public.recipes set archived_at = now() where id = rid;
  update public.recipes set archived_at = null where id = rid;
end $$;

-- ---------------------------------------------------------------- isolation
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean; rid uuid := (select id from public.recipes limit 1);
begin
  assert rid is null, 'B kan ikke se A''s opskrifter';
  assert (select count(*) from public.recipe_ingredients) = 0, 'B kan ikke se A''s ingredienser';
  -- B kan ikke indsætte i A's husstand
  begin
    insert into public.recipes (household_id, name) values ('11111111-1111-1111-1111-111111111111', 'Hack');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'B kan ikke oprette opskrift hos A';
  begin
    insert into public.meal_plan_entries (household_id, plan_date, title) values ('11111111-1111-1111-1111-111111111111', '2026-10-12', 'Hack');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'B kan ikke planlægge hos A';
end $$;
-- B kan ikke bruge A's opskrift i sin egen plan (sammensat fremmednøgle)
reset role;
do $$
declare ok boolean; rid uuid := (select id from public.recipes where household_id = '11111111-1111-1111-1111-111111111111' limit 1);
begin
  begin
    insert into public.meal_plan_entries (household_id, plan_date, title, recipe_id, created_by)
    values ('22222222-2222-2222-2222-222222222222', '2026-10-12', 'Lånt', rid, '00000000-0000-0000-0000-0000000000b1');
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'opskrift fra anden husstand afvist';
  -- Madbudget kan ikke pege på en anden husstands kategori
  begin
    update public.households set grocery_category_id = '44444444-0000-0000-0000-000000000002' where id = '11111111-1111-1111-1111-111111111111';
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'madbudget fra anden husstand afvist';
end $$;

-- ---------------------------------------------------------------- ugeplan og kopiering
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare rid uuid := (select id from public.recipes limit 1); n integer; ok boolean;
begin
  -- Uge 41 (mandag 5. okt.): man = opskrift, tir = fri tekst, ons = rester
  insert into public.meal_plan_entries (household_id, plan_date, recipe_id, title, servings) values
    ('11111111-1111-1111-1111-111111111111', '2026-10-05', rid, 'Kylling i karry', 4);
  insert into public.meal_plan_entries (household_id, plan_date, title) values
    ('11111111-1111-1111-1111-111111111111', '2026-10-06', 'Pasta bolognese'),
    ('11111111-1111-1111-1111-111111111111', '2026-10-07', 'Rester');
  -- Flyt onsdag til torsdag
  update public.meal_plan_entries set plan_date = '2026-10-08' where title = 'Rester';
  -- Næste uge har allerede tirsdag
  insert into public.meal_plan_entries (household_id, plan_date, title) values ('11111111-1111-1111-1111-111111111111', '2026-10-13', 'Fiskefrikadeller');

  n := public.copy_meal_week('2026-10-05', '2026-10-12');
  assert n = 2, format('2 retter kopieret (tirsdag var optaget), fik %s', n);
  assert (select title from public.meal_plan_entries where plan_date = '2026-10-13') = 'Fiskefrikadeller', 'eksisterende ret bevaret';
  assert (select recipe_id from public.meal_plan_entries where plan_date = '2026-10-12') = rid, 'opskriften følger med';
  assert public.copy_meal_week('2026-10-05', '2026-10-12') = 0, 'kopiering to gange giver ingen dubletter';
  begin
    perform public.copy_meal_week('2026-10-06', '2026-10-12');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'uger skal starte mandag';
end $$;

-- ---------------------------------------------------------------- indkøbsliste
do $$
declare n integer; lid uuid;
begin
  n := public.add_meal_ingredients_to_shopping('2026-10-05',
    '[{"key":"løg|stk","name":"Løg","quantity":"5 stk"},{"key":"ris|vægt","name":"Ris","quantity":"500 g"},{"key":"kyllingebryst|vægt","name":"Kyllingebryst","quantity":"700 g"}]');
  assert n = 3, '3 varer tilføjet';
  lid := (select id from public.shopping_lists limit 1);
  assert (select count(*) from public.shopping_items where list_id = lid and source = 'meal_plan') = 3, 'markeret som fra madplanen';
  assert (select meal_week from public.shopping_items where name = 'Løg') = '2026-10-05', 'uge gemt';
  assert (select added_by from public.shopping_items where name = 'Løg') = '00000000-0000-0000-0000-0000000000a1', 'tilføjet af';

  -- Samme knap igen (med en ændret mængde): ingen dubletter, mængden opdateres
  n := public.add_meal_ingredients_to_shopping('2026-10-05', '[{"key":"løg|stk","name":"Løg","quantity":"6 stk"},{"key":"ris|vægt","name":"Ris","quantity":"500 g"}]');
  assert (select count(*) from public.shopping_items where list_id = lid) = 3, 'ingen dubletter';
  assert (select quantity from public.shopping_items where name = 'Løg') = '6 stk', 'mængde opdateret';

  -- Allerede købt (afkrydset) røres ikke
  update public.shopping_items set is_checked = true where name = 'Ris';
  perform public.add_meal_ingredients_to_shopping('2026-10-05', '[{"key":"ris|vægt","name":"Ris","quantity":"1 kg"}]');
  assert (select quantity from public.shopping_items where name = 'Ris') = '500 g', 'købt vare uændret';
  assert (select count(*) from public.shopping_items where list_id = lid) = 3, 'stadig ingen dubletter';

  -- En anden uge er en anden linje
  perform public.add_meal_ingredients_to_shopping('2026-10-12', '[{"key":"løg|stk","name":"Løg","quantity":"2 stk"}]');
  assert (select count(*) from public.shopping_items where list_id = lid and name = 'Løg') = 2, 'ny uge = ny linje';

  -- Manuelle varer påvirkes ikke
  insert into public.shopping_items (household_id, list_id, name) values ('11111111-1111-1111-1111-111111111111', lid, 'Løg');
  assert (select source from public.shopping_items where name = 'Løg' and source_key is null) = 'manual', 'manuel vare';
end $$;

-- B kan ikke skrive på A's liste via funktionen
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  perform public.add_meal_ingredients_to_shopping('2026-10-05', '[{"key":"løg|stk","name":"Løg","quantity":"1 stk"}]');
  assert (select count(*) from public.shopping_items) = 1, 'B''s egen liste har én vare';
end $$;

-- ---------------------------------------------------------------- madbudget
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update public.households set grocery_category_id = '44444444-0000-0000-0000-000000000001' where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select grocery_category_id from public.households where id = '11111111-1111-1111-1111-111111111111') = '44444444-0000-0000-0000-000000000001', 'madbudget valgt';
end $$;

-- ---------------------------------------------------------------- priser (forberedt)
do $$ begin
  insert into public.ingredient_prices (household_id, name, price_ore, amount_milli, unit, store)
  values ('11111111-1111-1111-1111-111111111111', 'Skyr', 3100, 1000000, 'g', 'Netto');
  assert (select count(*) from public.ingredient_prices) = 1, 'pris gemt';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from public.ingredient_prices) = 0, 'B kan ikke se A''s priser';
end $$;

-- ---------------------------------------------------------------- eksport
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare e jsonb := public.export_household_data();
begin
  assert jsonb_array_length(e -> 'recipes') = 1, 'opskrifter med i eksport';
  assert jsonb_array_length(e -> 'meal_plan_entries') = 6, 'madplan med i eksport';
end $$;
reset role;
rollback;
