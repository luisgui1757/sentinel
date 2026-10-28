# Sources and licenses

Sentinel uses the [MIT license](LICENSE). Each imported skill keeps the license
files of its source in its folder. `upstream/lock.json` records the revision and
the SHA-256 of each imported file. A file that Sentinel changed also has a
`local` SHA-256 in the lock.

| Skills | Source | License |
|---|---|---|
| babysit-pr, council, file-pr, full-send, full-stop, leaving-pr-comments, modernize, sol-loop, takeover | [t3dotgg/tstack](https://github.com/t3dotgg/tstack) | MIT |
| impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache 2.0, with `NOTICE.md` |
| frontend-design | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Apache 2.0 |

Impeccable bundles two parts under the MIT license without their license
text. Sentinel adds these texts to the Impeccable folder. `PLATFORM-LICENSE`
covers the iOS and Android references from ehmo's
[platform-design-skills](https://github.com/ehmo/platform-design-skills).
`SCREENSHOT-LICENSE` covers `scripts/modern-screenshot.umd.js` from
[modern-screenshot](https://github.com/qq15725/modern-screenshot).

Sentinel keeps the T3 Code routes of the tstack skills and adds commands for
the other CLIs. `pr-wait` runs on Windows, and it waits for the requested
reviewers instead of named review bots. Council stops after 3 rounds by
default. Council and sol-loop start each reviewer at high effort by default. The Impeccable skill has one
added note about updates, and that note says that Sentinel added it.

Sentinel wrote beast-ui, doc-view and untangle. Beast-ui runs the Impeccable playbooks in
a fixed order. Doc-view uses Impeccable, Frontend-design and Beast-ui.
