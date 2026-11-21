# Patches

给 `kadaliao/dsh-bots` 加 zen-remote Plugin Bridge 声明，让 Bots 面板（`/​__dsh_bots/*`）能在 zen-remote 远程会话里显示，而不是静默拿到本机数据（见下文“没打 patch 时到底发生什么”）。

## 当前版：dsh-bots-zen-bridge.patch（bots 0.17.1 → 0.17.2-zen.1）

针对上游 **0.17.1**（commit `c265612a9a09e1b7f26b8e1f145e8da78e0fb471`，2026-11-21）。2026-11-22 全面测试已验证：静态校验、两端登记、远程读写转发、回归全部通过，详见 [docs/validation-2026-11-22.md](../docs/validation-2026-11-22.md)。

- 改动：`index.js` +24 行（只加一段 `ctx.inject(['zenRemote'], …)`，不改现有逻辑），`package.json` 版本 `0.17.1` → `0.17.2-zen.1`。
- 声明：`plugin: '@kadaliao/dsh-bots'`，`routes: [{ path: '/__dsh_bots', prefix: true, scope: 'server', methods: ['GET','POST'], maxBody: 41943040 }]`。
- 适用：仅限上面钉住的 commit；上游发新版后先跑 `scripts/verify-patch.sh`，失败就别硬打，等本仓跟进。

## 旧版：dsh-bots-zen-bridge-0.17.0.patch（bots 0.17.0 → 0.17.1-zen.1）

针对上游 **0.17.0**（commit `f51ca938794cfc97c963c0624ea70c908a50d7a9`），本仓第一版 patch，已归档保留。2026-11-22 复核：对 `f51ca93` 仍可干净应用。只在你明确要用 bots 0.17.0 时才打它；新部署一律用当前版。

## 没打 patch 时到底发生什么（2026-11-22 实测更正）

本仓早期文档写的是“远程打开面板回 503 `x-zen-remote: unbridged`”，这是错的。实测：未打 patch 的插件**没有任何桥接声明**，zen-remote 的路由拦截器只对已登记声明的路由生效，未声明的直接走本机 handler——远程视角返回 **HTTP 200 + client 本机数据**，无任何 `x-zen-remote` 头，**静默错机**，比可见的 503 更危险。503 只出现在已声明路由的拒绝场景（版本不匹配、方法未声明、`deny:true`、同意未开等），见 [docs/bridge.md](../docs/bridge.md) 的原因速查表。

用法与完整说明见 [docs/bridge.md](../docs/bridge.md)。
