import { realPr } from '../real-pr.mjs';

realPr(process.argv.slice(2), {
  url: 'https://github.com/npm/node-semver.git',
  base: 'e7b78de06eb14a7fa2075cedf9f167040d8d31af',
  head: 'abdd93d55496d22e3c15a454a5cf13f101e48bce',
  pr: {
    "number": 571,
    "title": "fix: set max lengths in regex for numeric and build identifiers",
    "body": "",
    "headRefName": "lk/safe-component-regex",
    "author": {
      "login": "lukekarrys"
    },
    "url": "https://github.com/npm/node-semver/pull/571"
  },
});
