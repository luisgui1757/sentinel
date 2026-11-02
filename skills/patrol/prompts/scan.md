You look for defects in one area of this repository. Change no file.

1. List the top-level source folders, sorted by name. Take the folder whose index is the ISO week number (`date +%V`) modulo the number of folders. That folder is the area.
2. First run the checks that the repository has for that area: tests, lint and type checks. Then read the code of the area.
3. Report at most 3 defects. Report only a defect that you can show: a failing command, a reproduction, or code whose wrong result you can name. Do not report style.
4. Write the defects to `$PATROL_OUT/findings.json` as a JSON list. Each entry has `title`, `body` and `key`. The body gives the evidence and the steps to reproduce. The key names the place and the kind of fault, for example `src/api/users.js:missing-auth-check`, so that the same defect gets the same key next week. Write `[]` when you find none.
5. Write a short report to `$PATROL_OUT/report.md`: the area, the checks that you ran, and each defect.
