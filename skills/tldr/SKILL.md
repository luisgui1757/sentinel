---
name: tldr
description: "Use when the user asks for a TLDR, a summary or a short version, or says that a reply or a document is too long. Makes the text short and keeps each fact that the reader needs to decide or act. The length follows the number of these facts, not a word count."
---

# TLDR

Make the text short, and lose as little as possible of what the reader needs.
The length of the result follows the number of important units in the source.
It does not follow the length of the source or a word count.

## Target

Use the text that the user names. If the user names no text, use your last
reply.

## 1. List the units

Read the full source. Then list each unit that changes what the reader decides
or does:

- The answer or the result.
- Each recommendation, and each decision that waits on the reader.
- Each number, date, limit and name that the reader needs to act.
- Each condition, risk and uncertainty.
- Each check that did not run.
- For each decision, each option with its cost and its limit.
- For each risk, what breaks and what removes the risk.
- For each change that the reader must make, the exact change, such as
  "change its connection string and client library", not only "fix the export".

A detail that only supports a unit is not a unit. Put it in the line of its
unit, or remove it.

## 2. Keep each unit

- Give each unit one line of about 30 words or fewer. Merge two units only
  when one line says both with no loss.
- Never remove a unit or make it shorter to meet a word count.
- Keep numbers, names, identifiers, code and quotations exactly.
- Keep each statement of uncertainty. Do not make a guess sound like a fact.
- Keep the strength of each recommendation. A slight preference stays a slight
  preference.

## 3. Remove the rest

Remove narration, background, repeated text, examples that repeat a point,
hedges and praise. Remove offers of more work. Remove a number that only explains
a unit, such as the data size behind a slow step. Remove the steps that led to a result when the result is
enough to act. Do not add your own notes or analysis. Summarize the source
only.

## 4. Write the result

1. Start with the answer in one or two sentences.
2. Give one line for each unit, in the order of importance. Put the lines in
   groups when there are more than about eight units.
3. Give a pointer to a section of the source only when the reader needs its
   detail to act.
4. End with one short line that says what you removed.

Write whole sentences. Do not remove articles or verbs to save words. Follow
the writing rules of the session.

## Check

Before you reply, compare the result with your list of units. If a unit is
not in the result, add it. Check that the source supports each claim of the
result, with the same strength. Count the words of the source and of the
result. If the result is longer than a third of the source, remove the lines
that change no decision, and count again.
