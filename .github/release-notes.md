# dsh-remote-bots — Bots 面板桥接 patch

让 DeepSeek Harness 里的 Bot 团队可以远程用：**dsh-bots 管干活，dsh-zen-remote 管远程入口**。本仓不 fork、不改上游代码，只提供组合部署指南、一份可选的桥接 patch，以及校验这份 patch 的脚本。

> **这是 prerelease。** 沙箱隔离环境全面测试已通过（见下），但真机/双机/手机端与真实模型尚未验证，见“未验”。

## 版本

| 组件 | 版本 |
| --- | --- |
| DeepSeek Harness | 0.2.2-rc.5（npm 最新，无 0.2.2 正式版） |
| dsh-zen-remote | 2.5.4 |
| dsh-bots（上游） | 0.17.1（commit `c265612`） |
| 打 patch 后 bots 版本 | **0.17.2-zen.2**（本版） |

## 本版内容（相对 v0.17.2-zen.1）

- `dsh-bots-zen-bridge.patch`：桥接声明新增 `rewriteIds: { fields: ['sessionId'] }`。此前面板 `send`/`open` 返回的 host 会话 id 会原样到达远程浏览器，点“打开对话”大概率打不开；现在返回的是 client 能打开的虚拟 id（`zr~…`），且该虚拟 id 能正确路由回 host 会话。API 层已实测，见“已验”。
- 旧版 patch（bots 0.17.0 版）一并附上，仅作归档；上一版 zen.1 patch 在完整包的 `patches/` 目录里，同样仅作归档。
- `dsh-remote-bots-<tag>.zip`：完整包（README、LICENSE、docs、patches、scripts）。
- 文档新增：只分享 Atlas home 的分享策略（autoShare 保持 OFF）、切 peer 角色前钉死插件桥同意、远程写操作全部落在 host、远程值班推送、改模型后发 `/new`。

## 怎么用

```bash
git clone https://github.com/kadaliao/dsh-bots.git dsh-bots-patched
cd dsh-bots-patched
git checkout c265612a9a09e1b7f26b8e1f145e8da78e0fb471
git apply dsh-bots-zen-bridge-v0.17.2-zen.2.patch
node --check index.js
```

两端都装打 patch 的副本（`link:` 方式或按 bots README 的 Git spec 装自己的副本），在 zen-remote 设置页「插件桥」里逐插件打开同意（默认 OFF），重启两端。完整说明见包内 `docs/bridge.md`。

## 已验（2026-11-22，隔离环境）

- DSH 安装与两插件上游原版同装；会话级远程分享 Atlas 成功。
- **面板缺口实测：未打 patch 时远程视角不是 503，而是 200 + 本机数据（静默错机）**——根因已读代码核实，文档已修正。
- Patch 校验器 20/20 通过；两端登记、远程读写转发、回归全部通过。
- **“打开对话”API 层已打通**：远程 `POST open` / `POST send` 与 ticket 详情返回的 `sessionId` 全部是虚拟形态（`zr~…`），用该虚拟 id 查消息/状态正确回到 host 会话。
- **ticket 共享继承已实证**：ticket 会话是独立顶层会话（无 origin、无 parentSession），autoShare OFF 时不在 shares 表里，桌面 client 看不到它；手机 PWA 不受影响。
- 模型调用链路已用本地 mock 端点打通（DSH 真发调用、Atlas 分派、ticket 建出、Forge 回复到达用户），只证明管子通，不证明模型行。
- 单机同环 relay 401 已找到绕法（网关绑 `0.0.0.0`、client 走 `127.0.1.1`）。
- 另查明：`/__dsh_bots/state` 从 localhost 不带 token 也返回 200，是 DSH 的设计（`WebServer` 分发插件路由不查鉴权），不是 bots 的 bug，见包内 `docs/bridge.md`。

完整记录在包内 `docs/validation-2026-11-22.md`；第三轮改进记录见仓内 `test-work/`（不随包发布）。

## 未验

- 浏览器里实际点面板“打开对话”（API 层已验；沙箱浏览器够不着回环服务）。
- 真实模型的能力（本轮回包是手写的 mock）、定时任务、跨会话、client 远程触发同一链路。
- 真机推送通道（第 6 条的配置方法只按文档写）。
- 设置页 UI 点勾选同意（同意是经配置文件层设置的同一值，浏览器点选路径未走）。
- 真实双机 relay、真机/手机端。
- 已知限制：`rewriteIds` 改写不到 `state.sessionMap` 的键与数组里的 `bots[].sessionId`（实现如此），见包内 `docs/bridge.md`。

## 出处与许可

dsh-bots（MIT，kadaliao）、dsh-zen-remote（MIT，KyoMio）。本仓新增内容同样 MIT；本仓与两个上游作者均无隶属关系；patch 若被上游接受，本仓即失去存在意义，那是最好的结局。
