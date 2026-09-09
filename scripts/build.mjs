import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, 'dist');
if (path.dirname(output) !== path.resolve(root)) throw new Error('Diretório de saída inválido.');
await mkdir(output, { recursive: true });

// Allowlist: código do servidor, configuração e segredos nunca viram assets.
// O código-fonte fica organizado por tipo (html/, css/, js/, assets/); o site
// publicado continua no mesmo formato plano de sempre — troca só de um lado.
const assets = [
  { from: 'html/index.html', to: 'index.html' },
  { from: 'html/diagnostico.html', to: 'diagnostico.html' },
  { from: 'js/app.js', to: 'app.js' },
  { from: 'js/diagnostico.js', to: 'diagnostico.js' },
  { from: 'css/styles.css', to: 'styles.css' },
  { from: 'assets/Fundo 4.png', to: 'Fundo 4.png' },
  { from: 'assets/Logo_Lavoro (Branca).png', to: 'Logo_Lavoro (Branca).png' },
  { from: '_headers', to: '_headers' }
];

const nomesPublicados = assets.map(a => a.to);
for (const entry of await readdir(output, { withFileTypes: true })) {
  if (!entry.isFile()) throw new Error('Diretório inesperado em dist: ' + entry.name);
  if (!nomesPublicados.includes(entry.name)) await unlink(path.join(output, entry.name));
}
for (const asset of assets) {
  await copyFile(path.join(root, asset.from), path.join(output, asset.to));
}
console.log('Build concluído: ' + assets.length + ' arquivos públicos em dist/.');
