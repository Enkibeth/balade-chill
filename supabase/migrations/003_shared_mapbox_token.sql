-- ============================================================
-- shared_mapbox_token(): exposes ONLY the public Mapbox token (pk.) to
-- unauthenticated callers, so the standalone Chine page (public/chine.html,
-- which has no user session) can render its map via /api/map-token.
--
-- SECURITY DEFINER bypasses RLS, but the function returns a single column
-- and never the sensitive ai_api_key. Safe: pk. tokens are public by design
-- and already shipped to the browser by the dashboard map.
-- ============================================================

create or replace function public.shared_mapbox_token()
returns text
language sql
security definer
set search_path = public
as $$
  select mapbox_token
  from public.user_settings
  where mapbox_token is not null
  order by updated_at desc
  limit 1
$$;

grant execute on function public.shared_mapbox_token() to anon, authenticated;
