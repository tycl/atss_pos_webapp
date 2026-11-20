# ATSS print-bridge

A small local helper the ATSS POS web app talks to over your shop's own
network, so it can print receipts and kitchen tickets on a LAN-connected
ESC/POS thermal printer and open the cash drawer. This runs on a PC at the
counter — it is a separate program from the POS web app itself.

## Requirements

- Node.js 18 or newer installed on the counter PC
- A thermal printer that supports raw ESC/POS, connected either:
  - over the network (listening on port 9100 — the standard
    "raw/JetDirect" port almost every network thermal printer uses), or
  - over USB, already installed as a printer on the counter PC

Bluetooth printers aren't supported yet.

## Daily use (after first-time setup below)

Each day before the shop opens, start the agent from this folder:

```powershell
# Windows, USB printer (example: a printer named "POS80 Printer")
$env:PRINTER_MODE="usb"; $env:USB_PRINTER_NAME="POS80 Printer"; npm start
```

```sh
# Windows/macOS/Linux, network printer (example: 192.168.1.50)
$env:PRINTER_HOST="192.168.1.50"; npm start   # Windows (PowerShell)
PRINTER_HOST=192.168.1.50 npm start           # macOS/Linux
```

Leave the terminal window open while the shop is open — closing it (or
restarting the PC) stops the agent, and it must be started again the same
way. See "Setup — network printer" / "Setup — USB printer" below if you
haven't configured a printer yet, and "Limitations" for the auto-start
caveat.

## Setup — network printer

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

## Setup — USB printer

The agent sends print jobs straight to the printer's raw port/queue,
bypassing any driver formatting, so the ESC/POS bytes arrive unmodified.

**Windows:**

1. Install the printer normally (driver from the printer box/website, or
   Windows' own "Generic / Text Only" driver) so it shows up in
   **Settings → Printers & scanners**, and note its exact name (e.g.
   `POS80 Printer`).
2. Start the agent with that printer name:

   ```powershell
   $env:PRINTER_MODE="usb"; $env:USB_PRINTER_NAME="POS80 Printer"; npm start
   ```

   This sends jobs through the Print Spooler's native raw-print API
   (`send-raw-windows.ps1`), by printer name — not by port name. A port
   name like `USB001`/`USB002` (seen on the printer's Ports tab) is a Print
   Spooler construct, not a real device, so writing to one directly (e.g.
   with `copy`) silently does nothing — it does not reach the printer.

**macOS/Linux:**

1. Install/add the printer so CUPS has a queue for it, using a raw/generic
   driver (on Linux, "Generic" → "Raw Queue" in the CUPS web admin at
   `http://localhost:631`; on macOS, "Generic PostScript Printer" also
   accepts raw data).
2. Run `lpstat -p` to find the queue name.
3. Start the agent with that queue name:

   ```sh
   PRINTER_MODE=usb USB_PRINTER_QUEUE=Receipt_Printer npm start
   ```

## Finish setup (both printer types)

1. Visit `http://localhost:7777/health` in a browser to confirm the agent
   is running and see which printer it's configured for.
2. In the POS web app, go to **Back office → Outlet settings** and set
   "Print-bridge agent URL":
   - `http://localhost:7777` if the browser runs on this same counter PC
   - `http://<this PC's LAN IP>:7777` if the browser runs on a different
     device (e.g. a tablet) on the same network

## Configuration (environment variables)

| Variable            | Default         | Meaning                                                |
| -------------------- | --------------- | ------------------------------------------------------- |
| `PRINTER_MODE`        | `network`      | `network` or `usb`                                      |
| `PRINTER_HOST`        | `192.168.1.100`| Network mode: your printer's IP address                 |
| `PRINTER_PORT`        | `9100`         | Network mode: raw ESC/POS port (rarely needs changing)  |
| `USB_PRINTER_NAME`    | *(none)*       | USB mode on Windows: exact printer name to print to      |
| `USB_PRINTER_QUEUE`   | *(none)*       | USB mode on macOS/Linux: the CUPS queue name             |
| `AGENT_PORT`          | `7777`         | Port this agent listens on                               |

## Limitations (current version)

- Bluetooth printers aren't supported yet.
- One printer handles both receipts and kitchen tickets — can't route to
  two different printers yet.
- No authentication — any device on your local network can send print jobs
  to this agent. Keep your shop's Wi-Fi/network private.
- Starting this automatically when the PC boots isn't set up — for now it
  needs to be started manually (or via your own OS startup script) each day.
