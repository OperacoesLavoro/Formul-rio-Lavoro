import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, 'dist');
if (path.dirname(output) !== path.resolve(root)) throw new Error('Diretório de saída inválido.');
await mkdir(output, { recursive: true });
// Allowlist: código do servidor, configuração e segredos nunca viram assets.
const assets = ['index.html', 'app.js', 'styles.css', 'diagnostico.html',
  'diagnostico.js', 'Fundo 4.png', 'Logo_Lavoro (Branca).png', '_headers'];
for (const entry of await readdir(output, { withFileTypes: true })) {
  if (!entry.isFile()) throw new Error('Diretório inesperado em dist: ' + entry.name);
  if (!assets.includes(entry.name)) await unlink(path.join(output, entry.name));
}
for (const asset of assets) await copyFile(path.join(root, asset), path.join(output, asset));
console.log('Build concluído: ' + assets.length + ' arquivos públicos em dist/.');
