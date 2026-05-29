/**
 * Local unauthenticated SOCKS5 proxy → remote authenticated SOCKS5 proxy
 * Listens on localhost:10801, forwards to 159.100.17.112:9000 with auth
 */

import net from 'net';
import { config } from 'dotenv';

config(); // Load .env

const LOCAL_PORT = parseInt(process.env.BRIDGE_LOCAL_PORT || '10801');
const REMOTE_HOST = process.env.PROXY_HOST || '159.100.17.112';
const REMOTE_PORT = parseInt(process.env.PROXY_PORT || '9000');
const REMOTE_USER = process.env.PROXY_USER || 'kelvin';
const REMOTE_PASS = process.env.PROXY_PASS || 'kelvin';

console.log(`🔄 SOCKS5 bridge: 127.0.0.1:${LOCAL_PORT} (no auth) → ${REMOTE_HOST}:${REMOTE_PORT}`);

const server = net.createServer(localConn => {
  let state = 'greeting';
  let buf = Buffer.alloc(0);
  let remoteConn = null;
  let addrInfo = { type: 1, addr: '0.0.0.0', port: 0 };

  function cleanup() {
    try { localConn.destroy(); } catch {}
    if (remoteConn) { try { remoteConn.destroy(); } catch {} remoteConn = null; }
  }

  function sendReply(rep) {
    let reply;
    if (addrInfo.type === 1) {
      const parts = addrInfo.addr.split('.').map(Number);
      reply = Buffer.alloc(10);
      reply[0] = 5; reply[1] = rep; reply[2] = 0; reply[3] = 1;
      for (let i = 0; i < 4; i++) reply[4 + i] = parts[i];
      reply[8] = (addrInfo.port >> 8) & 0xff;
      reply[9] = addrInfo.port & 0xff;
    } else if (addrInfo.type === 3) {
      const d = Buffer.from(addrInfo.addr, 'ascii');
      reply = Buffer.alloc(7 + d.length);
      reply[0] = 5; reply[1] = rep; reply[2] = 0; reply[3] = 3;
      reply[4] = d.length;
      d.copy(reply, 5);
      reply[5 + d.length] = (addrInfo.port >> 8) & 0xff;
      reply[6 + d.length] = addrInfo.port & 0xff;
    } else {
      reply = Buffer.from([5, rep, 0, 1, 0, 0, 0, 0, 0, 0]);
    }
    try { localConn.write(reply); } catch {}
  }

  localConn.on('data', function onLocalData(data) {
    buf = Buffer.concat([buf, data]);

    if (state === 'greeting') {
      if (buf.length < 3) return;
      if (buf[0] !== 5) { cleanup(); return; }
      const nmethods = buf[1];
      if (buf.length < 2 + nmethods) return;
      localConn.write(Buffer.from([5, 0x00])); // no auth
      buf = buf.slice(2 + nmethods);
      state = 'request';
      if (buf.length > 0) onLocalData(Buffer.alloc(0));
      return;
    }

    if (state === 'request') {
      if (buf.length < 4) return;
      if (buf[1] !== 1) { sendReply(0x07); cleanup(); return; } // only CONNECT
      addrInfo.type = buf[3];

      if (addrInfo.type === 1) {
        if (buf.length < 10) return;
        addrInfo.addr = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
        addrInfo.port = (buf[8] << 8) | buf[9];
        buf = buf.slice(10);
      } else if (addrInfo.type === 3) {
        if (buf.length < 5) return;
        const dLen = buf[4];
        if (buf.length < 7 + dLen) return;
        addrInfo.addr = buf.slice(5, 5 + dLen).toString('ascii');
        addrInfo.port = (buf[5 + dLen] << 8) | buf[6 + dLen];
        buf = buf.slice(7 + dLen);
      } else if (addrInfo.type === 4) {
        if (buf.length < 22) return;
        const parts = [];
        for (let i = 0; i < 8; i++) parts.push(((buf[4 + i * 2] << 8) | buf[5 + i * 2]).toString(16));
        addrInfo.addr = parts.join(':');
        addrInfo.port = (buf[20] << 8) | buf[21];
        buf = buf.slice(22);
      } else {
        sendReply(0x08); cleanup(); return;
      }

      state = 'connecting';

      // Connect to remote SOCKS5 proxy
      remoteConn = net.createConnection({ host: REMOTE_HOST, port: REMOTE_PORT }, () => {
        // Send SOCKS5 greeting asking for username/password auth
        remoteConn.write(Buffer.from([5, 1, 0x02])); // 1 method, method=2 (user/pass)
      });

      let rBuf = Buffer.alloc(0);
      let rStage = 'greeting';

      remoteConn.on('data', function onRemoteData(rData) {
        rBuf = Buffer.concat([rBuf, rData]);

        if (rStage === 'greeting') {
          if (rBuf.length < 2) return;
          const rMethod = rBuf[1];
          rBuf = rBuf.slice(2);

          if (rMethod === 0xff) { cleanup(); return; }

          // Send username/password auth
          const uBuf = Buffer.from(REMOTE_USER, 'utf8');
          const pBuf = Buffer.from(REMOTE_PASS, 'utf8');
          const authReq = Buffer.alloc(3 + uBuf.length + pBuf.length);
          authReq[0] = 1;
          authReq[1] = uBuf.length;
          uBuf.copy(authReq, 2);
          authReq[2 + uBuf.length] = pBuf.length;
          pBuf.copy(authReq, 3 + uBuf.length);
          remoteConn.write(authReq);
          rStage = 'auth';
          if (rBuf.length > 0) onRemoteData(Buffer.alloc(0));
          return;
        }

        if (rStage === 'auth') {
          if (rBuf.length < 2) return;
          const aStatus = rBuf[1];
          rBuf = rBuf.slice(2);

          if (aStatus !== 0) {
            sendReply(0x01);
            cleanup();
            return;
          }

          // Auth OK. Send the actual CONNECT request to the target
          rStage = 'connect';
          const req = buildConnectRequest();
          remoteConn.write(req);
          if (rBuf.length > 0) onRemoteData(Buffer.alloc(0));
          return;
        }

        if (rStage === 'connect') {
          if (rBuf.length < 4) return;
          const rep = rBuf[1];

          let hdrLen;
          if (rBuf[3] === 1) hdrLen = 10;
          else if (rBuf[3] === 3) hdrLen = 7 + rBuf[4];
          else if (rBuf[3] === 4) hdrLen = 22;
          else hdrLen = 10;

          if (rBuf.length < hdrLen) return;
          rBuf = rBuf.slice(hdrLen);

          if (rep !== 0) {
            sendReply(rep);
            cleanup();
            return;
          }

          // ✅ Success! Tell the local client
          sendReply(0);
          state = 'pipe';

          // Forward any buffered data from remote → local
          if (rBuf.length > 0) {
            try { localConn.write(rBuf); } catch {}
          }

          // Remove data handlers and set up raw piping
          remoteConn.removeListener('data', onRemoteData);
          localConn.removeListener('data', onLocalData);

          localConn.pipe(remoteConn);
          remoteConn.pipe(localConn);
          return;
        }
      });

      remoteConn.on('error', () => { sendReply(0x01); cleanup(); });
      remoteConn.on('close', () => { cleanup(); });
      return;
    }
  });

  function buildConnectRequest() {
    const { type, addr, port } = addrInfo;
    let req;
    if (type === 1) {
      req = Buffer.alloc(10);
      req[0] = 5; req[1] = 1; req[2] = 0; req[3] = 1;
      const parts = addr.split('.').map(Number);
      for (let i = 0; i < 4; i++) req[4 + i] = parts[i];
      req[8] = (port >> 8) & 0xff;
      req[9] = port & 0xff;
    } else if (type === 3) {
      const d = Buffer.from(addr, 'ascii');
      req = Buffer.alloc(7 + d.length);
      req[0] = 5; req[1] = 1; req[2] = 0; req[3] = 3;
      req[4] = d.length;
      d.copy(req, 5);
      req[5 + d.length] = (port >> 8) & 0xff;
      req[6 + d.length] = port & 0xff;
    } else if (type === 4) {
      req = Buffer.alloc(22);
      req[0] = 5; req[1] = 1; req[2] = 0; req[3] = 4;
      const parts = addr.split(':');
      for (let i = 0; i < 8; i++) {
        const n = parseInt(parts[i] || '0', 16);
        req[4 + i * 2] = (n >> 8) & 0xff;
        req[5 + i * 2] = n & 0xff;
      }
      req[20] = (port >> 8) & 0xff;
      req[21] = port & 0xff;
    }
    return req;
  }

  localConn.on('error', cleanup);
  localConn.on('close', cleanup);
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`✅ Bridge ready on 127.0.0.1:${LOCAL_PORT}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));