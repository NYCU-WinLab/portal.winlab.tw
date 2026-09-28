-- Add notified_at to track whether an announcement email has been sent
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- Index for quick lookup of unnotified published announcements
CREATE INDEX IF NOT EXISTS announcements_notified_at
  ON public.announcements (notified_at)
  WHERE is_published = true;
