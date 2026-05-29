import 'dotenv/config';

// Axios debug
import axios from 'axios';

async function main() {
  const email = 'Ugbekilemelvin@gmail.com';
  const password = 'Test2026!';
  const base = 'https://api.topsurveys.app';

  // Test without cookies, just the basic headers
  console.log('1. Login with bare minimum headers...');
  try {
    const resp = await axios.post(`${base}/auth/login`, { email, password }, {
      headers: { 
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    console.log(`   Status: ${resp.status}`);
    console.log(`   Data: ${JSON.stringify(resp.data).substring(0, 200)}`);
    console.log(`   Headers:`, JSON.stringify(resp.headers, null, 2));
  } catch (err: any) {
    console.log(`   Error ${err.response?.status}: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
    console.log(`   Request headers:`, err.config?.headers ? JSON.stringify(err.config.headers) : 'N/A');
  }
}

main().catch(console.error);