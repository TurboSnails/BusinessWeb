# businessweb-valuation-bridge

BusinessWeb「公司估值」页面使用的本地服务。它让线上页面调用**你电脑上已登录的 AI 命令行**（codex、claude、opencode、pi、antigravity/agy、kimi）完成估值，模型凭证始终留在你的电脑里，不经过任何服务器。

## 安装（只需一次）

```sh
npx businessweb-valuation-bridge install
```

安装会做两件事：

1. 把服务注册为开机自启的后台程序，只监听 `127.0.0.1:8788`。
2. 注册 `valuation://` 协议，服务没在运行时，网页可以自动把它唤起。

装完回到网页点“重新连接”即可。之后不需要再开终端。

需要 Node.js 20 或更高版本。网页请使用 Chrome 或 Edge（Safari 会拦截访问本机服务）。

## 命令

| 命令 | 作用 |
| --- | --- |
| `install` | 安装并启动自启服务、注册协议 |
| `uninstall` | 停止服务，移除自启、协议和安装文件 |
| `status` | 查看服务是否在运行、安装路径是否有效 |
| `serve` | 在当前终端前台运行（调试用，不改系统设置） |

## 前提

- 至少有一个已登录的 CLI。未登录时页面会提示对应的登录命令：`codex login`、在 `claude` 里输入 `/login`、`kimi login`、在 `agy` 里登录、`pi` 里输入 `/login`。
- 已安装的 CLI 用的是你自己的订阅或额度。

## 安全说明

- 服务只绑定本机回环地址，并且只接受来自 BusinessWeb 站点的请求；每次启动生成随机令牌，写入请求都要带上。
- 安装只写入你的用户目录（macOS：`~/Library/LaunchAgents`、`~/Applications`、`~/.businessweb-valuation`；Linux：`~/.config`、`~/.local`；Windows：当前用户注册表和 `%LOCALAPPDATA%`），不需要管理员权限。
- 想使用自定义域名的站点，启动时设置 `VALUATION_ALLOWED_ORIGINS=https://你的域名`。

## 已知限制

- macOS 已实机验证；Linux 和 Windows 的安装逻辑只经过单元测试，尚未在真机上验证。
- kimi 在额度充足时的输出格式尚未验证。

## 许可证

MIT
