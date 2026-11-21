# Patches

## dsh-bots-zen-bridge.patch

给 `kadaliao/dsh-bots` **0.17.0**（commit `f51ca938794cfc97c963c0624ea70c908a50d7a9`）加 zen-remote Plugin Bridge 声明，让 Bots 面板（`/​__dsh_bots/*`）能在 zen-remote 远程会话里显示，而不是 503。

- 改动：`index.js` +24 行（只加一段 `ctx.inject(['zenRemote'], …)`，不改现有逻辑），`package.json` 版本 `0.17.0` → `0.17.1-zen.1`。
- 声明：`plugin: '@kadaliao/dsh-bots'`，`routes: [{ path: '/__dsh_bots', prefix: true, scope: 'server', methods: ['GET','POST'], maxBody: 41943040 }]`。
- 适用：仅限上面钉住的 commit；上游发新版后先跑 `scripts/verify-patch.sh`，失败就别硬打，等本仓跟进。

用法与完整说明见 [docs/bridge.md](../docs/bridge.md)。
