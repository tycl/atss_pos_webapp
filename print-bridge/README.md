# ATSS print-bridge

A small local helper the ATSS POS web app talks to over your shop's own
network, so it can print receipts and kitchen tickets on a LAN-connected
ESC/POS thermal printer and open the cash drawer. This runs on a PC at the
counter — it is a separate program from the POS web app itself.

## Requirements

- Node.js 18 or newer installed on the counter PC
- A thermal printer that supports raw ESC/POS over the network (listening
  on port 9100 — the standard "raw/JetDirect" port almost every network
  thermal printer uses)

USB and Bluetooth printers aren't supported yet — only printers reachable
over the network.

## Setup

1. Find your printer's IP address (check its self-test/configuration page,
   or your router's list of connected devices).
2. In this folder, set the printer's address and start the agent:

   ```sh
   # Windows (PowerShell)
   $env:PRINTER_HOST="192.168.1.50"; npm start

   # macOS/Linux
   PRINTER_HOST=192.168.1.50 npm start
   ```

   Leave it running while the shop is open — closing the terminal stops it.

3. In the POS web app, go to **Back office → Outlet settings** and set
   "Print-bridge agent URL":
   - `http://localhost:7777` if the browser runs on this same counter PC
   - `http://<this PC's LAN IP>:7777` if the browser runs on a different
     device (e.g. a tablet) on the same network

4. Visit `http://localhost:7777/health` in a browser to confirm the agent
   is running and see which printer it's configured for.

## Configuration (environment variables)

| Variable       | Default         | Meaning                                  |
| -------------- | --------------- | ---------------------------------------- |
| `PRINTER_HOST` | `192.168.1.100` | Your printer's IP address                |
| `PRINTER_PORT` | `9100`          | Raw ESC/POS port (rarely needs changing) |
| `AGENT_PORT`   | `7777`          | Port this agent listens on               |

## Limitations (current version)

- LAN/network printers only — no USB or Bluetooth support yet.
- One printer handles both receipts and kitchen tickets — can't route to
  two different printers yet.
- No authentication — any device on your local network can send print jobs
  to this agent. Keep your shop's Wi-Fi/network private.
- Starting this automatically when the PC boots isn't set up — for now it
  needs to be started manually (or via your own OS startup script) each day.
