begin;
create extension if not exists pgtap with schema public;

select plan(10);

select lives_ok(
  $$insert into public.door_events (user_id, user_name, ok)
    values ('11111111-2222-3333-4444-555555555555', 'web fixture', true)$$,
  'existing web writers retain their defaults'
);

select is(
  (select source from public.door_events where user_name = 'web fixture'),
  'web',
  'old-style inserts remain web events'
);

select lives_ok(
  $$insert into public.door_events
    (source, source_event_id, card_id, device_event_code, device_reader,
     received_at, user_name, ok)
    values ('card', repeat('a', 64), '0000000042', '0000', 1, now(), 'guest fixture', true)$$,
  'a physical guest card does not need a user account'
);

select lives_ok(
  $$insert into public.door_events
    (source, source_event_id, card_id, device_event_code, device_reader,
     received_at, user_name, ok)
    values ('card', repeat('b', 64), '0000000042', '00FE', 1, now(), 'unknown fixture', null)$$,
  'unknown physical event codes are neither granted nor denied'
);

select lives_ok(
  $$insert into public.door_events
    (source, source_event_id, card_id, device_event_code, device_reader,
     received_at, user_name, ok)
    values ('card', repeat('a', 64), '0000000042', '0000', 1, now(), 'relabel attempt', true)
    on conflict (source_event_id) do nothing$$,
  'delivery replay is idempotent'
);

select is(
  (select user_name from public.door_events where source_event_id = repeat('a', 64)),
  'guest fixture',
  'delivery replay does not relabel an existing holder snapshot'
);

select throws_ok(
  $$insert into public.door_events (user_name, ok) values ('missing actor', true)$$,
  '23514', null, 'web events still require a user'
);

select throws_ok(
  $$insert into public.door_events
    (source, source_event_id, card_id, device_event_code, device_reader,
     received_at, user_name, ok)
    values ('card', repeat('c', 64), '42', '0000', 1, now(), 'bad card', true)$$,
  '23514', null, 'physical identifiers preserve the ten-digit contract'
);

select throws_ok(
  $$insert into public.door_events
    (source, source_event_id, card_id, device_event_code, device_reader,
     received_at, user_name, ok)
    values ('card', repeat('d', 64), '0000000042', '0014', 1, now(), 'missing reason', false)$$,
  '23514', null, 'denied access requires a reason'
);

set local role authenticated;
select throws_ok(
  $$insert into public.door_events
    (source, source_event_id, card_id, device_event_code, device_reader,
     received_at, user_name, ok)
    values ('card', repeat('e', 64), '0000000042', '0000', 1, now(), 'forgery', true)$$,
  '42501', null, 'members cannot forge physical access events'
);
reset role;

select * from finish();
rollback;
