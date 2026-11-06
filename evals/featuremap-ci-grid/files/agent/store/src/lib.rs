use stats::Counter;
use wire::Frame;

#[derive(Default)]
pub struct Store {
    frames: Vec<Frame>,
    writes: Counter,
}

impl Store {
    pub fn put(&mut self, frame: Frame) {
        self.writes.add(1);
        self.frames.push(frame);
    }

    pub fn total_wh(&self) -> u64 {
        self.frames.iter().map(|f| f.wh).sum()
    }
}
