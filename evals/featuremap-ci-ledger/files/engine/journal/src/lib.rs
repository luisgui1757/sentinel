pub mod posting;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Amount {
    pub cents: i64,
    pub currency: [u8; 3],
}

impl Amount {
    pub fn new(cents: i64, currency: &str) -> Self {
        let mut code = [0; 3];
        code.copy_from_slice(&currency.as_bytes()[..3]);
        Amount { cents, currency: code }
    }
}
