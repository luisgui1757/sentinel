pub fn encode(z: u8, x: u32, y: u32) -> u64 {
    ((z as u64) << 58) | ((x as u64) << 29) | y as u64
}

pub fn zoom(key: u64) -> u8 {
    (key >> 58) as u8
}
