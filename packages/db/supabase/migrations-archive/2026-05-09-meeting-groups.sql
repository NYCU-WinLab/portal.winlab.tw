-- Add per-meeting location, start_time, and question group to meetings
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS location    text NOT NULL DEFAULT 'EC 411',
  ADD COLUMN IF NOT EXISTS start_time  text NOT NULL DEFAULT '15:30',
  ADD COLUMN IF NOT EXISTS question_group_number int;

-- Meeting question groups (updated each semester by admin)
CREATE TABLE IF NOT EXISTS public.meeting_groups (
  group_number  int PRIMARY KEY CHECK (group_number BETWEEN 1 AND 9),
  members       text[] NOT NULL DEFAULT '{}',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings
  ADD CONSTRAINT fk_meeting_question_group
    FOREIGN KEY (question_group_number)
    REFERENCES public.meeting_groups(group_number)
    ON DELETE SET NULL;

-- Seed initial groups
INSERT INTO public.meeting_groups (group_number, members) VALUES
  (1, ARRAY['廖洺玄', '洪翊婕', '謝岱廷']),
  (2, ARRAY['沈昱宏', '詹詠翔', '劉翰成']),
  (3, ARRAY['蘇胤翔', '覃朝福', '葉睿丞'])
ON CONFLICT (group_number) DO NOTHING;

-- RLS
ALTER TABLE public.meeting_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read meeting_groups"
  ON public.meeting_groups FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "meetings admin write meeting_groups"
  ON public.meeting_groups FOR ALL
  TO authenticated
  USING (is_meetings_admin())
  WITH CHECK (is_meetings_admin());
