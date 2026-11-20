#!/usr/bin/env node
'use strict'

// Local print-bridge agent (CLAUDE.md section 2). Runs on the counter PC.
// The POS web app POSTs raw ESC/POS bytes to this agent over LAN HTTP; this
// agent forwards them as-is to the configured printer over a raw TCP
// socket (port 9100, the standard "raw/JetDirect" port almost every network
// thermal printer listens on). The cash drawer kick is just another ESC/POS
// command bundled into the same byte stream by the web app — this agent
// doesn't need to know anything special about it.

const http = require('http')
const net = require('net')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const AGENT_PORT = Number(process.env.AGENT_PORT || 7777)
const PRINTER_MODE = (process.env.PRINTER_MODE || 'network').toLowerCase() // 'network' | 'usb'
const PRINTER_HOST = process.env.PRINTER_HOST || '192.168.1.100'
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100)
const PRINTER_TIMEOUT_MS = 5000

// Windows: the printer's exact name as installed (Settings > Printers &
// scanners), e.g. "POS80 Printer". Bytes go through the Print Spooler's
// native WritePrinter API as a RAW job (send-raw-windows.ps1) — port names
// like "USB001"/"USB002" are a Print Spooler construct, not a device `copy`
// can target, so writing to one directly silently does nothing.
const USB_PRINTER_NAME = process.env.USB_PRINTER_NAME || ''

// macOS/Linux: a CUPS queue configured with a raw/passthrough driver (find
// the queue name with `lpstat -p`). `lp -o raw` skips CUPS's filters so the
// ESC/POS bytes reach the printer unmodified.
const USB_PRINTER_QUEUE = process.env.USB_PRINTER_QUEUE || ''

function sendToPrinterNetwork(bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: PRINTER_HOST, port: PRINTER_PORT }, () => {
      socket.end(bytes)
    })

    socket.setTimeout(PRINTER_TIMEOUT_MS)
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`Timed out connecting to printer at ${PRINTER_HOST}:${PRINTER_PORT}`))
    })
    socket.on('error', (err) => reject(err))
    socket.on('close', (hadError) => {
      if (!hadError) resolve()
    })
  })
}

const WINDOWS_PRINT_SCRIPT = path.join(__dirname, 'send-raw-windows.ps1')

function sendToPrinterUsbWindows(bytes) {
  return new Promise((resolve, reject) => {
    if (!USB_PRINTER_NAME) {
      reject(new Error('USB_PRINTER_NAME is not set — use the exact name from Settings > Printers & scanners'))
      return
    }
    const tmpFile = path.join(os.tmpdir(), `atss-print-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`)
    fs.writeFile(tmpFile, bytes, (writeErr) => {
      if (writeErr) {
        reject(writeErr)
        return
      }
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', WINDOWS_PRINT_SCRIPT, '-PrinterName', USB_PRINTER_NAME, '-FilePath', tmpFile],
        (err, stdout, stderr) => {
          fs.unlink(tmpFile, () => {})
          if (err) {
            reject(new Error(`Printing to '${USB_PRINTER_NAME}' failed: ${(stderr || err.message).trim()}`))
            return
          }
          resolve()
        }
      )
    })
  })
}

function sendToPrinterUsbCups(bytes) {
  return new Promise((resolve, reject) => {
    if (!USB_PRINTER_QUEUE) {
      reject(new Error('USB_PRINTER_QUEUE is not set — run `lpstat -p` to find your printer queue name'))
      return
    }
    const child = execFile('lp', ['-d', USB_PRINTER_QUEUE, '-o', 'raw'], (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`lp to queue ${USB_PRINTER_QUEUE} failed: ${(stderr || err.message).trim()}`))
        return
      }
      resolve()
    })
    child.stdin.end(bytes)
  })
}

function sendToPrinter(bytes) {
  if (PRINTER_MODE === 'usb') {
    return process.platform === 'win32' ? sendToPrinterUsbWindows(bytes) : sendToPrinterUsbCups(bytes)
  }
  return sendToPrinterNetwork(bytes)
}

function setCorsHeaders(res) {
  // Any device on the LAN can call this agent — see the Limitations section
  // in README.md. Acceptable for a trusted shop network, not for anything
  // internet-facing.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    const target =
      PRINTER_MODE === 'usb'
        ? process.platform === 'win32'
          ? { usbPrinterName: USB_PRINTER_NAME }
          : { usbQueue: USB_PRINTER_QUEUE }
        : { printerHost: PRINTER_HOST, printerPort: PRINTER_PORT }
    sendJson(res, 200, { ok: true, printerMode: PRINTER_MODE, ...target })
    return
  }

  if (req.method === 'POST' && req.url === '/print') {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', async () => {
      const bytes = Buffer.concat(chunks)
      try {
        await sendToPrinter(bytes)
        sendJson(res, 200, { ok: true })
      } catch (err) {
        console.error('Print failed:', err.message)
        sendJson(res, 502, { ok: false, error: err.message })
      }
    })
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
})

server.listen(AGENT_PORT, () => {
  console.log(`print-bridge listening on http://localhost:${AGENT_PORT}`)
  if (PRINTER_MODE === 'usb') {
    console.log(
      process.platform === 'win32'
        ? `Forwarding print jobs to Windows printer '${USB_PRINTER_NAME || '(not set)'}'`
        : `Forwarding print jobs to CUPS queue ${USB_PRINTER_QUEUE || '(not set)'}`
    )
  } else {
    console.log(`Forwarding print jobs to ${PRINTER_HOST}:${PRINTER_PORT}`)
  }
})
