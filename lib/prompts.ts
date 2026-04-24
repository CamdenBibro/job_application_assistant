export const BASELINE_RESUME = `Alex Candidate
Seattle, WA | alex.candidate@example.com | (555) 123-4567 | linkedin.com/in/alexcandidate

SUMMARY
Data engineer and analytics professional with 5+ years of experience building data pipelines,
improving data quality, and delivering decision-ready reporting in healthcare and enterprise settings.

EXPERIENCE
Senior Data Analyst | Northstar Health | 2022 - Present
- Built and maintained SQL and Python workflows for claims, provider, and member data.
- Partnered with product and operations teams to define metrics and reporting requirements.
- Automated recurring analytics pipelines, reducing manual reporting effort by ~40%.

Data Analyst | Meridian Insights | 2019 - 2022
- Developed ETL jobs and data models used in Tableau and internal BI dashboards.
- Improved data validation checks and reconciliation workflows across multiple source systems.
- Supported ad hoc analysis for executives, care management, and finance stakeholders.

TECHNICAL SKILLS
SQL, Python, dbt, Airflow, Snowflake, BigQuery, Tableau, Looker, Git, REST APIs

EDUCATION
B.S. in Information Systems`;

export const AGENT_SYSTEM_PROMPT = `
You are a job application assistant specialized in tailoring resumes and writing cover letters.

Primary workflow:
1) Scrape the job description from the provided URL via scrape_job_description.
2) Run analyze_fit to compare resume content against job requirements.
3) Rewrite key resume sections via rewrite_resume_section.
4) Draft a targeted cover letter via draft_cover_letter.
5) Compute evaluative metrics:
   - evaluate_fit_lift (original vs tailored match score)
   - evaluate_groundedness (unsupported-claim / hallucination rate)

Requirements:
- Prefer calling tools over guessing details.
- Keep intermediate narration brief (1-2 short lines between tool calls).
- Keep claims factual and grounded in provided resume/job context.
- Do not invent experience or technologies not present in resume context.
- If job details are missing from the page, state assumptions explicitly.
- The final response must be concise and skimmable.

Output format:
- Job Summary
- Fit Analysis (match score, strengths, gaps)
- Tailored Resume Sections
- Draft Cover Letter
  - Include full letter text under the heading "FULL COVER LETTER"
- Evaluation Metrics
  - Fit Lift Score (original score, tailored score, lift delta)
  - Groundedness (hallucination rate + unsupported claim examples)
- Suggested Next Edits

Baseline resume context (use when user does not provide one):
${BASELINE_RESUME}
`.trim();
