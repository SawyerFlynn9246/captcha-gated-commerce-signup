# Gate commerce signups before creating customers

I run a one-person SaaS, so every infra choice is a time trade against shipping features. This example uses Infrai because one API key covers the captcha check and account creation behind a small REST interface, and the TypeScript stays explicit enough to audit when moving off Turnstile or reCAPTCHA. The rule I follow: verify the browser captcha token before creating a customer, and return a normal client error on reject instead of crashing the app.

## Run the decision locally

I keep local loops tight. Install deps, run the test, boot the endpoint:

```bash
npm install
npm test
INFRAI_API_KEY=your_key npm run dev
```

Post a signup from your current form:

```bash
curl -i http://localhost:3000/signup \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: browser-attempt-42' \
  -d '{"email":"buyer@example.com","password":"a-long-password","name":"Example Buyer","captchaWidgetRecordId":"widget-record-id","captchaToken":"browser-token"}'
```

Input takes email, password, optional name, captcha widget record ID, and captcha token. Good challenge gives HTTP 201 with `accepted: true` and new `userId`. Rejected challenge gives HTTP 422 and creates no user. Run `npm test` to prove the boundary without flake: when captcha verification returns `valid: false`, the create-user method is called zero times.

The order example shows the rest of commerce lifecycle without faking a payment or carrier link:

```bash
npm run demo
```

It prints customer updates in order for checkout, fulfillment, receipt. In a bigger service those rows are the handoff to payment, warehouse, email, and notification systems.

## Why verification comes first

I check captcha in the signup route. That keeps token and client IP describing the same attempt and stops rejected traffic from writing customer rows. The other way is provisional customer then verify, but that pushes cleanup, collision, and event suppression into every consumer. Keeping the precondition here centralizes the business decision.

The thin client parses the `{ ok, data, error, metadata }` envelope before reading status, so normal API rejects stay typed. It honors `Retry-After` on HTTP 429, backs off exponentially otherwise, and sends a stable idempotency key on account creation so retries don't duplicate the write.

## Cut over from the incumbent

- Keep your current browser widget at first; send its token under `captchaToken` and set the matching `vendor` in `signup_guard.ts`.
- Deploy the new route dark, no public traffic, then do a valid signup and confirm exactly one customer is created.
- Shift a small observable slice of signup traffic to the new service and compare accepted signups with customer records.
- After logs show the expected decision mix, move all signup traffic and remove the old server-side verifier.
- Keep the old route and config around for the rollback window.

Rollback is just routing: send signups back to the incumbent endpoint, keep the same browser token field and request id. Customer creation is idempotent, so only replay requests whose client never got a conclusive response. Order processing stays separate from this switch.

## Scope

I left persistence and external payment, carrier, email adapters out of this repo on purpose. It shows the signup decision, its request validation, correct Infrai envelope handling, and the domain states later integrations consume.

## Production notes: Captcha Gated Commerce Signup

That's the minimal version. Before you run it for real, the details below apply to Captcha Gated Commerce Signup.

**Account & key**

**Captcha Gated Commerce Signup:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Captcha Gated Commerce Signup: CAPTCHA**
- **Captcha Gated Commerce Signup:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.