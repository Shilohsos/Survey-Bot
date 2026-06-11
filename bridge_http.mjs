#!/usr/bin/env node
/**
 * Local HTTP proxy bridge that forwards to Bright Data residential proxy.
 * Bypasses Chromium's SSL issue with Bright Data's self-signed cert.
 * Usage: node bridge_http.mjs
 * Listens on http://127.0.0.1:10810
 * Forward to http://brd-customer-...:545gc4qwrzue@brd.superproxy.io:33335
 */
import http from 'http';
import net from 'net';
import tls from 'tls';

const UPSTREAM_HOST = 'brd.superproxy.io';
const UPSTREAM_PORT = 33335;
const UPSTREAM_AUTH = 'brd-customer-hl_fd271bb3-zone-residential_proxy1:545gc4qwrzue';
const LOCAL_PORT = 10810;

// Handle CONNECT (HTTPS) requests
function handleConnect(req, cliSock) {
  const [host, port] = req.url.split(':');
  
  // Connect to upstream proxy
  const upSock = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    // Send CONNECT to upstream
    upSock.write(`CONNECT ${req.url} HTTP/1.1\r\n`);
    upSock.write(`Proxy-Authorization: Basic ${Buffer.from(UPSTREAM_AUTH).toString('base64')}\r\n`);
    upSock.write('\r\n');
  });

  let responded = false;
  upSock.once('data', (data) => {
    if (data.toString().includes('200')) {
      responded = true;
      cliSock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      cliSock.pipe(upSock);
      upSock.pipe(cliSock);
    } else {
      cliSock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    }
  });

  cliSock.on('error', () => upSock.destroy());
  upSock.on('error', () => { if (!responded) cliSock.end('HTTP/1.1 502\r\n\r\n'); });
  
  setTimeout(() => { if (!responded) { cliSock.end(); upSock.destroy(); } }, 15000);
}

// Handle plain HTTP requests
function handleHttp(req, res) {
  const opts = {
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: {
      ...req.headers,
      'Proxy-Authorization': `Basic ${Buffer.from(UPSTREAM_AUTH).toString('base64')}`,
    }
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  req.pipe(proxyReq);
  proxyReq.on('error', () => res.writeHead(502).end());
}

const server = http.createServer((req, res) => {
  if (req.method === 'CONNECT') handleConnect(req, req.socket);
  else handleHttp(req, res);
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`[bridge-http] listening on 127.0.0.1:${LOCAL_PORT} → ${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
});
