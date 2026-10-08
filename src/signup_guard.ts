import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { InfraiError, type SignupProvider } from "./infrai_client.js";

export const signupBody = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1).max(100).optional(),
  captchaWidgetRecordId: z.string().min(1),
  captchaToken: z.string().min(1),
});

export type SignupBody = z.infer<typeof signupBody>;
export type SignupDecision =
  | { accepted: true; status: 201; userId: string }
  | { accepted: false; status: 422; reason: "captcha_rejected" };

export async function registerCustomer(
  provider: SignupProvider,
  input: SignupBody,
  ip: string | undefined,
  requestId: string = randomUUID(),
): Promise<SignupDecision> {
  let captcha;
  try {
    captcha = await provider.verifyCaptcha({
      widget_record_id: input.captchaWidgetRecordId,
      token: input.captchaToken,
      vendor: "turnstile",
      ip,
      action: "commerce_signup",
      score_threshold: 0.7,
    });
  } catch (error) {
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      return { accepted: false, status: 422, reason: "captcha_rejected" };
    }
    throw error;
  }
  if (!captcha.valid) {
    return { accepted: false, status: 422, reason: "captcha_rejected" };
  }

  const emailKey = createHash("sha256").update(input.email.toLowerCase()).digest("hex");
  const user = await provider.createUser({
    email: input.email,
    password: input.password,
    name: input.name,
    metadata: { signup_source: "commerce" },
    vendor: "infrai",
    mode: "password",
    idempotency_key: `signup:${emailKey}:${requestId}`,
  });
  return { accepted: true, status: 201, userId: user.id };
}
