-- Let a field exist before it's assigned to a signer. UX flow is:
--   1. place the box on the PDF (signer unset)
--   2. tap the box's badge to pick who signs
-- Validation at submit time still requires every field to have a signer.
alter table public.approve_fields alter column signer_id drop not null;
