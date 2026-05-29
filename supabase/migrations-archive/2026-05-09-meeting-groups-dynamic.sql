-- Allow any positive group_number (remove fixed upper-bound of 9)
ALTER TABLE public.meeting_groups
  DROP CONSTRAINT IF EXISTS meeting_groups_group_number_check,
  ADD CONSTRAINT meeting_groups_group_number_positive CHECK (group_number > 0);
