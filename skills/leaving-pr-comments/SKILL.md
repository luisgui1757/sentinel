---
name: leaving-pr-comments
description: Use whenever leaving comments on a pull request or merge request, on any forge.
---

# Leaving PR Comments

Prefix every agent-authored comment left on the user's behalf with this note
callout:

```md
> [!NOTE]
> 🤖 **<model> responding on behalf of <user>**

Actual comment starts here.
```

Keep the `> [!NOTE]` line only on a forge that shows it as a note box, such as
GitHub. On other forges, remove it and keep the robot line as a plain quote.

Use the verified public name of the model that wrote the comment, and the
user's name or forge login.

If the harness does not expose a model name, use the harness name. Do not guess.

Before posting, check the entire comment, including quoted text and
attachments, for secrets and private details.

Keep the attribution inside the quote and the actual reply outside it. The
context line must start with the robot emoji. Do not add a horizontal rule,
Setext underline, heading, signature footer, or a second attribution.

Apply this format to top-level PR comments, inline review comments, replies to
bots or reviewers, and written explanations used before resolving or
dismissing feedback. Do not add it to PR descriptions, commit messages, or text
the user explicitly asked to post verbatim without attribution. Do not add it
when `git config --get sentinel.attribution` prints `off`.

Write the comment itself in a direct style:

- Lead with the conclusion.
- Cite the relevant code, behavior, check, or reproduction.
- Keep it concise and avoid filler, canned thanks, or status narration.
- Distinguish verified facts from judgment.

Preview the final Markdown before posting so quoting and blank lines render as
shown. After posting, verify that the forge returned the new comment, with its
URL or ID.
Resolve a review thread only after its response was posted successfully.
