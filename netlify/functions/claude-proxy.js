exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const BIBLE_KEY     = process.env.API_BIBLE_KEY;

  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Anthropic API key not configured.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  // ── VERSE FETCH (API.Bible) ───────────────────────────────────────────────
  if (body.type === 'verse') {
    if (!BIBLE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API.Bible key not configured.' }) };
    }
    const { ref, bibleId } = body;
    if (!ref || !bibleId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing ref or bibleId.' }) };
    }
    try {
      const encoded = encodeURIComponent(ref);
      const res = await fetch(
        `https://api.scripture.api.bible/v1/bibles/${bibleId}/search?query=${encoded}&limit=1`,
        { headers: { 'api-key': BIBLE_KEY } }
      );
      if (!res.ok) throw new Error('API.Bible error ' + res.status);
      const data = await res.json();
      const raw  = data?.data?.verses?.[0]?.text
                || data?.data?.passages?.[0]?.content
                || '';
      const text = raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text || null })
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── PARALLEL SEARCH (Claude) ──────────────────────────────────────────────
  const { query, depth } = body;
  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing query.' }) };
  }

  const DEPTH_PROMPT = [
    'Return only the most well-established, direct parallels — major synoptic relationships and clear OT quotations. Limit thematic parallels to 2–3.',
    'Return a balanced set including synoptic relationships, OT quotations and allusions, and notable thematic connections. Aim for 8–15 total results.',
    'Go deep. Identify all synoptic parallels, OT quotations, verbal allusions, typological echoes, structural parallels, and thematic connections across the full canon. Return as many genuine connections as you can find — 25 or more is appropriate for well-referenced passages.'
  ];

  const prompt = `You are a biblical scholar assistant. Given the scripture reference or passage below, identify parallel passages across the Bible.

Passage/Reference: "${query}"

${DEPTH_PROMPT[depth ?? 1]}

Respond ONLY with a valid JSON object in this exact format — no markdown fences, no preamble, no explanation:
{
  "sourceText": "brief quote of the source verse if known, else empty string",
  "synoptic": [
    { "ref": "Book Chapter:Verse", "note": "explanation of the parallel connection", "tag": "Synoptic" }
  ],
  "ot": [
    { "ref": "Book Chapter:Verse", "note": "explanation of the connection", "tag": "OT quotation" }
  ],
  "thematic": [
    { "ref": "Book Chapter:Verse", "note": "explanation of the thematic connection", "tag": "Thematic" }
  ]
}

Use "OT quotation" or "OT allusion" as the tag value for OT items depending on the nature of the connection.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || 'Anthropic API error.' })
      };
    }

    const raw    = data.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal server error.' })
    };
  }
};
