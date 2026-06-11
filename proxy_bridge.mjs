/**
 * Local SOCKS5 proxy → HTTP CONNECT tunnel via Bright Data proxy
 * Listens on localhost:10801 (SOCKS5), forwards via HTTP proxy to target host
 */

import net from 'net';
import { config } from 'dotenv';

config();

const LOCAL_PORT = parseInt(process.env.BRIDGE_LOCAL_PORT || '10801');
const PROXY_HOST = process.env.PROXY_HOST || 'brd.superproxy.io';
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '33335');
const PROXY_USER = process.env.PROXY_USER || '';
const PROXY_PASS = process.env.PROXY_PASS || '';

console.log(`🔄 SOCKS5 bridge: 127.0.0.1:${LOCAL_PORT} → HTTP proxy ${PROXY_HOST}:${PROXY_PORT}`);

const server = net.createServer(localSocket => {
  let state = 'greeting';
  let buf = Buffer.alloc(0);
  let remoteSocket = null;
  let targetHost = '';
  let targetPort = 0;

  function cleanup() {
    try { localSocket.destroy(); } catch {}
    if (remoteSocket) { try { remoteSocket.destroy(); } catch {} remoteSocket = null; }
  }

  function sendSocks5Reply(rep) {
    const reply = Buffer.from([5, rep, 0, 1, 0, 0, 0, 0, 0, 0]);
    try { localSocket.write(reply); } catch {}
  }

  localSocket.on('data', (data) => {
    buf = Buffer.concat([buf, data]);

    if (state === 'greeting') {
      if (buf.length < 3) return;
      if (buf[0] !== 5) { cleanup(); return; }
      const nmethods = buf[1];
      if (buf.length < 2 + nmethods) return;
      localSocket.write(Buffer.from([5, 0x00]));
      buf = buf.slice(2 + nmethods);
      state = 'request';
      if (buf.length > 0) localSocket.emit('data', Buffer.alloc(0));
      return;
    }

    if (state === 'request') {
      if (buf.length < 4) return;
      if (buf[1] !== 1) { sendSocks5Reply(0x07); cleanup(); return; }
      const addrType = buf[3];

      if (addrType === 1) {
        if (buf.length < 10) return;
        targetHost = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
        targetPort = (buf[8] << 8) | buf[9];
        buf = buf.slice(10);
      } else if (addrType === 3) {
        if (buf.length < 5) return;
        const domainLen = buf[4];
        if (buf.length < 7 + domainLen) return;
        targetHost = buf.slice(5, 5 + domainLen).toString('utf8');
        targetPort = (buf[5 + domainLen] << 8) | buf[6 + domainLen];
        buf = buf.slice(7 + domainLen);
      } else {
        sendSocks5Reply(0x08); cleanup(); return;
      }

      state = 'connecting';
      console.log(`[bridge] Connecting to ${PROXY_HOST}:${PROXY_PORT} for target ${targetHost}:${targetPort}`);

      remoteSocket = net.createConnection({ host: PROXY_HOST, port: PROXY_PORT }, () => {
        const authHeader = PROXY_USER && PROXY_PASS
          ? `Basic ${Buffer.from(`${PROXY_USER}:${PROXY_PASS}`).toString('base64')}`
          : '';
        const connectRequest = [
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
          `Host: ${targetHost}:${targetPort}`,
          authHeader ? `Proxy-Authorization: ${authHeader}` : '',
          'Connection: Keep-Alive',
          '',  // This empty line MUST stay — produces trailing \r\n\r\n
          '',
        ].join('\r\n');

        console.log('[bridge] Sending CONNECT request');
        remoteSocket.write(connectRequest);
      });

      let responseBuf = Buffer.alloc(0);
      let headersEnded = false;
      let statusCode = 0;

      remoteSocket.on('data', (chunk) => {
        console.log('[bridge] Raw response from proxy:', chunk.toString('utf8').slice(0, 300));
        responseBuf = Buffer.concat([responseBuf, chunk]);

        if (!headersEnded) {
          const headersEnd = responseBuf.indexOf('\r\n\r\n');
          if (headersEnd === -1) return;

          const headerPart = responseBuf.slice(0, headersEnd).toString('utf8');
          const statusLine = headerPart.split('\r\n')[0];
          console.log('[bridge] Status line:', statusLine);

          const statusMatch = statusLine.match(/HTTP\/1\.1\s+(\d{3})/);
          if (statusMatch) {
            statusCode = parseInt(statusMatch[1], 10);
          }
          console.log(`[bridge] Parsed HTTP status: ${statusCode}`);

          responseBuf = responseBuf.slice(headersEnd + 4);
          headersEnded = true;

          if (statusCode === 200) {
            console.log('[bridge] Tunnel established successfully');
            sendSocks5Reply(0);
            state = 'tunneling';

            if (responseBuf.length > 0) {
              try { localSocket.write(responseBuf); } catch {}
            }

            localSocket.pipe(remoteSocket);
            remoteSocket.pipe(localSocket);
          } else {
            console.log('[bridge] Proxy returned non-200, failing');
            sendSocks5Reply(0x01);
            cleanup();
          }
        }
      });

      remoteSocket.on('error', (err) => {
        console.log('[bridge] Remote socket error:', err.message);
        sendSocks5Reply(0x01);
        cleanup();
      });

      remoteSocket.on('end', () => {
        console.log('[bridge] Remote socket ended');
        cleanup();
      });

      remoteSocket.on('close', () => {
        console.log('[bridge] Remote socket closed');
        cleanup();
      });

      return;
    }
  });

  localSocket.on('error', cleanup);
  localSocket.on('close', cleanup);
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`✅ Bridge ready on 127.0.0.1:${LOCAL_PORT}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));