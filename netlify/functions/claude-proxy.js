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

  // Detect whether the query is an OT or NT passage
  const OT_BOOKS = ['genesis','exodus','leviticus','numbers','deuteronomy','joshua','judges','ruth',
    '1 samuel','2 samuel','1 kings','2 kings','1 chronicles','2 chronicles','ezra','nehemiah',
    'esther','job','psalm','psalms','proverbs','ecclesiastes','song of solomon','song of songs',
    'isaiah','jeremiah','lamentations','ezekiel','daniel','hosea','joel','amos','obadiah',
    'jonah','micah','nahum','habakkuk','zephaniah','haggai','zechariah','malachi'];
  const queryLower = query.toLowerCase();
  const isOT = OT_BOOKS.some(b => queryLower.startsWith(b));

  const DEPTH_PROMPT = [
    'Return only the most well-established, direct parallels. Limit thematic parallels to 2–3.',
    'Return a balanced set of parallels. Aim for 8–15 total results.',
    'Go deep across the full canon. Return as many genuine connections as you can find — 25 or more is appropriate for well-referenced passages.'
  ];

  const sectionInstructions = isOT
    ? `The source passage is from the Old Testament. Structure your response as:
- "synoptic": Direct NT quotations and allusions to this passage — places where NT authors explicitly cite or echo it
- "ot": Parallel OT passages — related texts within the Old Testament (type/antitype, similar themes, verbal parallels)
- "thematic": Broader thematic connections across the canon`
    : `The source passage is from the New Testament. Structure your response as:
- "synoptic": Synoptic parallels — direct gospel parallels or parallel NT passages
- "ot": OT quotations and allusions — OT passages this text quotes, echoes, or fulfills
- "thematic": Broader thematic connections across the canon`;

  const prompt = `You are a biblical scholar assistant. Given the scripture reference or passage below, identify parallel passages across the Bible.

Passage/Reference: "${query}"

${DEPTH_PROMPT[depth ?? 1]}

${sectionInstructions}

Respond ONLY with a valid JSON object in this exact format — no markdown fences, no preamble, no explanation:
{
  "sourceText": "brief quote of the source verse if known, else empty string",
  "isOT": ${isOT},
  "synoptic": [
    { "ref": "Book Chapter:Verse", "note": "explanation of the connection", "tag": "NT quotation" }
  ],
  "ot": [
    { "ref": "Book Chapter:Verse", "note": "explanation of the connection", "tag": "OT parallel" }
  ],
  "thematic": [
    { "ref": "Book Chapter:Verse", "note": "explanation of the thematic connection", "tag": "Thematic" }
  ]
}

For the tag field: use "NT quotation" or "NT allusion" for synoptic items when isOT is true. Use "Synoptic" for gospel parallels and "NT parallel" for other NT parallels when isOT is false. Use "OT quotation" or "OT allusion" for ot items when isOT is false. Use "OT parallel" for ot items when isOT is true.`;

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
