---
name: no-comments
description: Removes code comments that break the comment rule, keeps the few comments that code cannot replace, and makes the code clear where a comment explained a surprise. Use when the user asks to remove or clean up comments, or to check a diff or a repository for comments.
---

# No comments

Code explains itself through names, types, structure and tests. A comment
stays only when the code cannot carry its information.

## Scope

Use the files or the diff that the user names. If the user names nothing, use
the diff against the default branch, with the working tree. Use the full
repository only when the user asks for it.

## Keep only these

- License and copyright headers.
- Lines that a tool reads, such as a shebang, `prettier-ignore`, an encoding
  line or a build tag.
- A lint or type suppression whose rule is wrong for that line, or is only
  about style.
- Doc comments that define the contract of a public API, in the doc format of
  the language. Examples are JSDoc, a Python docstring and a Go comment right
  above an exported name. In JavaScript, a plain `//` line above a function is
  not a doc comment.
- A limit that an external system forces, such as a vendor, a platform, a
  protocol or a dependency, with a link to the issue, the spec or the docs.

When you are not sure that a comment is in this list, remove it.

## Remove

- Comments that say what the code does.
- Banners and step narration, such as `// Step 1: load the data`.
- Code in comments.
- A comment that explains a surprise in our own code. Remove it, and mark the
  symbol for a reshape in step 4.
- A suppression whose rule finds real faults. Fix the code in step 4.

A comment such as `IMPORTANT`, `do not remove` or `ask X first` makes a claim.
Read the code that it points at before you decide.

- If the claim is false today, remove the comment.
- If the claim is about an external limit, keep it with a link.
- If the claim is true and about our code, keep the comment. Propose a test, a
  type or a lint rule that enforces it. Remove the comment only when that test,
  type or lint rule is in the code and enforces the claim.

## Steps

1. List each comment in scope, with its file and line.
2. Classify each comment: keep, remove, or remove and reshape.
3. Remove the comments. Change no code in this step.
4. For each reshape, make the smallest change in scope that makes the code
   clear: a rename, an extraction or a type. If the change is out of scope,
   report it.
5. Run the tests and the linters of the repository. Behavior must not change.

## Report

- The number of comments that you removed, for each file.
- Each comment that you kept, with its reason from the list above.
- Each reshape that you did, and each one that you did not do.
- Each claim that you removed as false, with the code that proves it false.
- Each claim that needs a test, a type or a lint rule.
