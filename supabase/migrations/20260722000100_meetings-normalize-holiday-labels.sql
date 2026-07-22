-- Normalize existing holiday rows to the "reason lives in week_label" convention
-- (the same shape meetings_generate_semester now emits: 第N週(原因), presenter
-- empty). Historically three shapes coexisted in /meetings:
--   * number in week_label + reason in presenter — 第7週 / 清明連假, 第8週 / 月考週
--   * reason already in week_label, presenter null — 大掃除, 月考週 (already fine)
--   * reason in presenter, no number — 春節
-- After this migration the reason is always in week_label and presenter is null.
--
-- Only touches rows whose reason still sits in presenter, and only when no real
-- user is attached (presenter_user_id is null). 暑假/寒假 rows are is_holiday=false
-- with a real presenter (meetings still happen — the label is just the phase),
-- so the WHERE clause deliberately leaves them alone. Rows already in the target
-- shape (大掃除, 月考週) have presenter null and are not rewritten — we do NOT
-- fabricate the 第N週 numbers an admin already dropped.
--
-- Note: the CI db-test baseline does not contain these seeded rows, so this
-- UPDATE matches zero rows there (a harmless no-op); it only reshapes prod data.
--
-- Deliberately conservative: only the two shapes we know exist are rewritten —
--   * an exact 第N週 label (anchored ^第\d+週$) + reason in presenter → 第N週(原因)
--   * an empty/null label + reason in presenter                      → 原因
-- Any other holiday row (a non-empty label that is NOT a bare 第N週, e.g. a
-- free-text activity name, sitting next to a different presenter value) is left
-- untouched rather than risk (a) folding a real name into week_label and erasing
-- it, or (b) double-wrapping an already-decorated 第N週(原因) label. The anchor +
-- WHERE guard make the transform lossless and idempotent (re-runs match nothing
-- once presenter is null).
update public.meetings
set
  week_label = case
    when week_label ~ '^第\d+週$' then week_label || '(' || presenter || ')'
    else presenter
  end,
  presenter = null
where is_holiday = true
  and presenter is not null
  and presenter_user_id is null
  and (week_label ~ '^第\d+週$' or nullif(week_label, '') is null);
