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

const AGENT_PORT = Number(process.env.AGENT_PORT || 7777)
const PRINTER_HOST = process.env.PRINTER_HOST || '192.168.1.100'
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100)
const PRINTER_TIMEOUT_MS = 5000

function sendToPrinter(bytes) {
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
    sendJson(res, 200, { ok: true, printerHost: PRINTER_HOST, printerPort: PRINTER_PORT })
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
  console.log(`Forwarding print jobs to ${PRINTER_HOST}:${PRINTER_PORT}`)
})
