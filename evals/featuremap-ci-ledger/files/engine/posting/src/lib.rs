use journal::posting::{balanced, Line};

#[derive(Debug)]
pub enum Error {
    Unbalanced,
    Empty,
}

pub fn post(lines: Vec<Line>) -> Result<Vec<Line>, Error> {
    if lines.is_empty() {
        return Err(Error::Empty);
    }
    if !balanced(&lines) {
        return Err(Error::Unbalanced);
    }
    Ok(lines)
}
