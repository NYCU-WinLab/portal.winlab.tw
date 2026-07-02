-- Tier 1 dead-object cleanup (audit follow-up):
--   * debit_* tables + old un-prefixed debit functions — superseded by the debt_*
--     rename (live /debt route uses debt_create_expense etc.)
--   * egress / ingress tables + prevent_egress_status_change — superseded by
--     reimburse_egress / reimburse_ingress (live lib/reimburse/*.ts)
--   * orphan functions referencing already-dropped tables (documents/document_signers)
--     and unbound helpers with no code/trigger/policy usage
-- All confirmed zero code refs; no live FK points into these tables (verified
-- against live DB). Tables dropped first so their triggers/policies release the
-- functions; then the now-unreferenced functions.

-- 1. dead tables (debit_expense_items FKs debit_expenses → items first)
drop table if exists public.debit_expense_items;
drop table if exists public.debit_expenses;
drop table if exists public.debit_settlements;
drop table if exists public.egress;
drop table if exists public.ingress;

-- 2. dead functions (by name, any signature; NO cascade — if one is still
--    referenced by a live policy the drop errors and the whole tx rolls back,
--    which is the safe failure mode).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        -- old debit feature (replaced by debt_*)
        'check_debtor_not_creator','is_expense_debtor','confirm_settlement_from',
        'confirm_settlement_to','create_expense','update_expense','mark_item_paid',
        'generate_monthly_settlements',
        -- old egress feature (replaced by reimburse_*)
        'prevent_egress_status_change',
        -- orphans referencing dropped documents/document_signers tables
        'can_sign_document','can_view_document_signers','can_view_signature_boxes',
        -- unbound helpers (no code/trigger/policy usage)
        'generate_short_id','has_any_role_in_system','update_invoice_invoices_updated_at'
      )
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end $$;
