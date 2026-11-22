# dsh-remote-bots

一个 DeepSeek Harness 插件包，把两份上游插件 vendor 在一起：

- **dsh-bots** `0.17.1` — Bot 团队：人设、模型、技能、记忆，Atlas 分派任务。
- **dsh-zen-remote** `2.5.4` — 远程访问层：phone PWA / peer 组网 / 桌面 client 挂载。
- 内置 zen-remote Plugin Bridge 声明：Bots 管理面板（`/__dsh_bots/*`）可以远程转发到 host。

上游代码基本原样保留，唯一改动是 bots 侧多了一段桥接声明（见 `VENDORING.md` 的 M1）。

## 安装

从 [Releases](https://github.com/izerok/dsh-remote-bots/releases) 下载 `dsh-remote-bots-<version>.tgz`，然后：

```bash
# 完全退出 DSH
dsh plugin --profile web add /absolute/path/to/dsh-remote-bots-<version>.tgz
# 重启 DSH
```

- 这个包**替代** `dsh-zen-remote` 和 `@kadaliao/dsh-bots`。同一个 profile 不要同时安装三者。
- profile 会把 tarball 记录成 `file:` 依赖，安装后请保留这个 tgz，否则以后 `dsh plugin install` 会找不到它。
- DSH Desktop 使用 `--profile desktop`，并先完全退出 App。
- 依赖 `web-push` 会从 npm registry 安装；离线环境请先确认 profile 能访问 registry。

## 版本三元组

| 组件 | 版本 |
| --- | --- |
| 合并插件 `dsh-remote-bots` | `1.0.0` |
| bots 一半 | `0.17.1` |
| zen-remote 一半 | `2.5.4` |

要求 DSH `>=0.2.1-alpha.2 <0.3.0`，Node `>=18`。已在 DSH `0.2.2-rc.5` 上启动验证。

## 配置

插件只有一条 cordis row：`dsh-remote-bots`。两半的配置键不重叠，平铺在同一个配置对象里：

- bots：`enabled`、`workdir`、`workdirs`、`language`（默认沿用上游）。
- zen-remote：`role`、`port`、`host`、`targetPort`、`rateLimit`、`vapidSubject`、`push*`、`pluginBridgeConsent` 等，完整默认值见 `src/zen-remote/lib/config.js`。

`pluginBridgeConsent` 的键仍是 `@kadaliao/dsh-bots`（保持与上游一致，已有同意不用重开）。`scope: 'server'` 的 Bots 面板转发默认 OFF，需要在 zen-remote 设置页「插件桥」里手动打开。

## 数据与升级

两半沿用上游的存储目录和路由前缀，已有 bots / zen-remote 数据可以直接复用；升级前仍建议备份 `~/.dsh`。从旧的两插件组合迁移时，先在同一个 profile 里移除旧插件，再安装本包。

## 许可

dsh-bots（MIT，kadaliao）与 dsh-zen-remote（MIT，KyoMio）的原件在 `LICENSES/`；本仓新增的接线层同样 MIT。本包与两个上游作者无隶属关系。
