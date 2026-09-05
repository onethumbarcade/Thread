import { readFile, writeFile, mkdir, rm, cp, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url)), out = path.join(root, 'dist');
// Android appends this path directly to the origin; a missing slash becomes
// part of the hostname and fails before the native startup loader can run.
const config = JSON.parse(await readFile(path.join(root, 'capacitor.config.json'), 'utf8'));
const startPath = config.server?.appStartPath;
if (typeof startPath !== 'string' || !/^\/(?!\/)/.test(startPath)) {
  throw new Error('server.appStartPath must begin with a single /');
}
await stat(path.join(root, startPath));
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'assets/pages'), { recursive: true });
await cp(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
// Only packaged scripts use native-backed storage. Browser builds stay intact.
const safeInsets = text => text.replace(/env\(safe-area-inset-(top|right|bottom|left)\)/g, 'var(--safe-area-inset-$1, env(safe-area-inset-$1))');
const nativeStorage = code => code.replace(/\blocalStorage\b/g, 'ThreadStorage');
for (const file of await readdir(path.join(out, 'assets'))) {
  if (!/\.(js|css)$/.test(file)) continue;
  const target = path.join(out, 'assets', file);
  await writeFile(target, file.endsWith('.js') ? nativeStorage(await readFile(target, 'utf8')) : safeInsets(await readFile(target, 'utf8')));
}
let audio;
for (const [file, page] of [['index.html', 'game'], ['update-2-preview.html', 'menu']]) {
  let html = await readFile(path.join(root, file), 'utf8');
  html = html.replace(/src="data:audio\/mpeg;base64,([^"]+)"/g, (_, data) => {
    audio = Buffer.from(data, 'base64'); return 'src="assets/thread-menu.mp3"';
  });
  const scripts = [], inline = [];
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (_, attributes, content) => {
    const source = attributes.match(/\bsrc="([^"]+)"/);
    if (source) scripts.push(source[1]);
    else if (content.trim()) {
      const name = `assets/pages/${page}-${inline.length}.js`;
      inline.push({ name, code: nativeStorage(content) }); scripts.push(name);
    }
    return '';
  });
  for (const { name, code } of inline) await writeFile(path.join(out, name), code);
  await writeFile(path.join(out, `assets/pages/${page}.json`), JSON.stringify(scripts));
  html = html.replace('<html lang="en">', `<html lang="en" data-mobile-page="${page}">`)
    .replace('</head>', '<link rel="stylesheet" href="assets/mobile.css">\n</head>')
    .replace('</body>', '<script type="module" src="assets/native-shell.js"></script>\n</body>');
  await writeFile(path.join(out, file), safeInsets(html));
}
if (!audio?.length) throw new Error('Missing bundled menu music');
await writeFile(path.join(out, 'assets/thread-menu.mp3'), audio);
await writeFile(path.join(out, 'assets/mobile.css'), safeInsets(await readFile(path.join(root, 'mobile/mobile.css'), 'utf8')));
await build({ entryPoints: [path.join(root, 'mobile/bootstrap.mjs')],
  outfile: path.join(out, 'assets/native-shell.js'), bundle: true, format: 'esm',
  target: ['chrome118', 'safari15'], minify: true });
// Fail before sync if a bundled page has an unresolved local asset.
for (const file of ['index.html', 'update-2-preview.html']) {
  const html = await readFile(path.join(out, file), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^(?:https?:|data:)/.test(match[1])) continue;
    await stat(path.join(out, match[1].split(/[?#]/)[0]));
  }
}
console.log('Bundled THREAD, native adapters, artwork, and menu music into dist/.');
