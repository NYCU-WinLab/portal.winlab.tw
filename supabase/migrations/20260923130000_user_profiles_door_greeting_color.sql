-- The door's LED panel greets with three lines: 歡迎, the member's name, and a
-- suffix. This column lets each member pick the colour of the name line on
-- /profile. Null means the panel's default (white), which the service owns.
--
-- The check mirrors apps/portal/lib/door/greeting-color.ts: lower-case
-- #rrggbb, and at least one channel >= 128 so the line is visible on an LED
-- (a dim colour is barely lit, not dark grey). The app lower-cases before
-- writing, so an upper-case value here is a bug, not a member's typo.
--
-- The brightness test sits inside a CASE on the format match: Postgres does
-- not promise to evaluate AND left to right, and the hex cast raises 22P02
-- instead of a check violation on a malformed value.
--
-- No policy or grant changes, same as door_greeting_suffix (20260923120000):
-- user_profiles_update_own limits a member to their own row, authenticated
-- already holds table-level UPDATE, prevent_role_escalation keeps pinning
-- roles / is_admin / lab_status, and anon's column-level SELECT stays
-- (id, name).

alter table public.user_profiles
  add column door_greeting_color text;

alter table public.user_profiles
  add constraint user_profiles_door_greeting_color_check check (
    door_greeting_color is null
    or case
      when door_greeting_color ~ '^#[0-9a-f]{6}$' then
        greatest(
          ('x' || substr(door_greeting_color, 2, 2))::bit(8)::int,
          ('x' || substr(door_greeting_color, 4, 2))::bit(8)::int,
          ('x' || substr(door_greeting_color, 6, 2))::bit(8)::int
        ) >= 128
      else false
    end
  );

comment on column public.user_profiles.door_greeting_color is
  'Colour of the name line of the door LED panel greeting, set by the member on /profile. Lower-case #rrggbb with max(r, g, b) >= 128. Null means the panel default (white). Read by GET /api/door/greetings.';
