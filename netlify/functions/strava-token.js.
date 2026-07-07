// netlify/functions/strava-token.js
//
// Proxy first-party para a troca de token do Strava (Pulso).
// Objetivo (#2 segurança): o Client Secret deixa de passar por um proxy público
// de terceiros (corsproxy.io). Este pedido é feito servidor-a-servidor, aqui.
//
// COMO USAR:
//   1. Coloca este ficheiro em:  netlify/functions/strava-token.js
//   2. (Opcional, recomendado para "app única") define variáveis de ambiente no Netlify:
//        STRAVA_CLIENT_ID       -> o Client ID da tua app Strava
//        STRAVA_CLIENT_SECRET   -> o Client Secret da tua app Strava
//      Se as definires, o cliente não precisa de enviar o secret — este fica só no servidor.
//   3. Publica. O Pulso deteta a função automaticamente e usa-a; se não existir,
//      continua a funcionar pelo método antigo (fallback), por isso nada parte.
//
// O corpo aceite (JSON):
//   { client_id, client_secret, grant_type, code?, refresh_token? }
//   - Se STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET estiverem definidos no ambiente,
//     têm prioridade sobre os do corpo.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // Pré-voo CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // Credenciais: ambiente tem prioridade (modo "app única"); senão usa as do corpo (modo por-utilizador).
  const clientId = process.env.STRAVA_CLIENT_ID || payload.client_id;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET || payload.client_secret;
  const grantType = payload.grant_type;

  if (!clientId || !clientSecret || !grantType) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Faltam client_id, client_secret ou grant_type.' }),
    };
  }

  // Monta o corpo para a Strava conforme o tipo de concessão.
  const body = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: grantType,
  };
  if (grantType === 'authorization_code') {
    if (!payload.code) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Falta o code.' }) };
    }
    body.code = payload.code;
  } else if (grantType === 'refresh_token') {
    if (!payload.refresh_token) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Falta o refresh_token.' }) };
    }
    body.refresh_token = payload.refresh_token;
  } else {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'grant_type não suportado.' }) };
  }

  try {
    // Node 18+ no Netlify tem fetch global.
    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    // Devolve tal e qual (JSON) e o mesmo status, para o cliente tratar erros como antes.
    return { statusCode: resp.status, headers: CORS, body: text };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Falha a contactar a Strava', detail: String(err && err.message || err) }),
    };
  }
};
