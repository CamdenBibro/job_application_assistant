import { anthropic } from "@ai-sdk/anthropic";
import { generateText, tool } from "ai";
import { load } from "cheerio";
import { z } from "zod";

const REWRITE_MODEL = anthropic("claude-sonnet-4-20250514");

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
  "you",
  "your",
  "will",
  "this",
  "their",
  "our",
  "we",
  "they",
  "into",
  "across",
  "using",
  "experience",
  "ability",
  "strong",
  "skills",
  "work",
]);

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function extractKeywords(text: string, maxKeywords: number) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  const frequency = new Map<string, number>();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

function extractLikelyJobDescription(html: string) {
  const $ = load(html);
  $("script, style, noscript, svg").remove();

  const selectors = [
    "main",
    "article",
    "[role='main']",
    ".job-description",
    "#job-description",
    ".description",
    ".posting",
    ".job-posting",
    "body",
  ];

  const candidates = selectors
    .map((selector) => normalizeWhitespace($(selector).text()))
    .filter((text) => text.length > 200);

  const best = candidates.sort((a, b) => b.length - a.length)[0] ?? "";
  const title = normalizeWhitespace($("title").first().text());

  return {
    title: title || "Unknown job title",
    description: best.slice(0, 16000),
  };
}

export const tools = {
  scrape_job_description: tool({
    description:
      "Fetch and parse a job posting URL into clean job description text.",
    inputSchema: z.object({
      jobUrl: z.string().url().describe("The URL of the job posting"),
    }),
    execute: async ({ jobUrl }) => {
      const parsedUrl = new URL(jobUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Only http and https URLs are supported.");
      }

      const response = await fetch(jobUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; JobApplicationAgent/1.0; +https://vercel.com)",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch job URL (${response.status} ${response.statusText}).`,
        );
      }

      const html = await response.text();
      const { title, description } = extractLikelyJobDescription(html);

      if (description.length < 200) {
        return {
          jobUrl,
          title,
          description,
          warning:
            "The extracted job description is short. The page may require JavaScript rendering.",
        };
      }

      return { jobUrl, title, description };
    },
  }),

  analyze_fit: tool({
    description:
      "Compare resume text with job description and return fit score and gaps.",
    inputSchema: z.object({
      jobDescription: z.string().min(100),
      resume: z.string().min(50),
    }),
    execute: async ({ jobDescription, resume }) => {
      const jdKeywords = extractKeywords(jobDescription, 35);
      const resumeLower = resume.toLowerCase();

      const matchedKeywords = jdKeywords.filter((word) =>
        resumeLower.includes(word),
      );
      const missingKeywords = jdKeywords.filter(
        (word) => !resumeLower.includes(word),
      );

      const matchScore = Math.round(
        (matchedKeywords.length / Math.max(jdKeywords.length, 1)) * 100,
      );

      return {
        matchScore,
        matchedKeywords,
        missingKeywords: missingKeywords.slice(0, 15),
        strengthsSummary:
          matchedKeywords.length > 0
            ? `Resume already aligns with: ${matchedKeywords.slice(0, 10).join(", ")}.`
            : "Few direct keyword matches were found.",
        gapsSummary:
          missingKeywords.length > 0
            ? `Potential gaps to address: ${missingKeywords.slice(0, 10).join(", ")}.`
            : "No major keyword gaps were detected.",
      };
    },
  }),

  rewrite_resume_section: tool({
    description:
      "Rewrite one resume section to better target the specific job description.",
    inputSchema: z.object({
      sectionTitle: z.string().min(1),
      sectionText: z.string().min(20),
      jobDescription: z.string().min(100),
      fitGaps: z.array(z.string()).optional(),
    }),
    execute: async ({ sectionTitle, sectionText, jobDescription, fitGaps }) => {
      const { text } = await generateText({
        model: REWRITE_MODEL,
        system:
          "You are an expert technical resume writer. Keep edits truthful and concise.",
        prompt: `
Rewrite the resume section below for better relevance to the target role.

Rules:
- Keep output specific and ATS-friendly.
- Preserve factual claims from the source section.
- Improve clarity, impact, and keyword alignment.
- Return only the rewritten section content (no preamble).

Section title: ${sectionTitle}

Current section:
${sectionText}

Top job description context:
${jobDescription.slice(0, 5000)}

Known fit gaps to address:
${(fitGaps ?? []).join(", ") || "None provided"}
`.trim(),
      });

      return {
        sectionTitle,
        rewrittenSection: text.trim(),
      };
    },
  }),

  draft_cover_letter: tool({
    description:
      "Draft a tailored cover letter using resume and job description context.",
    inputSchema: z.object({
      resume: z.string().min(50),
      jobDescription: z.string().min(100),
      companyName: z.string().optional(),
      jobTitle: z.string().optional(),
      tone: z.enum(["professional", "warm", "direct"]).default("professional"),
    }),
    execute: async ({
      resume,
      jobDescription,
      companyName,
      jobTitle,
      tone,
    }) => {
      const { text } = await generateText({
        model: REWRITE_MODEL,
        system:
          "You write concise, high-quality cover letters tailored for technical roles.",
        prompt: `
Draft a one-page cover letter.

Constraints:
- 3 to 5 short paragraphs
- Confident but not exaggerated
- Tie past impact to the target role
- End with a clear call to action

Role: ${jobTitle ?? "Not specified"}
Company: ${companyName ?? "Not specified"}
Preferred tone: ${tone}

Resume context:
${resume.slice(0, 5000)}

Job description context:
${jobDescription.slice(0, 6000)}
`.trim(),
      });

      return {
        coverLetter: text.trim(),
      };
    },
  }),
};
