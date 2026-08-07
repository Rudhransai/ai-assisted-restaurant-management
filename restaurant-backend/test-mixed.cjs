require('dotenv').config();
(async () => {
  const login = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@restaurant.com', password: 'manager123', role: 'manager' })
  });
  const token = (await login.json()).data.token;

  const tests = [
    'The food was delicious but delivery was slow.',
    'We waited forever and nobody came to our table.',
    'Absolutely wonderful evening, everything was perfect.'
  ];

  for (const text of tests) {
    const r = await fetch('http://localhost:3000/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ customerName: 'Model Test', reviewText: text, rating: 3, source: 'test' })
    });
    const d = await r.json();
    if (!r.ok) { console.log('ERROR', r.status, d.message); continue; }
    console.log('\n"' + text + '"');
    console.log(JSON.stringify(d.data, null, 2));
  }
})();
