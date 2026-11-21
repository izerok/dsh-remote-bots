# 桥接 Bots 面板：zen-remote Plugin Bridge

> 来源：`dsh-zen-remote` 的 `docs/plugin-bridge.md`（协作声明一节）。下面每一步都对照那份规范写，规范没说的，本文件不编。

## 为什么需要桥接

Bots 面板的数据来自它自己注册在 DSH `webServer` 上的路由，前缀 `/__dsh_bots`（`index.js` 里 `const R = '/__dsh_bots'`，`mountRoutes` 用 `ctx.inject(['webServer'], mountRoutes)` 注册）。面板在浏览器里直接 `fetch('/__dsh_bots/state')` 这类请求。

没有桥接时，zen-remote 的子客户端上打开的远程会话里，这些请求落在**子客户端本机**的 bots 插件上——本机没有这支 Bot 队，拿到的是本机自己的数据。

> **2026-11-22 实测更正（全面测试 T4）**：本仓早期文档写的是“远程打开面板回 503 `x-zen-remote: unbridged`”，这是错的。实测返回 **HTTP 200 + client 本机数据**，无任何 `x-zen-remote` 头——**静默错机**，用户看不出任何错误。根因：zen-remote 的路由拦截器（`plugin-route-intercept.js` 的 `wrappedMatch`）只对已在桥接 registry 登记的路由挂 surrogate handler，未声明的插件直接走本机 handler；`zr-plugin-unbridged` 只在已声明路由的 surrogate 里触发。503 只出现在已声明路由的拒绝场景（版本不匹配、方法未声明、`deny:true`、同意未开等）。静默错数据比可见报错更危险，打 patch 前务必知道这一点。

## 声明长什么样

`patches/dsh-bots-zen-bridge.patch` 在 bots `apply()` 里、`webServer` 挂载之后加了这一段（JS，无需 TS 类型导入）：

```js
if (typeof ctx.inject === 'function') ctx.inject(['zenRemote'], (scope) => {
  const bridge = scope.zenRemote;
  if (!bridge || typeof bridge.bridge !== 'function') return;
  const declaration = {
    plugin: '@kadaliao/dsh-bots',
    version: '0.17.2-zen.2',
    routes: [
      { path: '/__dsh_bots', prefix: true, scope: 'server', methods: ['GET', 'POST'], maxBody: 41943040, rewriteIds: { fields: ['sessionId'] } },
    ],
  };
  const dispose = bridge.bridge(declaration);
  ctx.effect(() => dispose, 'bots: zen-remote bridge declaration');
});
```

字段逐个核过：

| 字段 | 值 | 依据 |
| --- | --- | --- |
| `plugin` | `@kadaliao/dsh-bots` | 必须与 package.json 的 `name` 一致 |
| `version` | `0.17.2-zen.2` | 必须与运行版本一致；patch 同时把 package.json 从 `0.17.1` 改成这个版本 |
| `path` | `/__dsh_bots` | bots 的路由前缀；不以 `/_dsh/` 或 `/api` 开头，合规 |
| `prefix: true` | 命中该路径本身及其任意子路径 | zen-remote 2.4 起支持；一条声明盖住 state、teams、tickets、needs、memory、usage、settings、avatar、image、logo 等全部子路由 |
| `scope: 'server'` | 整机数据 | 面板数据是全队、全看板、全用量，不是单个会话的；`session` 作用域不适用 |
| `methods` | `['GET', 'POST']` | 面板读写都用这两个方法；客户端 `client.js` 里只有这两类 fetch |
| `maxBody: 41943040` | 40 MiB | 上限 500 MiB 内合规；取 bots 自己的最大值：`postJson` 默认 `MAX_BODY` 4 MiB，`images` 路由 `MAX_IMAGE_UPLOAD` 40 MiB |
| `rewriteIds: { fields: ['sessionId'] }` | 位置改写 + 值深扫 | zen-remote 2.4+（PB-25a）。`{ fields }` 形态 = 值深扫（请求自带 id ∪ 客户端已知会话清单）**加**位置改写：`POST send/open` 与 ticket 路由返回的顶层 `sessionId` 会被包上 `zr~<服务端>~<id>` 外壳，面板的“打开对话”拿到的才是 client 能打开的虚拟 id。只写 `{ fields: ['sessionId'] }` 而不用 `true`，是因为 `true` 只做值深扫、新建的 id 不在已知清单里，改不到。已知缺口（实现原文 `src/plugin-route-intercept.ts`）：对象键从不改写（`state.sessionMap` 的键仍是真实 id）；数组里的 id（`teams/hire` 返回的 `bots[].sessionId`）只在已在已知清单里时才改，新招 Bot 的 home id 改不到；超过 8 MiB 或非 JSON 的响应原样直通。 |

## 怎么打 patch

只钉在上游 **0.17.1 / commit `c265612`**，别的版本先别硬打。旧版 patch 已归档：bots 0.17.0 → 0.17.1-zen.1 是 `patches/dsh-bots-zen-bridge-0.17.0.patch`，只在明确用 0.17.0 时才打；0.17.2-zen.1（无 rewriteIds）是 `patches/dsh-bots-zen-bridge-0.17.2-zen.1.patch`。

```bash
git clone https://github.com/kadaliao/dsh-bots.git dsh-bots-patched
cd dsh-bots-patched
git checkout c265612a9a09e1b7f26b8e1f145e8da78e0fb471
git apply /path/to/dsh-remote-bots/patches/dsh-bots-zen-bridge.patch
node --check index.js
# 安装打过 patch 的副本（两种方式任选其一）：
# 1. 本地 link 进 profile，见 DSH 文档的 link: 方式
# 2. 按 bots README 的 Git spec 方式装你自己的副本
```

打完后用本仓脚本自检：

```bash
node scripts/verify-bridge.mjs /path/to/dsh-bots-patched
bash scripts/verify-patch.sh   # 全新克隆上游 → 打 patch → node --check → verify-bridge
```

## 两端必须一致，否则 503

桥接握手要求**两端插件名、确切版本、声明摘要一致**：

- host 和 client 的 DSH 里，bots 必须都是打过 patch 的 `0.17.2-zen.2`，zen-remote 都装 2.1+（2.5.4 已核；`rewriteIds` 要 2.4+）。
- 一端是上游原版 0.17.1、另一端是 patch 版 → `version-mismatch` 或 `declaration-mismatch`，面板 503（注意：这个 503 只在 patch 版已声明的前提下出现；两端都是原版时是上面说的静默错机，不是 503）。一端 zen.1、一端 zen.2 同样 mismatch——`rewriteIds` 进摘要，两边声明必须完全一致。
- 升级任一端后没重启行 → 同样 503，先重启再查。

## 同意开关（必须手动开）

含 `scope: 'server'` 路由的声明，host 主人必须在 zen-remote 设置页「插件桥」里逐插件打开，默认 OFF。没打开时面板 503，reason 是 `consent-off`。这是设计，不是 bug。

> **⚠️ 两个开关，别用错（2026-11-22 源码核查，zen-remote 2.5.4）**：设置页「插件桥」开关保存后写 row 层，生效值与 file 层相同，但 row 会遮蔽 file——保存过一次之后，改 `lan-gate.config.json` 不再起作用。**插件详情页顶部的向导开关不要点**：它把同意值存成 JSON 字符串，读取侧 `consentMap` 拒收，点完看着成功了、实际同意没生效。想用 UI 开同意，只走设置页。证据见 `test-work/task4-result.md`（源码推导，未 live 复现）。

打开之前想清楚：远程能完整操作 Bots 面板，包括招团队、删卡片、改设置、代答提问、上传图片。只给可信设备开；不用时关掉。

## 分享策略：只分享 Atlas home 就够了（2026-11-22 实证）

默认只手动分享 Atlas home（dispatcher 是唯一入口）；`autoShareNewSessions` 保持默认 OFF。

- **ticket 会话不自动跟随**：第 4 条实验实证——autoShare OFF、只分享 Atlas home 的状态下分派一个任务，ticket 会话建出且任务 `done`，但 host 的 shares 表里始终只有 Atlas home 那一个，ticket 会话没进去。根因：ticket 会话是没有 `origin`、没有 `parentSession` 的独立顶层会话（会话头文件已解压核实），按 `onSessionCreated` 的规则，顶层会话只有 autoShare 开时才分享。
- **autoShare 开的代价**：一开就是所有非 subagent 起源的新会话都分享，没有“只分享 ticket”的粒度——桌面 client 侧边栏会被每个 ticket/分叉淹没，Ledger 这类管钱 Bot 的 home 也会被动暴露。
- **手机不需要 autoShare**：手机 PWA 本来就能看到 host 全部会话；autoShare 只影响桌面 client 的可见范围。
- 需要在桌面跟进某个 ticket 时，手动分享该 ticket 会话（手机信息卡开关 / 设置页列表 / `admin/shares`）。桌面上看不到 ticket 会话时，先查 `admin/shares` 里有没有它——不在表里就是没分享，不是 patch 问题。

## 远程面板的写操作全部落在 host（2026-11-22）

zen-remote 回环带操作者 cookie，插件接口看到的权限与本机浏览器完全相同；bots 的路由自己不做鉴权（见文末“回环免 token”一节）。所以**远程面板上的任何写操作 = 直接以 host 身份改 host 的数据**：保存、删除、招团队、改模型、改 key、删卡片，点一下就真改了，没有二次确认兜底。

远程最适合做的（读为主 + 轻写）：看全队状态与 activity、批复 Requests 看板、跟进 ticket（追问/叫停/关闭）、DM 任何 Bot、手动跑一次定时任务、看用量与记忆。

建议只在本地做的操作（一旦误操作恢复成本高）：

| 操作 | 原因 |
| --- | --- |
| 改模型 key（`models/custom/save`、`models/login/connect`） | key 写错，全队模型全断 |
| 删 Bot、改 Bot 人设/模型（`save` / `delete`） | 不可逆，删了 Bot 它的任务全停 |
| 导 apps（`apps/import`）、导 skill（`skills/import` / `github` / `local`） | 改 host 文件系统、带入外部 key |
| 配对聊天 App（`channels/*`） | 配对流程本就要求人在 host 侧操作 |
| 画头像（`avatar/generate`） | 10–90 秒长耗时，远程等它纯属浪费 |

**不做只读面板**：默认保持完整远程面板，不在声明里禁写路由。如需“只读面板 + 会话聊天”，可以自己拆声明：把最危险的几条写路由单独写 exact 声明 `deny: true` 并放在 prefix 声明之前（多条命中按声明次序取第一条，`deny` 优先）——做法备着，本仓不默认。

## 远程值班：推送配置（2026-11-22，未真机验证）

OPC 早报、收件箱扫荡这些定时任务在主机上跑，手机要收到结果，靠的是 zen-remote 的推送，不是 bots 自己的开关：

- 默认只在**等授权 / 等回答**时推送（工具等授权、模型调 `ask_user_question`），回合结束默认不推。
- 想让“干完活就响一下”：设 `DSH_PUSH_TURN_END=1`（只推顶层会话，子代理跑完不推）。
- 想让通知带上结果：设 `DSH_PUSH_SUMMARY=1`，正文换成本回合的最终文本回复（截 120 字，思考过程不会漏出来）。
- 总开关 `DSH_PUSH_ENABLED`（默认开）；`DSH_PUSH_SESSION_NAME=1` 让正文首行显示来源会话名。

沙箱无真机，上面只是按文档写的配置方法，推送通道本身未在本轮验证；真机上开一次设置页自带的测试推送核对。

## 远程改模型后要发 `/new` 才生效（2026-11-22）

会话的模型选择是粘性的：旧会话的 `lastUsed` 钉在旧模型路由上，改默认 + 重启也不生效（TASK3 实证：两次探针任务 441ms/2s 内 error、0 次模型调用，最后删旧会话重建才通）。远程在 Bot 的 Profile 里改了模型后，正在跑的旧会话仍用旧模型；给该 Bot 发 `/new` 开新话题（或等 6 小时安静、prompt 到 128K 自动开新话题）才生效。

## 桌面改 peer 角色前：先把 bots 的同意显式钉死（2026-11-22，安全前置）

zen-remote 2.5.2 起，`role: 'peer'` 下授权表里**没写过**的已登记插件对网内 peer 设备默认就是同意的（`effectivePluginConsent`，`src/index.ts:846-858`）。去中心化 plan B（桌面改 peer 角色）实施时，切 peer 之前必须先在授权表里显式写死 `pluginBridgeConsent: {"@kadaliao/dsh-bots": false}`（或确认网内全是可信设备），切完用 `admin/plugin-bridge` 核对实际生效值。去中心化实施本身仍暂停，这条只是给未来的 plan B 加护栏，详见 [docs/decentralization.md](decentralization.md)。

## 单机同环部署：relay 会 401（2026-11-22 实测）

host 和 client 在同一台机器上时，client 的 relay 流量永远是回环来源。zen-remote 网关的 `isLocalDirect()` 把回环请求一律当作“本机用户直连”，不走设备认证、不打 relay 戳（`x-zen-remote-secret` / `x-zen-remote-via` / `x-zen-remote-role`），DSH 侧的 relay 门直接回 401 `relay-unauthorized`，client 的 `remote-status` 始终 `offline`。这与 token 或配置无关。

已验证的绕法（仅用于同机调试）：网关改绑 `0.0.0.0`（host 启动时 `LAN_GATE_HOST=0.0.0.0`），client 改用 **`http://127.0.1.1:3088`** 配对——`isLoopbackIp()` 只精确匹配 `127.0.0.1`/`::1`，而 `isPrivateOrLoopbackIp()` 接受整个 `127/8`，请求于是走设备认证、网关打戳、DSH 门通过。注意沙箱/代理环境下须把 `127.0.1.1` 追加进 `no_proxy`。两台真实机器之间部署没有这个问题。是否向 zen-remote 上游提 issue（回环客户端的设备认证被本地直连判定吞掉）待定。

## 回环免 token 观察（2026-11-22，已查根因：DSH 的设计，不是 bots 的 bug）

`GET /__dsh_bots/state` 从 localhost **不带任何 token 也返回 200**，内容与带 token 一致。根因已读 DSH 0.2.2-rc.5 源码核实：

- DSH 的 `WebServer` 服务（`@deepseek-ai/dsh-host-webserver/src/index.ts`，`handle()`）按路径直接分发给注册的 handler，**全程不查 cookie、token、Host、Origin**；其 `readResource()` 的文档原话就是 "This method checks no cookie, Host, or Origin"。
- bots 经 `web.register()` 注册的是裸 handler，自己也不做鉴权。
- `?token=` 那道 fence 不在 `webServer` 里，而在浏览器连接层（`@deepseek-ai/dsh-client-connection/src/browser-auth.ts`，token 换 303 + set-cookie 只管 SPA 连接流程），插件路由根本不经过它。

所以这是平台属性，不是 bots 一家的问题：**所有经 `webServer.register()` 注册的插件路由都不带鉴权**。缓解因素是 `dsh web` 默认只绑一个具体的回环地址（配置里明确拒绝通配绑定，理由是“会把远程代码执行暴露给网络”），所以默认只影响本机；但只要把 DSH web 绑到局域网地址或放到反代后面，`/__dsh_bots/*` 这类插件路由对能到达的人就是免 token 的——反代上的 token 检查如果有，也只拦 SPA 连接，不拦插件路由。是否向 DSH 上游反馈，由用户定；本仓的桥接 patch 不改变这一点。

## 503 原因速查

下表只适用于**已声明桥接**的路由。未打 patch 的插件不在表里——它不回 503，见文首的实测更正。

| reason | 含义 | 先查什么 |
| --- | --- | --- |
| `not-on-server` | 服务端没登记这个插件 | host 的 bots 是不是 patch 版、zen-remote 是不是 2.1+ |
| `version-mismatch` | 两端版本不同 | 两端 bots 版本号是否都是 `0.17.2-zen.2` |
| `declaration-mismatch` | 版本相同但声明摘要不同 | 两端 patch 是否同一份 |
| `consent-off` | host 没同意 | 设置页「插件桥」里 bots 有没有打开 |
| `method-not-bridged` | 方法不在声明里 | 面板是不是发了 GET/POST 之外的方法 |
| `offline` | 中继离线或传输失败 | zen-remote 的 peer/host 链路 |
| `not-shared` | 会话未共享 | 当前打开的会话有没有开远程 |

## 没装 zen-remote 时会怎样

什么都不会发生。`ctx.inject(['zenRemote'])` 在没有 zen-remote 的行里永不触发，bots 的行为与上游完全一致。这是 zen-remote 规范原文的保证，也是 patch 只加 inject、不改任何现有逻辑的原因。
