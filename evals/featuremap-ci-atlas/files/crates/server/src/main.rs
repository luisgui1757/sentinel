use tilecache::Cache;

fn main() {
    let mut cache = Cache::default();
    cache.put(3, 4, 5, vec![1, 2, 3]);
    let width = style::line_width(codec::encode(3, 4, 5));
    println!("{} tiles, line width {}", cache.len(), width);
}
