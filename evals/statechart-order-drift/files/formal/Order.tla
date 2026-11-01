---- MODULE Order ----
EXTENDS Naturals

VARIABLES status, inFlight, charges, refunded, shipped, cancelled, retried

vars == <<status, inFlight, charges, refunded, shipped, cancelled, retried>>

Init == status = "new" /\ inFlight = 0 /\ charges = 0 /\ refunded = FALSE
        /\ shipped = FALSE /\ cancelled = FALSE /\ retried = FALSE

Pay == status = "new" /\ status' = "charging" /\ inFlight' = inFlight + 1
       /\ UNCHANGED <<charges, refunded, shipped, cancelled, retried>>

\* A retry sends one more charge request.
Retry == status = "charging" /\ ~retried /\ retried' = TRUE /\ inFlight' = inFlight + 1
         /\ UNCHANGED <<status, charges, refunded, shipped, cancelled>>

Webhook == inFlight > 0 /\ inFlight' = inFlight - 1 /\ charges' = charges + 1 /\ status' = "paid"
           /\ UNCHANGED <<refunded, shipped, cancelled, retried>>

Ship == status = "paid" /\ status' = "shipped" /\ shipped' = TRUE
        /\ UNCHANGED <<inFlight, charges, refunded, cancelled, retried>>

Cancel == status # "cancelled" /\ status' = "cancelled" /\ cancelled' = TRUE
          /\ refunded' = (refunded \/ status \in {"paid", "shipped"})
          /\ UNCHANGED <<inFlight, charges, shipped, retried>>

Done == inFlight = 0 /\ status \in {"shipped", "cancelled"} /\ UNCHANGED vars

Next == Pay \/ Retry \/ Webhook \/ Ship \/ Cancel \/ Done

NoDoubleCharge == charges <= 1
NoRefundAfterShip == ~(refunded /\ shipped)
NoPaidWhileCancelled == cancelled => status = "cancelled"
====
