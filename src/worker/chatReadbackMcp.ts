import {
  projectChatReadbackPayload,
  unavailableChatReadbackSource,
  type ChatReadbackResult,
} from "../domain/chatReadback";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
const TOOL_NAME = "read_human_gate" as const;

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export interface ChatReadbackMcpDependencies {
  loadStatusPayload(): Promise<unknown>;
}

function responseHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders() });
}

function jsonRpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: JsonRpcId, code: number, message: string): Response {
  return jsonResponse({ jsonrpc: "2.0", id, error: { code, message } });
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.jsonrpc !== "2.0" || typeof candidate.method !== "string") return false;
  if (
    "id" in candidate &&
    candidate.id !== null &&
    typeof candidate.id !== "string" &&
    typeof candidate.id !== "number"
  ) {
    return false;
  }
  return true;
}

function negotiatedProtocolVersion(params: unknown): string {
  if (typeof params === "object" && params !== null && !Array.isArray(params)) {
    const requested = (params as Record<string, unknown>).protocolVersion;
    if (
      typeof requested === "string" &&
      (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ) {
      return requested;
    }
  }
  return LATEST_PROTOCOL_VERSION;
}

function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (origin === null) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function toolDefinition() {
  return {
    name: TOOL_NAME,
    title: "Read Human Gate",
    description:
      "Use this when the user asks for the current Human Action, evidence state, decision-candidate presence, instruction, reason, or provenance for the single repository fixed by the Control Center. Read-only; never authorizes or performs Human GO, merge, deploy, or execution.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "decisionCandidate", "sourceEndpoint", "boundary"],
      properties: {
        ok: { type: "boolean" },
        repository: { type: "string" },
        humanAction: {
          type: "object",
          additionalProperties: false,
          required: ["status", "title", "instruction", "reason", "sourceRefs"],
          properties: {
            status: { enum: ["ACTION_REQUIRED", "WAIT", "NO_ACTION", "UNKNOWN"] },
            title: { type: "string" },
            instruction: { type: "string" },
            reason: { type: "string" },
            sourceRefs: { type: "array", items: { type: "string" } },
          },
        },
        evidenceState: { enum: ["CONFIRMED", "MISSING", "CONTRADICTORY", "ERROR"] },
        decisionCandidate: { enum: ["PRESENT", "NOT_PRESENT", "UNKNOWN"] },
        observedAt: { type: "string" },
        state: { enum: ["SOURCE_UNAVAILABLE", "INVALID_PAYLOAD"] },
        sourceEndpoint: { const: "/api/status" },
        boundary: { const: "READ_ONLY_NO_EXECUTION_AUTHORITY" },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
}

function toolContent(result: ChatReadbackResult) {
  if (!result.ok) {
    return `Human Gate readback unavailable: ${result.state}. Decision Candidate=UNKNOWN. Boundary=READ-ONLY / NO EXECUTION AUTHORITY.`;
  }
  return [
    `Repository: ${result.repository}`,
    `Human Action: ${result.humanAction.status}`,
    `Evidence: ${result.evidenceState}`,
    `Decision Candidate: ${result.decisionCandidate}`,
    `Instruction: ${result.humanAction.instruction}`,
    `Reason: ${result.humanAction.reason}`,
    `Observed At: ${result.observedAt}`,
    `Source Refs: ${result.humanAction.sourceRefs.join(", ") || "(none)"}`,
    "Boundary: READ-ONLY / NO EXECUTION AUTHORITY",
  ].join("\n");
}

async function callReadHumanGate(dependencies: ChatReadbackMcpDependencies): Promise<ChatReadbackResult> {
  try {
    const payload = await dependencies.loadStatusPayload();
    return projectChatReadbackPayload(payload);
  } catch {
    return unavailableChatReadbackSource();
  }
}

export async function handleChatReadbackMcp(
  request: Request,
  dependencies: ChatReadbackMcpDependencies,
): Promise<Response> {
  if (!isOriginAllowed(request)) {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    });
  }

  const protocolHeader = request.headers.get("MCP-Protocol-Version");
  if (
    protocolHeader !== null &&
    !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(protocolHeader)
  ) {
    return jsonResponse({ error: "Unsupported MCP protocol version" }, 400);
  }

  let message: unknown;
  try {
    message = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  if (!isJsonRpcRequest(message)) return jsonRpcError(null, -32600, "Invalid Request");

  if (!("id" in message)) {
    return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  const id = message.id ?? null;

  if (message.method === "initialize") {
    return jsonRpcResult(id, {
      protocolVersion: negotiatedProtocolVersion(message.params),
      capabilities: { tools: {} },
      serverInfo: {
        name: "ai-development-control-center-chat-readback",
        title: "AI Development Control Center Chat Readback",
        version: "1.0.0",
      },
      instructions:
        "Read-only Human Gate readback for one server-fixed repository. Preserve source HumanAction vocabulary. Never infer or perform Human GO, merge, deploy, or execution authority.",
    });
  }

  if (message.method === "ping") return jsonRpcResult(id, {});

  if (message.method === "tools/list") {
    return jsonRpcResult(id, { tools: [toolDefinition()] });
  }

  if (message.method === "tools/call") {
    const params = message.params;
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      return jsonRpcError(id, -32602, "Invalid params");
    }
    const call = params as Record<string, unknown>;
    if (call.name !== TOOL_NAME) return jsonRpcError(id, -32602, "Unknown tool");
    if (
      call.arguments !== undefined &&
      (typeof call.arguments !== "object" ||
        call.arguments === null ||
        Array.isArray(call.arguments) ||
        Object.keys(call.arguments as Record<string, unknown>).length > 0)
    ) {
      return jsonRpcError(id, -32602, "read_human_gate accepts no arguments");
    }

    const result = await callReadHumanGate(dependencies);
    return jsonRpcResult(id, {
      structuredContent: result,
      content: [{ type: "text", text: toolContent(result) }],
      ...(result.ok ? {} : { isError: true }),
    });
  }

  return jsonRpcError(id, -32601, "Method not found");
}
