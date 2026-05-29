const { login, getDashboard, getAvailableSurveys, getProfile } = require('./topsurveys.ts');

(async () => {
  try {
    console.log('🔑 Logging in...');
    const result = await login('Ugbekilemelvin@gmail.com', 'Test2026!');
    console.log('✅ Login successful!');
    console.log(`   Email: ${result.email}`);
    console.log(`   Token: ${result.token.substring(0, 30)}...`);
    console.log(`   Balance: ${result.balance}`);
    console.log(`   Locale: ${result.locale}`);

    const token = result.token;

    console.log('\n📊 Fetching dashboard...');
    const dash = await getDashboard(token);
    console.log(`   Balance: ${dash.balance}`);
    console.log(`   Available: ${dash.available}`);
    console.log(`   Completed: ${dash.completed_today}`);
    console.log(`   Total earned: ${dash.total_earned}`);

    console.log('\n🔍 Checking available surveys...');
    const surveys = await getAvailableSurveys(token);
    console.log(`   ${surveys.length} surveys available`);
    if (surveys.length > 0) {
      for (const s of surveys) {
        console.log(`   - ${s.title || s.name}: ${s.reward}`);
      }
    }

    console.log('\n👤 Profile:');
    const profile = await getProfile(token);
    console.log(`   ID: ${profile.id}`);
    console.log(`   Country: ${profile.country?.name || 'N/A'}`);
    console.log(`   Balance: ${profile.balance}`);

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.response) {
      console.error(`   Status: ${err.response.status}`);
      console.error(`   Data: ${JSON.stringify(err.response.data)}`);
    }
  }
})();