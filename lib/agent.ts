import { anthropic } from "@ai-sdk/anthropic";
import { ToolLoopAgent, stepCountIs } from "ai";

import { AGENT_SYSTEM_PROMPT } from "@/lib/prompts";
import { tools } from "@/lib/tools";

export const jobApplicationAgent = new ToolLoopAgent({
  model: anthropic("claude-sonnet-4-20250514"),
  instructions: AGENT_SYSTEM_PROMPT,
  tools,
  stopWhen: stepCountIs(10),
});
