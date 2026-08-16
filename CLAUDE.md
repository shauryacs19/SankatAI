### Project Instructions

- Keep all replies extremely short, direct, and code-focused. Avoid unnecessary explanations or summaries.
- Use `context.md` as the primary source of project context.
- Do NOT reread previous conversation/chat history unless explicitly required to resolve missing information.
- At the start of every task, read the relevant `context.md` first.
- After completing a task, ALWAYS update `context.md` with meaningful changes, decisions, fixes, and current project state.
- Keep `context.md` concise and high-signal. Do not store large code blocks, verbose logs, or redundant information.

### Token Efficiency

- Do not repeat information already present in `context.md`.
- Do not scan or reread the entire repository unless explicitly required.
- Inspect only files directly relevant to the current task and their necessary dependencies.
- Do not ask for or require the user to paste files that you can inspect yourself.
- Do not paste unchanged code in responses.
- When modifying code, change only what is necessary and preserve existing functionality.
- Prefer targeted commands and targeted log output instead of dumping entire files/logs.
- Break large tasks into logical steps when necessary.
- Avoid unnecessary explanations, documentation, or summaries.
- Return only the required code changes, commands, and minimal verification steps.

### Shared Architecture

- Web and mobile are separate clients sharing the same SankatAI backend and AWS infrastructure.
- Share common APIs, authentication, databases, S3 storage, AI/LLM, RAG, business logic, and other backend resources wherever possible.
- Keep client-specific UI/UX separate.
- Reuse existing shared resources before creating new ones.
- Before creating a new resource, inspect `context.md` and the relevant existing code/infrastructure.
- Do not duplicate backend logic or AWS resources unnecessarily.
- Follow the existing Terraform, Docker, environment-variable, backend, and AWS architecture.
- Keep dev and prod resources isolated and environment-driven.
- Never modify, replace, or remove an existing resource or flow if it could break another client or existing functionality.
- Maintain backward compatibility.
- Any meaningful architectural change must be reflected in `context.md`.
- Never introduce a new technology, AWS service, database, or architectural pattern when an existing project resource can safely fulfill the requirement.

### Code Changes

- Understand the existing implementation before modifying it.
- Make the smallest safe change that solves the task.
- Preserve existing APIs, interfaces, environment variables, database schemas, and resource relationships unless the task explicitly requires changing them.
- Check for dependencies/usages before renaming, removing, or changing shared resources.
- Verify changes with the smallest relevant test, build, lint, or command.
- If a change could affect web, mobile, backend, Terraform, or AWS resources, verify that the other components are not broken.

### Response Format

- Be concise.
- Prefer code and commands over explanations.
- For fixes: provide the change and the verification command.
- For errors: identify the root cause first, then give the fix.
- Do not provide lengthy tutorials unless explicitly requested.