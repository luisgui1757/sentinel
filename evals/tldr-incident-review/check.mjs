import { final, check, note, report, words } from '../lib.mjs';

const text = final().replace(/\*\*|__/g, '').replace(/\bNov\./gi, 'Nov');
const units = text.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
const has = (...patterns) => units.some(unit => patterns.every(pattern => pattern.test(unit)));
const date = day => new RegExp(`\\b(?:${day}(?:st|nd|rd|th)?\\s+(?:Nov(?:ember)?)|Nov(?:ember)?\\s+${day}(?:st|nd|rd|th)?|2026-11-${day.padStart(2, '0')})\\b`, 'i');
const duplicates = /duplicat|double.?captur/i;
const captures = /captur|payment|ledger|reconcil/i;
const count = /\b(?:1[ ,]?847|1\.847\s*k|one thousand (?:eight hundred (?:and )?forty[- ]seven))\b/i;
const merchants = /\bmerchant/i;
const total = /\b(?:62|sixty[- ]two)\b/i;
const phaseOne = /phase\s*(?:1|one|i)\b|trial|pilot/i;
const phaseTwo = /phase\s*(?:2|two|ii)\b|expan|full\s+(?:group|rollout|release)/i;

check('approval owner and deadline', has(/Daniel(?: Cho)?/i, /approv|decid|sign/i, date('8'), /\b(?:17[:.]00|1700|5\s*(?:p\.?m\.?|in the afternoon))\s*(?:UTC|Z)\b/i));
check('budget and engineering allocation',
  has(/\$?\s*(?:24[ ,]?300|24\.3\s*k)\b/i, /budget|ceiling|approv|reserv|cost|spend/i)
  && has(/\b(?:2|two)\s+engineers?\b/i, /\b(?:10|ten)\s+(?:working|business|work)\s*days\b/i));
check('incident scale', has(count, duplicates, /captur|payment/i) && has(total, merchants, /affect|across|incident|duplicate|capture/i));
check('phase one owner date and size',
  has(phaseOne, date('16')) && has(/Marta(?: Bell)?/i, phaseOne)
  && has(phaseOne, /\b(?:4|four)\b/i, merchants));
check('phase one reconciliation gate', has(/Nina(?: Shah)?/i, /reconcil|match/i, count, /before|until|only|requir|gate|block|certif/i));
check('phase two owner date and total scope',
  has(phaseTwo, date('23')) && has(/Omar(?: Chen)?/i, phaseTwo)
  && has(phaseTwo, total, merchants, /all|total|includ/i));
check('phase two observation and support gate',
  has(/\b(?:48|forty[- ]eight)\s*(?:continuous\s+)?(?:h(?:ours?|rs?)?\b)|\b(?:2|two)\s+(?:continuous\s+)?days\b/i, /zero|no\b|0\b/i, duplicates, /gate|after|requir|only|before|clean/i)
  && has(/support/i, /written|writ|sign.?off/i, /accept|approv|sign.?off|gate/i));
check('rollback owner and manual path', has(/Priya(?: Nair)?/i, /manual\s+(?:review|processing)/i, /stop|abort|rollback|disable|return|revert/i));
check('abort trigger and ledger preservation',
  has(/\b(?:one|1|any|a single)\b/i, /confirm/i, duplicates, /stop|abort|rollback|disable|trigger/i)
  && has(/preserv|keep|retain/i, /ledger/i));
check('migration rejection and notice reason', has(/gateway|vendor/i, /migrat|replac/i, /reject|lost|ruled out|cannot|too slow/i, /\b(?:90|ninety)\s*days?\b/i, /notice/i));
check('permanent manual rejection and staffing reason', has(/permanent|indefinite/i, /manual/i, /\b(?:3|three)\b/i, /staff|support|hires/i, /budget|fund|afford/i));
check('Nina doubt remains a blocker', has(/Nina(?: Shah)?/i, /block|must|cannot|won't|will not|refus/i, /reconcil|match/i, captures));
check('Leo numerical objection stays nonblocking',
  has(/Leo(?: Grant)?/i, /\b(?:18\s*(?:%|percent)|eighteen\s*percent)/i, /storage|ledger/i, /cost|estimat|expens/i)
  && has(/Leo(?: Grant)?|his objection/i, /non[- ]?block|not\s+(?:a\s+)?block|does not block|doesn't block/i));
check('Samir unmeasured question stays open', has(/Samir(?: Patel)?/i, /bank\s+holidays?|overseas\s+holidays?/i, /refund/i, /unmeasured|not measured|nobody measured|no\s+(?:one|measurements?|data)|not been measured/i, /question|asks?|unknown|uncertain/i));
check('author owns upgrade uncertainty', has(/Elena(?: Ruiz)?|author|\bI\b/i, /does not know|doesn't know|do not know|don't know|unsure|uncertain/i, /gateway/i, /upgrade/i, /request\s*(?:identifiers?|IDs?)|idempotency\s*keys?/i));
note('summary word count', true, words(final()));
report();
