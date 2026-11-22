# dsh-remote-bots {{TAG}} — 单插件包

一个 DSH 插件包，同时包含 **dsh-bots {{BOTS_VERSION}}** 和 **dsh-zen-remote {{ZEN_VERSION}}**，并内置 Bots 面板的 zen-remote 桥接声明。不再需要分别安装两个插件，也不需要手动打 patch。

> **这是 prerelease。** 两半沿用已核对的上游版本；本版新增的接线层通过了打包、隔离安装、启动和 Bots 路由冒烟。真实模型、真机/双机/手机端仍未验证。

## 资产

| 文件 | 说明 |
| --- | --- |
| `dsh-remote-bots-{{VERSION}}.tgz` | 唯一插件包（约 5 MB） |
| `SHA256SUMS.txt` | 上面文件的 SHA-256 |

没有单独的 bots / zen-remote 包，也没有单独的 patch 文件。

## 手动安装

```bash
# 0. 完全退出 DSH；建议先备份 ~/.dsh
# 1. 下载并校验
gh release download {{TAG}} -R izerok/dsh-remote-bots
sha256sum -c SHA256SUMS.txt

# 2. 同一 profile 如果装过旧的两个插件，先移除
dsh plugin --profile web remove dsh-zen-remote @kadaliao/dsh-bots

# 3. 放到固定目录再安装。profile 会记录这个 file: 路径，安装后不要删除 tgz
mkdir -p ~/.dsh/plugin-packages
mv dsh-remote-bots-{{VERSION}}.tgz ~/.dsh/plugin-packages/
dsh plugin --profile web add ~/.dsh/plugin-packages/dsh-remote-bots-{{VERSION}}.tgz

# 4. 重启 DSH
```

- DSH Desktop 用 `--profile desktop`，并先完全退出 App。
- `dsh` 不在 PATH：用 `npx --yes @deepseek-ai/dsh@<本机 DSH 版本> plugin ...`。
- 也可以直接装 release URL（不需要保留本地文件）：
  `dsh plugin --profile web add https://github.com/izerok/dsh-remote-bots/releases/download/{{TAG}}/dsh-remote-bots-{{VERSION}}.tgz`
- 单插件包**替代**两个上游插件。同一个 profile 不要同时装单插件包和 `dsh-zen-remote` / `@kadaliao/dsh-bots`，否则会重复注册路由和服务。存储目录沿用上游，升级前仍建议备份 `~/.dsh`。

## 版本三元组

| 组件 | 版本 |
| --- | --- |
| 合并插件 `dsh-remote-bots` | **{{VERSION}}** |
| bots 一半（面板自报 `BOTS_VERSION`） | {{BOTS_VERSION}} |
| zen-remote 一半（debug 报告 `pluginVersion`） | {{ZEN_VERSION}} |

要求 DeepSeek Harness `>=0.2.1-alpha.2 <0.3.0`（本版在 0.2.2-rc.5 上验证）。

## 这个版本验证了什么

- `npm pack` 产物包含服务端入口、生成的 client bundle、cordis patch、两半源码和许可证。
- 在临时 `DSH_HOME` 里用 `dsh plugin --profile web add <tgz>` 安装成功，bundle 自动进入 `dsh.profile.bundles`。
- `--dump-config` 包含 `dsh-remote-bots` row。
- Web profile 能启动；`GET /__dsh_bots/state` 返回 200，含 Bot 数据（Atlas）。
- zen-remote 半边启动并注册 `push_notify` 工具。

## 未验 / 已知限制

- 真实模型能力、定时任务、跨会话与真实 provider 未验。
- 真机/手机 PWA、真实双机 relay、推送到达未验。
- 浏览器里实际点 Bots 面板的“打开对话”未在图形界面走通；API 层此前已验证。
- `rewriteIds` 改写不到 `state.sessionMap` 的键和 `bots[].sessionId` 里的新建 id（上游实现限制）。

完整背景见仓库 `docs/bridge.md` 与 `docs/validation-2026-11-22.md`。

## 出处与许可

dsh-bots（MIT，kadaliao）、dsh-zen-remote（MIT，KyoMio）；本仓新增的接线层同样 MIT。本仓与两个上游作者无隶属关系。
