#!/usr/bin/env node
// SillyTavern 载入动画补丁（适配 1.18.x / 1.19.x）
// 用法：node patch.mjs install|uninstall|status [酒馆目录]
// 不写目录时默认用 ~/SillyTavern。
//
// 安装和卸载都先把两个核心文件还原成酒馆原样，再按需要加入动画，
// 所以打字机和 Y2K 两个补丁可以互相切换，卸载后文件与官方版本一致。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SUPPORTED = /^1\.(18|19)\./;

// 两个补丁（以及 Codex 旧版补丁）会放进酒馆的全部文件。卸载时只删这些。
const KNOWN = {
    typewriter: { name: '打字机', css: 'css/typewriter-startup.css', dir: 'img/typewriter-startup', preview: 'typewriter-startup-preview.html' },
    y2k: { name: 'Y2K 手机', css: 'css/y2k-phone-startup.css', dir: 'img/y2k-phone-startup', preview: 'y2k-phone-startup-preview.html' },
};
const MARK = 'st-startup-patch';

const STOCK_LOGO = [
    "    const splashLogo = document.createElement('img');",
    "    splashLogo.src = '/img/logo.png';",
    "    splashLogo.alt = 'SillyTavern';",
    "    splashLogo.className = 'splash-logo';",
    '    splashLogo.ariaLabel = t`SillyTavern Logo`;',
].join('\n');
const SCRIPT_START = "    initLoaderOverlay.classList.add('splash-screen');\n";
const SCRIPT_END = "    const splashMessage = document.createElement('h2');";
const FAVICON = '    <link rel="icon" type="image/x-icon" href="favicon.ico">';

const fail = message => { throw Object.assign(new Error(message), { friendly: true }); };
const exists = p => fs.stat(p).then(() => true, () => false);
const count = (text, part) => text.split(part).length - 1;

function stockIndex(text) {
    const known = Object.values(KNOWN).map(k => k.css.replace(/[.]/g, '\\.')).join('|');
    text = text.replace(new RegExp(`^[ \\t]*<link rel="stylesheet"[^>\\n]*href="(?:${known})"[^>\\n]*>\\n`, 'gm'), '');
    // 预加载层里的动画整段拿掉，恢复成空的 <div id="preloader"></div>。
    text = text.replace(/<div id="preloader">[\s\S]*?(\n[ \t]*<div id="bg1">)/, '<div id="preloader"></div>$1');
    if (count(text, '<div id="preloader"></div>') !== 1 || count(text, FAVICON) !== 1) fail('index.html 的结构和酒馆 1.18 / 1.19 不一样，已停止，没有改任何文件。');
    return text;
}

function stockScript(text) {
    const start = text.indexOf(SCRIPT_START);
    const end = text.indexOf(SCRIPT_END, start);
    if (start < 0 || end < 0 || count(text, SCRIPT_START) !== 1) fail('script.js 里找不到启动画面的代码，已停止，没有改任何文件。');
    return text.slice(0, start + SCRIPT_START.length) + '\n' + STOCK_LOGO + '\n\n' + text.slice(end);
}

function patchedIndex(stock, theme, markup) {
    return stock
        .replace(FAVICON, `    <link rel="stylesheet" href="${theme.css}" data-${MARK}>\n${FAVICON}`)
        .replace('<div id="preloader"></div>', `<div id="preloader">${markup}</div>`);
}

function patchedScript(stock, theme) {
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

function detect(index) {
    for (const [id, k] of Object.entries(KNOWN)) if (index.includes(k.css)) return id;
    return /<div id="preloader"><\/div>/.test(index) ? null : 'unknown';
}

async function writeAtomic(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, data);
    await fs.rename(temp, file);
}

async function main() {
    const action = process.argv[2] || 'status';
    if (!['install', 'uninstall', 'status'].includes(action)) fail('用法：node patch.mjs install|uninstall|status [酒馆目录]');
    let target = (process.argv[3] || '~/SillyTavern').replace(/^['"]|['"]$/g, '');
    if (target === '~' || target.startsWith('~/')) target = path.join(os.homedir(), target.slice(2));
    const root = path.resolve(target);
    const pub = path.join(root, 'public');
    const indexFile = path.join(pub, 'index.html');
    const scriptFile = path.join(pub, 'script.js');
    if (!await exists(path.join(root, 'server.js')) || !await exists(indexFile) || !await exists(scriptFile)) {
        fail(`在 ${root} 没找到酒馆。\n请在命令最后写上酒馆文件夹的位置，例如：node patch.mjs ${action} ~/SillyTavern`);
    }
    const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version || '?';
    const theme = JSON.parse(await fs.readFile(path.join(here, 'theme.json'), 'utf8'));

    const rawIndex = await fs.readFile(indexFile, 'utf8');
    const rawScript = await fs.readFile(scriptFile, 'utf8');
    const current = detect(rawIndex);

    if (action === 'status') {
        console.log(`酒馆版本：${version}${SUPPORTED.test(version) ? '' : '（本补丁不支持）'}`);
        console.log(`当前载入动画：${current === null ? '酒馆原版' : current === 'unknown' ? '被别的东西改过（不认识）' : KNOWN[current].name}`);
        return;
    }
    if (!SUPPORTED.test(version)) fail(`你的酒馆是 ${version} 版，这个补丁只支持 1.18 和 1.19，已停止，没有改任何文件。`);
    if (current === 'unknown') fail('载入画面已经被别的补丁改过，这个补丁不认识，已停止，没有改任何文件。');

    // 两个核心文件可能是 CRLF 换行（Windows），统一按 LF 处理，写回时保持原样。
    const crlf = rawIndex.includes('\r\n');
    const lf = s => s.replace(/\r\n/g, '\n');
    const back = s => crlf ? s.replace(/\n/g, '\r\n') : s;
    const index = stockIndex(lf(rawIndex));
    const script = stockScript(lf(rawScript));

    let nextIndex = index;
    let nextScript = script;
    if (action === 'install') {
        const markup = (await fs.readFile(path.join(here, 'markup.html'), 'utf8')).trim();
        nextIndex = patchedIndex(index, theme, markup);
        nextScript = patchedScript(script, theme);
        if (nextScript === script) fail('script.js 写入失败，已停止，没有改任何文件。');
    }

    // 改动前备份一次当前文件，放在酒馆文件夹的 .startup-patch-backup 里。
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(root, '.startup-patch-backup', stamp);
    await fs.mkdir(backup, { recursive: true });
    await fs.writeFile(path.join(backup, 'index.html'), rawIndex);
    await fs.writeFile(path.join(backup, 'script.js'), rawScript);

    for (const k of Object.values(KNOWN)) {
        await fs.rm(path.join(pub, k.css), { force: true });
        await fs.rm(path.join(pub, k.preview), { force: true });
        await fs.rm(path.join(pub, k.dir), { recursive: true, force: true });
    }
    if (action === 'install') {
        await writeAtomic(path.join(pub, theme.css), await fs.readFile(path.join(here, 'startup.css')));
        for (const file of await fs.readdir(path.join(here, 'assets'))) {
            await writeAtomic(path.join(pub, theme.dir, file), await fs.readFile(path.join(here, 'assets', file)));
        }
        const markup = (await fs.readFile(path.join(here, 'markup.html'), 'utf8')).trim();
        await writeAtomic(path.join(pub, theme.preview), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${theme.name} 载入动画预览</title><link rel="stylesheet" href="/${theme.css}"></head><body style="margin:0">${markup}</body></html>`);
    }
    await writeAtomic(indexFile, back(nextIndex));
    await writeAtomic(scriptFile, back(nextScript));

    if (action === 'install') {
        const switched = current && current !== theme.id ? `（已替换掉原来的「${KNOWN[current].name}」动画）` : '';
        console.log(`\n安装完成！「${theme.name}」载入动画已装好${switched}。\n重新启动酒馆，刷新网页就能看到。\n想完整看一遍：在酒馆地址后面加 /${theme.preview}`);
    } else {
        console.log(`\n卸载完成，已恢复酒馆原来的载入画面。${current ? '' : '（本来就是原版，没有变化）'}`);
    }
}

main().catch(error => {
    console.error(`\n操作失败：${error.friendly ? error.message : error.stack}`);
    process.exitCode = 1;
});
