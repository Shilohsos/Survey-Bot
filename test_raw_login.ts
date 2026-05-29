import 'dotenv/config';

async function main() {
  // Test raw API calls
  const email = 'Ugbekilemelvin@gmail.com';
  const password = 'Test2026!';
  const base = 'https://api.topsurveys.app';

  // Step 1: Check email
  console.log('1. Checking email...');
  const checkResp = await fetch(`${base}/auth/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email }),
  });
  console.log(`   Status: ${checkResp.status}`);
  const checkData = await checkResp.json();
  console.log(`   Response: ${JSON.stringify(checkData)}`);

  if (!checkData.exists) {
    console.log('❌ Account not found!');
    return;
  }

  // Step 2: Try login with password
  console.log('\n2. Logging in...');
  const loginResp = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  console.log(`   Status: ${loginResp.status}`);
  
  // Show response headers
  const headers: Record<string, string> = {};
  loginResp.headers.forEach((v, k) => { headers[k] = v; });
  console.log(`   Headers: ${JSON.stringify(headers, null, 2)}`);

  const loginData = await loginResp.text();
  console.log(`   Body: ${loginData.substring(0, 500)}`);
}

main().catch(console.error);