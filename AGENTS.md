<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data.

Before writing or modifying any Next.js code, read the relevant guide in:

`node_modules/next/dist/docs/`

Follow the documentation in this project over any prior knowledge.

Heed deprecation notices and avoid using outdated Next.js APIs or conventions.

## Git commit rule

After completing each individual feature or logical implementation step, create a Git commit.

Do not bundle multiple unrelated features into one commit.

Examples of commit boundaries:

- Initialize project structure
- Add QR payload type definitions
- Add base64 utilities
- Add compression utilities
- Add chunk split/join utilities
- Add checksum utility
- Implement send page UI
- Implement QR generation
- Implement QR auto-play loop
- Implement receive page UI
- Implement QR scanner
- Implement chunk collection logic
- Implement payload restore logic
- Add validation and error handling
- Polish UI

Use clear commit messages, for example:

```bash
git add .
git commit -m "Add QR payload type definitions"
```

Before each commit, run the available checks when practical:

```bash
npm run lint
npm run build
```

If a check fails, fix the issue before committing.

If a check cannot be run because the project does not define it, mention that in the commit/log summary.
<!-- END:nextjs-agent-rules -->