use metrics::Counter;
use store::Store;

fn main() {
    let mut store = Store::default();
    let mut lines = Counter::default();
    for line in ["m1,1500", "m2,700"] {
        lines.add(1);
        if let Some(frame) = wire::decode(line) {
            store.put(frame);
        }
    }
    println!("{} lines, {} Wh", lines.get(), store.total_wh());
}
