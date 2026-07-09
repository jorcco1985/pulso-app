// netlify/functions/nutrition-photo.js
//
// Analisa uma FOTO de um rótulo nutricional ou de um prato/alimentos e devolve os
// dados de nutrição já estruturados. A imagem é usada apenas para a análise e NUNCA
// é guardada: não é escrita em disco nem em nenhuma base de dados — é passada ao
// modelo e descartada quando a função termina.
//
// Requer a variável de ambiente ANTHROPIC_API_KEY (a mesma que já usas na função
// "nutrition"). Configura-a em Netlify > Site settings > Environment variables.
//
// Resposta (JSON): { nome, gramas, kcal, carbs, protein, fat, itens:[{nome,kcal}] }

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// Modelo com visão. IMPORTANTE: usa de preferência o MESMO modelo da tua função
// "nutrition" (que já sabes que funciona na tua conta). Podes defini-lo sem mexer no
// código, na variável de ambiente NUTRITION_MODEL do Netlify.
const MODEL = process.env.NUTRITION_MODEL || 'claude-sonnet-5';

const SYSTEM_PROMPT = [
  'És um nutricionista que lê fotografias.',
  'A foto pode ser (a) um RÓTULO nutricional de um produto, ou (b) um PRATO/alimentos.',
  'Se for um rótulo, lê os valores impressos e, se o rótulo indicar por 100 g e também',
  'a dose/embalagem, usa a quantidade mais provável de uma dose.',
  'Se for um prato, identifica cada alimento e estima a quantidade em gramas.',
  'Responde APENAS com um objeto JSON válido, sem texto à volta e sem markdown, no formato:',
  '{"nome": string, "gramas": number, "kcal": number, "carbs": number, "protein": number, "fat": number, "itens": [{"nome": string, "kcal": number}]}',
  '"nome" é um nome curto para o conjunto (ex.: "Iogurte natural" ou "Frango com arroz").',
  '"gramas" é a quantidade total estimada; kcal/carbs/protein/fat são os TOTAIS para essa quantidade (em gramas).',
  'Se não conseguires identificar comida na foto, devolve {"error":"sem_alimento"}.'
].join(' ');

exports.handler = async function(event){
  const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if(event.httpMethod === 'OPTIONS'){ return { statusCode: 204, headers: CORS, body: '' }; }
  if(event.httpMethod !== 'POST'){ return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Método não permitido.' }) }; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey){ return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY em falta.' }) }; }

  let imageBase64, mimeType;
  try{
    const body = JSON.parse(event.body || '{}');
    imageBase64 = body.imageBase64;
    mimeType = body.mimeType || 'image/jpeg';
  }catch(_){ return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Corpo inválido.' }) }; }

  if(!imageBase64){ return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Sem imagem.' }) }; }
  // Só aceita tipos de imagem suportados; evita processar outra coisa qualquer.
  const allowed = ['image/jpeg','image/png','image/webp','image/gif'];
  if(allowed.indexOf(mimeType) === -1) mimeType = 'image/jpeg';

  try{
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: 'Analisa a foto e devolve só o JSON pedido.' }
          ]
        }]
      })
    });

    if(!res.ok){
      const txt = await res.text().catch(()=> '');
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'IA indisponível (' + res.status + '). ' + txt.slice(0,180) }) };
    }

    const data = await res.json();
    // Extrai o texto da resposta e isola o JSON (ignora qualquer texto à volta).
    let text = '';
    if(Array.isArray(data.content)){
      text = data.content.filter(b => b && b.type === 'text').map(b => b.text).join('\n');
    }
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    if(start === -1 || end === -1){ return { statusCode: 422, headers: CORS, body: JSON.stringify({ error: 'Resposta não interpretável.' }) }; }

    let parsed;
    try{ parsed = JSON.parse(text.slice(start, end + 1)); }
    catch(_){ return { statusCode: 422, headers: CORS, body: JSON.stringify({ error: 'JSON inválido da IA.' }) }; }

    if(parsed && parsed.error === 'sem_alimento'){
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Não identifiquei alimentos na foto.' }) };
    }

    // Normaliza os números e devolve. (A imagem não é guardada em lado nenhum.)
    const out = {
      nome: String(parsed.nome || '').slice(0, 80) || 'Refeição da foto',
      gramas: Number(parsed.gramas) || 0,
      kcal: Number(parsed.kcal) || 0,
      carbs: Number(parsed.carbs) || 0,
      protein: Number(parsed.protein) || 0,
      fat: Number(parsed.fat) || 0,
      itens: Array.isArray(parsed.itens) ? parsed.itens.slice(0, 12).map(i => ({ nome: String(i.nome || '').slice(0,60), kcal: Number(i.kcal) || 0 })) : []
    };
    imageBase64 = null; // liberta a imagem
    return { statusCode: 200, headers: CORS, body: JSON.stringify(out) };
  }catch(err){
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Falha na análise: ' + (err && err.message ? err.message : 'desconhecida') }) };
  }
};
