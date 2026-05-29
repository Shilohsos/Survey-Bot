const net = require('net');

const LOCAL_PORT = 10809;
const REMOTE_HOST = '159.100.17.112';
const REMOTE_PORT = 9000;

// SOCKS5 auth credentials for the remote proxy
const AUTH_USER = 'kelvin';
const AUTH_PASS = 'kelvin';

console.log(`SOCKS5 bridge: localhost:${LOCAL_PORT} -> ${REMOTE_HOST}:${REMOTE_PORT} (auth: ${AUTH_USER}:****)`);

const server = net.createServer(localSocket => {
  let remoteSocket = null;

  // SOCKS5 handshake states
  let state = 'greeting';
  let buffer = Buffer.alloc(0);
  let addrType = 0;
  let dstAddr = '';
  let dstPort = 0;
  let addrBytes = 0;
  let addrPos = 0;

  function sendReply(rep) {
    if (addrType === 1) { // IPv4
      const ip = dstAddr.split('.').map(Number);
      const buf = Buffer.alloc(10);
      buf[0] = 5; buf[1] = rep; buf[2] = 0; buf[3] = 1;
      for (let i = 0; i < 4; i++) buf[4 + i] = ip[i];
      buf[8] = (dstPort >> 8) & 0xff;
      buf[9] = dstPort & 0xff;
      localSocket.write(buf);
    } else if (addrType === 3) { // Domain
      const domainBuf = Buffer.from(dstAddr, 'ascii');
      const buf = Buffer.alloc(7 + domainBuf.length);
      buf[0] = 5; buf[1] = rep; buf[2] = 0; buf[3] = 3;
      buf[4] = domainBuf.length;
      domainBuf.copy(buf, 5);
      buf[5 + domainBuf.length] = (dstPort >> 8) & 0xff;
      buf[6 + domainBuf.length] = dstPort & 0xff;
      localSocket.write(buf);
    }
  }

  function processData(data) {
    buffer = Buffer.concat([buffer, data]);

    if (state === 'greeting') {
      if (buffer.length < 3) return;
      const ver = buffer[0];
      const nmethods = buffer[1];
      if (buffer.length < 2 + nmethods) return;
      
      buffer = buffer.slice(2 + nmethods);
      state = 'auth';
      
      // Send: we want username/password auth (0x02)
      localSocket.write(Buffer.from([5, 2])); // method: username/password
      
      // Continue processing if more data
      if (buffer.length > 0) processData(Buffer.alloc(0));
      return;
    }

    if (state === 'auth') {
      if (buffer.length < 5) return;
      const ver = buffer[0]; // should be 1
      const ulen = buffer[1];
      if (buffer.length < 2 + ulen + 1) return;
      const plen = buffer[2 + ulen];
      if (buffer.length < 2 + ulen + 1 + plen) return;

      const uname = buffer.slice(2, 2 + ulen).toString();
      const passwd = buffer.slice(3 + ulen, 3 + ulen + plen).toString();
      
      if (uname !== AUTH_USER || passwd !== AUTH_PASS) {
        console.log('Auth failed from local client');
        localSocket.write(Buffer.from([1, 1])); // auth failed
        localSocket.destroy();
        return;
      }

      // Auth success for the LOCAL client (no auth needed on local)
      localSocket.write(Buffer.from([1, 0])); // auth success
      buffer = buffer.slice(3 + ulen + plen);
      state = 'request';
      
      if (buffer.length > 0) processData(Buffer.alloc(0));
      return;
    }

    if (state === 'request') {
      // We need to intercept the request, send it to the actual remote
      // ... but actually, we simply need to forward traffic.
      // The problem is that the real SOCKS5 proxy requires auth.
      // So instead of doing full SOCKS proxying here, let's just forward bytes.
      return;
    }
  }

  localSocket.on('data', data => processData(data));

  localSocket.on('error', err => {
    if (remoteSocket) remoteSocket.destroy();
  });

  localSocket.on('close', () => {
    if (remoteSocket) remoteSocket.destroy();
  });
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`Bridge listening on 127.0.0.1:${LOCAL_PORT}`);
});

process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
