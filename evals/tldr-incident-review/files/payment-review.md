# Payment replay incident: approval for a bounded repair

Author: Elena Ruiz, payments engineering. Decision date: 8 November 2026.

## What I need today

Daniel Cho, please approve the remediation plan by 17:00 UTC today, 8 November 2026. The approval reserves $24,300 and two engineers for ten working days. The money covers temporary ledger storage and merchant support during the two phases below. This is a spending ceiling, not a monthly subscription. Approval reserves the people and money, but it does not waive either release gate. If approval misses the deadline, we keep manual review and move the first phase to the next available support window. Please record the decision in the incident ticket so that support can schedule its coverage.

## What happened and what remains

On Friday, a replay worker sent payment capture requests again after a timeout. The gateway accepted the original requests but our worker treated the missing acknowledgements as failed captures. It created a new request identifier for each retry. We confirmed 1,847 duplicate captures across 62 merchants. The gateway records support those counts, rather than an estimate from support tickets. The immediate repair disables automatic capture replay. New captures still work, while timed out requests wait for manual review. The proposed repair keeps the original request identifier across retries and checks the ledger before it sends another capture.

We first heard about the incident through a merchant who runs a small bicycle shop. Her message included a photograph of a receipt and a careful description of what her customer saw. That was more useful than our initial dashboard, which showed successful requests without showing whether they represented the same purchase. I mention this because the conversation changed how we conducted the review. We started with the customer's sequence of events and then compared the service records. The review meeting was calmer once we had one shared example on the screen.

Support has contacted every affected merchant. Refund work continues under the existing incident procedure and does not depend on this approval. Please do not read a proposed engineering date as a promise that every customer's bank will display a refund that day. Bank posting follows a separate process. Nina Shah owns the accounting evidence for the release, and support owns the customer messages. We need both groups to agree on the description, but only Nina can certify the ledger gate described below.

## Phase one: a small live group

Marta Bell owns phase one, scheduled for 16 November 2026. It enables the repaired replay path for four merchants who volunteered for the trial. It starts only after Nina certifies that the refund ledger reconciles all 1,847 duplicate captures against gateway records. Nina calls missing reconciliation a blocker: she will not authorize the trial while any duplicate capture lacks a matched ledger entry. A successful replay demonstration alone does not satisfy her condition. Marta must keep the other merchants on manual review while the trial runs.

The four merchants include a repair shop, a book seller, a florist, and a parts supplier. Their support contacts already know our team, which makes it easier to arrange the observation window. We chose them for that practical reason, not because their traffic proves anything about every merchant. During the planning meeting we spent quite a while discussing the names for the two dashboard panels. That discussion helped support understand the workflow, although the panel names do not affect the release decision.

## Phase two: the full merchant group

Omar Chen owns phase two, scheduled for 23 November 2026. It enables the repaired replay path for all 62 merchants, including the four trial merchants. This is a total of 62, not 62 additional merchants. The gate requires 48 continuous hours with zero duplicate captures in phase one and written acceptance from support. Any duplicate restarts that observation period after the fault is repaired. If either gate item is missing, Omar delays phase two. The calendar date alone never authorizes expansion. Manual review remains available until Omar records the expansion decision.

Omar asked that the schedule stay in the incident ticket rather than in a separate presentation. That seems sensible because support already uses the ticket during shift changes. We also agreed to keep the existing review meeting slot for now. Several people find a familiar meeting easier than another invitation with another title. The meeting is a place to inspect evidence and resolve questions. Attendance at it is not release approval, and a quiet room must not become a substitute for the written acceptance.

## Stop and return path

Priya Nair owns the abort and rollback decision in both phases. One confirmed duplicate capture triggers an immediate stop of automatic replay. Priya disables replay, returns affected merchants to manual review, and preserves the ledger for investigation. She does not undo completed captures by deleting ledger entries. Refunds continue through the existing procedure. Restart requires the relevant phase gate again. This path uses the same switch that operations used during the incident, and Priya has authority to use it without waiting for Daniel. The spending approval does not remove that authority.

## Options we rejected

We rejected a complete gateway migration for this incident repair. The vendor contract requires 90 days of notice, so migration cannot meet the November repair window. A later migration discussion can still happen, but it does not replace this decision. We also rejected permanent manual review as the final remedy. That approach needs three additional support staff, and the staffing budget has no capacity for them. Manual review remains our temporary safety path. Rejecting it as the permanent plan does not mean we must disable it before the release gates pass.

The options discussion brought back stories from the gateway selection project. People remembered different parts of that project, and some of those memories were helpful context. We thanked the support team for finding old merchant messages and the finance team for tracing the original settlement notes. I would keep those acknowledgements in the full review because people did substantial work under pressure. They do not change the reasons the two alternatives lost, and they do not create another option for today's approval.

We also spent part of the review sorting the shared notes into a readable order. The first draft followed the order in which people joined the call, which made sense to those of us who were there but confused colleagues who read it later. Support suggested putting the customer experience before the service timeline. Finance preferred to see the approval request near the beginning. Both suggestions made the document easier to discuss. Someone found the old meeting template and offered to restore its headings, but we kept the headings we already had. None of that editing changes the requested work or the evidence needed for release.

## Doubts that remain

Leo Grant objects to the storage cost estimate because he expects ledger storage to cost 18% more than the estimate. His figure comes from a comparable account, not a measurement of this workload. He requests a cost review during the trial, but he does not block approval or phase one. The $24,300 ceiling still applies. Nina's reconciliation blocker remains a stronger condition than Leo's objection. We should not combine them into a general statement that finance opposes the plan.

Samir Patel asks whether overseas bank holidays will delay refund visibility. Nobody measured that effect, and Samir leaves it as an open question rather than a forecast or a blocker. Support will collect observations during the trial. Separately, I do not know whether the gateway will retain request identifiers across its next software upgrade. That is my uncertainty, not a claim that nobody knows the answer. I will ask the gateway contact before expansion. It is not an extra release gate. Please preserve these distinctions when you describe the approval to the other managers.
