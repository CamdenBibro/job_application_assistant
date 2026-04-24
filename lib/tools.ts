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

function decodeHtmlEntities(text: string) {
  const $ = load(`<span>${text}</span>`);
  return $("span").text();
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

function calculateKeywordFit(jobDescription: string, resumeText: string) {
  const jdKeywords = extractKeywords(jobDescription, 35);
  const resumeLower = resumeText.toLowerCase();

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
    jdKeywords,
    matchedKeywords,
    missingKeywords,
    matchScore,
  };
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

  const selectorCandidates = selectors
    .map((selector) => normalizeWhitespace($(selector).text()))
    .filter((text) => text.length > 200);

  const metaDescriptions = [
    $("meta[property='og:description']").attr("content"),
    $("meta[name='description']").attr("content"),
    $("meta[name='twitter:description']").attr("content"),
  ]
    .map((value) => decodeHtmlEntities(normalizeWhitespace(value ?? "")))
    .filter((text) => text.length > 80);

  const jsonLdDescriptions: string[] = [];
  const jsonLdTitles: string[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];

      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== "object") continue;

        const record = current as Record<string, unknown>;
        if (typeof record.description === "string") {
          const description = decodeHtmlEntities(
            normalizeWhitespace(record.description),
          );
          if (description.length > 80) {
            jsonLdDescriptions.push(description);
          }
        }

        const candidateTitle =
          typeof record.title === "string"
            ? record.title
            : typeof record.name === "string"
              ? record.name
              : "";
        if (candidateTitle) {
          jsonLdTitles.push(
            decodeHtmlEntities(normalizeWhitespace(candidateTitle)),
          );
        }

        const nestedValues = Object.values(record).filter(
          (value) => value && typeof value === "object",
        );
        for (const value of nestedValues) {
          if (Array.isArray(value)) {
            stack.push(...value);
          } else {
            stack.push(value);
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue with other extraction methods.
    }
  });

  const bestSelectorDescription =
    selectorCandidates.sort((a, b) => b.length - a.length)[0] ?? "";
  const bestJsonLdDescription =
    jsonLdDescriptions.sort((a, b) => b.length - a.length)[0] ?? "";
  const bestMetaDescription =
    metaDescriptions.sort((a, b) => b.length - a.length)[0] ?? "";
  const description =
    bestSelectorDescription || bestJsonLdDescription || bestMetaDescription;

  const titleCandidates = [
    normalizeWhitespace($("meta[property='og:title']").attr("content") ?? ""),
    normalizeWhitespace($("meta[name='title']").attr("content") ?? ""),
    ...jsonLdTitles,
    normalizeWhitespace($("title").first().text()),
  ].filter(Boolean);
  const title = decodeHtmlEntities(titleCandidates[0] ?? "Unknown job title");

  const extractionMethod = bestSelectorDescription
    ? "main-content"
    : bestJsonLdDescription
      ? "json-ld"
      : bestMetaDescription
        ? "meta-tags"
        : "none";

  return {
    title,
    description: description.slice(0, 16000),
    extractionMethod,
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
      const { title, description, extractionMethod } =
        extractLikelyJobDescription(html);

      if (description.length < 200) {
        return {
          jobUrl,
          title,
          description,
          extractionMethod,
          warning:
            "The extracted job description is short. The page may require JavaScript rendering.",
        };
      }

      return {
        jobUrl,
        title,
        description,
        extractionMethod,
      };
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
      const { matchedKeywords, missingKeywords, matchScore } =
        calculateKeywordFit(jobDescription, resume);

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

  evaluate_fit_lift: tool({
    description:
      "Calculate fit lift by comparing original vs tailored resume against the same job description.",
    inputSchema: z.object({
      jobDescription: z.string().min(100),
      originalResume: z.string().min(50),
      tailoredResume: z.string().min(50),
    }),
    execute: async ({ jobDescription, originalResume, tailoredResume }) => {
      const originalFit = calculateKeywordFit(jobDescription, originalResume);
      const tailoredFit = calculateKeywordFit(jobDescription, tailoredResume);
      const fitLift = tailoredFit.matchScore - originalFit.matchScore;

      return {
        originalMatchScore: originalFit.matchScore,
        tailoredMatchScore: tailoredFit.matchScore,
        fitLift,
        originalMatchedKeywords: originalFit.matchedKeywords,
        tailoredMatchedKeywords: tailoredFit.matchedKeywords,
        newlyMatchedKeywords: tailoredFit.matchedKeywords.filter(
          (keyword) => !originalFit.matchedKeywords.includes(keyword),
        ),
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

  evaluate_groundedness: tool({
    description:
      "Estimate unsupported-claim rate by checking if generated claims are grounded in original resume evidence.",
    inputSchema: z.object({
      originalResume: z.string().min(50),
      generatedText: z.string().min(50).describe("Rewritten resume + cover letter"),
    }),
    execute: async ({ originalResume, generatedText }) => {
      const { text } = await generateText({
        model: REWRITE_MODEL,
        system:
          "You are a strict factuality evaluator for resume tailoring output. Be conservative when judging support.",
        prompt: `
Evaluate groundedness of generated job-application text against the original resume.

Definitions:
- A claim is "supported" if the original resume contains direct evidence for it.
- A claim is "unsupported" if it adds facts/experience/metrics/skills not substantiated by the original resume.

Return ONLY valid JSON with this shape:
{
  "totalClaims": number,
  "supportedClaims": number,
  "unsupportedClaims": number,
  "hallucinationRate": number,
  "unsupportedExamples": string[],
  "notes": string
}

Rules:
- hallucinationRate = unsupportedClaims / max(totalClaims, 1)
- Keep unsupportedExamples to at most 5 concise claims.
- If uncertain, count as unsupported.

Original resume:
${originalResume.slice(0, 7000)}

Generated text:
${generatedText.slice(0, 9000)}
`.trim(),
      });

      try {
        const parsed = JSON.parse(text) as {
          totalClaims?: number;
          supportedClaims?: number;
          unsupportedClaims?: number;
          hallucinationRate?: number;
          unsupportedExamples?: string[];
          notes?: string;
        };

        const totalClaims = Math.max(0, parsed.totalClaims ?? 0);
        const supportedClaims = Math.max(0, parsed.supportedClaims ?? 0);
        const unsupportedClaims = Math.max(0, parsed.unsupportedClaims ?? 0);
        const calculatedRate =
          totalClaims > 0 ? unsupportedClaims / totalClaims : 0;

        return {
          totalClaims,
          supportedClaims,
          unsupportedClaims,
          hallucinationRate: Number(
            (parsed.hallucinationRate ?? calculatedRate).toFixed(3),
          ),
          unsupportedExamples: (parsed.unsupportedExamples ?? []).slice(0, 5),
          notes: parsed.notes ?? "",
        };
      } catch {
        return {
          totalClaims: 0,
          supportedClaims: 0,
          unsupportedClaims: 0,
          hallucinationRate: 0,
          unsupportedExamples: [],
          notes:
            "Could not parse evaluator output as JSON. Re-run groundedness evaluation if needed.",
        };
      }
    },
  }),
};
