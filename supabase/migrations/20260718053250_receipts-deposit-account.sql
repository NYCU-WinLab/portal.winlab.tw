-- Which account the uploader wants reimbursed into: 郵局 (post) or 玉山 (esun).
-- Mirrors receipts.status — plain text + a CHECK, not a Postgres enum, to stay
-- consistent with how this table already models its other small closed sets.
-- Nullable so existing receipts stay untouched (NULL = unknown/pre-migration);
-- the upload dialog makes it required for anything new.

alter table public.receipts
  add column if not exists deposit_account text;

alter table public.receipts
  drop constraint if exists receipts_deposit_account_check;

alter table public.receipts
  add constraint receipts_deposit_account_check
  check (deposit_account is null or deposit_account = any (array['post'::text, 'esun'::text]));
