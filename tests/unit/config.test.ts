import { describe, expect, it } from "vitest";
import { parsePublicOrigin, readSiteConfig } from "@/lib/site-config";
import {
  readDatabaseUrl,
  readDeliveryConfig,
  readEnquiryConfig,
  readRetentionConfig,
  readWorkerSecret,
} from "@/server/config";
import { onlineEnv } from "../support/fixtures";

describe("SITE_URL validation for production", () => {
  it.each([
    "https://kctf.example",
    "https://kctf.example/",
    "https://www.kctf.example",
  ])("accepts the public origin %s", (value) =>
    expect(parsePublicOrigin(value)).toBe(new URL(value).origin),
  );
  it.each([
    [undefined, "required"],
    ["", "required"],
    ["kctf.example", "valid URL"],
    ["http://kctf.example", "https"],
    ["https://user:pass@kctf.example", "credentials"],
    ["https://kctf.example:8443", "port"],
    ["https://kctf.example/path", "origin only"],
    ["https://kctf.example?x=1", "origin only"],
    ["https://kctf.example/?", "origin only"],
    ["https://kctf.example#top", "origin only"],
    ["https://localhost", "public host"],
    ["https://app.localhost", "public host"],
    ["https://127.0.0.1", "public host"],
    ["https://10.0.0.8", "public host"],
    ["https://192.168.1.100", "public host"],
    ["https://[::1]", "public host"],
    ["https://intranet", "public domain"],
    ["https://203.0.113.10", "public domain"],
  ])("rejects %s", (value, message) =>
    expect(() => parsePublicOrigin(value)).toThrow(message),
  );
});

describe("environment and indexing", () => {
  it("is noindex by default with a local origin", () =>
    expect(readSiteConfig({})).toMatchObject({
      environment: "development",
      origin: "http://localhost:3000",
      indexable: false,
    }));
  it("indexes production only with an explicit opt-in", () => {
    const base = {
      SITE_ENVIRONMENT: "production",
      SITE_URL: "https://kctf.example",
    };
    expect(readSiteConfig(base).indexable).toBe(false);
    expect(readSiteConfig({ ...base, SITE_INDEXING: "index" }).indexable).toBe(
      true,
    );
  });
  it("fails production builds with an invalid origin", () =>
    expect(() =>
      readSiteConfig({
        SITE_ENVIRONMENT: "production",
        SITE_URL: "http://localhost:3000",
      }),
    ).toThrow());
  it.each(["staging", "preview"])(
    "keeps %s noindex even when asked to index",
    (env) => {
      const config = readSiteConfig({
        SITE_ENVIRONMENT: env,
        SITE_URL: "https://preview.kctf.example",
        SITE_INDEXING: "index",
      });
      expect(config.indexable).toBe(false);
      expect(config.warnings.join()).toContain("ignored");
    },
  );
  it("builds previews without a SITE_URL", () =>
    expect(readSiteConfig({ SITE_ENVIRONMENT: "preview" }).indexable).toBe(
      false,
    ));
  it("rejects unknown environments and indexing values", () => {
    expect(() => readSiteConfig({ SITE_ENVIRONMENT: "prod" })).toThrow();
    expect(() => readSiteConfig({ SITE_INDEXING: "yes" })).toThrow();
  });
  it("rejects malformed non-production origins", () =>
    expect(() =>
      readSiteConfig({ SITE_URL: "http://localhost:3000/contact" }),
    ).toThrow());
});

describe("enquiry configuration", () => {
  it("is fully online with complete configuration", () =>
    expect(readEnquiryConfig(onlineEnv)).toMatchObject({
      mode: "online",
      config: {
        siteHostname: "kctf.example",
        to: ["staff@kctf.example"],
        retentionDays: 30,
      },
    }));
  it.each([undefined, "", "false"])(
    "uses email-draft mode when switched off (%s)",
    (value) =>
      expect(
        readEnquiryConfig({ ...onlineEnv, ENQUIRIES_ENABLED: value }).mode,
      ).toBe("email-draft"),
  );
  it.each([
    "DATABASE_URL",
    "RESEND_API_KEY",
    "ENQUIRY_FROM",
    "ENQUIRY_TO",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "ABUSE_HASH_SECRET",
    "SITE_URL",
  ])("is unavailable — never draft mode — when %s is missing", (key) => {
    const result = readEnquiryConfig({ ...onlineEnv, [key]: undefined });
    expect(result.mode).toBe("unavailable");
    expect(result.issues.join(" ")).toContain(key);
  });
  it("blocks collection until retention is configured and approved", () => {
    expect(
      readEnquiryConfig({ ...onlineEnv, ENQUIRY_RETENTION_DAYS: undefined })
        .mode,
    ).toBe("unavailable");
    expect(
      readEnquiryConfig({ ...onlineEnv, RETENTION_POLICY_APPROVED: "false" })
        .mode,
    ).toBe("unavailable");
  });
  it.each([
    ["ENQUIRIES_ENABLED", "yes"],
    ["DATABASE_URL", "mysql://db.example/kctf"],
    ["DATABASE_URL", "not a url"],
    ["RESEND_API_KEY", "synthetic"],
    ["ENQUIRY_FROM", "Website <not-an-email>"],
    ["ENQUIRY_TO", "staff@kctf.example, not-an-email"],
    ["ABUSE_HASH_SECRET", "short"],
    ["TRUSTED_PROXY", "cloudflare"],
    ["ENQUIRY_RETENTION_DAYS", "0"],
    ["ENQUIRY_RETENTION_DAYS", "thirty"],
  ])("rejects invalid %s", (key, value) =>
    expect(readEnquiryConfig({ ...onlineEnv, [key]: value }).mode).toBe(
      "unavailable",
    ),
  );
  it("rejects a local database in production", () =>
    expect(
      readEnquiryConfig({
        ...onlineEnv,
        DATABASE_URL: "postgresql://u:p@localhost:5432/kctf",
      }).mode,
    ).toBe("unavailable"));
  it("allows local test doubles only in development and test", () => {
    const local = "http://127.0.0.1:4010/siteverify";
    expect(
      readEnquiryConfig({ ...onlineEnv, TURNSTILE_VERIFY_URL: local }).mode,
    ).toBe("unavailable");
    const testEnv = {
      ...onlineEnv,
      SITE_ENVIRONMENT: "test",
      SITE_URL: "http://localhost:3100",
      DATABASE_URL: "postgresql://u:p@localhost:5432/kctf_test",
    };
    const result = readEnquiryConfig({
      ...testEnv,
      TURNSTILE_VERIFY_URL: local,
    });
    expect(result.mode === "online" && result.config.turnstileVerifyUrl).toBe(
      local,
    );
    expect(
      readEnquiryConfig({
        ...testEnv,
        RESEND_API_URL: "https://evil.example/emails",
      }).mode,
    ).toBe("unavailable");
  });
  it("never includes secret values in issue messages", () => {
    const secretEnv = {
      ...onlineEnv,
      RESEND_API_KEY: "bad-secret-value-123",
      DATABASE_URL: "mysql://user:hunter2@db.example/kctf",
    };
    const text = readEnquiryConfig(secretEnv).issues.join(" ");
    expect(text).not.toContain("bad-secret-value-123");
    expect(text).not.toContain("hunter2");
  });
});

describe("other server configuration", () => {
  it("reads delivery settings independently of the public form switch", () =>
    expect(
      readDeliveryConfig({ ...onlineEnv, ENQUIRIES_ENABLED: "false" }).config,
    ).toBeDefined());
  it("requires a postgres DATABASE_URL", () => {
    expect(() => readDatabaseUrl({})).toThrow("not set");
    expect(() =>
      readDatabaseUrl({ DATABASE_URL: "https://db.example" }),
    ).toThrow();
  });
  it("has no default retention period", () =>
    expect(readRetentionConfig({})).toMatchObject({
      days: undefined,
      approved: false,
    }));
  it("disables the worker endpoint without a strong secret", () => {
    expect(readWorkerSecret({})).toBeUndefined();
    expect(readWorkerSecret({ CRON_SECRET: "short" })).toBeUndefined();
    expect(readWorkerSecret({ CRON_SECRET: "x".repeat(32) })).toHaveLength(32);
  });
});
