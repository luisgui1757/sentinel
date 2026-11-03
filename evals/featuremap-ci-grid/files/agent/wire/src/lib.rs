pub struct Frame {
    pub meter: String,
    pub wh: u64,
}

pub fn decode(line: &str) -> Option<Frame> {
    let (meter, wh) = line.split_once(',')?;
    Some(Frame { meter: meter.to_string(), wh: wh.trim().parse().ok()? })
}
