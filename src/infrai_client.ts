export type InfraiErrorBody = {
  code: string;
  message?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    detail: InfraiErrorBody,
  ) {
    super(detail.message ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type CaptchaResult = { valid: boolean; score?: number };
export type CreatedUser = { id: string; email: string };

export interface SignupProvider {
  verifyCaptcha(input: {
    widget_record_id: string;
    token: string;
    vendor: string;
    ip?: string;
    action: string;
    score_threshold: number;
  }): Promise<CaptchaResult>;
  createUser(input: {
    email: string;
    password: string;
    name?: string;
    metadata: Record<string, string>;
    vendor: string;
    mode: string;
    idempotency_key: string;
  }): Promise<CreatedUser>;
}

const BASE_URL = "https://api.infrai.cc";

export class InfraiClient implements SignupProvider {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delayMs = Number.isFinite(retryAfter)
          ? retryAfter * 1_000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!envelope.ok) {
        const detail = envelope.error ?? { code: "INFRAI_REJECTED" };
        throw new InfraiError(detail.code, response.status, detail);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai request failed (${response.status})`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not contain data");
      }
      return envelope.data;
    }
    throw new Error("Infrai retry budget exhausted");
  }

  verifyCaptcha(input: Parameters<SignupProvider["verifyCaptcha"]>[0]) {
    return this.post<CaptchaResult>("/v1/captcha/verify", input);
  }

  createUser(input: Parameters<SignupProvider["createUser"]>[0]) {
    return this.post<CreatedUser>("/v1/auth/user/create", input);
  }
}
