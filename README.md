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

## 查看现在装的是哪个、还有哪些能装

```sh
curl -fsSL https://raw.githubusercontent.com/Hhhayato621/ST-startup-patch/main/install.sh | bash -s status
```

把 `status` 换成 `list`，只列出能装的动画。

## 注意

- **更新酒馆前先卸载**，更新完再装一次。
- 酒馆不在 `~/SillyTavern` 也没关系，脚本会自己找。找不到时，在命令最后加上酒馆文件夹，例如 `… | bash -s typewriter ~/ST`。
- 每次安装或卸载前，原来的文件会备份到酒馆文件夹里的 `.startup-patch-backup`。
- 电脑上（macOS / Linux 终端）也能用同一行命令。

## 加新动画（给作者看）

在仓库里新建一个文件夹，文件夹名就是动画名（小写英文、数字或短横线，例如 `starry`），里面放：

| 文件 | 内容 |
|---|---|
| `theme.json` | `{"name": "中文名", "root": "画面最外层的 class", "loaderClass": "加在 #loader 上的 class"}` |
| `markup.html` | 动画画面的 HTML |
| `startup.css` | 动画样式，图片地址写成 `/img/<动画名>-startup/文件名` |
| `assets/` | 用到的图片、字体（可以没有） |
| `preview.html` | 自己做的预览页，可以带重播按钮（可以没有，没有就自动生成一个） |

`theme.json` 里还可以加 `"keepPreloader": true`：动画一直留在最上层播到酒馆加载完，不会中途从头再播一遍。这时样式里要把酒馆自己的加载框藏起来，可以参考 `y2k/startup.css` 开头几行。

传上去之后，安装命令最后写这个文件夹名就能装，不用改别的文件。
