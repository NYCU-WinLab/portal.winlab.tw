begin;
create extension if not exists pgtap with schema public;

select plan(4);

select lives_ok(
  $$insert into public.door_events (source, user_id, user_name, ok, latency_ms)
    values ('mcp', '11111111-2222-3333-4444-555555555555', 'mcp fixture', true, 420)$$,
  'an MCP unlock is recorded like a web one'
);

select throws_ok(
  $$insert into public.door_events (source, user_name, ok)
    values ('mcp', 'mcp without a member', true)$$,
  '23514', null, 'an MCP unlock names the member it acted for'
);

select throws_ok(
  $$insert into public.door_events (source, user_id, user_name, ok, card_id)
    values ('mcp', '11111111-2222-3333-4444-555555555555', 'mcp with a card', true, '0000000042')$$,
  '23514', null, 'an MCP unlock carries no card fields'
);

select throws_ok(
  $$insert into public.door_events (source, user_id, user_name, ok)
    values ('agent', '11111111-2222-3333-4444-555555555555', 'unknown source', true)$$,
  '23514', null, 'the source is still one of web, mcp or card'
);

select * from finish();
rollback;
