#[derive(Default)]
pub struct Counter {
    value: u64,
}

impl Counter {
    pub fn add(&mut self, n: u64) {
        self.value += n;
    }

    pub fn get(&self) -> u64 {
        self.value
    }
}
