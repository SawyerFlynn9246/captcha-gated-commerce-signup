import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { registerCustomer, signupBody } from "./signup_guard.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const client = new InfraiClient(apiKey);

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/signup") {
    response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = signupBody.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const ip = request.socket.remoteAddress;
    const requestId = request.headers["idempotency-key"];
    const result = await registerCustomer(
      client,
      input,
      ip,
      typeof requestId === "string" ? requestId : undefined,
    );
    response.writeHead(result.status).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_request" }));
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      response.writeHead(error.status).end(JSON.stringify({ error: error.code }));
      return;
    }
    console.error(error);
    response.writeHead(502).end(JSON.stringify({ error: "upstream_request_failed" }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Signup service listening on http://localhost:${port}`));
