require('dotenv').config();
const token = process.env.HUGGINGFACE_API_KEY;
console.log('TOKEN:', token ? token.slice(0,8) + '... (' + token.length + ' chars)' : 'MISSING');
if (!token) process.exit(1);

(async () => {
  const res = await fetch('https://router.huggingface.co/hf-inference/models/distilbert-base-uncased-finetuned-sst-2-english', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: 'The food was delicious', options: { wait_for_model: true } })
  });
  console.log('HTTP', res.status);
  console.log(await res.text());
})();
