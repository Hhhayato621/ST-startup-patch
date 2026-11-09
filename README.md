# 酒馆载入动画补丁

把 SillyTavern 打开时的蜘蛛图标换成动画，适用于酒馆 1.18 和 1.19 版。

| 名字 | 效果 |
|---|---|
| `typewriter` | 打字机：稿纸上一个字一个字打出 SillyTavern |
| `y2k` | Y2K 手机：粉色翻盖手机响铃，弹出短信 |

## 安装

在 Termux 里粘贴下面这一行，按回车：

```sh
curl -fsSL https://raw.githubusercontent.com/Hhhayato621/ST-startup-patch/main/install.sh | bash -s typewriter
```

想装 Y2K，把最后的 `typewriter` 换成 `y2k`。看到「安装完成！」就好了，刷新酒馆网页就能看到。两个可以随时互相切换。

## 卸载

```sh
curl -fsSL https://raw.githubusercontent.com/Hhhayato621/ST-startup-patch/main/install.sh | bash -s uninstall
```

## 查看现在装的是哪个

```sh
curl -fsSL https://raw.githubusercontent.com/Hhhayato621/ST-startup-patch/main/install.sh | bash -s status
```

## 注意

- **更新酒馆前先卸载**，更新完再装一次。
- 酒馆不在 `~/SillyTavern` 也没关系，脚本会自己找。找不到时，在命令最后加上酒馆文件夹，例如 `… | bash -s typewriter ~/ST`。
- 每次安装或卸载前，原来的文件会备份到酒馆文件夹里的 `.startup-patch-backup`。
- 电脑上（macOS / Linux 终端）也能用同一行命令。
