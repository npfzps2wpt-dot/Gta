// يجمع اللعبة في ملف HTML واحد: dist/neon-city.html (يعمل بالنقر المزدوج)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({
  entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020',
});
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = readFileSync('index.html', 'utf8').replace(
  /<script type="module" src=".\/src\/main.js"><\/script>/,
  () => `<script>${js}</script>`
);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/neon-city.html', html);
console.log('dist/neon-city.html', (html.length / 1024 / 1024).toFixed(2) + ' MB');
