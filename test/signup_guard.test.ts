import assert from "node:assert/strict";
import test from "node:test";
import { registerCustomer } from "../src/signup_guard.js";
import type { SignupProvider } from "../src/infrai_client.js";

test("a failed captcha stops registration before user creation", async () => {
  let createCalls = 0;
  let captchaInput: Parameters<SignupProvider["verifyCaptcha"]>[0] | undefined;
  const provider: SignupProvider = {
    async verifyCaptcha(input) {
      captchaInput = input;
      return { valid: false, score: 0.2 };
    },
    async createUser() {
      createCalls += 1;
      return { id: "unexpected", email: "buyer@example.com" };
    },
  };

  const result = await registerCustomer(provider, {
    email: "buyer@example.com",
    password: "a-long-password",
    name: "Example Buyer",
    captchaWidgetRecordId: "widget-record-001",
    captchaToken: "test-token",
  }, "203.0.113.8", "request-001");

  assert.deepEqual(result, { accepted: false, status: 422, reason: "captcha_rejected" });
  assert.equal(captchaInput?.widget_record_id, "widget-record-001");
  assert.equal(createCalls, 0);
});
