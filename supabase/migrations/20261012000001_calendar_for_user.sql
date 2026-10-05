-- =============================================================================
-- Kalender: "Gælder for" – hvem aftalen gælder (adskilt fra "Oprettet af")
-- =============================================================================
-- NULL = Begge/Fælles. Eksisterende aftaler får derfor automatisk "Fælles"
-- uden at noget data ændres. Fremmednøglen sikrer, at personen er medlem af
-- SAMME husstand (virker for alle husstande – ingen navne er hardcodet).
-- Forlader et medlem husstanden, bliver aftalen fælles i stedet for at forsvinde.
-- =============================================================================
alter table public.calendar_events
  add column for_user_id uuid;

alter table public.calendar_events
  add constraint calendar_events_for_user_fk
  foreign key (household_id, for_user_id)
  references public.household_members (household_id, user_id)
  on delete set null (for_user_id);

create index calendar_events_for_user_idx on public.calendar_events (for_user_id) where for_user_id is not null;

grant insert (for_user_id) on public.calendar_events to authenticated;
grant update (for_user_id) on public.calendar_events to authenticated;
