import test from "node:test";
import assert from "node:assert/strict";
import {
  MULTIPART_EXPOSED_RESPONSE_HEADERS,
  parseOptionalBoolean,
  resolveCorsAllowedOrigins,
  resolveForcePathStyle
} from "./s3Config.js";

test("parseOptionalBoolean accepts standard true and false values", () => {
  assert.equal(parseOptionalBoolean("true"), true);
  assert.equal(parseOptionalBoolean("YES"), true);
  assert.equal(parseOptionalBoolean("0"), false);
  assert.equal(parseOptionalBoolean("off"), false);
  assert.equal(parseOptionalBoolean(undefined), undefined);
  assert.equal(parseOptionalBoolean(""), undefined);
});

test("resolveForcePathStyle defaults to local-friendly behavior only when needed", () => {
  assert.equal(resolveForcePathStyle({ provider: "local" }), true);
  assert.equal(resolveForcePathStyle({ provider: "s3" }), false);
  assert.equal(
    resolveForcePathStyle({
      provider: "s3",
      endpoint: "http://localhost:9000"
    }),
    true
  );
  assert.equal(
    resolveForcePathStyle({
      provider: "r2",
      endpoint: "https://example.r2.cloudflarestorage.com"
    }),
    false
  );
  assert.equal(
    resolveForcePathStyle({
      provider: "s3",
      forcePathStyle: true
    }),
    true
  );
});

test("resolveCorsAllowedOrigins de-duplicates the configured frontend origin", () => {
  assert.deepEqual(resolveCorsAllowedOrigins("http://localhost:3000"), [
    "http://localhost:3000"
  ]);
  assert.deepEqual(MULTIPART_EXPOSED_RESPONSE_HEADERS, ["ETag"]);
});
