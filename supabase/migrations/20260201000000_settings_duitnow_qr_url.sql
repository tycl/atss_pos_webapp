-- CLAUDE.md section 9: "show the merchant's own DuitNow QR image on screen."
-- Section 6's schema listing for `settings` didn't include a place to store
-- this, so adding it here. A URL rather than an upload column since no file
-- storage is set up yet.

alter table public.settings
  add column duitnow_qr_url text;
