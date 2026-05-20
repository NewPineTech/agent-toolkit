import type { AgenticIntent } from "../constants.js";
import type { AgenticCapability } from "./types.js";

export class AgenticCapabilityRegistry {
  private readonly capabilities: Map<string, AgenticCapability>;

  constructor(capabilities: AgenticCapability[]) {
    this.capabilities = new Map();

    for (const capability of capabilities) {
      if (this.capabilities.has(capability.id)) {
        throw new Error(`Duplicate agentic capability id: ${capability.id}`);
      }
      this.capabilities.set(capability.id, capability);
    }
  }

  get(id: string): AgenticCapability | undefined {
    return this.capabilities.get(id);
  }

  listByIntent(intent: AgenticIntent): AgenticCapability[] {
    return [...this.capabilities.values()].filter(
      (capability) => capability.intent === intent,
    );
  }
}

export function createAgenticCapabilityRegistry(
  capabilities: AgenticCapability[],
): AgenticCapabilityRegistry {
  return new AgenticCapabilityRegistry(capabilities);
}
