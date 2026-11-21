# dsh-remote-bots — Bots 面板桥接 patch

让 DeepSeek Harness 里的 Bot 团队可以远程用：**dsh-bots 管干活，dsh-zen-remote 管远程入口**。本仓不 fork、不改上游代码，只提供组合部署指南、一份可选的桥接 patch，以及校验这份 patch 的脚本。

> **这是 prerelease。** 沙箱隔离环境全面测试已通过（见下），但真机/双机/手机端与模型调用尚未验证，见“未验”。

## 版本

| 组件 | 版本 |
| --- | --- |
| DeepSeek Harness | 0.2.2-rc.5（npm 最新，无 0.2.2 正式版） |
| dsh-zen-remote | 2.5.4 |
| dsh-bots（上游） | 0.17.1（commit `c265612`） |
| 打 patch 后 bots 版本 | **0.17.2-zen.1**（本版） |

## 本版内容

- `dsh-bots-zen-bridge.patch`：给 bots 0.17.1 加 zen-remote Plugin Bridge 声明，一条 prefix 路由盖住全部 `/__dsh_bots/*`，`scope: 'server'`，`methods: ['GET','POST']`，`maxBody: 41943040`。host 和 client 两端必须装打过 patch 的同一版本。
- 旧版 patch（bots 0.17.0 → 0.17.1-zen.1）一并附上，仅作归档。
- `dsh-remote-bots-<tag>.zip`：完整包（README、LICENSE、docs、patches、scripts）。

## 怎么用

```bash
git clone https://github.com/kadaliao/dsh-bots.git dsh-bots-patched
cd dsh-bots-patched
git checkout c265612a9a09e1b7f26b8e1f145e8da78e0fb471
git apply dsh-bots-zen-bridge-v0.17.2-zen.1.patch
node --check index.js
```

两端都装打 patch 的副本（`link:` 方式或按 bots README 的 Git spec 装自己的副本），在 zen-remote 设置页「插件桥」里逐插件打开同意（默认 OFF），重启两端。完整说明见包内 `docs/bridge.md`。

## 已验（2026-11-22 全面测试，隔离环境）

- DSH 安装与两插件上游原版同装；会话级远程分享 Atlas 成功。
- **面板缺口实测：未打 patch 时远程视角不是 503，而是 200 + 本机数据（静默错机）**——根因已读代码核实，文档已修正。
- Patch rebase 到 0.17.1：校验器 17/17 通过；两端登记、远程读写转发、回归全部通过。
- 单机同环 relay 401 已找到绕法（网关绑 `0.0.0.0`、client 走 `127.0.1.1`）。
- 另查明：`/__dsh_bots/state` 从 localhost 不带 token 也返回 200，是 DSH 的设计（`WebServer` 分发插件路由不查鉴权），不是 bots 的 bug，见包内 `docs/bridge.md`。

完整记录在包内 `docs/validation-2026-11-22.md`。

## 未验

- 机器人实际回复、Atlas 调度分派、定时任务、token 统计（无模型 key）。
- 设置页 UI 点勾选同意（同意是经配置文件层设置的同一值，浏览器点选路径未走）。
- 真实双机 relay、真机/手机端。

## 出处与许可

dsh-bots（MIT，kadaliao）、dsh-zen-remote（MIT，KyoMio）。本仓新增内容同样 MIT；本仓与两个上游作者均无隶属关系；patch 若被上游接受，本仓即失去存在意义，那是最好的结局。
