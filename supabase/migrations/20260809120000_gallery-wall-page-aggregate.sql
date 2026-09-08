-- Wall data layer, one query instead of four.
--
-- The home wall used to fetch cover rows, then every vote row for the visible
-- page, then every comment row, and (for logged-out visitors) a second profile
-- lookup — reducing all of it to counts + the viewer's own reaction in JS. This
-- view pushes that reduction into Postgres so a page is one round trip whose
-- payload scales with covers, not with engagement.
--
-- It is layered on gallery_wall_covers so the representative-cover / deep-link
-- ordering rules stay the single source of truth. security_invoker = true keeps
-- RLS intact: gallery_image_votes and gallery_comments are both SELECT
-- USING (true), and anon is column-scoped to user_profiles(id, name) — this view
-- only ever reads those two columns of a profile, so it leaks nothing new.

create or replace view public.gallery_wall_page
with (security_invoker = true) as
select
  w.id,
  w.name,
  w.image_path,
  w.media_type,
  w.poster_path,
  w.duration_seconds,
  w.created_by,
  w.created_at,
  w.pinned_at,
  w.sequence_id,
  w.sequence_index,
  coalesce(nullif(btrim(up.name), ''), 'Unknown') as uploader_name,
  coalesce(rc.reaction_counts, '{}'::jsonb) as reaction_counts,
  coalesce(rn.reaction_names, '{}'::jsonb) as reaction_names,
  mine.reaction as my_reaction,
  coalesce(cc.comment_count, 0) as comment_count
from public.gallery_wall_covers w
left join public.user_profiles up on up.id = w.created_by
left join lateral (
  -- { reaction: count } for this cover
  select jsonb_object_agg(t.reaction, t.cnt) as reaction_counts
  from (
    select v.reaction, count(*)::int as cnt
    from public.gallery_image_votes v
    where v.image_id = w.id
    group by v.reaction
  ) t
) rc on true
left join lateral (
  -- { reaction: [display name, ...] } for this cover, oldest reaction first
  select jsonb_object_agg(t.reaction, t.names) as reaction_names
  from (
    select
      v.reaction,
      to_jsonb(
        array_agg(
          coalesce(nullif(btrim(p.name), ''), 'Unknown')
          order by v.created_at asc, v.user_id asc
        )
      ) as names
    from public.gallery_image_votes v
    left join public.user_profiles p on p.id = v.user_id
    where v.image_id = w.id
    group by v.reaction
  ) t
) rn on true
left join lateral (
  -- the calling viewer's own reaction, if any (null for anon)
  select v.reaction
  from public.gallery_image_votes v
  where v.image_id = w.id
    and v.user_id = auth.uid()
  limit 1
) mine on true
left join lateral (
  select count(*)::int as comment_count
  from public.gallery_comments c
  where c.image_id = w.id
) cc on true;

grant select on public.gallery_wall_page to anon, authenticated, service_role;

-- gallery_comments (20260602010000) was created relying on Supabase's default
-- privileges for its table grant, so prod grants SELECT to anon / authenticated
-- but the captured baseline + migrations that `db reset` / CI replay do not —
-- the same silent prod-vs-local divergence #332 warns about. The comment_count
-- lateral above reads gallery_comments under security_invoker, so the grant has
-- to be real on both. Pin it explicitly; a no-op against prod, which already
-- has it (the wall's comment counts have always rendered, anon included).
grant select on public.gallery_comments to anon, authenticated, service_role;
