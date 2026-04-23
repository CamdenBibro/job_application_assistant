import { createAgentUIStreamResponse, type UIMessage } from "ai";

import { BASELINE_RESUME } from "@/lib/prompts";
import { jobApplicationAgent } from "@/lib/agent";

export const maxDuration = 60;
export const runtime = "nodejs";

type AgentRequestBody = {
  messages: UIMessage[];
  jobUrl?: string;
  resume?: string;
};

export async function POST(request: Request) {
  const { messages, jobUrl, resume }: AgentRequestBody = await request.json();

  if (!Array.isArray(messages)) {
    return Response.json(
      { error: "Invalid request: messages must be an array." },
      { status: 400 },
    );
  }

  const resolvedJobUrl = (jobUrl ?? "").trim();
  const resolvedResume = (resume ?? "").trim() || BASELINE_RESUME;
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const latestUserText = latestUserMessage?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (!resolvedJobUrl) {
    return Response.json(
      { error: "A job URL is required to run the workflow." },
      { status: 400 },
    );
  }

  const extraUserRequest = latestUserText
    ? `\nAdditional user request:\n${latestUserText}`
    : "";

  const userPrompt = `Run the full job-application workflow for this request.

Job URL: ${resolvedJobUrl || "Not provided"}
Resume:
${resolvedResume}

Requirements:
- Call scrape_job_description with the job URL first (if job URL provided).
- Call analyze_fit next.
- Rewrite the sections "SUMMARY", "EXPERIENCE", and "TECHNICAL SKILLS" using rewrite_resume_section.
- Draft a tailored cover letter with draft_cover_letter.
- Return one cohesive final response using the requested output format.${extraUserRequest}`;

  const mergedMessages = [
    ...messages,
    {
      id: `agent-context-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text: userPrompt }],
    } as UIMessage,
  ];

  return createAgentUIStreamResponse({
    agent: jobApplicationAgent,
    uiMessages: mergedMessages,
  });
}
