import {
  handleAuthorityApprovalPost,
  type AuthorityRecorderEnv,
} from "../../worker/authority/trustedAuthorityRecorder";

export default {
  async fetch(request: Request, env: AuthorityRecorderEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/authority/approvals") {
      return handleAuthorityApprovalPost(request, env);
    }
    if (url.pathname.startsWith("/api/authority/")) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response("Not Found", { status: 404 });
  },
};
