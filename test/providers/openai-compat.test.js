import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OpenaiCompatProvider } from '../../lib/providers/openai-compat.js';

const realFetch = globalThis.fetch;
let mockResponses = [];

function setMock(...responses) {
  mockResponses = responses.slice();
  globalThis.fetch = async (url, init) => {
    const next = mockResponses.shift();
    if (!next) throw new Error('mock: unexpected fetch call to ' + url);
    if (typeof next === 'function') return next(url, init);
    return next;
  };
}

beforeEach(() => { mockResponses = []; });
afterEach(() => { globalThis.fetch = realFetch; });

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('chat() POSTs to /v1/chat/completions and normalizes response', async () => {
  setMock(jsonResponse(200, {
    id: 'chatcmpl-1',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'merhaba' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  }));

  const p = new OpenaiCompatProvider({
    id: 'test',
    base_url: 'https://api.example.com',
    api_key: 'sk-test',
    timeout_ms: 5000,
  });

  const out = await p.chat({
    model: 'm1',
    messages: [{ role: 'user', content: 'hi' }],
  });

  assert.equal(out.text, 'merhaba');
  assert.equal(out.finish_reason, 'stop');
  assert.equal(out.native_tool_calls, undefined);
  assert.deepEqual(out.usage, { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 });
  assert.ok(out.raw);
});
