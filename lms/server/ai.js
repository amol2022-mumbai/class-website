// AI quiz generation using an OpenAI-compatible chat completions API.
// The API key is provided by the site owner via project environment variables
// (USER_LLM_API_KEY / USER_LLM_BASE_URL / USER_LLM_MODEL) - see .env.example.

const config = {
  apiKey: process.env.USER_LLM_API_KEY || '',
  baseUrl: (process.env.USER_LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
  model: process.env.USER_LLM_MODEL || 'deepseek-chat',
};

function isConfigured() {
  return Boolean(config.apiKey);
}

function configError() {
  const err = new Error(
    'AI quiz generation is not configured. Set USER_LLM_API_KEY (and optionally ' +
    'USER_LLM_BASE_URL, USER_LLM_MODEL) in your environment - see .env.example.'
  );
  err.status = 400;
  return err;
}

function parseQuestions(content, count) {
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('AI response did not contain a JSON question list');
  }
  let parsed;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch (e) {
    throw new Error('Could not parse the AI response into questions');
  }
  if (!Array.isArray(parsed)) throw new Error('AI response was not a list of questions');

  const questions = [];
  for (const q of parsed) {
    if (!q || typeof q.text !== 'string' || !Array.isArray(q.options)) continue;
    const options = q.options.map((o) => String(o).trim()).filter(Boolean);
    if (options.length < 2) continue;
    let correct = parseInt(q.correct_index, 10);
    if (isNaN(correct) || correct < 0 || correct >= options.length) correct = 0;
    questions.push({ text: q.text.trim(), options: options.slice(0, 6), correct_index: correct });
  }
  if (questions.length === 0) {
    throw new Error('No valid questions could be extracted from the AI response');
  }
  return questions.slice(0, count);
}

async function generateQuizQuestions(topic, count, difficulty) {
  if (!isConfigured()) throw configError();

  const system = [
    'You are an expert quiz generator for a computer science class.',
    'Respond with ONLY a valid JSON array of multiple-choice questions.',
    'No markdown, no commentary, no code fences.',
  ].join(' ');

  const user = [
    `Generate exactly ${count} multiple-choice questions about "${topic}".`,
    `Difficulty: ${difficulty || 'medium'}.`,
    'Each question must be a JSON object with the shape:',
    '{"text": "question text", "options": ["A", "B", "C", "D"], "correct_index": 0}',
    '"options" must have exactly 4 choices and "correct_index" must be the index (0-based) of the correct answer.',
    'Output only the JSON array.',
  ].join(' ');

  let res;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });
  } catch (e) {
    const err = new Error('Could not reach the AI service: ' + e.message);
    err.status = 502;
    throw err;
  }

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (_) {}
    const err = new Error(`AI service returned ${res.status}: ${detail.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  if (!content) throw new Error('AI service returned an empty response');
  return parseQuestions(content, count);
}

module.exports = { generateQuizQuestions, isConfigured, config };
