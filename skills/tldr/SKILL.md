---
name: tldr
description: "Load this skill before you shorten a text that exists: a reply, a document, a file or a thread. Use it when the user asks for a tldr, a TLDR, a summary, a recap, the key points or the short version. Use it also when the user says that a text is too long or that there is no time to read it. Do not use it to explain a command, a concept or code. The skill gives a fixed form that keeps each decision, option, necessary change, doubt and limit of the source."
---

# TLDR

Shorten a text that exists. Keep what the reader needs for a decision or an
action. The number of these items sets the length. The length of the source
and a word count do not.

## Target

Use the text that the user names. If the user names no text, use your last
reply. Read the full source before you write. Do not start from the summary
of the source, because a summary drops conditions.

## Form

Write the result in this form. Fill each slot with one sentence, or two when
the slot has two parts. Each sentence of the result fills one slot. Remove a
sentence that fills no slot, such as a reason, or how a step or a tool works
inside.

Fill each part of a slot only with what the source says about it. Keep each
part that the source gives, also when another part is empty. Remove a part, a
slot or a section that the source does not fill. Do not write a part only to
complete the form, or give an action as its own benefit. Keep the section
labels.

```
**Answer.** <the recommendation or the result of the source, with its strength, and no reason>

**Key facts.**
- <a number, a cost or a date that the reader needs, and that no other line holds>

**Decision: <name>.** <what the source recommends, with its strength, and who decides>
- Option <name>: <the exact change>. Gives: <what>. Costs: <time, money, what it loses>. Needs: <what>.

**Must do.**
- <each part of the change, with its values>. <by when>. Without it, <what breaks, when, and for whom>.

**Limits.**
- <an action or a plan> works only <condition>.

**Open.**
- <who> says or doubts <what>. <who> tried <what>, with <result>. <what stays unknown>.
- <a check that did not run, or how far it ran>.
```

A decision is a choice that waits on the reader. For a yes or no decision,
give what each answer causes, when the source says it. A yes or no decision
gets no option line. Write no option that the source does not describe. Give
each option its own line, with each of its slots.

Give each change that the source says must happen its own line, with each of
its parts. A risk goes in Must do only when the source says that its fix must
happen. A risk or a cost of one option stays in the line of that option. Other
risks go in Open, with the strength of the source. Give the doubt of each
person its own line.

Key facts holds only a number, a cost or a date that no other line holds. Give
the number alone, with its unit and what it is. Do not give how the source
measured it or what it explains. Give each fact once, in the line where the
reader acts on it.

## Keep the meaning

- Keep the words of the source that say how sure it is, such as "seems",
  "probably", "slightly", "likely" or "not sure". The session rules forbid
  hedges in your own words. The certainty of the source is a fact about its
  claim, not a hedge. Keep it.
- Keep the verb of obligation of the source: "must", "should", "recommends",
  "suggests", "can". Do not change "suggests" into "must".
- Keep a plain statement plain. Do not change "the test fails" into "the
  test can fail".
- Keep who says each thing, and whom it covers. The doubt of one person stays
  the doubt of that person. "One reviewer disagrees" is not "the reviewers
  disagree".
- Keep the scope of each claim: "only on X", "until Y", "if Z", "with one of
  the options".
- Keep each part of a change. "Set the timeout to 30 s" is a change. "Fix the
  timeout" is only a name for one.
- When the source says a point two times with a different strength, use the
  more careful words.
- Keep numbers, names, identifiers, code and quotations exactly.

## Add nothing

Do not add a note, a cause, a conclusion or a computed number of your own.
Do not write about your own work, such as what you read or did not change.
Summarize the source only.

## Remove the rest

Remove narration, background, praise, repeated text and offers of more work.
Remove a detail that only explains an item, such as the line count behind a
slow test. Remove a check that did not run when its result changes nothing
that the reader does. Do not remove a slot or an item to save words.

## Check

Compare the source with the result, paragraph by paragraph. For each
decision, option, change, limit and doubt, find each of its slots and parts in
the result. Look for conditions and limits also in sentences that name no
problem. Then read each sentence of the result and name its slot. Remove a
sentence with no slot. Then find each fact that the result gives two times,
and keep it in one line.

Then compare each sentence of the result with the source. It must have the
same strength, scope and owner. Restore what is missing or changed, in the
words of the source.
