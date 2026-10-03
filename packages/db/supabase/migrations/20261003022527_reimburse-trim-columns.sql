-- #1129: trim reimburse_egress / reimburse_ingress to the columns the lab uses.

-- No backfill. #1130's version of this file filled transfer_date from
-- updated_at for rows that were approved but unpaid, on the theory that
-- updated_at was the approval day. That backfill never ran on prod: by the
-- time this was applied (2026-10-03) a bulk edit on 2026-09-16 had reset
-- updated_at on 9 of those 10 rows, so it would have recorded payments on a
-- day nothing was paid. They stay unpaid (transfer_date null)
-- until a reimburse admin enters the real date.

drop trigger if exists trg_reimburse_egress_updated_at on public.reimburse_egress;
drop trigger if exists trg_reimburse_ingress_updated_at on public.reimburse_ingress;
drop function if exists public.reimburse_set_updated_at();

alter table public.reimburse_egress
  drop column if exists item_comment,
  drop column if exists invoice_files,
  drop column if exists transfer_files,
  drop column if exists status,
  drop column if exists updated_at;

alter table public.reimburse_ingress
  drop column if exists ingress_files,
  drop column if exists updated_at;
