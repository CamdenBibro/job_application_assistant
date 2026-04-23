"use client";

import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

import { BASELINE_RESUME } from "@/lib/prompts";

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default function Home() {
  const [jobUrl, setJobUrl] = useState("");
  const [resume, setResume] = useState(BASELINE_RESUME);
  const [requestNote, setRequestNote] = useState(
    "Tailor my resume and draft a cover letter for this role.",
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent",
    }),
  });

  const isRunning = status === "submitted" || status === "streaming";
  const canSubmit = jobUrl.trim().length > 0 && status === "ready";

  const assistantMessages = useMemo(
    () => messages.filter((message) => message.role === "assistant"),
    [messages],
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold">Job Application Agent</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Paste a job posting URL and your resume, then run an agentic loop
            that scrapes, analyzes fit, rewrites key sections, and drafts a
            cover letter.
          </p>

          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) return;

              sendMessage(
                { text: requestNote.trim() || "Run the full workflow." },
                {
                  body: {
                    jobUrl: jobUrl.trim(),
                    resume: resume.trim(),
                  },
                },
              );
            }}
          >
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="job-url">
                Job posting URL
              </label>
              <input
                id="job-url"
                type="url"
                placeholder="https://company.com/careers/data-engineer"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={jobUrl}
                onChange={(event) => setJobUrl(event.target.value)}
                disabled={isRunning}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="resume">
                Resume baseline
              </label>
              <textarea
                id="resume"
                rows={14}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-xs outline-none ring-blue-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={resume}
                onChange={(event) => setResume(event.target.value)}
                disabled={isRunning}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="request">
                Optional request note
              </label>
              <textarea
                id="request"
                rows={3}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={requestNote}
                onChange={(event) => setRequestNote(event.target.value)}
                disabled={isRunning}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Run agent
              </button>
              <button
                type="button"
                onClick={() => stop()}
                disabled={!isRunning}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
              >
                Stop
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Streaming output</h2>
            <span className="text-xs uppercase tracking-wide text-zinc-500">
              {status}
            </span>
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error.message || "An error occurred while running the agent."}
            </p>
          ) : null}

          {assistantMessages.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Submit a job URL to start. Tool calls and final outputs will
              stream here.
            </p>
          ) : (
            <div className="space-y-4">
              {assistantMessages.map((message) => (
                <article
                  key={message.id}
                  className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {message.parts.map((part, index) => {
                    if (part.type === "step-start") {
                      return (
                        <div key={`${message.id}-step-${index}`} className="my-2">
                          <div className="h-px bg-zinc-300 dark:bg-zinc-700" />
                        </div>
                      );
                    }

                    if (part.type === "text") {
                      return (
                        <pre
                          key={`${message.id}-text-${index}`}
                          className="whitespace-pre-wrap text-sm"
                        >
                          {part.text}
                        </pre>
                      );
                    }

                    if (part.type === "reasoning") {
                      return (
                        <details
                          key={`${message.id}-reasoning-${index}`}
                          className="rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-900"
                        >
                          <summary className="cursor-pointer font-medium">
                            Reasoning
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap">
                            {part.text}
                          </pre>
                        </details>
                      );
                    }

                    if (part.type.startsWith("tool-")) {
                      const toolPart = part as {
                        type: string;
                        state: string;
                        input?: unknown;
                        output?: unknown;
                        errorText?: string;
                      };

                      return (
                        <div
                          key={`${message.id}-tool-${index}`}
                          className="my-2 rounded-md border border-zinc-300 bg-white p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <p className="font-semibold">
                            {toolPart.type.replace("tool-", "")}
                          </p>
                          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                            state: {toolPart.state}
                          </p>
                          {toolPart.input ? (
                            <pre className="mt-2 whitespace-pre-wrap">
                              input: {formatJson(toolPart.input)}
                            </pre>
                          ) : null}
                          {toolPart.output ? (
                            <pre className="mt-2 whitespace-pre-wrap">
                              output: {formatJson(toolPart.output)}
                            </pre>
                          ) : null}
                          {toolPart.errorText ? (
                            <p className="mt-2 text-red-600 dark:text-red-400">
                              error: {toolPart.errorText}
                            </p>
                          ) : null}
                        </div>
                      );
                    }

                    return null;
                  })}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
