import test from 'node:test';
import assert from 'node:assert/strict';
import { LimiteEnvioDiario, LIMITE_ENVIOS_POR_DIA, periodoDiario } from '../src/services/submission-limit.mjs';

class StorageFalso {
  constructor() {
    this.dados = new Map();
    this.alarme = null;
  }
  async transaction(callback) { return callback(this); }
  async get(chave) { return this.dados.get(chave); }
  async put(chave, valor) { this.dados.set(chave, valor); }
  async setAlarm(instante) { this.alarme = instante; }
  async deleteAll() { this.dados.clear(); }
}

const consumir = (limite, dia, retryAfter = 3600) => limite.fetch(new Request('https://interno/consumir', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dia, retryAfter })
}));

test('permite trinta envios no dia e bloqueia o trigésimo primeiro', async () => {
  const storage = new StorageFalso();
  const limite = new LimiteEnvioDiario({ storage });

  for (let numero = 1; numero <= LIMITE_ENVIOS_POR_DIA; numero += 1) {
    const response = await consumir(limite, '2026-09-17');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      permitido: true,
      restantes: LIMITE_ENVIOS_POR_DIA - numero
    });
  }
  const bloqueado = await consumir(limite, '2026-09-17');
  assert.equal(bloqueado.status, 200);
  assert.deepEqual(await bloqueado.json(), { permitido: false, restantes: 0 });
  assert.ok(storage.alarme > Date.now());
});

test('reinicia a cota no próximo dia e remove o estado pelo alarme', async () => {
  const storage = new StorageFalso();
  const limite = new LimiteEnvioDiario({ storage });
  for (let numero = 0; numero < LIMITE_ENVIOS_POR_DIA; numero += 1) {
    await consumir(limite, '2026-09-17');
  }

  const novoDia = await consumir(limite, '2026-09-18');
  assert.deepEqual(await novoDia.json(), { permitido: true, restantes: LIMITE_ENVIOS_POR_DIA - 1 });
  await limite.alarm();
  assert.equal(storage.dados.size, 0);
});

test('calcula o dia e a virada no fuso de São Paulo', () => {
  assert.deepEqual(periodoDiario(new Date('2026-09-18T02:59:30.000Z')), {
    dia: '2026-09-17',
    retryAfter: 60
  });
  assert.deepEqual(periodoDiario(new Date('2026-09-18T03:00:00.000Z')), {
    dia: '2026-09-18',
    retryAfter: 86400
  });
});
