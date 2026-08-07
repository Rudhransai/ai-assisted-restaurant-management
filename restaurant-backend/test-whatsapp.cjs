require('dotenv').config();
const to = '916374665423';
const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
const token = process.env.WHATSAPP_ACCESS_TOKEN;
const version = process.env.WHATSAPP_API_VERSION || 'v21.0';

console.log('PHONE_NUMBER_ID:', id || 'MISSING');
console.log('TOKEN:', token ? token.slice(0,12) + '... (' + token.length + ' chars)' : 'MISSING');
if (!id || !token) process.exit(1);

(async () => {
  const res = await fetch(`https://graph.facebook.com/${version}/${id}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: 'reservation_confirmed',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [
          { type: 'text', text: 'Rudh' },
          { type: 'text', text: '2 guests' },
          { type: 'text', text: '20:00' }
        ]}]
      }
    })
  });
  console.log('HTTP', res.status);
  console.log(JSON.stringify(await res.json(), null, 2));
})();
