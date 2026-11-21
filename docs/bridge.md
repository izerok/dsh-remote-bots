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
    version: '0.17.2-zen.1',
    routes: [
      { path: '/__dsh_bots', prefix: true, scope: 'server', methods: ['GET', 'POST'], maxBody: 41943040 },
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
| `version` | `0.17.2-zen.1` | 必须与运行版本一致；patch 同时把 package.json 从 `0.17.1` 改成这个版本 |
| `path` | `/__dsh_bots` | bots 的路由前缀；不以 `/_dsh/` 或 `/api` 开头，合规 |
| `prefix: true` | 命中该路径本身及其任意子路径 | zen-remote 2.4 起支持；一条声明盖住 state、teams、tickets、needs、memory、usage、settings、avatar、image、logo 等全部子路由 |
| `scope: 'server'` | 整机数据 | 面板数据是全队、全看板、全用量，不是单个会话的；`session` 作用域不适用 |
| `methods` | `['GET', 'POST']` | 面板读写都用这两个方法；客户端 `client.js` 里只有这两类 fetch |
| `maxBody: 41943040` | 40 MiB | 上限 500 MiB 内合规；取 bots 自己的最大值：`postJson` 默认 `MAX_BODY` 4 MiB，`images` 路由 `MAX_IMAGE_UPLOAD` 40 MiB |

## 怎么打 patch

只钉在上游 **0.17.1 / commit `c265612`**，别的版本先别硬打。旧版 patch（bots 0.17.0 → 0.17.1-zen.1）已归档为 `patches/dsh-bots-zen-bridge-0.17.0.patch`，只在明确用 0.17.0 时才打。

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

- host 和 client 的 DSH 里，bots 必须都是打过 patch 的 `0.17.2-zen.1`，zen-remote 都装 2.1+（2.5.4 已核）。
- 一端是上游原版 0.17.1、另一端是 patch 版 → `version-mismatch` 或 `declaration-mismatch`，面板 503（注意：这个 503 只在 patch 版已声明的前提下出现；两端都是原版时是上面说的静默错机，不是 503）。
- 升级任一端后没重启行 → 同样 503，先重启再查。

## 同意开关（必须手动开）

含 `scope: 'server'` 路由的声明，host 主人必须在 zen-remote 设置页「插件桥」里逐插件打开，默认 OFF。没打开时面板 503，reason 是 `consent-off`。这是设计，不是 bug。

打开之前想清楚：远程能完整操作 Bots 面板，包括招团队、删卡片、改设置、代答提问、上传图片。只给可信设备开；不用时关掉。

## 单机同环部署：relay 会 401（2026-11-22 实测）

host 和 client 在同一台机器上时，client 的 relay 流量永远是回环来源。zen-remote 网关的 `isLocalDirect()` 把回环请求一律当作“本机用户直连”，不走设备认证、不打 relay 戳（`x-zen-remote-secret` / `x-zen-remote-via` / `x-zen-remote-role`），DSH 侧的 relay 门直接回 401 `relay-unauthorized`，client 的 `remote-status` 始终 `offline`。这与 token 或配置无关。

已验证的绕法（仅用于同机调试）：网关改绑 `0.0.0.0`（host 启动时 `LAN_GATE_HOST=0.0.0.0`），client 改用 **`http://127.0.1.1:3088`** 配对——`isLoopbackIp()` 只精确匹配 `127.0.0.1`/`::1`，而 `isPrivateOrLoopbackIp()` 接受整个 `127/8`，请求于是走设备认证、网关打戳、DSH 门通过。注意沙箱/代理环境下须把 `127.0.1.1` 追加进 `no_proxy`。两台真实机器之间部署没有这个问题。是否向 zen-remote 上游提 issue（回环客户端的设备认证被本地直连判定吞掉）待定。

## 回环免 token 观察（2026-11-22，DSH/bots 侧行为，与 patch 无关）

`GET /__dsh_bots/state` 从 localhost **不带任何 token 也返回 200**，内容与带 token 一致。插件的 `webServer` 路由似乎绕过了浏览器的 token fence（仅限 localhost）。如在意，可进一步确认这是 DSH 的设计还是 bots 的路由配置问题。

## 503 原因速查

下表只适用于**已声明桥接**的路由。未打 patch 的插件不在表里——它不回 503，见文首的实测更正。

| reason | 含义 | 先查什么 |
| --- | --- | --- |
| `not-on-server` | 服务端没登记这个插件 | host 的 bots 是不是 patch 版、zen-remote 是不是 2.1+ |
| `version-mismatch` | 两端版本不同 | 两端 bots 版本号是否都是 `0.17.2-zen.1` |
| `declaration-mismatch` | 版本相同但声明摘要不同 | 两端 patch 是否同一份 |
| `consent-off` | host 没同意 | 设置页「插件桥」里 bots 有没有打开 |
| `method-not-bridged` | 方法不在声明里 | 面板是不是发了 GET/POST 之外的方法 |
| `offline` | 中继离线或传输失败 | zen-remote 的 peer/host 链路 |
| `not-shared` | 会话未共享 | 当前打开的会话有没有开远程 |

## 没装 zen-remote 时会怎样

什么都不会发生。`ctx.inject(['zenRemote'])` 在没有 zen-remote 的行里永不触发，bots 的行为与上游完全一致。这是 zen-remote 规范原文的保证，也是 patch 只加 inject、不改任何现有逻辑的原因。
