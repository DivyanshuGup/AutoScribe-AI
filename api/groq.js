export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Groq API key not configured on server.' });
  }

  const { messages, systemPrompt, maxTokens = 4000, model = 'llama-3.3-70b-versatile' } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array required.' });
  }

  const payload = {
    model,
    max_tokens: maxTokens,
    temperature: 0.7,
    messages: systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages
  };

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!groqRes.ok) {
      const errData = await groqRes.json();
      return res.status(groqRes.status).json({ error: errData.error?.message || 'Groq API error' });
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
