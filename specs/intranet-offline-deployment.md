# 内网离线部署规格（intranet-offline fork）

> 本 fork（Allenskoo856/ZCode，基于上游 zai-org/ZCode）面向**不允许任何主动请求外网**的内网离线环境。
> 本文是行为规格与改造清单的唯一事实源；恢复联机语义时按"回退方式"一节逆向操作。

## 1. 外联策略

| 级别 | 定义 | 处理 |
| --- | --- | --- |
| 启动即外联 | 进程启动/周期性自动发出的请求 | **必须物理禁止**（ZCODE_OFFLINE 门控） |
| 用户操作触发 | 点击登录/安装/打开外链等 | **入口整体剔除**，功能不可达 |
| 默认关闭遥测 | 需要显式 env 才启用的上报 | 保持不配置（见 §4） |
| 构建期依赖 | pnpm registry / Node 二进制 / Electron 镜像 | 部署构建时换内网源，见 §6 |

## 2. `ZCODE_OFFLINE` 离线开关（fork 默认开启）

- 定义：`packages/shared/src/env.ts` → `ZCODE_OFFLINE_MODE` / `resolveZCodeOfflineMode(env)`。
- 语义：env `ZCODE_OFFLINE` **未设置 = 离线**；显式 `ZCODE_OFFLINE=0|false|off|no` 恢复联机。
- 门控点（离线时全部短路）：
  - CLI/services 内置 provider 目录远端刷新：`process-provider-registry-runtime.ts` 不创建
    `zcodeBuiltinRemote` 同步器（启动请求与 60s 轮询消失）；`services/node.ts` 不接
    `EndpointScopedZCodeBuiltinSource`，回落 bundled 本地源（refresh 直接 skipped）。
  - 桌面端自动更新：`initAutoUpdater` 不调用、forceUpdateGuard 跳过、菜单/托盘"检查更新"隐藏、
    手动更新命令兜底拒绝（`desktopCommandHandlers.ts`）。
- **约定：新增任何"启动即外联"链路必须先经过 `ZCODE_OFFLINE_MODE` 判断。**

## 3. 模型接入：内网 newAPI 网关（无鉴权）

- 唯一事实源：`config/provider/zcode-builtin.json`（revision 31），仅含一个 provider：
  - id `intranet-newapi`，group `standard-personal`（设置页"自定义供应商"分区），
    `api.type: "openai-chat-completions"`（newAPI 全部为 OpenAI chat-completions 协议），
    `baseUrl` 占位 `http://intranet-newapi.example:3000/v1`，`access: api-key` 占位 `EMPTY`
    （网关不校验鉴权时占位即可通过 Registry 完整校验）。
  - 占位模型：`glm-4.6` / `claude-sonnet-4-5` / `deepseek-v3.1`（`builtinProviderModelRules`
    仅 `enabled:true`，属性由 `.*` 兜底规则给默认值）。
- **部署适配只改这一个 JSON**：baseUrl、apiKey（如需）、`builtinModelIds` 与对应模型规则；
  修改后必须 bump `revision`（`facades.ts` 乐观并发依赖它）。
- schema 放宽：`rule-data-schema.ts` 允许 builtin 层使用 `standard-personal` 组（上游仅允许
  zai-family/bigmodel-family）。
- 离线护栏测试：`packages/provider/test/zcode-builtin-config.test.ts` —— 内置目录必须可解析、
  全部 baseUrl 为内网 http 地址、不得出现 `https://`、公网域名与 `account:*` 规则。
- Coding Plan 网关改写已删除：`official-coding-plan-gateway.ts` 移除，
  `createProviderTransportFetch` 直连（`model-execution.ts`）。

## 4. 已剔除的功能（入口删除，外联不可达）

| 功能 | 删除内容 | 保留物（不可达管道） |
| --- | --- | --- |
| CLI 登录/OAuth | `adapters/src/auth/{cli-oauth,bigmodel-oauth,coding-plan-api-key}.ts`、`bootstrap/auth-login*.ts`、`cli/src/login-command.ts`、`tui-auth.ts`、`command-center/login-flow.ts`；run/prompt/slash/`requiresProviderRuntime` 的 login/logout 分支 | `shared-credentials.ts`/`credential-cipher.ts`/`standalone-account-provider-runtime.ts`（本地凭据只读）；`services/src/oauth/` 服务层（JWT 401 清理、损坏凭据恢复、feedback 认证仍依赖；UI 入口已删故不可达）；`browser.ts`/`localhost-callback.ts`（MCP OAuth 复用） |
| 桌面/Web 登录 UI | WelcomeScreen、useOAuth、SettingsPage 登录区、web `src/auth/` 全目录 + main.tsx 登录路由、WorkspaceSidebar/Footer 登录登出项 | Root 的 welcome 状态机保留但不再渲染登录页（失败时开门放行）；`platform.onOAuthCallback` 空实现 |
| Coding Plan 购买/升级/额度 | settings CodingPlan 组件族（EntryButton/UpgradeDialog/EmbeddedWebview/PricingCards/StatusCards Plan 分支等）、usage-stats 的 CodingPlan 面板、composer 配额横幅与升级入口、desktopWindowChrome 的 coding-plan webview 分支保留为不可达守卫 | `ModelProviderSection` 的 custom provider 编辑全流程 |
| 会话分享 | services `conversation-share/`、desktop host attachment/scope、client 代理、web `src/share/`、UI（ConversationShareMenu、v4 dock/scrim/panel/attempt/preflight、SessionPane 分享流、root shareImportIntent）、`shared/conversation-share.ts`、`ServiceChannel.ConversationShare` | 协议 `sharedContext` provenance schema（wire 兼容）；`ConversationTurnGroup` 的 `shareSelectionToggle` 通用插槽 props |
| 展示链接 | `config/default.json`（feedback_url/community_urls 清空）、帮助菜单"产品文档/社区"（`productDocs.ts` 删除）、quickpick 对应命令、`BotsDialog` 的 BotFather 外链按钮、`zcode.z.ai` 下载页（随分享落地页删除）、changelog 菜单项在离线模式下随更新链路停用 | 内置反馈表单（`feedback_use_external_form=false`，无外联）；二维码为本地生成 |
| image-search 插件 | 默认启用集合移除（源码不在本仓库、seed 不完整） | 插件定义仍在，可手动启用 |
| 官方市场 CDN | `plugin-marketplaces.ts` source 改为内网资产服务优先（`INTRANET_ASSET_BASE_URL`），未配置则 `ensureDefaultPluginMarketplaces` 跳过注册远端市场；插件图标基址同样内网优先/置空（PluginIcon 对非 https 直接本地 fallback，不发请求）；推荐卡片图标改用本地 `Z.svg` | bundled 插件本地 seed 分片、默认启用集合 |
| 遥测 | 不配置即零上报 | `ZCODE_ARMS_RUM_ENDPOINT`、`ZCODE_TELEMETRY_REPORT_ENDPOINT`、`OTEL_EXPORTER_OTLP_ENDPOINT` 均默认空；离线部署**不得配置**这三项（如需内网 telemetry，OTLP 可指向内网 collector） |
| 桌面 remote 资产 CDN | `remoteCdn.ts` 支持 `ZCODE_CDN_BASE_URL` 覆盖 | 仅在连接远端 workspace 时使用；离线单机部署不触发 |

## 5. 登录与凭据语义

- 无登录流程；模型请求不携带真实凭据（占位 key 或网关忽略 Authorization）。
- `zcode login/logout` 命令、`/login` `/logout` slash 命令、CLI `--no-browser` 均已移除。
- 桌面 deep-link OAuth 回调路由保留但 renderer 无任何发起方，不可达。

## 6. 构建 / 分发（离线准备清单）

1. `.npmrc` registry 指向内网 registry（含 `patches/` 中被 patch 的包）。
2. Node 二进制：`ZCODE_NODE_DIST_MIRROR`（`scripts/prepare-prebuilds.mjs`）。
3. 原生搜索工具源码包（github/sourceware）：需预置，无现成 env。
4. Electron 镜像：`mise.toml` 的 `ELECTRON_MIRROR`。
5. 仓库已带内网约定：`INTRANET_MACHINE_HOST`、`ZCODE_DEPS_BASE_URL`、
   `INTRANET_ASSET_BASE_URL`（http://$HOST:12345/zcode）、分发脚本 `--base-url`。

## 7. 验收场景

1. 空载启动（CLI prompt / desktop / web+server）：出口防火墙无任何外联记录
   （`ZCODE_OFFLINE` 默认开；stderr 不再出现 "ZCode Built-in 刷新失败"）。
2. `config/provider/zcode-builtin.json` 适配后，`node --import tsx --test packages/provider/test/zcode-builtin-config.test.ts` 通过。
3. 桌面端：设置页出现"内网 newAPI"自定义供应商，可编辑 baseUrl/模型并发起对话；帮助菜单无文档/社区/更新项。
4. 尝试 `/login`、分享菜单、购买入口均不存在。
5. 抓包复核第 6 节"待验证残留"：Chromium 内核级外联（组件更新/GPU 黑名单）在 Electron 无 Google API key 下预期为静默，验收时实测确认。

## 8. 回退方式

- `ZCODE_OFFLINE=0` 恢复联机行为（更新检查、内置目录刷新重新生效）。
- 内置目录/登录/分享等删除的功能：按 git 历史逆向上游 `main`。
