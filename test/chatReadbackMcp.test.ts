import { describe, expect, it } from "vitest";
import { handleChatReadbackMcp } from "../src/worker/chatReadbackMcp";

function statusPayload() {
  return {
    action: {
      status: "ACTION_REQUIRED",
      title: "Review current scope",
      instruction: "Read the independent scope review.",
      reason: "Human decision required.",
      sourceRefs: ["github:pr:138"],
    },
    developmentStatus: {
      repository: "yasutakesougo/severe-behavior-support-spfx",
      evidenceState: "CONFIRMED",
    },
    observedAt: "2026-09-02T03:00:00.000Z",
    decisionFingerprint: "server-only-fingerprint",
    evidence: [{ privateFutureField: "must-not-leak" }],
  };
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://control.example/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

describe("CHAT-READBACK-V1 MCP contract", () => {
  it("negotiates current stable MCP and advertises tools capability", async () => {
    const response = await handleChatReadbackMcp(
      request({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
      { loadStatusPayload: async () => statusPayload() },
    );

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "ai-development-control-center-chat-readback" },
      },
    });
  });

  it("lists exactly one zero-input read-only tool with exact safety annotations", async () => {
    const response = await handleChatReadbackMcp(
      request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      { loadStatusPayload: async () => statusPayload() },
    );
    const json = await body(response);

    expect(json.result.tools).toHaveLength(1);
    expect(json.result.tools[0]).toMatchObject({
      name: "read_human_gate",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    });
  });

  it("returns allowlisted structured content without raw evidence or fingerprint", async () => {
    const response = await handleChatReadbackMcp(
      request({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "read_human_gate", arguments: {} },
      }),
      { loadStatusPayload: async () => statusPayload() },
    );
    const json = await body(response);

    expect(json.result.structuredContent).toMatchObject({
      ok: true,
      repository: "yasutakesougo/severe-behavior-support-spfx",
      evidenceState: "CONFIRMED",
      decisionCandidate: "PRESENT",
      sourceEndpoint: "/api/status",
      boundary: "READ_ONLY_NO_EXECUTION_AUTHORITY",
    });
    expect(JSON.stringify(json)).not.toContain("privateFutureField");
    expect(JSON.stringify(json)).not.toContain("server-only-fingerprint");
  });

  it("maps source exceptions to SOURCE_UNAVAILABLE and UNKNOWN", async () => {
    const response = await handleChatReadbackMcp(
      request({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "read_human_gate", arguments: {} },
      }),
      {
        loadStatusPayload: async () => {
          throw new Error("source unavailable");
        },
      },
    );
    const json = await body(response);

    expect(json.result.isError).toBe(true);
    expect(json.result.structuredContent).toEqual({
      ok: false,
      state: "SOURCE_UNAVAILABLE",
      decisionCandidate: "UNKNOWN",
      sourceEndpoint: "/api/status",
      boundary: "READ_ONLY_NO_EXECUTION_AUTHORITY",
    });
  });

  it("rejects arguments so the tool cannot become a repository selector", async () => {
    const response = await handleChatReadbackMcp(
      request({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "read_human_gate", arguments: { repository: "other/repo" } },
      }),
      { loadStatusPayload: async () => statusPayload() },
    );

    expect(await body(response)).toMatchObject({
      error: { code: -32602 },
    });
  });

  it("rejects unsupported MCP protocol headers", async () => {
    const response = await handleChatReadbackMcp(
      request(
        { jsonrpc: "2.0", id: 6, method: "ping" },
        { "MCP-Protocol-Version": "2099-01-01" },
      ),
      { loadStatusPayload: async () => statusPayload() },
    );

    expect(response.status).toBe(400);
  });

  it("fails closed for a cross-origin browser request", async () => {
    const response = await handleChatReadbackMcp(
      request(
        { jsonrpc: "2.0", id: 7, method: "ping" },
        { Origin: "https://unexpected.example" },
      ),
      { loadStatusPayload: async () => statusPayload() },
    );

    expect(response.status).toBe(403);
  });

  it("accepts initialized notifications without creating state", async () => {
    const response = await handleChatReadbackMcp(
      request({ jsonrpc: "2.0", method: "notifications/initialized" }),
      { loadStatusPayload: async () => statusPayload() },
    );

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("rejects non-POST requests with no mutation fallback", async () => {
    const response = await handleChatReadbackMcp(
      new Request("https://control.example/mcp", { method: "GET" }),
      { loadStatusPayload: async () => statusPayload() },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});