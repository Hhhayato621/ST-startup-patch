#!/usr/bin/env bash
# 酒馆载入动画补丁：一键安装 / 卸载
# 用法（在 Termux 里粘贴一行）：
#   curl -fsSL https://raw.githubusercontent.com/Hhhayato621/ST-startup-patch/main/install.sh | bash -s typewriter
#   ……| bash -s y2k         装 Y2K 手机
#   ……| bash -s uninstall   卸载，恢复原样
#   ……| bash -s status      查看现在装的是哪个
# 最后可以再加酒馆文件夹的位置，例如：…| bash -s typewriter ~/ST
set -euo pipefail

# 整段放进 main 里：通过 curl | bash 运行时，bash 会先读完全部内容再执行。
main() {

REPO="Hhhayato621/ST-startup-patch"
ACTION="${1:-typewriter}"
TARGET="${2:-}"

say()  { printf '%s\n' "$*"; }
fail() { printf '\n操作失败：%s\n' "$*" >&2; exit 1; }

case "$ACTION" in
    typewriter|y2k|uninstall|status) ;;
    *) fail "不认识「$ACTION」。可以用：typewriter（打字机）、y2k（Y2K 手机）、uninstall（卸载）、status（查看）。" ;;
esac

is_termux() { [ -n "${PREFIX:-}" ] && [ -d "$PREFIX" ] && case "$PREFIX" in *com.termux*) true ;; *) false ;; esac; }

# 1. 准备 node（酒馆本身就需要它，正常都有）
if ! command -v node >/dev/null 2>&1; then
    if is_termux; then
        say "没找到 node，正在安装（第一次要等一会儿）……"
        pkg install -y nodejs-lts </dev/null >/dev/null 2>&1 || pkg install -y nodejs </dev/null >/dev/null 2>&1 || fail "node 安装失败。请先运行 pkg update，再重新粘贴命令。"
    else
        fail "没找到 node。请在平时启动酒馆的那个终端里运行这条命令。"
    fi
fi

# 2. 找到酒馆
is_st() { [ -f "$1/server.js" ] && [ -f "$1/public/index.html" ] && [ -f "$1/public/script.js" ] && grep -qi '"name": *"sillytavern"' "$1/package.json" 2>/dev/null; }

find_st() {
    local candidates=() dir
    candidates+=("$HOME/SillyTavern")
    while IFS= read -r dir; do candidates+=("$dir"); done < <(find "$HOME" -maxdepth 4 -name server.js -not -path '*/node_modules/*' 2>/dev/null | sed 's#/server.js$##')
    # 装在 Termux 里的 Ubuntu / Debian（proot-distro）中的酒馆
    if is_termux; then
        for dir in "$PREFIX"/var/lib/proot-distro/installed-rootfs/*/root/SillyTavern "$PREFIX"/var/lib/proot-distro/installed-rootfs/*/home/*/SillyTavern; do
            candidates+=("$dir")
        done
    fi
    for dir in "${candidates[@]}"; do
        if is_st "$dir"; then printf '%s\n' "$dir"; return 0; fi
    done
    return 1
}

if [ -n "$TARGET" ]; then
    case "$TARGET" in "~"|"~/"*) TARGET="$HOME${TARGET#\~}" ;; esac
    is_st "$TARGET" || fail "在 $TARGET 没找到酒馆。请检查文件夹位置。"
    ST="$TARGET"
else
    ST="$(find_st)" || fail "没找到酒馆。请在命令最后加上酒馆文件夹的位置，例如：…| bash -s $ACTION ~/SillyTavern"
fi
say "找到酒馆：$ST"

# 3. 下载补丁（MOI_PATCH_SOURCE 仅用于本地测试）
WORK="$(mktemp -d "${TMPDIR:-/tmp}/st-startup-patch.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
if [ -n "${MOI_PATCH_SOURCE:-}" ]; then
    cp -R "$MOI_PATCH_SOURCE"/. "$WORK/"
else
    say "正在下载补丁……"
    curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/main" | tar -xz -C "$WORK" --strip-components=1 \
        || fail "补丁下载失败。请检查网络后重新粘贴命令。"
fi

# 4. 安装 / 卸载 / 查看
case "$ACTION" in
    typewriter|y2k) node "$WORK/$ACTION/patch.mjs" install "$ST" ;;
    uninstall)      node "$WORK/typewriter/patch.mjs" uninstall "$ST" ;;
    status)         node "$WORK/typewriter/patch.mjs" status "$ST" ;;
esac

if [ "$ACTION" = typewriter ] || [ "$ACTION" = y2k ]; then
    say ""
    say "酒馆开着的话，直接刷新网页就能看到；没开就照常启动酒馆。"
fi
}

main "$@"
