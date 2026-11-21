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
| DeepSeek Harness | 0.2.x（建议 0.2.2） | zen-remote 要求 `>=0.2.1-alpha.2 <0.3.0`；0.1.x 上 zen-remote 不支持 |
| dsh-zen-remote | 2.5.4 | npm `dsh-zen-remote` |
| dsh-bots | 0.17.0（上游 commit `f51ca93`） | npm `@kadaliao/dsh-bots`；patch 针对此 commit |
| 桥接后 bots 版本 | 0.17.1-zen.1 | 只在打了 patch 的副本里，见下 |

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

Bots 的管理面板（招团队、改 Bot 人设/模型、Requests 看板、用量统计）数据走它自己的后端路由 `GET/POST /__dsh_bots/*`。zen-remote 没有给它做内置适配，bots 上游也没有声明 zen-remote 的 Plugin Bridge。按 zen-remote 的 fail-closed 规则，远程打开面板会返回 503 `x-zen-remote: unbridged`，不会静默回落到本机空数据。

补这个缺口的办法在本仓的 `patches/` 里，详见 [docs/bridge.md](docs/bridge.md)：

- `patches/dsh-bots-zen-bridge.patch`：给 bots 0.17.0（`f51ca93`）加一份 zen-remote 协作声明，一条 prefix 路由盖住全部 `/__dsh_bots/*`，`scope: 'server'`，`methods: ['GET','POST']`，`maxBody: 41943040`（40 MiB，覆盖 bots 自己的 4 MiB 默认和 40 MiB 图片上传上限）。
- 打了 patch 的 bots 版本号变为 `0.17.1-zen.1`。桥接要求两端插件名、版本、声明摘要完全一致，所以 **host 和 client 两台 DSH 都必须装打过 patch 的同一版本**，混装上游原版会 503（`declaration-mismatch` / `version-mismatch`）。
- `scope: 'server'` 是整机数据，host 主人必须在 zen-remote 设置页「插件桥」里逐插件手动打开，默认 OFF。打开后远程能完整操作 Bots 面板，包括招团队、删卡片、改设置、代答提问，只给可信设备开。

没装 zen-remote 时这份声明零影响：`ctx.inject(['zenRemote'])` 永不触发，bots 行为与上游完全一致。

## 安全提醒

- `autoShareNewSessions` 默认 `false`，建议保持关闭，只手动共享 Atlas 和需要远程跟的 Bot home。
- 共享一个 Bot home 等于共享它的 workspace 文件和终端权限，管钱的 Ledger 这类 Bot 谨慎共享。
- 多机 peer 组网时，zen-remote 只同步会话，不同步 bots 的团队 roster 和记忆，Bot 队只认主机那一份。
- bots 自带的 Telegram / Discord / 飞书 / Slack 通道是另一条远程入口，和 zen-remote PWA 不冲突，但别对同一件事开两条通道重复处理。

## 验证状态（诚实版）

已验：

- patch 在全新克隆的上游 0.17.0（`f51ca93`）上 `git apply --check` 通过，打完后 `node --check index.js` 通过，打完文件与生成时逐字节一致。
- `scripts/verify-bridge.mjs` 校验声明字段符合 zen-remote Plugin Bridge 规范（插件名、版本与 package.json 一致、路径、scope、方法、maxBody 上限）。
- 两插件的 cordis id、包名、路由、存储目录无冲突（源码核对）。

未验：

- **没有在真机 DSH 上同装同跑过**：没有跑通一次 host + client 两端都装打 patch 版、打开同意开关、在手机上打开 Bots 面板的全链路。请先在 web profile 上按 [docs/bridge.md](docs/bridge.md) 的核对表走一遍再上主力。
- 上游发新版后 patch 可能要重打：patch 只钉在 0.17.0 / `f51ca93`，新版先跑 `scripts/verify-patch.sh`，失败就别硬打。

## 出处与许可

- dsh-bots：MIT，作者 kadaliao；dsh-zen-remote：MIT，作者 KyoMio。本仓新增内容（指南、patch、脚本）同样 MIT。
- 本仓与两个上游作者均无隶属关系；patch 若被上游接受，本仓即失去存在意义，那是最好的结局。
