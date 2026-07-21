-- Realtime updates for lightbox comments and reactions.

alter publication supabase_realtime add table public.gallery_comments;
alter publication supabase_realtime add table public.gallery_image_votes;
