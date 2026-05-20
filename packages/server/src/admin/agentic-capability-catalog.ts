import {
  mapAgenticCapabilityCatalog,
  type AdminAgenticCapabilityInput,
} from "./agentic-inspector.contract.js";

const capabilities: AdminAgenticCapabilityInput[] = [
  {
    id: "hr_knowledge.retrieve_process",
    intent: "hr_knowledge_qa",
    kind: "retriever",
    displayName: "Retrieve HR Process Documents",
    description: "Searches the HR process knowledge base for policy steps.",
    safety: { readOnly: true, requiresApproval: false },
    redactedArgumentKeys: [],
  },
  {
    id: "hr_knowledge.retrieve_forms",
    intent: "hr_knowledge_qa",
    kind: "retriever",
    displayName: "Retrieve HR Forms",
    description: "Searches the HR form/document knowledge base.",
    safety: { readOnly: true, requiresApproval: false },
    redactedArgumentKeys: [],
  },
  {
    id: "hr_recruitment.list_user_guide_pages",
    intent: "hr_recruitment",
    kind: "mcp_tool",
    displayName: "List Recruitment Guide Pages",
    description: "Lists available AI Recruitment Platform guide pages.",
    safety: { readOnly: true, requiresApproval: false },
    redactedArgumentKeys: [],
  },
  {
    id: "hr_recruitment.search_user_guide",
    intent: "hr_recruitment",
    kind: "mcp_tool",
    displayName: "Search Recruitment Guide",
    description: "Searches guide sections and returns cited results.",
    safety: { readOnly: true, requiresApproval: false },
    redactedArgumentKeys: [],
  },
  {
    id: "hr_recruitment.get_user_guide_page",
    intent: "hr_recruitment",
    kind: "mcp_tool",
    displayName: "Get Recruitment Guide Page",
    description: "Returns one guide page by slug.",
    safety: { readOnly: true, requiresApproval: false },
    redactedArgumentKeys: [],
  },
  {
    id: "hr_recruitment.get_user_guide_section",
    intent: "hr_recruitment",
    kind: "mcp_tool",
    displayName: "Get Recruitment Guide Section",
    description: "Returns one guide section by slug and heading.",
    safety: { readOnly: true, requiresApproval: false },
    redactedArgumentKeys: [],
  },
  {
    id: "hr_recruitment.update_candidate_status",
    intent: "hr_recruitment",
    kind: "mcp_tool",
    displayName: "Update Candidate Status",
    description:
      "Future approval-required recruitment action surfaced for policy review.",
    safety: { readOnly: false, requiresApproval: true },
    redactedArgumentKeys: ["candidateEmail", "candidatePhone"],
  },
];

export function getAgenticCapabilityCatalog() {
  return mapAgenticCapabilityCatalog(capabilities);
}
