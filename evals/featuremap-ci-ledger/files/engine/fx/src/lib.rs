use journal::Amount;

pub struct Rate {
    pub from: [u8; 3],
    pub to: [u8; 3],
    pub micros: i64,
}

pub fn convert(amount: Amount, rate: &Rate) -> Option<Amount> {
    if amount.currency != rate.from {
        return None;
    }
    Some(Amount { cents: amount.cents * rate.micros / 1_000_000, currency: rate.to })
}
