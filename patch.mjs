#!/usr/bin/env node
// SillyTavern 载入动画补丁（适配 1.18.x / 1.19.x）
// 用法：
//   node patch.mjs install <动画名> [酒馆目录]
//   node patch.mjs uninstall [酒馆目录]
//   node patch.mjs status [酒馆目录]
//   node patch.mjs list
// 不写目录时默认用 ~/SillyTavern。
//
// 和本文件放在一起、带 theme.json 的每个文件夹都是一个动画，文件夹名就是动画名。
// 安装和卸载都先把两个核心文件还原成酒馆原样，再按需要加入动画，
// 所以各个动画可以互相切换，卸载后文件与官方版本一致。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const SUPPORTED = /^1\.(18|19)\./;
const MARK = 'st-startup-patch';
const RECORD = path.join('.startup-patch-backup', 'installed.json');

// 早期单独发的补丁压缩包装进酒馆的文件。仓库里删掉了这些动画，也照样能认出来并卸干净。
const LEGACY = {
    typewriter: { name: '打字机', css: 'css/typewriter-startup.css', dir: 'img/typewriter-startup', preview: 'typewriter-startup-preview.html' },
    y2k: { name: 'Y2K 手机', css: 'css/y2k-phone-startup.css', dir: 'img/y2k-phone-startup', preview: 'y2k-phone-startup-preview.html' },
};

const STOCK_LOGO = [
    "    const splashLogo = document.createElement('img');",
    "    splashLogo.src = '/img/logo.png';",
    "    splashLogo.alt = 'SillyTavern';",
    "    splashLogo.className = 'splash-logo';",
    '    splashLogo.ariaLabel = t`SillyTavern Logo`;',
].join('\n');
const SCRIPT_START = "    initLoaderOverlay.classList.add('splash-screen');\n";
const SCRIPT_END = "    const splashMessage = document.createElement('h2');";
const STOCK_PREPEND = '    initLoaderOverlay.prepend(splashLogo);';
const KEEP_PREPEND = '    if (!startupArtwork) initLoaderOverlay.prepend(splashLogo);';
const FAVICON = '    <link rel="icon" type="image/x-icon" href="favicon.ico">';

const fail = message => { throw Object.assign(new Error(message), { friendly: true }); };
const exists = p => fs.stat(p).then(() => true, () => false);
const count = (text, part) => text.split(part).length - 1;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 读出所有动画。缺省的文件位置按动画名推出来。 */
async function loadThemes() {
    const themes = {};
    for (const entry of await fs.readdir(here, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) continue;
        const folder = path.join(here, entry.name);
        const file = path.join(folder, 'theme.json');
        if (!await exists(file)) continue;
        const id = entry.name;
        const raw = JSON.parse(await fs.readFile(file, 'utf8'));
        if (!raw.root || !raw.loaderClass) fail(`动画「${id}」的 theme.json 缺少 root 或 loaderClass。`);
        themes[id] = {
            name: id,
            css: `css/${id}-startup.css`,
            dir: `img/${id}-startup`,
            preview: `${id}-startup-preview.html`,
            ...raw,
            id,
            folder,
        };
    }
    return themes;
}

/** 补丁可能放进酒馆的全部文件：仓库里的动画、早期补丁，以及上次安装时记下来的那个。 */
function allKnown(themes, record) {
    const known = { ...LEGACY, ...themes };
    if (record?.id && !known[record.id]) known[record.id] = record;
    return known;
}

function stockIndex(text, known) {
    const hrefs = Object.values(known).map(k => escape(k.css)).join('|');
    // 去掉补丁加的样式表：带补丁标记的，或者指向已知动画样式的（可能带 ?v= 版本号）。
    text = text.replace(new RegExp(`^[ \\t]*<link rel="stylesheet"[^>\\n]*(?:data-${MARK}|href="(?:${hrefs})(?:\\?[^"]*)?")[^>\\n]*>\\n`, 'gm'), '');
    // 预加载层里的动画整段拿掉，恢复成空的 <div id="preloader"></div>。
    text = text.replace(/<div id="preloader">[\s\S]*?(\n[ \t]*<div id="bg1">)/, '<div id="preloader"></div>$1');
    if (count(text, '<div id="preloader"></div>') !== 1 || count(text, FAVICON) !== 1) fail('index.html 的结构和酒馆 1.18 / 1.19 不一样，已停止，没有改任何文件。');
    return text;
}

function stockScript(text) {
    const start = text.indexOf(SCRIPT_START);
    const end = text.indexOf(SCRIPT_END, start);
    if (start < 0 || end < 0 || count(text, SCRIPT_START) !== 1) fail('script.js 里找不到启动画面的代码，已停止，没有改任何文件。');
    text = text.slice(0, start + SCRIPT_START.length) + '\n' + STOCK_LOGO + '\n\n' + text.slice(end);
    // 「保留预加载层」的动画还改了插入启动图的那一行，也要还原，不然酒馆启动会报错。
    text = text.replace(KEEP_PREPEND, STOCK_PREPEND);
    if (count(text, STOCK_PREPEND) !== 1 || text.includes('startupArtwork')) fail('script.js 里启动画面的代码和酒馆 1.18 / 1.19 不一样，已停止，没有改任何文件。');
    return text;
}

function patchedIndex(stock, theme, markup, version) {
    return stock
        .replace(FAVICON, `    <link rel="stylesheet" href="${theme.css}?v=${version}" data-${MARK}="${theme.id}">\n${FAVICON}`)
        .replace('<div id="preloader"></div>', `<div id="preloader">${markup}</div>`);
}

function patchedScript(stock, theme) {
    // keepPreloader：预加载层留在最上面一直播到酒馆加载完，不再复制一份到加载框里。
    if (theme.keepPreloader) {
        const block = [
            `    // ${MARK}: ${theme.id}。预加载层里的动画一直播到酒馆加载完，由酒馆自己移除。`,
            `    const startupArtwork = document.querySelector('#preloader .${theme.root}');`,
            "    const splashLogo = document.createElement('img');",
            '    if (startupArtwork) {',
            `        initLoaderOverlay.classList.add('${theme.loaderClass}');`,
            '    } else {',
            ...STOCK_LOGO.split('\n').slice(1).map(line => '    ' + line),
            '    }',
        ].join('\n');
        return stock.replace(STOCK_LOGO, block).replace(STOCK_PREPEND, KEEP_PREPEND);
    }
    const elapsed = theme.elapsed
        ? `\n        // 把已经播放的时间交给接手的画面，动画不会从头再来一遍。\n        const played = startupArtwork.querySelector('${theme.elapsed.selector}')?.getAnimations?.()[0]?.currentTime;\n        if (Number.isFinite(played)) splashLogo.style.setProperty('${theme.elapsed.variable}', Math.max(0, played) + 'ms');`
        : '';
    const block = [
        `    // ${MARK}: ${theme.id}。沿用预加载层里的动画，关闭时机仍由酒馆控制。`,
        `    const startupArtwork = document.querySelector('#preloader .${theme.root}');`,
        "    const splashLogo = startupArtwork ? startupArtwork.cloneNode(true) : document.createElement('img');",
        '    if (startupArtwork) {',
        `        initLoaderOverlay.classList.add('${theme.loaderClass}');${elapsed}`,
        '    } else {',
        ...STOCK_LOGO.split('\n').slice(1).map(line => '    ' + line),
        '    }',
    ].join('\n');
    return stock.replace(STOCK_LOGO, block);
}

/** 返回当前装的动画名；null 表示原版，'unknown' 表示被别的东西改过。 */
function detect(index, known, record) {
    const tagged = index.match(new RegExp(`data-${MARK}(?:="([a-z0-9-]+)")?`));
    if (tagged) return tagged[1] || Object.keys(known).find(id => index.includes(known[id].css)) || record?.id || 'ours';
    for (const [id, k] of Object.entries(known)) if (index.includes(k.css)) return id;
    return /<div id="preloader"><\/div>/.test(index) ? null : 'unknown';
}

const label = (id, known) => id === null ? '酒馆原版' : id === 'unknown' ? '被别的东西改过（不认识）' : known[id]?.name || id;

async function writeAtomic(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, data);
    await fs.rename(temp, file);
}

async function main() {
    const action = process.argv[2] || 'status';
    const usage = '用法：node patch.mjs install <动画名> [酒馆目录] | uninstall [酒馆目录] | status [酒馆目录] | list';
    if (!['install', 'uninstall', 'status', 'list'].includes(action)) fail(usage);
    const themes = await loadThemes();
    const names = Object.values(themes).map(t => `${t.id}（${t.name}）`).join('、') || '（没有）';

    if (action === 'list') {
        console.log(`可以装的动画：${names}`);
        return;
    }
    let themeId;
    let rest = process.argv.slice(3);
    if (action === 'install') {
        themeId = rest.shift();
        if (!themeId) fail(`请写上要装哪个动画。可以装的有：${names}`);
        if (!themes[themeId]) fail(`没有叫「${themeId}」的动画。可以装的有：${names}`);
    }

    let target = (rest[0] || '~/SillyTavern').replace(/^['"]|['"]$/g, '');
    if (target === '~' || target.startsWith('~/')) target = path.join(os.homedir(), target.slice(2));
    const root = path.resolve(target);
    const pub = path.join(root, 'public');
    const indexFile = path.join(pub, 'index.html');
    const scriptFile = path.join(pub, 'script.js');
    if (!await exists(path.join(root, 'server.js')) || !await exists(indexFile) || !await exists(scriptFile)) {
        fail(`在 ${root} 没找到酒馆。\n请在命令最后写上酒馆文件夹的位置，例如：node patch.mjs ${action}${themeId ? ' ' + themeId : ''} ~/SillyTavern`);
    }
    const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version || '?';
    const recordFile = path.join(root, RECORD);
    const record = await fs.readFile(recordFile, 'utf8').then(JSON.parse, () => null);
    const known = allKnown(themes, record);

    const rawIndex = await fs.readFile(indexFile, 'utf8');
    const rawScript = await fs.readFile(scriptFile, 'utf8');
    const current = detect(rawIndex, known, record);

    if (action === 'status') {
        console.log(`酒馆版本：${version}${SUPPORTED.test(version) ? '' : '（本补丁不支持）'}`);
        console.log(`当前载入动画：${label(current, known)}`);
        console.log(`可以装的动画：${names}`);
        return;
    }
    if (!SUPPORTED.test(version)) fail(`你的酒馆是 ${version} 版，这个补丁只支持 1.18 和 1.19，已停止，没有改任何文件。`);
    if (current === 'unknown') fail('载入画面已经被别的补丁改过，这个补丁不认识，已停止，没有改任何文件。');

    // 两个核心文件可能是 CRLF 换行（Windows），统一按 LF 处理，写回时保持原样。
    const crlf = rawIndex.includes('\r\n');
    const lf = s => s.replace(/\r\n/g, '\n');
    const back = s => crlf ? s.replace(/\n/g, '\r\n') : s;
    const index = stockIndex(lf(rawIndex), known);
    const script = stockScript(lf(rawScript));

    const theme = themeId && themes[themeId];
    let nextIndex = index;
    let nextScript = script;
    let markup;
    let css;
    if (theme) {
        markup = (await fs.readFile(path.join(theme.folder, 'markup.html'), 'utf8')).trim();
        css = await fs.readFile(path.join(theme.folder, 'startup.css'));
        // 样式地址带上内容指纹，动画更新后浏览器不会继续用旧的缓存。
        const fingerprint = createHash('sha256').update(css).digest('hex').slice(0, 8);
        nextIndex = patchedIndex(index, theme, markup, fingerprint);
        nextScript = patchedScript(script, theme);
        if (nextScript === script) fail('script.js 写入失败，已停止，没有改任何文件。');
    }

    // 改动前备份一次当前文件，放在酒馆文件夹的 .startup-patch-backup 里。
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(root, '.startup-patch-backup', stamp);
    await fs.mkdir(backup, { recursive: true });
    await fs.writeFile(path.join(backup, 'index.html'), rawIndex);
    await fs.writeFile(path.join(backup, 'script.js'), rawScript);

    for (const k of Object.values(known)) {
        await fs.rm(path.join(pub, k.css), { force: true });
        await fs.rm(path.join(pub, k.preview), { force: true });
        await fs.rm(path.join(pub, k.dir), { recursive: true, force: true });
    }
    if (theme) {
        await writeAtomic(path.join(pub, theme.css), css);
        const assets = path.join(theme.folder, 'assets');
        if (await exists(assets)) {
            for (const file of await fs.readdir(assets)) {
                await writeAtomic(path.join(pub, theme.dir, file), await fs.readFile(path.join(assets, file)));
            }
        }
        // 动画文件夹里有 preview.html 就用它（可以带重播按钮），没有就自动生成一个。
        const ownPreview = path.join(theme.folder, 'preview.html');
        if (await exists(ownPreview)) await writeAtomic(path.join(pub, theme.preview), await fs.readFile(ownPreview));
        else await writeAtomic(path.join(pub, theme.preview), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${theme.name} 载入动画预览</title><link rel="stylesheet" href="/${theme.css}"></head><body style="margin:0">${markup}</body></html>`);
    }
    await writeAtomic(indexFile, back(nextIndex));
    await writeAtomic(scriptFile, back(nextScript));
    // 记下装了什么，以后仓库里删掉这个动画也能卸干净。
    if (theme) {
        const { id, name, css, dir, preview } = theme;
        await writeAtomic(recordFile, JSON.stringify({ id, name, css, dir, preview }, null, 2));
    } else {
        await fs.rm(recordFile, { force: true });
    }

    if (theme) {
        const switched = current && current !== theme.id ? `（已替换掉原来的「${label(current, known)}」动画）` : '';
        console.log(`\n安装完成！「${theme.name}」载入动画已装好${switched}。\n刷新酒馆网页就能看到。\n想完整看一遍：在酒馆地址后面加 /${theme.preview}`);
    } else {
        console.log(`\n卸载完成，已恢复酒馆原来的载入画面。${current ? '' : '（本来就是原版，没有变化）'}`);
    }
}

main().catch(error => {
    console.error(`\n操作失败：${error.friendly ? error.message : error.stack}`);
    process.exitCode = 1;
});
