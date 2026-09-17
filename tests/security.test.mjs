import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('assets publicam headers defensivos sem liberar script inline', () => {
  for (const diretiva of [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    'Strict-Transport-Security:',
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: no-referrer'
  ]) assert.ok(headers.includes(diretiva), diretiva);

  assert.ok(!headers.includes("script-src 'self' 'unsafe-inline'"));
  assert.ok(!headers.includes("script-src 'self' 'unsafe-eval'"));
});

test('dados completos da proposta não ficam expostos em propriedade global', () => {
  assert.ok(!frontend.includes('window.__proposta'));
  assert.match(frontend, /let propostaAtual = null/);
});
