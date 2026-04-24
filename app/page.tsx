"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

import { BASELINE_RESUME } from "@/lib/prompts";

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getLatestCoverLetter(messages: UIMessage[]) {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    const message = messages[messageIndex];
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex--) {
      const part = message.parts[partIndex] as {
        type?: string;
        state?: string;
        output?: unknown;
      };

      if (
        part.type === "tool-draft_cover_letter" &&
        part.state === "output-available" &&
        part.output &&
        typeof part.output === "object" &&
        "coverLetter" in part.output
      ) {
        const coverLetter = (part.output as { coverLetter?: unknown }).coverLetter;
        if (typeof coverLetter === "string" && coverLetter.trim()) {
          return coverLetter.trim();
        }
      }
    }
  }

  return "";
}

type SavedChat = {
  id: string;
  label: string;
  createdAt: string;
  jobUrl: string;
  requestNote: string;
  resume: string;
  messages: UIMessage[];
};

const SAVED_CHATS_STORAGE_KEY = "job-application-agent.saved-chats.v1";

function formatTimestamp(dateIsoString: string) {
  const date = new Date(dateIsoString);
  return date.toLocaleString();
}

export default function Home() {
  const [savedChats, setSavedChats] = useState<SavedChat[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const rawValue = localStorage.getItem(SAVED_CHATS_STORAGE_KEY);
      if (!rawValue) return [];
      const parsed = JSON.parse(rawValue) as SavedChat[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [jobUrl, setJobUrl] = useState("");
  const [resume, setResume] = useState(BASELINE_RESUME);
  const [requestNote, setRequestNote] = useState(
    "Tailor my resume and draft a cover letter for this role.",
  );
  const [historyLabel, setHistoryLabel] = useState("");
  const [showToolPayloads, setShowToolPayloads] = useState(false);

  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent",
    }),
  });

  const isRunning = status === "submitted" || status === "streaming";
  const canSubmit = jobUrl.trim().length > 0 && !isRunning;

  const assistantMessages = useMemo(
    () => messages.filter((message) => message.role === "assistant"),
    [messages],
  );
  const latestCoverLetter = useMemo(
    () => getLatestCoverLetter(assistantMessages),
    [assistantMessages],
  );

  useEffect(() => {
    localStorage.setItem(SAVED_CHATS_STORAGE_KEY, JSON.stringify(savedChats));
  }, [savedChats]);

  const clearChat = () => {
    if (isRunning) return;
    setMessages([]);
  };

  const saveCurrentChat = () => {
    if (!messages.length) return;

    const now = new Date();
    const label =
      historyLabel.trim() ||
      jobUrl.trim() ||
      `Saved chat ${now.toLocaleDateString()}`;

    const nextChat: SavedChat = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      createdAt: now.toISOString(),
      jobUrl: jobUrl.trim(),
      requestNote: requestNote.trim(),
      resume,
      messages,
    };

    setSavedChats((prevChats) => [nextChat, ...prevChats].slice(0, 20));
    setHistoryLabel("");
  };

  const loadSavedChat = (chat: SavedChat) => {
    if (isRunning) return;

    setJobUrl(chat.jobUrl);
    setRequestNote(chat.requestNote || "");
    setResume(chat.resume || BASELINE_RESUME);
    setMessages(chat.messages);
  };

  const deleteSavedChat = (chatId: string) => {
    setSavedChats((prevChats) =>
      prevChats.filter((savedChat) => savedChat.id !== chatId),
    );
  };

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
              <button
                type="button"
                onClick={clearChat}
                disabled={isRunning || messages.length === 0}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
              >
                Clear chat
              </button>
            </div>
          </form>

          <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold">Saved chat history</h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Save the current chat locally in this browser and reload it later.
            </p>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="Optional save name"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={historyLabel}
                onChange={(event) => setHistoryLabel(event.target.value)}
                disabled={isRunning}
              />
              <button
                type="button"
                onClick={saveCurrentChat}
                disabled={isRunning || messages.length === 0}
                className="whitespace-nowrap rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
              >
                Save
              </button>
            </div>

            {savedChats.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-500">
                No saved chats yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {savedChats.map((chat) => (
                  <li
                    key={chat.id}
                    className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <p className="font-medium">{chat.label}</p>
                    <p className="mt-0.5 text-zinc-500">
                      {formatTimestamp(chat.createdAt)}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => loadSavedChat(chat)}
                        disabled={isRunning}
                        className="rounded border border-zinc-300 px-2 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSavedChat(chat.id)}
                        className="rounded border border-zinc-300 px-2 py-1 font-medium dark:border-zinc-700"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Streaming output</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowToolPayloads((value) => !value)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium dark:border-zinc-700"
              >
                {showToolPayloads ? "Hide tool payloads" : "Show tool payloads"}
              </button>
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                {status}
              </span>
            </div>
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error.message || "An error occurred while running the agent."}
            </p>
          ) : null}

          {latestCoverLetter ? (
            <article className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
              <h3 className="text-sm font-semibold">Draft Cover Letter</h3>
              <pre className="mt-2 whitespace-pre-wrap text-sm">
                {latestCoverLetter}
              </pre>
            </article>
          ) : null}

          {assistantMessages.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Submit a job URL to start. A concise final response and your full
              cover letter will appear here.
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
                          {!showToolPayloads &&
                          (toolPart.input || toolPart.output || toolPart.errorText) ? (
                            <p className="mt-2 text-zinc-500 dark:text-zinc-400">
                              payload hidden
                            </p>
                          ) : null}
                          {showToolPayloads ? (
                            <>
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
                            </>
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
