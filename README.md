# dsh-remote-bots

让 DeepSeek Harness 里的 Bot 团队可以远程用：**dsh-bots 管干活，dsh-zen-remote 管远程入口**。

- 上游 A：[kadaliao/dsh-bots](https://github.com/kadaliao/dsh-bots) — Grok 式 Bot 团队，每个 Bot 有自己的人设、模型、技能、记忆，dispatcher（Atlas）分活，任务在独立会话里跑。
- 上游 B：[KyoMio/dsh-zen-remote](https://github.com/KyoMio/dsh-zen-remote) — DSH 远程访问层，peer 组网 / host 手机 PWA / client 桌面挂载，零公网 IP、E2EE 加密、锁屏推送。

本仓**不 fork、不改上游代码**。它只提供三样东西：组合部署指南、一份可选的桥接 patch、以及校验这份 patch 的脚本。

## 组合长什么样

```
家里一台主机：DSH web + dsh-bots + dsh-zen-remote
      │  zen-remote host / peer
      ├─ 手机 PWA：跟已共享的 Bot 会话聊天、收推送、批复提问
      └─ 另一台电脑（zen-remote client）：在侧边栏挂载主机的共享会话
```

Bot 队的定时任务（早报、收件箱扫荡）本来就在主机上跑，不依赖手机在线。

## 版本矩阵（已核对）

| 组件 | 已核版本 | 说明 |
| --- | --- | --- |
| DeepSeek Harness | 0.2.2-rc.5 | zen-remote 要求 `>=0.2.1-alpha.2 <0.3.0`；0.1.x 上 zen-remote 不支持；npm 最新是 rc.5，无 0.2.2 正式版 |
| dsh-zen-remote | 2.5.4 | npm `dsh-zen-remote` |
| dsh-bots | 0.17.1（上游 commit `c265612`） | npm `@kadaliao/dsh-bots`；patch 针对此 commit |
| 桥接后 bots 版本 | 0.17.2-zen.1 | 只在打了 patch 的副本里，见下 |

## 开箱即用的部分（不用打 patch）

两插件同装一个 profile 没有冲突：cordis patch id 不同（`dsh-zen-remote` / `bots`），包名、路由、存储目录都不同。

```bash
dsh plugin --profile web add dsh-zen-remote
dsh plugin --profile web add @kadaliao/dsh-bots
```

或跑本仓的安装脚本（只做上面两条命令 + 回显版本，不改别的）：

```bash
bash scripts/install.sh
```

然后在 host 上把想远程聊的 Bot 会话逐个开远程：侧边栏会话 `…` 菜单 → Enable remote，或会话标题栏的 globe 图标。Bot 的 home 是普通 DSH 会话（`session-<uuid>`），任务是 `ticket-<id>` 会话；ticket 是独立顶层会话，不会自动跟随 home 共享，需要时单独开，或开 `autoShareNewSessions`（默认 `false`，见安全一节）。

手机上能做的：跟已共享的 Bot 会话聊天、跟进任务、看文件 diff、收推送。不能做的：见下一节。

## 缺口：Bots 面板本身远程用不了（开箱状态）

Bots 的管理面板（招团队、改 Bot 人设/模型、Requests 看板、用量统计）数据走它自己的后端路由 `GET/POST /__dsh_bots/*`。zen-remote 没有给它做内置适配，bots 上游也没有声明 zen-remote 的 Plugin Bridge。

> **2026-11-22 实测更正**：本仓早期版本写的是“远程打开面板回 503 `x-zen-remote: unbridged`”，这是错的。全面测试实测：未打 patch 时远程视角返回 **HTTP 200 + client 本机数据**，无任何 `x-zen-remote` 头——**静默错机**，不是可见报错。根因是 zen-remote 的路由拦截器只对已登记声明的路由生效，未声明的插件直接走本机 handler。503 只出现在已声明路由的拒绝场景。详见 [docs/bridge.md](docs/bridge.md)。

补这个缺口的办法在本仓的 `patches/` 里，详见 [docs/bridge.md](docs/bridge.md)：

- `patches/dsh-bots-zen-bridge.patch`：给 bots 0.17.1（`c265612`）加一份 zen-remote 协作声明，一条 prefix 路由盖住全部 `/__dsh_bots/*`，`scope: 'server'`，`methods: ['GET','POST']`，`maxBody: 41943040`（40 MiB，覆盖 bots 自己的 4 MiB 默认和 40 MiB 图片上传上限）。旧版 patch（bots 0.17.0 → 0.17.1-zen.1）已归档为 `patches/dsh-bots-zen-bridge-0.17.0.patch`。
- 打了 patch 的 bots 版本号变为 `0.17.2-zen.1`。桥接要求两端插件名、版本、声明摘要完全一致，所以 **host 和 client 两台 DSH 都必须装打过 patch 的同一版本**，混装上游原版会 503（`declaration-mismatch` / `version-mismatch`）。
- `scope: 'server'` 是整机数据，host 主人必须在 zen-remote 设置页「插件桥」里逐插件手动打开，默认 OFF。打开后远程能完整操作 Bots 面板，包括招团队、删卡片、改设置、代答提问，只给可信设备开。

没装 zen-remote 时这份声明零影响：`ctx.inject(['zenRemote'])` 永不触发，bots 行为与上游完全一致。

## 安全提醒

- `autoShareNewSessions` 默认 `false`，建议保持关闭，只手动共享 Atlas 和需要远程跟的 Bot home。
- 共享一个 Bot home 等于共享它的 workspace 文件和终端权限，管钱的 Ledger 这类 Bot 谨慎共享。
- 多机 peer 组网时，zen-remote 只同步会话，不同步 bots 的团队 roster 和记忆，Bot 队只认主机那一份。
- bots 自带的 Telegram / Discord / 飞书 / Slack 通道是另一条远程入口，和 zen-remote PWA 不冲突，但别对同一件事开两条通道重复处理。

## 验证状态（诚实版）

**2026-11-22 全面测试已跑完**（隔离环境，DSH 0.2.2-rc.5 + zen-remote 2.5.4 + bots 0.17.1，三个独立 DSH_HOME，未碰主力 profile，无真实模型 key）。完整记录在 [docs/validation-2026-11-22.md](docs/validation-2026-11-22.md)，主代理已从盘上复核关键证据。

已验：

- DSH 安装与两插件上游原版同装：启动成功，bots 路由全 200，hire 一个 OPC 团队建出 6 个机器人（无模型 key 即可）。
- 会话级远程：分享 Atlas 成功，48 小时有效；`admin/plugin-bridge` 基线为空。
- **面板缺口复现（与早期文档预期不符）**：远程视角未回 503，而是 **200 + 本机数据（静默错机）**，对照与远程返回同一 client 本机机器人 id，根因已读代码核实。
- Patch rebase 到 0.17.1：新 patch（0.17.2-zen.1）`git apply --check` + `node --check` 通过，校验器 17/17 PASS，未改校验器。
- 打 patch 版两端安装：host 声明登记且 `consent:true`，client `bridgedPlugins` 含 `@kadaliao/dsh-bots`，两端启动零报错。
- 两端远程面板转发：远程读到 **host 的 6 个机器人**；远程 `POST hire dev` 建出的 3 个机器人在 host 的 roster 上（写转发也通）。
- 回归：无 zen-remote 的实例上 patch 版 bots 启动干净，日志零 `zen` 提及，行为与上游一致。
- 单机同环 relay 401 已找到绕法：网关绑 `0.0.0.0`、client 走 `127.0.1.1:3088` 配对（见 [docs/bridge.md](docs/bridge.md)）。
- 两插件的 cordis id、包名、路由、存储目录无冲突（源码核对）。

未验：

- 一切需要模型调用的行为（机器人实际回复、Atlas 调度分派、定时任务、token 统计）——无模型 key，未编造。
- 设置页 UI 点勾选同意（同意是经配置文件层设置的同一值，浏览器点选路径未走）。
- 真实双机 relay、真机/手机端。
- 上游发新版后 patch 可能要重打：patch 只钉在 0.17.1 / `c265612`，新版先跑 `scripts/verify-patch.sh`，失败就别硬打。

## 出处与许可

- dsh-bots：MIT，作者 kadaliao；dsh-zen-remote：MIT，作者 KyoMio。本仓新增内容（指南、patch、脚本）同样 MIT。
- 本仓与两个上游作者均无隶属关系；patch 若被上游接受，本仓即失去存在意义，那是最好的结局。
