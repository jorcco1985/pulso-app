// netlify/functions/strava-proxy.js
// Proxy fiável (server-side) para a API do Strava — evita o bloqueio CORS do browser
// e os proxies públicos instáveis. Recebe { url, token } por POST e devolve a resposta.
// Só permite pedidos GET para o domínio oficial da API do Strava.
exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: CORS, body: 'Invalid JSON' }; }

  const { url, token } = payload || {};
  if (!url || typeof url !== 'string') return { statusCode: 400, headers: CORS, body: 'Missing url' };
  // Segurança: só a API oficial do Strava.
  if (!/^https:\/\/www\.strava\.com\/api\/v3\//.test(url)) {
    return { statusCode: 400, headers: CORS, body: 'URL not allowed' };
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + (token || ''),
        'Accept': 'application/json',
      },
    });
    const text = await res.text();
    return {
      statusCode: res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: text,
    };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
