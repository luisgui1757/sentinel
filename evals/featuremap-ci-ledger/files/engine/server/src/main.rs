use fx::Rate;
use journal::{posting::Line, Amount};

fn main() {
    let usd = Amount::new(10_000, "USD");
    let rate = Rate { from: *b"USD", to: *b"EUR", micros: 920_000 };
    let eur = fx::convert(usd, &rate).expect("rate matches");
    let lines = vec![
        Line { account: 1, amount: eur },
        Line { account: 2, amount: Amount { cents: -eur.cents, currency: eur.currency } },
    ];
    match posting::post(lines) {
        Ok(posted) => println!("posted {} lines", posted.len()),
        Err(error) => eprintln!("rejected: {error:?}"),
    }
}
