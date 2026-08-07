require('dotenv').config();
const BASE = 'http://localhost:3000';

(async () => {
  const login = await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.MANAGER_EMAIL || 'manager@restaurant.com',
      password: process.env.MANAGER_PASSWORD || 'manager123',
      role: 'manager'
    })
  });
  const auth = await login.json();
  if (!login.ok) return console.log('Login failed:', auth);

  console.log('Logged in. Running the models — this takes a minute...');

  const res = await fetch(BASE + '/api/v1/feedback/reanalyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + auth.data.token
    },
    body: JSON.stringify({ limit: 10 })
  });
  console.log('HTTP', res.status);
  console.log(await res.json());
})();
