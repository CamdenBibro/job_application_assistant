# Job Application Agent

A simple agentic app that:

1. Scrapes a job description from a URL
2. Analyzes resume/job fit and keyword gaps
3. Rewrites key resume sections for the role
4. Drafts a tailored cover letter

Built with:

- Next.js (App Router)
- Vercel AI SDK 6 (`ToolLoopAgent`)
- Anthropic model `claude-sonnet-4-20250514`
- Deployed on Vercel

## Project Structure

```text
app/
  api/agent/route.ts   # API endpoint that runs the ToolLoopAgent
  page.tsx             # Demo UI (URL + resume inputs + streamed output)
lib/
  agent.ts             # ToolLoopAgent configuration
  prompts.ts           # System prompt + baseline resume
  tools.ts             # scrape/analyze/rewrite/cover-letter tools
```

## Local Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Create `.env.local`:

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 3) Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Demo Flow

1. Paste a job posting URL
2. Paste (or keep) the resume baseline
3. Optionally add a short request note
4. Click **Run agent**
5. Watch the stream:
   - Tool calls (`scrape_job_description`, `analyze_fit`, etc.)
   - Intermediate step boundaries
   - Final formatted output

## Deploy to Vercel

1. Push this repository to GitHub
2. Import the repository in Vercel
3. Add env var in Vercel project settings:
   - `ANTHROPIC_API_KEY`
4. Deploy

That is it. The API route is already in `app/api/agent/route.ts` and is Vercel-ready.
