import net from 'net';

// Connect to proxy bridge and try to hit the API directly
const LOCAL_PORT = 10801;

async function socks5Connect(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: LOCAL_PORT }, () => {
      // SOCKS5 greeting: no auth
      socket.write(Buffer.from([5, 1, 0])); // ver=5, nmethods=1, method=0 (no auth)
    });

    let buf = Buffer.alloc(0);
    let stage = 'greeting';

    socket.on('data', (data) => {
      buf = Buffer.concat([buf, data]);

      if (stage === 'greeting') {
        if (buf.length < 2) return;
        if (buf[1] !== 0) { reject(new Error('Auth required')); return; }
        buf = buf.slice(2);

        // Send CONNECT
        const hostParts = host.split('.').map(Number);
        const req = Buffer.alloc(10);
        req[0] = 5; req[1] = 1; req[2] = 0; req[3] = 1;
        for (let i = 0; i < 4; i++) req[4 + i] = hostParts[i];
        req[8] = (port >> 8) & 0xff;
        req[9] = port & 0xff;
        socket.write(req);
        stage = 'connect';
        return;
      }

      if (stage === 'connect') {
        if (buf.length < 10) return;
        const rep = buf[1];
        buf = buf.slice(10);
        if (rep !== 0) { reject(new Error('Connect failed: ' + rep)); return; }
        stage = 'done';
        socket.removeAllListeners('data');
        resolve(socket);
        return;
      }
    });

    socket.on('error', reject);
    setTimeout(() => reject(new Error('SOCKS timeout')), 15000);
  });
}

async function httpRequest(socket, method, path, headers, body) {
  return new Promise((resolve, reject) => {
    let req = `${method} ${path} HTTP/1.1\r\nHost: api.topsurveys.app\r\n`;
    req += 'Connection: close\r\n';
    for (const [k, v] of Object.entries(headers)) {
      req += `${k}: ${v}\r\n`;
    }
    req += '\r\n';
    if (body) req += body;

    let response = '';
    socket.on('data', (data) => {
      response += data.toString();
    });
    socket.on('end', () => {
      // Parse response
      const [headerPart, bodyPart] = response.split('\r\n\r\n');
      const lines = headerPart.split('\r\n');
      const statusLine = lines[0];
      const respHeaders = {};
      for (let i = 1; i < lines.length; i++) {
        const colonIdx = lines[i].indexOf(':');
        if (colonIdx > 0) {
          respHeaders[lines[i].substring(0, colonIdx).trim().toLowerCase()] = lines[i].substring(colonIdx + 1).trim();
        }
      }
      resolve({ status: statusLine.split(' ')[1], headers: respHeaders, body: bodyPart });
    });
    socket.on('error', reject);
    socket.write(req);
  });
}

async function main() {
  try {
    // Step 1: Login via API
    console.log('Logging in via API...');
    const loginSocket = await socks5Connect(34, 126, 87, 3, 443);
    // Use CONNECT tunnel through the bridge
    // Actually, let's use the API endpoint directly
    
    // The bridge is SOCKS5, we need to use it via HTTP
    // Let's try using node-fetch with the socks agent... but we don't have that.
    // Let's try the login endpoint directly
    
    const socket = await socks5Connect(34, 126, 87, 3, 443);
    
    const body = JSON.stringify({
      email: 'sirfuel365@gmail.com',
      password: 'TopSurveyBot2026!',
    });
    
    const resp = await httpRequest(socket, 'POST', '/api/login', {
      'Content-Type': 'application/json',
      'Content-Length': body.length,
    }, body);
    
    console.log('Response:', JSON.stringify(resp).substring(0, 2000));
    
    // Try even without proxy
    console.log('\n--- Trying without proxy ---');
    const plainSocket = net.createConnection({ host: 'api.topsurveys.app', port: 80 }, async () => {
      const plainResp = await httpRequest(plainSocket, 'POST', '/api/login', {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'Host': 'api.topsurveys.app',
      }, body);
      console.log('Response:', JSON.stringify(plainResp).substring(0, 2000));
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();