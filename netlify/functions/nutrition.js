exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  let description;
  try {
    const body = JSON.parse(event.body || '{}');
    description = (body.description || '').trim();
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Pedido inválido.' }) };
  }

  if (!description) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta a descrição da refeição.' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY não está configurada nas variáveis de ambiente do site no Netlify.' }) };
  }

  const prompt = `Estima os valores nutricionais totais desta refeição descrita em português: "${description}".

Responde APENAS com um objeto JSON válido, sem nenhum texto antes ou depois, exatamente neste formato:
{"kcal": number, "carbs": number, "protein": number, "fat": number, "itens": [{"nome": string, "kcal": number}]}

Regras:
- kcal, carbs, protein e fat são o TOTAL da refeição inteira (kcal em quilocalorias; carbs/protein/fat em gramas).
- "itens" é uma lista curta (um por alimento identificado) com o nome e a estimativa de kcal de cada um.
- Usa valores nutricionais realistas e conhecidos. Se a quantidade não for indicada, assume uma porção normal para um adulto.
- Não incluas nenhum texto fora do JSON.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Erro da API Anthropic: ' + errText.slice(0, 300) }) };
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).map((c) => c.text || '').join('');

    let parsed;
    try {
      parsed = JSON.parse(text.trim());
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        return { statusCode: 502, body: JSON.stringify({ error: 'A IA não devolveu um formato reconhecível.' }) };
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno: ' + err.message }) };
  }
};
