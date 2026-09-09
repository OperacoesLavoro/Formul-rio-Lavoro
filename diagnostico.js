'use strict';
const button = document.querySelector('#btnStatus');
const output = document.querySelector('#saida');
async function verificar() {
  button.disabled = true;
  output.textContent = 'Verificando…';
  try {
    if (location.protocol === 'file:') throw new Error('Abra esta página pelo link publicado.');
    const response = await fetch('/api/status', { signal: AbortSignal.timeout(10000) });
    if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) {
      throw new Error('O Worker não respondeu neste endereço.');
    }
    const data = await response.json();
    if (data.service !== 'datajud') throw new Error('Serviço inesperado.');
    output.textContent = data.configured
      ? 'Worker disponível. Credencial configurada. Teste agora uma consulta no formulário.'
      : 'Worker disponível, mas falta configurar DATAJUD_APIKEY em Variables & Secrets.';
  } catch (error) {
    output.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
button.addEventListener('click', verificar);
verificar();
