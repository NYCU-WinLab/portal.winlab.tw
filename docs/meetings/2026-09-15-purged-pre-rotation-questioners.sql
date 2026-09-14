-- Rollback for 20260915000002_purge_pre_rotation_questioners.sql (#1143).
--
-- The eighteen meeting_questioners rows that migration deleted, captured from
-- prod on 2026-09-15 before it ran. All six meetings are 寒假 weeks in
-- January–February 2026 — real meetings, five of the six with an uploaded deck
-- and video — that the questioner rotation retroactively staffed months after
-- they happened, on 2026-07-22 and 2026-08-17. The rotation itself only began
-- on 2026-06-15.
--
-- Kept because a delete is irreversible and "we decided these were wrong" is a
-- judgement someone may want to re-examine. Re-running this restores the rows
-- exactly; it will NOT restore them through meetings_sync_questioners, which
-- now refuses to staff a meeting older than a member's own pool join date.
insert into public.meeting_questioners (meeting_id, user_id, source, assigned_at) values
('640303bc-a595-4f5c-b90d-31a8cb3a5b0d','476d232e-b5e5-4e46-9698-7c64191e3c9f','auto','2026-07-22 11:19:26.955536+00'),
('640303bc-a595-4f5c-b90d-31a8cb3a5b0d','51268bd5-712d-4155-abd9-e9203db26f9f','auto','2026-07-22 11:19:26.955536+00'),
('640303bc-a595-4f5c-b90d-31a8cb3a5b0d','ac24bb3f-9daa-43ae-bd57-f93e9d25dc89','auto','2026-07-22 11:19:26.955536+00'),
('9169382e-a964-42a2-a406-8b9fa18a0dd9','476d232e-b5e5-4e46-9698-7c64191e3c9f','auto','2026-07-22 11:19:27.150238+00'),
('9169382e-a964-42a2-a406-8b9fa18a0dd9','51268bd5-712d-4155-abd9-e9203db26f9f','auto','2026-07-22 11:19:27.150238+00'),
('9169382e-a964-42a2-a406-8b9fa18a0dd9','ac24bb3f-9daa-43ae-bd57-f93e9d25dc89','auto','2026-07-22 11:19:27.150238+00'),
('0e860813-3618-4754-9651-9dc903eb0559','476d232e-b5e5-4e46-9698-7c64191e3c9f','auto','2026-07-22 11:19:27.47383+00'),
('0e860813-3618-4754-9651-9dc903eb0559','51268bd5-712d-4155-abd9-e9203db26f9f','auto','2026-07-22 11:19:27.47383+00'),
('0e860813-3618-4754-9651-9dc903eb0559','ac24bb3f-9daa-43ae-bd57-f93e9d25dc89','auto','2026-07-22 11:19:27.47383+00'),
('c212edf8-9e4d-4d24-a206-b13c9ac362d6','476d232e-b5e5-4e46-9698-7c64191e3c9f','auto','2026-07-22 11:19:28.11797+00'),
('c212edf8-9e4d-4d24-a206-b13c9ac362d6','51268bd5-712d-4155-abd9-e9203db26f9f','auto','2026-07-22 11:19:28.11797+00'),
('c212edf8-9e4d-4d24-a206-b13c9ac362d6','ac24bb3f-9daa-43ae-bd57-f93e9d25dc89','auto','2026-07-22 11:19:28.11797+00'),
('debcf19b-384f-41b0-9e69-8e3e5bfc24a0','476d232e-b5e5-4e46-9698-7c64191e3c9f','auto','2026-07-22 11:19:28.62216+00'),
('debcf19b-384f-41b0-9e69-8e3e5bfc24a0','51268bd5-712d-4155-abd9-e9203db26f9f','auto','2026-07-22 11:19:28.62216+00'),
('debcf19b-384f-41b0-9e69-8e3e5bfc24a0','ac24bb3f-9daa-43ae-bd57-f93e9d25dc89','auto','2026-07-22 11:19:28.62216+00'),
('21347797-8777-43d9-8b3b-7bfaa05a21f4','055abafc-13a6-4bd7-99a6-932c62358f01','auto','2026-08-17 08:24:22.730712+00'),
('21347797-8777-43d9-8b3b-7bfaa05a21f4','3700ed52-aebb-40cd-b4ff-214090f5d949','auto','2026-08-17 08:24:22.730712+00'),
('21347797-8777-43d9-8b3b-7bfaa05a21f4','afaf335f-6a32-4257-a776-e5f25452744c','auto','2026-08-17 08:24:22.730712+00');
