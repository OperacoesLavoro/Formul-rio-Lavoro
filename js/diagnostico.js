'use strict';
const button = document.querySelector('#btnStatus');
const output = document.querySelector('#saida');
async function verificar() {
  button.disabled = true;
  output.textContent = 'Verificando…';
  try {
    if (location.protocol === 'file:') throw new Error('Abra esta página pelo link publicado.');
    const [response, configResponse] = await Promise.all([
      fetch('/api/status', { signal: AbortSignal.timeout(10000) }),
      fetch('/api/config', { signal: AbortSignal.timeout(10000) })
    ]);
    if (!response.ok || !configResponse.ok || !response.headers.get('Content-Type')?.includes('application/json')) {
      throw new Error('O Worker não respondeu neste endereço.');
    }
    const data = await response.json();
    const config = await configResponse.json();
    if (data.service !== 'datajud') throw new Error('Serviço inesperado.');
    const cnj = data.configured
      ? 'CNJ: credencial configurada.'
      : 'CNJ: falta configurar DATAJUD_APIKEY em Variables & Secrets.';
    const turnstile = config.turnstile?.enabled === false
      ? 'Turnstile: desativado neste ambiente.'
      : config.turnstile?.siteKey
        ? 'Turnstile: site key configurada. A secret key será validada somente em um envio real.'
        : 'Turnstile: falta configurar TURNSTILE_SITE_KEY em Variables & Secrets.';
    output.textContent = `Worker disponível.\n${cnj}\n${turnstile}`;
  } catch (error) {
    output.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
button.addEventListener('click', verificar);
verificar();
