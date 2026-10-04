import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createRegistryModelConfig,
  createRegistryProviderConfig,
  parseZCodeBuiltinModelConfigRules,
  parseZCodeBuiltinProviderConfigRules,
} from "../src/index.js";

// 内网离线部署护栏：内置目录只允许指向内网 newAPI 网关，禁止公网 provider 回流。
// 任何把公网 baseUrl 或 account:* 规则加回 zcode-builtin.json 的改动都会在这里失败。

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const builtinConfigPath = join(repoRoot, "config", "provider", "zcode-builtin.json");

/** 离线部署允许的 baseUrl 形态：仅 http 明文的内网/私网/保留名地址。 */
function isIntranetBaseUrl(baseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  const host = url.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".invalid") ||
    host.endsWith(".example") ||
    host.endsWith(".local") ||
    host.endsWith(".intranet") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
  );
}

test("内置目录只声明内网 newAPI provider 且可通过 Registry 完整校验", async () => {
  const raw = JSON.parse(await readFile(builtinConfigPath, "utf8"));
  const { providers, providerTemplates } = parseZCodeBuiltinProviderConfigRules(
    raw.config.providerConfigRules,
  );
  const rules = providers.rules();
  assert.ok(rules.length >= 1, "内置目录至少要有一个 provider");
  assert.ok(
    rules.some((rule) => rule.providerId === "intranet-newapi"),
    "必须包含 intranet-newapi",
  );

  for (const rule of rules) {
    const registryResult = createRegistryProviderConfig(rule.config, [
      "providers",
      rule.providerId,
    ]);
    assert.equal(
      registryResult.ok,
      true,
      `provider ${rule.providerId} 未通过完整校验: ${JSON.stringify(
        registryResult.ok ? [] : registryResult.issues,
      )}`,
    );
    const baseUrl = rule.config.api?.baseUrl ?? "";
    assert.ok(
      isIntranetBaseUrl(baseUrl),
      `provider ${rule.providerId} 的 baseUrl 不是内网地址: ${baseUrl}`,
    );
  }
  assert.ok(providerTemplates.get("intranet-newapi"), "保留内网网关模板供设置页添加 provider");
});

test("内置目录全部模型可解析为可执行的完整模型配置", async () => {
  const raw = JSON.parse(await readFile(builtinConfigPath, "utf8"));
  const { providers } = parseZCodeBuiltinProviderConfigRules(raw.config.providerConfigRules);
  const modelRules = parseZCodeBuiltinModelConfigRules(raw.config.modelConfigRules);

  for (const rule of providers.rules()) {
    const apiType = rule.config.api?.type;
    const baseUrl = rule.config.api?.baseUrl;
    for (const modelId of rule.config.builtinModelIds ?? []) {
      const modelConfig = modelRules.resolve({ providerId: rule.providerId, modelId, apiType, baseUrl });
      assert.equal(modelConfig.enabled, true, `${rule.providerId}/${modelId} 必须 enabled`);
      const registryResult = createRegistryModelConfig(modelConfig, [
        "providers",
        rule.providerId,
        "models",
        modelId,
      ]);
      assert.equal(
        registryResult.ok,
        true,
        `${rule.providerId}/${modelId} 未通过完整校验: ${JSON.stringify(
          registryResult.ok ? [] : registryResult.issues,
        )}`,
      );
    }
  }
});

test("内置目录文本中不残留公网端点与 account 规则", async () => {
  const text = await readFile(builtinConfigPath, "utf8");
  assert.doesNotMatch(text, /https:\/\//, "内置目录不允许出现 https 公网端点");
  assert.doesNotMatch(text, /"account:/, "内置目录不允许 account:* provider 规则");
  for (const banned of ["zcode.z.ai", "api.z.ai", "bigmodel.cn", "cdn-zcode.z.ai", "openai.com"]) {
    assert.ok(!text.includes(banned), `内置目录不允许出现公网域名: ${banned}`);
  }
});
