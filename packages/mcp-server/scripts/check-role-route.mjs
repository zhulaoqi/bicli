import { getEnabledTools } from "../dist/tools/tool-domain-registry.js";
import { routeUserMessage } from "../dist/chat/agent/intent-router.js";
import { selectToolsForRoute } from "../dist/chat/agent/tool-selector.js";
import { pickSubAgent, applySubAgent } from "../dist/chat/agent/sub-agents/sub-agent.js";
import { createInitialAgentRunState } from "../dist/chat/agent/agent-state.js";

const msg = process.argv[2] || "我的组织里有哪些角色可以分配";
const route = routeUserMessage({ userMessage: msg, history: [], pageContextEvidence: false });
const tools = getEnabledTools({ DATAEYE_API_URL: "http://test" });
const roleTool = tools.find((t) => t.name === "dataeye_role_list");
const sel = selectToolsForRoute(tools, route, { userMessage: msg });

const state = createInitialAgentRunState({
  sessionId: 1,
  userMessage: msg,
  history: [],
});
state.route = route;
state.allowedToolNames = sel.allowed.map((t) => t.name);
state.forbiddenToolNames = sel.forbidden;

const sub = pickSubAgent(route);
if (sub) {
  applySubAgent(sub, state, "base");
}

console.log(JSON.stringify({
  route: route.route,
  domains: route.domains,
  roleListHints: roleTool?.routeHints,
  allowedBeforeSub: sel.allowed.some((t) => t.name === "dataeye_role_list"),
  allowedAfterSub: state.allowedToolNames.includes("dataeye_role_list"),
  subAgent: sub?.name ?? null,
  allowedCount: state.allowedToolNames.length,
  sampleAllowed: state.allowedToolNames.filter((n) => n.includes("role") || n.includes("user")),
}, null, 2));
