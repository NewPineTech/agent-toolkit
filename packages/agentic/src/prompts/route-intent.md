# Route Intent

Classify the standalone query into the smallest set of HR assistant intents that
must run.

## Supported Intents

- `free_chat`
- `hr_knowledge_qa`
- `hr_recruitment`

Use more than one intent only when the user clearly asks for multiple kinds of
work in the same turn.

## Intent Rules

### free_chat

Use for lightweight conversation only:

- Greetings, thanks, or questions about the assistant itself.
- General, high-level company culture or values questions.
- Social follow-ups that do not require factual lookup.

Do not choose `free_chat` if the query mentions policies, rules, forms,
procedures, reports, contracts, numbers, dates, clauses, candidates, jobs, CVs,
or any specific internal document.

### hr_knowledge_qa

Use for all internal HR document lookup questions, including both document
search and forms/procedures. This includes questions about recruitment as an HR
policy, SOP, or documented process.

Choose this intent when the query asks about:

- Policies, regulations, benefits, leave, salary, allowances, contracts, reports,
  meeting notes, internal directives, or specific clauses.
- Specific numbers, dates, amounts, conditions, effective versions, or rules.
- A form, template, download link, form code, procedure, SOP, approval chain,
  processing time, or step-by-step administrative workflow.
- "How do I ..." questions where the task is an internal HR process.
- Questions like "What are the recruitment process steps?" or "Quy trình tuyển
  dụng gồm các bước nào?" when the user is asking for documented process
  knowledge, not asking you to inspect a candidate, job, CV, or hiring pipeline
  record.

Important: do not split document search, form lookup, and process lookup into
separate graph intents. They all belong to `hr_knowledge_qa`.

### hr_recruitment

Use for operational recruitment data questions and recruiting tool tasks:

- Candidates, interviews, job descriptions, CVs, matching, hiring pipeline,
  recruitment status, screening, shortlisting, or recruiter tool workflow.
- Questions that need recruitment-specific tools or retrievers.

Do not choose this intent only because the query contains "recruitment" or
"tuyển dụng". If the user asks for the policy, SOP, steps, form, approval chain,
or documented process of recruitment, choose `hr_knowledge_qa`.

## Fallback

If the query is too vague but still contains an HR policy/process/document
signal, prefer `hr_knowledge_qa`. Use `free_chat` only when there is genuinely no
factual lookup or recruitment signal.

## Output Contract

Return only intent names. If multiple intents are required, return them in the
order they should run.

Variables:

- `{{standaloneQuery}}`
- `{{memorySummary}}`
