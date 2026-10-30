-- CLAUDE.md section 2: "a local print-bridge agent (small helper process on
-- a counter PC/network) that the browser calls over LAN HTTP." Section 6's
-- schema listing didn't include a place to store the agent's address, same
-- situation as duitnow_qr_url in the previous migration.

alter table public.settings
  add column print_bridge_url text;
