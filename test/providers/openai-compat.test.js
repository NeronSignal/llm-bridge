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

test('chat() passes through native tool_calls when present', async () => {
  setMock(jsonResponse(200, {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Istanbul"}' } },
        ],
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
  }));

  const p = new OpenaiCompatProvider({
    id: 'test', base_url: 'https://api.example.com', api_key: 'sk-test',
  });
  const out = await p.chat({ model: 'm1', messages: [] });

  assert.ok(Array.isArray(out.native_tool_calls));
  assert.equal(out.native_tool_calls.length, 1);
  assert.equal(out.native_tool_calls[0].function.name, 'get_weather');
  assert.equal(out.text, '');
  assert.equal(out.finish_reason, 'tool_calls');
});
