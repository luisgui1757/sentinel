use std::collections::HashMap;

#[derive(Default)]
pub struct Cache {
    tiles: HashMap<u64, Vec<u8>>,
}

impl Cache {
    pub fn put(&mut self, z: u8, x: u32, y: u32, bytes: Vec<u8>) {
        self.tiles.insert(codec::encode(z, x, y), bytes);
    }

    pub fn len(&self) -> usize {
        self.tiles.len()
    }
}
