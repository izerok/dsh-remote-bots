# VENDORING — 合并插件的代码来源与再同步

合并插件 `dsh-remote-bots` 1.0.1 把两个上游项目的**已发布文件集**整树 vendor 进
`plugin/src/`，不做深度统一。两份代码各放一个子目录、原样保留，只做接线必需
的最小改动（见“本地改动”）。本文件是再同步的唯一依据。

## 来源（钉版）

| 一半 | 上游 | 钉版 | 核实 |
| --- | --- | --- | --- |
| bots | `kadaliao/dsh-bots`（MIT） | 0.17.1，commit `c265612a9a09e1b7f26b8e1f145e8da78e0fb471`（`Use the target bot's workspace for projectless tasks (#7)`） | `test-work/clones/dsh-bots-0171` 的 HEAD；与 patch 钉版一致 |
| zen-remote | `KyoMio/dsh-zen-remote`（MIT） | 2.5.4，tag `v2.5.4` → commit `031876259e4ef6756d6ef22ae842fa6160b4ae2d` | GitHub API 核实；已装包与 tag 的已发布文件逐字节一致（`test-work/SINGLE-PLUGIN-MERGE.md` §1.1） |

上游新鲜度复查（2026-11-22，vendor 当日）：bots 最新 tag 仍是 `v0.17.1`（无
GitHub Release）；zen-remote 最新 Release 仍是 `v2.5.4`（2026-11-20 发布）。
两边均无新版，钉版不变。

## Vendor 方法

- bots：从干净 clone 取已发布文件集——`index.js`、`client.js`、`lib/`、
  `locale/`、`logos/`、`icon.svg`、`cordis.patch.yml`、`package.json`、
  `README.md`、`README.zh-CN.md`、`LICENSE`、`API.md`。clone 里的 `docs/`、
  `test/`、`.github/`、`.gitignore` 不在发布文件集里，未搬运。
- zen-remote：从已装包（npm 发布件）
  `test-work/dsh-home/profiles/web/node_modules/dsh-zen-remote` 整目录复制
  （`cp -rL` 解引用），即 `lib/`、`src/`、`pwa/`、`assets/`、`bin/`、
  `lan-gate.mjs`、`dsh-push.mjs`、`cordis.patch.yml`、
  `cordis.patch.yml.example`、`llms.txt`、`CHANGELOG.md`、`README.md`、
  `README.zh-CN.md`、`LICENSE`、`package.json`、`docs/`。
- 搬运后核对：`diff -rq` vendored bots vs clone 只有 `docs/`、`test/`、
  `.github/`、`.gitignore` 四处缺失（均不在发布集里），其余零不同；
  vendored zen vs 已装包零不同。合并后插件约 16 MB。
- 相对 import 全数有效，无需改路径：bots 的 `./lib/*`；zen 的
  `lib/index.js` 对 `../lan-gate.mjs` / `../dsh-push.mjs` 的引用与
  `../package.json` 的 version 自读都保持相对位置。

## 本地改动（相对上游，全量）

| # | 位置 | 改动 | 理由 |
|---|---|---|---|
| M1 | `src/bots/index.js`，约 6491–6528 行（纯插入，0 行上游改动） | 插入桥接声明段（`ctx.inject(['zenRemote'])` + 声明），与 `patches/dsh-bots-zen-bridge.patch` 的桥接段相同，**仅** `version` 由 `'0.17.2-zen.2'` 改为 `'1.0.0'`；`plugin` 保持 `'@kadaliao/dsh-bots'` | 合并后仍需向 zen 的改道层登记；版本改为合并插件版本；`plugin` 保持旧键使现有 `pluginBridgeConsent` 同意不用重开（有意偏离文档字面，见下） |
| M1.5 | `src/zen-remote/lib/client.js`，4 处字面量（2026-11-22，1.0.1） | `SETTINGS_ENTRY_ID`（:20486）`'dsh-zen-remote'` → `'dsh-remote-bots'`；`SETTINGS_ROW_KEY`（:20488）`'dsh-zen-remote#dsh-zen-remote'` → `'dsh-remote-bots#dsh-remote-bots'`；`WIZARD_BUNDLE_KEY`（:24059）`'dsh-zen-remote'` → `'dsh-remote-bots'`；向导包名检查（:22466）`subject.pkg.name !== 'dsh-zen-remote'` → `!== 'dsh-remote-bots'` | 合并把包名/行 id 改成 `dsh-remote-bots` 后，zen 客户端这 4 处硬编码旧 id 致设置页（`plugins.row.config`）与网关向导（`plugins.bundle.config`）注册全部落空（根因见 `test-work/SIDEBAR-MISSING.md`）。只动这 4 处：locale 命名空间、样式 `data-plugin` 标签、`dsh-zen-remote: …` effect 名等其余字面量只是名字、不参与匹配，一律不动。vendored 树里没有 `lib/client.js.map`，无过期 map 文件 |
| M2 | 其余 bots 文件 | 零改动（含 `client.js` 的 `BOTS_VERSION = '0.17.1'`、`package.json` 的 `0.17.1`） | 它就是 bots 0.17.1 的代码 |
| M3 | 全部 zen-remote 文件 | 除 M1.5 外零改动 | 原样 vendor |
| M4 | 新增（接线层，全部新写） | `plugin/package.json`、`plugin/index.js`、`plugin/client.js`（由 `scripts/build-plugin-client.mjs` 生成）、`plugin/cordis.patch.yml`、本文件、`plugin/README.md`、`plugin/icon.svg`（沿用 bots 的）、`plugin/LICENSES/` | 单插件入口与发布单元 |

声明的其余字段与 patch 完全一致：
`routes: [{path: '/__dsh_bots', prefix: true, scope: 'server', methods: ['GET','POST'], maxBody: 41943040, rewriteIds: {fields: ['sessionId']}}]`。
已知限制原样保留：`state.sessionMap` 的键从不改写；数组里的
`bots[].sessionId` 只有已在请求/已知清单里时才改写。

**版本三元组（不要混淆）**：合并插件 `1.0.1`（声明 version 亦为此）／
bots 一半 `0.17.1`（面板自报 `BOTS_VERSION`）／zen 一半 `2.5.4`
（debug 报告自报 `pluginVersion`）。

声明 version 的两条硬约束（1.0.1 起）：① `scripts/verify-plugin.mjs`
强制 `declaration.version === plugin/package.json` 的 version，升版须两处
同改；② zen 的 `compareBridges`（`lib/plugin-bridge.js`，version 不等 →
`version-mismatch`，桥接判 false）、`validatePluginCall` 与 relay 校验
（version/digest 不等 → 409 `plugin-mismatch`）都拿声明 version 做两端
相等校验——**host 与 client 必须同装同一合并插件版本**，一端 1.0.0、一端
1.0.1 即断桥。`plugin` 字段不是版本键（同意键，不动）。

## 再同步

- bots：取上游某 commit 的已发布文件集覆盖 `src/bots/`，然后用三方 diff
  重放 M1（十几行，行号区间见上表——重放后以 `diff` 确认除 M1 外零不同）。
- zen：取上游某 tag 的已发布文件集覆盖 `src/zen-remote/`（除 M1.5 外零改动，
  覆盖后重放 M1.5 四处字面量；
  注意保留上游 `package.json` 原件，`lib/index.js` 自读 version 依赖它）。
- 每次同步后：重跑 `node scripts/build-plugin-client.mjs`（重新生成
  `plugin/client.js`），再跑 `test-work/SINGLE-PLUGIN-MERGE.md` §3 的四项测试。
- 上游发新版时不要只升 `plugin/package.json` 里的版本号——vendored 代码
  本身必须同步覆盖，否则声明版本与代码版本会脱节。

## 许可证

两份上游均为 MIT。原件在 `plugin/LICENSES/`（`dsh-bots-MIT.txt`、
`dsh-zen-remote-MIT.txt`）；`src/bots/LICENSE` 与 `src/zen-remote/LICENSE`
也是上游原件。本仓新增的接线层（M4）同样 MIT。`plugin/package.json` 的
`repository` 指向本仓；本仓与两个上游作者均无隶属关系。
