pub fn line_width(key: u64) -> f32 {
    1.0 + codec::zoom(key) as f32 * 0.25
}
