-- Remove the Debt app (#321): personal expense-splitting between members is
-- being dropped from the portal. Tables dropped in FK-dependency order (items
-- before expenses; settlements has no FK into expenses) so no cascade is
-- needed. Policies, indexes, and the trg_debt_check_debtor_not_creator
-- trigger all live on these tables and are released automatically. Functions
-- are dropped separately by exact signature since they aren't owned by a
-- table.
drop table if exists public.debt_expense_items;
drop table if exists public.debt_expenses;
drop table if exists public.debt_settlements;

drop function if exists public.debt_check_debtor_not_creator();
drop function if exists public.debt_confirm_settlement_from(p_settlement_id uuid);
drop function if exists public.debt_confirm_settlement_to(p_settlement_id uuid);
drop function if exists public.debt_create_expense(p_name text, p_description text, p_items jsonb);
drop function if exists public.debt_generate_monthly_settlements();
drop function if exists public.debt_mark_item_paid(p_item_id uuid, p_paid boolean);
drop function if exists public.debt_update_expense(p_expense_id uuid, p_name text, p_description text, p_items jsonb);
drop function if exists public.is_debt_expense_debtor(expense_uuid uuid);
