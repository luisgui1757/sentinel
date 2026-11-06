use crate::Amount;

#[derive(Clone, Debug)]
pub struct Line {
    pub account: u64,
    pub amount: Amount,
}

pub fn balanced(lines: &[Line]) -> bool {
    lines.iter().map(|l| l.amount.cents).sum::<i64>() == 0
}
