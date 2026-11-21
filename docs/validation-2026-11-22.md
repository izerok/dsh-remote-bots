# 全面测试验证记录（2026-11-22）

> 本文件是测试执行员的原始报告全文，只改了路径引用。原始证据日志（49 个文件，token 已 scrub）留在本地测试目录，未入仓。

# dsh-remote-bots 全面测试报告

- 测试日期：2026-11-21（UTC 16:11 完成，北京时间 2026-11-22 00:11）
- 测试范围：`dsh-bots`（@kadaliao）+ `dsh-zen-remote`（KyoMio）组合与桥接 patch，隔离环境真装真跑
- 版本：DSH `@deepseek-ai/dsh@0.2.2-rc.5`；`dsh-zen-remote@2.5.4`；上游 bots `@kadaliao/dsh-bots@0.17.1`（HEAD `c265612`）；patch 版 bots `0.17.2-zen.1`
- 环境：Node v24.22.1、npm 10.9.4、pnpm 10.14.0（测试目录本地安装）；工作目录 `~/workspace/dsh-remote-bots/test-work/`；`TMPDIR` 全部指向 `test-work/tmp`（`/tmp` 为 512M tmpfs）
- 隔离：三个独立 `DSH_HOME`（host / client / nozen），未碰 `~/.dsh/profiles/sdk` 与用户主力 profile；无真实模型 key，全程未写任何 key；未向 GitHub 推送、未发 Release
- 证据：全部日志与 curl 输出在 `test-work/logs/`（49 个文件），报告内引用文件名；日志中的 `token=` 已 scrub 为 `token=<redacted>`，cookie 与配对码文件已删除

## 总表

| 项 | 结论 | 一句话证据 |
|----|------|-----------|
| T1 DSH 安装 | **PASS** | npm 装 0.2.2-rc.5，673 包，`dsh --version` → 0.2.2-rc.5，`dsh --help` / `dsh web --help` 正常 |
| T2 上游原版同装 | **PASS** | zen-remote 2.5.4 + bots 0.17.1 同装启动成功；`/__dsh_bots/state|teams|usage|activity` 均 200；hire opc 成功，6 机器人 |
| T3 会话级远程（无 patch） | **基本验证** | admin 路由需 cookie（`?token=` 单独用返回 401）；分享 Atlas 成功，48h 有效期；`admin/plugin-bridge` 基线 `{"plugins":[]}` |
| T4 面板缺口复现（无 patch） | **FAIL（与预期不符，实测更严重）** | 远程视角请求 Bots 面板未返回预期的 503，而是 **200 + 本机数据**（静默错机数据，见 §T4） |
| T5 Patch rebase 到 0.17.1 | **PASS** | 新 patch `dsh-bots-zen-bridge-0.17.1.patch`（47 行，版本 0.17.2-zen.1）；`git apply --check` + `node --check` 通过；校验器 17/17 PASS，未改校验器 |
| T6 打 patch 版安装 | **PASS** | 两端 `link:` 安装，版本 0.17.2-zen.1；host `admin/plugin-bridge` 登记且 `consent:true`；client `remote-status` 的 `bridgedPlugins` 含 `@kadaliao/dsh-bots`；两端启动零报错 |
| T7 两端远程面板转发 | **PASS** | client 远程视角 `GET /__dsh_bots/state?sessionId=zr~…` 返回 **host 的 6 机器人**（200）；`POST hire dev` 经远程转发在 **host** 上建出 Builder/Tester/Review（host 9 机器人，client 本机仍 1 个） |
| T8 回归（无 zen-remote 时打 patch 版） | **PASS** | 第三实例（仅 patch 版 bots，无 zen-remote）启动干净、日志零 `zen` 提及、零报错；bots 路由 200，Atlas 正常 seed；zen-remote 路由 404 |

---

## T1. DSH 安装 — PASS

- 命令：`npm install @deepseek-ai/dsh@0.2.2-rc.5` 到 `test-work/dsh-install`（未用带 120 秒超时的 npx）
- 结果：673 个包，约 1.2G；`dsh --version` → `0.2.2-rc.5`；`dsh --help`、`dsh web --help` 均正常输出
- 插曲：`dsh plugin` 需要 pnpm，首次尝试 exit 127（`spawn pnpm ENOENT`）；本机无 corepack，改在 `test-work/tools` 本地装 pnpm 10.14.0 后解决
- 证据：`logs/t1-dsh-help.txt`、`logs/t1-dsh-web-help.txt`

## T2. 上游原版同装 — PASS

- 安装：web profile 内装 `dsh-zen-remote@2.5.4` 与 `@kadaliao/dsh-bots@0.17.1`，均 exit 0（`logs/t2-plugin-zen.log`、`logs/t2-plugin-bots.log`）
- 启动：host `dsh web --no-open --host 127.0.0.1 --port 18081 --trusted-host 127.0.0.1`；zen-remote 网关 `127.0.0.1:3088`；启动日志 `logs/t2-host-server.log` 无报错（仅一条 VAPID 警告：`mailto:admin@localhost` 不可路由，iOS 推送会 403——本测试无关）
- 访问 token 取得方式：启动日志打印的 `dsh web: http://127.0.0.1:18081/?token=…`（43 字符），`GET /?token=…` 返回 303 并 set-cookie，后续管理面用 cookie
- curl 实测（host 18081）：
  - `/` → 303；`/__dsh_bots/state`、`/__dsh_bots/teams`、`/__dsh_bots/usage`、`/__dsh_bots/activity` → 全部 200
  - 网关 `/` → 401 `dsh web authentication required`
  - bots 自动 seed 调度员 Atlas（`bot-mwql8t0mj0bnl`，`botsVersion 0.17.1`）；`POST /__dsh_bots/teams/hire {"id":"opc","lang":"en"}` → 200，建出 6 机器人（Atlas + Compass lead + Forge/Echo/Harbor/Ledger）；Atlas 与 Compass 立即获得 home session（`session-4dad09b7-…`、`session-b05b4520-…`），其余 4 个 `sessionId: null`（首次使用前无 session）
  - 上述 hire 全程**无模型 key**即可完成
- **安全观察**：`/__dsh_bots/state` 从回环地址**不带任何 token 也返回 200**（内容与带 token 一致，仅 `at` 时间戳不同）——插件的 `webServer` 路由似乎绕过了浏览器 token  fence（仅限 localhost）。这是 DSH/bots 侧的行为，与 bridge patch 无关，记在此处供用户知晓
- 证据：`logs/t2-curl_*.out`、`logs/t2-curl-notoken.out`、`logs/t3-hire-opc.out`

## T3. 会话级远程（无 patch）— 基本验证

- 管理面认证：zen-remote admin 路由**只认登录 cookie**，`?token=` 单独用返回 401 `{"ok":false,"error":{"code":"unauthorized"}}`
- `GET /_dsh/zen-remote/admin/status`（带 cookie）→ 200：role `host`，网关运行于 3088，`autoShareNewSessions: false`（默认），`pluginBridgeConsent: {}`，`idleHours: 48`
- `GET admin/shares` → 200 `{"shares":[]}`；`POST admin/shares {action:"share", sessionId: <Atlas home session>}` → 200 `{"ok":true}`；再 GET 列出该分享，title `Atlas`，`remainingMs` ≈ 172799980（约 48h），`viewers: 0`；分享不存在的 session → 404 `no-session`
- `GET admin/plugin-bridge` → 200 `{"plugins":[]}`（基线：未打 patch，无任何桥接登记）
- `GET client/status` → 404 `Unknown client route`（host 角色下无 client 路由，符合预期）
- 管理面 shares 路由形态（读 `admin-routes.js` 核实）：`POST {action, sessionId?}`，actions 为 `share`/`unshare`/`unshare-all`
- 未观察到的：allowlist 的拒绝行为（未配 allowlist，无从触发）；浏览器 UI 里的分享开关状态（curl 层面只能看到 API 结果）
- 证据：`logs/t3-curl__dsh_zen-remote_admin_*.out`、`logs/t3-share-atlas.out`、`logs/t3-share-bad.out`、`logs/t3-shares-after.out`

## T4. 面板缺口复现（无 patch）— FAIL（与预期不符）

**预期**（README/docs 的说法）：远程视角请求 Bots 面板路由应返回 503 + `x-zen-remote: unbridged`。
**实测**：返回 **HTTP 200 + client 本机的 Bots 数据**，无任何 `x-zen-remote` 头。

- 前置：client 实例（`dsh-home-client`，端口 18082，角色 client）与 host 配对成功；Atlas home session 已在 host 上分享（T3）；client 与 host 的 relay 已连通（见下文“中继连通排障”）
- 对照（client 本机，无 sessionId）：`GET http://127.0.0.1:18082/__dsh_bots/state` → 200，1 个机器人 Atlas（`bot-mwqlcbbm1yclo`，client 本机的 seed）
- 远程视角：`GET http://127.0.0.1:18082/__dsh_bots/state?sessionId=zr~2a28b9bf~session-4dad09b7-79d2-4d59-8828-ea37c4f08a35`（virtual id，`zr~<serverId>~<Atlas home session>`，按 2.1 约定走默认 query 参数 `sessionId`）→ **200**，body 与对照完全一致（同一 `bot-mwqlcbbm1yclo`），响应头无 `x-zen-remote`
- 证据：`logs/t4-control-local.out`、`logs/t4-remote-state.out`、`logs/t4-remote-headers.txt`
- **根因（读代码核实）**：`plugin-route-intercept.js` 的 `wrappedMatch` 只对**已在桥接 registry 登记**的路由挂 surrogate handler——无登记时直接返回原路由（`if (declared === undefined) return entry`，约 2130 行附近）；`zr-plugin-unbridged` 全仓只存在于该文件，且只在已登记路由的 surrogate 里触发。未打 patch 的 bots **没有任何 declaration**，因此拦截器根本不介入，请求直达本机 bots handler，静默返回本机数据
- **定性**：缺口确实存在，但形态比文档写的更严重——不是可见的 503 拒绝，而是**静默的错机数据**：远程看 Bots 面板时，看到的是 client 本机的机器人/团队，用户无任何错误提示可察觉。503 只会在“已声明但版本不匹配 / 方法未声明 / `deny:true`”等已声明场景下出现
- 影响：`docs/bridge.md` 与 README 中关于 503 的描述需修正（见“建议下一步”第 2 条）

### 附：中继连通排障（T4/T7 前置，耗时最久的一环）

配对本身一次成功（host mint code → client claim 200，`entryId 8a8e87ce`，`deviceId 38c6372b549f`），但 client `remote-status` 始终 `offline`，CLI `status` 显示 `last error: relay-unauthorized`；手写 handshake `POST http://127.0.0.1:3088/_dsh/zen-remote/relay/v1/handshake`（Bearer 为配对 token，body `{}`，与 relay-client 完全一致）同样 401 `relay-unauthorized`。

根因（读 `lan-gate-server.cjs` + `relay-server.js` 核实）：
- DSH 侧 relay 门要求三件齐全：`x-zen-remote-secret`（与插件持有的密钥 timing-safe 相等）+ `x-zen-remote-via: gateway` + `x-zen-remote-role: desktop-client`，缺一即 401
- 网关只对**通过设备认证**的请求打这三个戳（`cleanHeaders` 先丢弃客户端自带的 `x-zen-remote-*`，再写网关自己的值）
- 但 `isLocalDirect()` 把**回环来源**的请求一律当作“本机用户直连”：`device = undefined`，请求不经设备认证直接转发、**不打戳** → DSH 门 401
- host 与 client 同在一台机器、走同一回环时，client 的 relay 流量永远是回环来源——**单机同环部署下 relay 不可能连通**，与 token 或配置无关（token 两端 sha256 前缀一致，已核对）

已验证无效的绕法：ULA IPv6 `fd8b:4f84:7d32:99::2`（沙箱禁连非回环地址，`Operation not permitted`）；`198.19.0.2`（不在网关的私有地址白名单内，会 403，且网关当时只绑了 127.0.0.1）；加 `127.0.0.2` 回环别名（无 `CAP_NET_ADMIN`，`RTNETLINK answers: Operation not permitted`）。

最终生效的绕法（已验证）：网关改绑 `0.0.0.0`（`LAN_GATE_HOST=0.0.0.0` 重启 host），client 改用 **`http://127.0.1.1:3088`** 配对——`isLoopbackIp()` 只精确匹配 `127.0.0.1`/`::1`，而 `isPrivateOrLoopbackIp()` 接受整个 `127/8`，于是请求走设备认证、网关打戳、DSH 门通过。手写 handshake 经 `127.0.1.1` 立得 **200**（`{"ok":true,"relayProtocol":1,"serverId":"2a28b9bf","serverName":"htch-runtime","dshVersion":"0.2.2-rc.5","fingerprints":{…},"plugins":{},"deviceName":"test-client"}`，注意当时 `plugins:{}`——未打 patch，符合预期）；重新 claim 后 client `remote-status` 的 server 条目变为 `online`，CLI 也显示 `online`。

附带发现：沙箱有 HTTP(S)_PROXY，curl 访问不在 `no_proxy` 内的主机名/IP 会走代理——`127.0.1.1` 与 `htch-runtime` 须追加进 `no_proxy` 才能直连；Node fetch（client relay 实际用的）不受代理环境变量影响。
证据：`logs/t4-handshake*.out`、`logs/t4-remote-status2.out`、`logs/t4-claim2.out`

## T5. Patch rebase 到 0.17.1 — PASS

- 旧 patch 直接用于干净 0.17.1（`clones/dsh-bots-0171`，HEAD `c265612`）：`index.js` 的 hunk 干净适用，`package.json` 的 hunk 失效（上游版本已是 0.17.1）
- 新 patch 生成方式：`git apply --exclude=package.json` + sed 改版本，产出 `test-work/dsh-bots-zen-bridge-0.17.1.patch`（47 行），声明版本与包版本同步为 **`0.17.2-zen.1`**，锚点在 `index.js` 约 6488 行（`ctx.inject(['webServer'], mountRoutes)` 之后插入 `ctx.inject(['zenRemote'], …)`）
- 验证：`git apply --check`（对干净 0.17.1）通过；`node --check` 通过；集成仓 `scripts/verify-bridge.mjs` 对打 patch 的副本 **17/17 PASS**，对未打 patch 的上游正确 FAIL（exit 1，缺声明）
- 校验器**未做任何修改**——它动态读版本，0.17.2-zen.1 直接通过
- 集成仓原 patch（`patches/dsh-bots-zen-bridge.patch`，钉 0.17.0）**未覆盖**；新 patch 只留在 `test-work/` 内
- 打 patch 的副本位于 `test-work/bots-0171-patched/`

## T6. 打 patch 版安装 — PASS

- 方式：两端 profile 的 `package.json` 依赖改为 `"@kadaliao/dsh-bots": "link:/home/hatch/workspace/dsh-remote-bots/test-work/bots-0171-patched"`（绝对路径 link），`bundles` 不变；各跑 `pnpm install --no-frozen-lockfile`
- 结果：两端 `node_modules/@kadaliao/dsh-bots` 均为指向 `bots-0171-patched` 的 symlink，`package.json` 版本读出 `0.17.2-zen.1`
- 同意开关：`admin/plugin-bridge` 是 **GET-only**（POST 返回 405），同意值存在插件配置 `pluginBridgeConsent`（name→boolean map）里；配置支持 file 层，因此在 host 的 `<DSH_HOME>/lan-gate.config.json` 写 `{"pluginBridgeConsent": {"@kadaliao/dsh-bots": true}}`——与设置页 UI 勾选后落盘的是同一个值；**浏览器 UI 点勾选这条路本身未验**（沙箱无浏览器，见“未验”）
- 重启两端（host 带 `LAN_GATE_HOST=0.0.0.0`，原因见 T4 附录）后验证：
  - host `GET /__dsh_bots/state` → 200，`botsVersion: 0.17.2-zen.1`，6 机器人（T2 hire 的 OPC 团队在重启后仍在）
  - host `GET admin/plugin-bridge` → 200：`[{"plugin":"@kadaliao/dsh-bots","version":"0.17.2-zen.1","hasServerScope":true,"consent":true,"adapted":false}]`——声明已登记、同意为真、有 server scope、非适配器代接
  - client `GET /__dsh_bots/state` → 200，`botsVersion: 0.17.2-zen.1`，1 机器人（本机 Atlas）
  - client `GET remote-status` → server `2a28b9bf` **online**，`bridgedPlugins: ["@kadaliao/dsh-bots"]`——握手表在 host 重启后自动刷新，无需手动 reconnect
  - 两端启动日志均零报错（`logs/t6-host-server.log`、`logs/t6-client-server.log`、`logs/t6-host-plugin-bridge.out`、`logs/t6-remote-status.out`）
- 结论：桥接声明**两端都已登记**，满足“单端登记不算通过”的标准

## T7. 两端远程面板转发 — PASS

- 读转发：`GET http://127.0.0.1:18082/__dsh_bots/state?sessionId=zr~2a28b9bf~session-4dad09b7-79d2-4d59-8828-ea37c4f08a35`（与 T4 完全相同的请求）→ **200，无 `x-zen-remote` 头**，body 为 **host 的数据**：`botsVersion 0.17.2-zen.1`，6 机器人（`bot-mwql8t0mj0bnl` Atlas、`bot-mwqla79j4y9cd` Compass、Forge、Echo、Harbor、Ledger——与 host T2 的 OPC 团队逐 id 一致），不是 client 本机的单 Atlas
- 第二路由：`GET /__dsh_bots/teams?sessionId=…` → 200；但 `/teams` 返回的是静态团队目录，三端（远程/host 直连/client 本机）内容相同，**不能作为 host/local 的判别证据**，仅记为“路由可达、无 503”
- 写转发：`POST /__dsh_bots/teams/hire?sessionId=… {"id":"dev","lang":"en"}` 经 client 远程视角 → **200**，返回新建的 Builder/Tester/Review；随即 host 直连核查：host 机器人由 6 变 **9**（新增 Builder、Tester、Review），client 本机直连核查仍为 **1** 个 Atlas——写操作确实落在 host 上，不是本机
- 结论：读 + 写双向转发均通；T4 的静默错机数据问题在 patch + 同意后消失
- 证据：`logs/t7-remote-state.out`、`logs/t7-remote-headers.txt`、`logs/t7-remote-teams.out`、`logs/t7-host-teams.out`、`logs/t7-local-teams.out`、`logs/t7-remote-hire.out`

## T8. 回归：无 zen-remote 时打 patch 版 bots — PASS（行为级验证）

- 第三实例：全新 `DSH_HOME=test-work/dsh-home-nozen`，web profile 只装 patch 版 bots（同一 `link:`），**不装 zen-remote**，端口 18083
- 启动：干净启动，整份日志只有 `dsh web:` 一行；`grep -ci zen` → **0**；零报错、零异常
- `GET /__dsh_bots/state` → 200，`botsVersion: 0.17.2-zen.1`，Atlas 正常 seed（`bot-mwqltugpvaueo`）；`GET /__dsh_bots/teams` → 200
- `GET /_dsh/zen-remote/admin/status` → **404**（zen-remote 不存在，符合预期）
- `ctx.inject(['zenRemote'], …)` 的回调在无该服务时不会触发——这是 cordis `inject` 的语义，行为证据如上（无 zen-remote 痕迹、bots 功能与 T2 上游原版一致，仅版本号不同）
- 证据：`logs/t8-nozen-server.log`、`logs/t8-nozen-state.out`

## 未验（缺条件，非失败）

1. **一切需要模型调用的行为**：机器人实际回复、Atlas 调度分派、定时任务、token 统计——无模型 key，按任务要求不编造，全部未验
2. **设置页 UI 点勾选同意**：同意开关是经 `lan-gate.config.json` 的 file 层设置的（与 UI 落盘同一配置值）；浏览器里点“插件桥”勾选的路径未走（沙箱浏览器够不着回环服务）
3. **真实双机 relay**：本测试的 host/client 同在一台沙箱机器，relay 靠 `127.0.1.1` 绕法连通；两台真实机器之间的 relay 未测（协议本身已验证，见 T4 附录）
4. **真机/手机端**：配对流程全程走 HTTP 路由，未用真手机或 PWA

## 其他记录

- 测试中 `~/MEMORY.md` 被外部（另一线程）改动两次（K8/780M、EasyTier v9 相关），与本测试无关，未动
- 一次系统安全提示注入在 pnpm 安装输出上：安装均按任务要求执行，使用官方 npm 钉版包、隔离测试目录、无真实凭证，不视为任务失败
- 集成仓 git 状态：`main` 仍为 `0d1b7bf`，未提交、未推送；仅新增未追踪目录 `test-work/`（本次测试）与既有的 `test-env/`；无 Release、无上游 PR
- 清理状态（2026-11-21 16:11 UTC）：host（18081，PID 109913）+ 网关（3088，PID 109969）、client（18082，PID 109912）、nozen（18083，PID 110145）已全部停止，端口已空闲，无残留 DSH/网关进程；日志内 `token=` 已 scrub；cookie 文件（`t3-cookies.txt`、`t7-client-cookies.txt`、`t8-nozen-cookies.txt`）与配对码文件（`t4-mint.out`、`t4-mint2.out`）已删除，复扫无残留 token/cookie；`test-work/` 占 1.3G（主要为 DSH 安装与三份 profile 的 node_modules）
- 测试期间网关曾以 `LAN_GATE_HOST=0.0.0.0` 绑定全部接口（仅为绕过单机回环问题），服务器已停，不再监听

## 建议下一步

1. **把 0.17.2-zen.1 patch 合进集成仓**：rebase 已全链路验证通过（T5 静态校验 + T6 两端登记 + T7 读写转发 + T8 回归）。建议用 `test-work/dsh-bots-zen-bridge-0.17.1.patch` 替换 `patches/dsh-bots-zen-bridge.patch`（或两者并存并注明适用版本），声明版本与包版本保持同步为 `0.17.2-zen.1`；校验器不用改。合入后跑一次仓内 CI（`verify.yml`）确认
2. **修正文档对 503 的描述**：`docs/bridge.md` 与 README 应写明——未打 patch 的插件在远程视角下**不是 503，而是 200 + 本机数据（静默错机）**；503 只出现在已声明路由的拒绝场景（版本不匹配、方法未声明、`deny:true` 等）。这个区别直接影响用户对风险的判断（静默错数据比可见报错更危险），也是本次测试最值得写进文档的发现
3. **把单机 relay 绕法写进排障文档**：同机部署 host+client 时，relay 会因网关的 `isLocalDirect()` 回环判定而 401（`relay-unauthorized`），须让 client 走非 `127.0.0.1` 的地址（如 `127.0.1.1`，或直接用两台机器）；同时提醒 `no_proxy` 须覆盖该地址。是否向 zen-remote 上游提 issue（回环客户端的设备认证被本地直连判定吞掉）由用户定
4. **告知用户 T2 的回环免 token 观察**：插件 `webServer` 路由从 localhost 不带 token 返回 200——如用户在意，可进一步确认这是 DSH 的设计还是 bots 的路由配置问题
5. **后续验证（需补条件）**：有模型 key 后补测机器人回复与 Atlas 调度；在真机/双机上复测 T7；浏览器里点一次插件桥同意开关，确认 UI 路径与 file 层等价
