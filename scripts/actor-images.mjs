import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(resolve(root, 'assets/actor-media.json'), 'utf8'));
const mode = process.argv[2] ?? '--check';
if (!['--check', '--apply', '--list'].includes(mode)) throw new Error('Use --check, --apply or --list.');
if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(catalog.repository) || !/^[a-f0-9]{40}$/.test(catalog.assetRevision)) throw new Error('Invalid repository or assetRevision in image catalog.');
const begin = '<!-- actor-cover:start -->';
const end = '<!-- actor-cover:end -->';
const managed = /<!-- actor-cover:start -->[\s\S]*?<!-- actor-cover:end -->\n*/;

async function findActors(dir) {
    const paths = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || ['node_modules', '.git', 'storage', 'assets'].includes(entry.name)) continue;
        if (entry.name === '.actor') paths.push(resolve(dir, '.actor/actor.json'));
        else paths.push(...await findActors(resolve(dir, entry.name)));
    }
    return paths;
}

let errors = 0;
const actors = await findActors(root);
for (const actorFile of actors) {
    const actor = JSON.parse(await readFile(actorFile, 'utf8'));
    const folder = relative(root, dirname(dirname(actorFile)));
    const site = folder.split(/[\\/]/)[0];
    const image = catalog.actors?.[actor.name] ?? catalog.sites?.[site] ?? catalog.defaultImage;
    const imagePath = resolve(root, image);
    if (relative(root, imagePath).startsWith('..') || !/\.(png|jpe?g|webp)$/i.test(image)) throw new Error(`Invalid image path for ${actor.name}.`);
    if (!(await stat(imagePath)).isFile()) throw new Error(`Missing image for ${actor.name}.`);
    const pictureUrl = `https://raw.githubusercontent.com/${catalog.repository}/${catalog.assetRevision}/${image}`;
    const readmePath = resolve(dirname(actorFile), actor.readme ?? '../README.md');
    const content = await readFile(readmePath, 'utf8');
    const alt = `${actor.title ?? actor.name} — Spiderly`.replace(/[\[\]\r\n]/g, '');
    const block = `${begin}\n<img src="${pictureUrl}" alt="${alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" width="128" height="128">\n${end}\n\n`;
    if (mode === '--list') {
        console.log(JSON.stringify({ actor: actor.name, folder, image, pictureUrl }));
        continue;
    }
    const banner = content.split('\n', 1)[0].match(/!\[[^\]]*\]\(https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([a-f0-9]{40})\/(assets\/banners\/[a-z0-9_.-]+\.png)\)/i);
    if (banner?.[1] === catalog.repository && (await stat(resolve(root, banner[3]))).isFile()) continue;
    const stripped = content.replace(managed, '');
    const headingEnd = stripped.indexOf('\n');
    const desired = headingEnd >= 0 ? `${stripped.slice(0, headingEnd + 1)}\n${block}${stripped.slice(headingEnd + 1).replace(/^\n+/, '')}` : `${stripped}\n\n${block}`;
    if (content !== desired) {
        if (mode === '--apply') { await writeFile(readmePath, desired); console.log(`Updated image: ${actor.name}`); }
        else { errors++; console.error(`Missing or outdated image: ${actor.name}. Run node scripts/actor-images.mjs --apply.`); }
    }
}
if (errors) process.exitCode = 1;
else if (mode !== '--list') console.log(`Images verified for ${actors.length} actors.`);
