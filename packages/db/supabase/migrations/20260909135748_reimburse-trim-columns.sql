-- #1129: trim reimburse_egress / reimburse_ingress to the columns the lab uses.

-- Backfill: 7 rows are approved but never got a transfer_date. updated_at is
-- when the row was flipped to approved, so use it before dropping the column.
update public.reimburse_egress
set transfer_date = (updated_at at time zone 'Asia/Taipei')::date
where status = 'approved' and transfer_date is null;

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
