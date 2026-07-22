//! SyncTeX: mapping between source positions and places on the page.
//!
//! The file pdflatex writes with `-synctex=1` is a gzipped text format:
//!
//! ```text
//! Input:1:/path/to/main.tex        tag -> file
//! Input:5:/path/to/sections/a.tex
//! Content:
//! {1                               page 1 begins
//! [1,6:4736286,46220574:...        record: tag 1, line 6, at x,y
//! (5,1:8799518,10300473:...        record: tag 5, line 1, at x,y
//! }1                               page 1 ends
//! ```
//!
//! Every body record starts with a type character (`[ ( h v x k g $`), then
//! `tag,line`, then `:x,y`. Coordinates are in scaled points from the
//! top-left of the page, 65536 sp to the point.
//!
//! An earlier version of this module looked for a `Page:` key the format does
//! not contain, read the tag where the x coordinate is, and ignored the
//! `Input:` table entirely — so it reported every hit as line 0 of the root
//! file. It had never run: the compiler was not passing `-synctex=1`, so no
//! file was produced to parse.

use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;

/// Scaled points per TeX point.
const SP_PER_PT: f64 = 65536.0;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncTeXRecord {
    pub page: u32,
    /// Horizontal position in PDF points from the left edge.
    pub x: f64,
    /// Vertical position in PDF points from the *top* edge.
    pub y: f64,
    pub file: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncTeXResult {
    pub forward: Vec<SyncTeXRecord>,
    pub inverse: Vec<SyncTeXRecord>,
}

/// Pull the records out of an already-decompressed synctex body.
///
/// Separated from the file handling so it can be tested against a literal
/// sample without writing a gzip to disk.
pub fn parse_synctex_content(content: &str) -> Vec<SyncTeXRecord> {
    let mut inputs: HashMap<u32, String> = HashMap::new();
    let mut records = Vec::new();
    let mut page = 0u32;

    for raw in content.lines() {
        // Input:tag:path — a path may itself contain colons, so split once.
        if let Some(rest) = raw.strip_prefix("Input:") {
            if let Some((tag, path)) = rest.split_once(':') {
                if let Ok(tag) = tag.parse::<u32>() {
                    inputs.insert(tag, normalise(path));
                }
            }
            continue;
        }

        // {N and }N delimit a page.
        if let Some(n) = raw.strip_prefix('{') {
            page = n.trim().parse().unwrap_or(page);
            continue;
        }
        if raw.starts_with('}') {
            continue;
        }

        if let Some(record) = parse_body_record(raw, page, &inputs) {
            records.push(record);
        }
    }

    records
}

/// `TYPE tag,line:x,y[:...]` — None for anything that is not a positioned
/// record, which is most of the file.
fn parse_body_record(
    raw: &str,
    page: u32,
    inputs: &HashMap<u32, String>,
) -> Option<SyncTeXRecord> {
    let kind = raw.chars().next()?;
    if !matches!(kind, '[' | '(' | 'h' | 'v' | 'x' | 'k' | 'g' | '$') {
        return None;
    }

    let body = &raw[kind.len_utf8()..];
    let (tag_line, rest) = body.split_once(':')?;
    let (tag, line) = tag_line.split_once(',')?;

    let tag: u32 = tag.trim().parse().ok()?;
    // Some records carry `line,column`; take the line and keep any column.
    let (line, column) = match line.split_once(',') {
        Some((l, c)) => (l, c.trim().parse().unwrap_or(0)),
        None => (line, 0),
    };
    let line: u32 = line.trim().parse().ok()?;

    // Coordinates are the next `x,y`, ahead of any width/height/depth.
    let xy = rest.split(':').next()?;
    let (x, y) = xy.split_once(',')?;
    let x: f64 = x.trim().parse().ok()?;
    let y: f64 = y.trim().parse().ok()?;

    // A record whose file we cannot name is no use for jumping.
    let file = inputs.get(&tag)?.clone();

    Some(SyncTeXRecord {
        page,
        x: x / SP_PER_PT,
        y: y / SP_PER_PT,
        file,
        line,
        column,
    })
}

/// pdflatex writes paths like `/tmp/x/./main.tex`; tidy the `./` so the result
/// compares equal to the path the editor holds.
fn normalise(path: &str) -> String {
    path.replace("/./", "/")
}

pub fn parse_synctex(tex_path: &str, output_dir: &str) -> Result<SyncTeXResult, String> {
    let tex_file = PathBuf::from(tex_path);
    let stem = tex_file.file_stem().unwrap_or_default().to_str().unwrap_or("");
    let synctex_path = PathBuf::from(output_dir).join(format!("{}.synctex.gz", stem));

    if !synctex_path.exists() {
        return Ok(SyncTeXResult {
            forward: vec![],
            inverse: vec![],
        });
    }

    let file = std::fs::File::open(&synctex_path)
        .map_err(|e| format!("Cannot open synctex: {}", e))?;
    let mut decoder = GzDecoder::new(file);
    let mut content = String::new();
    decoder
        .read_to_string(&mut content)
        .map_err(|e| format!("Cannot read synctex: {}", e))?;

    let records = parse_synctex_content(&content);
    Ok(SyncTeXResult {
        forward: records.clone(),
        inverse: records,
    })
}

/// PDF position -> source position, for click-to-source.
///
/// Returns the record on that page nearest the click. Distance favours
/// vertical proximity: a page is a column of lines, so the line meant is far
/// more likely to be the one at that height than one level with it across the
/// page.
pub fn find_line_for_page(
    records: &[SyncTeXRecord],
    page: u32,
    x: f64,
    y: f64,
) -> Option<(String, u32)> {
    records
        .iter()
        .filter(|r| r.page == page)
        .min_by(|a, b| {
            weighted_distance(a, x, y)
                .partial_cmp(&weighted_distance(b, x, y))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|r| (r.file.clone(), r.line))
}

fn weighted_distance(r: &SyncTeXRecord, x: f64, y: f64) -> f64 {
    let dx = r.x - x;
    let dy = r.y - y;
    // Vertical error counts for four times horizontal.
    dx * dx + 4.0 * dy * dy
}

/// Source position -> page, for forward search.
pub fn find_page_for_line(records: &[SyncTeXRecord], file: &str, line: u32) -> Option<u32> {
    records
        .iter()
        .filter(|r| r.file.ends_with(file) || file.ends_with(&r.file))
        .min_by_key(|r| r.line.abs_diff(line))
        .map(|r| r.page)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Trimmed from a real main.synctex.gz: main.tex with \input{sec}.
    const SAMPLE: &str = "SyncTeX Version:1\n\
        Input:1:/tmp/sx/./main.tex\n\
        Input:5:/tmp/sx/./sec.tex\n\
        Output:pdf\n\
        Magnification:1000\n\
        Content:\n\
        {1\n\
        [1,6:4736286,46220574:26673152,41484288,0\n\
        (1,3:8799518,8865054:22609920,655359,0\n\
        (5,1:8799518,10300473:22609920,455111,127431\n\
        }1\n";

    #[test]
    fn input_records_map_tags_to_files() {
        let records = parse_synctex_content(SAMPLE);
        assert!(records.iter().any(|r| r.file.ends_with("main.tex")));
        assert!(
            records.iter().any(|r| r.file.ends_with("sec.tex")),
            "tag 5 must resolve to the included file, not the root"
        );
    }

    /// The old parser read the tag where the x coordinate is, so every record
    /// came back as line 0.
    #[test]
    fn tag_and_line_are_not_confused_with_coordinates() {
        let records = parse_synctex_content(SAMPLE);
        let included = records.iter().find(|r| r.file.ends_with("sec.tex")).unwrap();
        assert_eq!(included.line, 1);
    }

    #[test]
    fn coordinates_are_converted_to_points() {
        let records = parse_synctex_content(SAMPLE);
        let r = records.iter().find(|r| r.file.ends_with("sec.tex")).unwrap();
        // 8799518 sp / 65536 = 134.3 pt; 10300473 / 65536 = 157.2 pt
        assert!((r.x - 134.27).abs() < 0.1, "x was {}", r.x);
        assert!((r.y - 157.17).abs() < 0.1, "y was {}", r.y);
    }

    /// `{1` opens the page. The old parser looked for a `Page:` key that does
    /// not exist, so every record was page 0.
    #[test]
    fn page_is_taken_from_the_brace_marker() {
        let records = parse_synctex_content(SAMPLE);
        assert!(!records.is_empty());
        assert!(records.iter().all(|r| r.page == 1));
    }

    /// A click should land on the nearest record, not the first on the page.
    #[test]
    fn inverse_search_picks_the_nearest_record() {
        let records = parse_synctex_content(SAMPLE);

        let (file, line) = find_line_for_page(&records, 1, 134.0, 157.0).unwrap();
        assert!(file.ends_with("sec.tex"), "got {}", file);
        assert_eq!(line, 1);

        let (file, line) = find_line_for_page(&records, 1, 134.0, 135.0).unwrap();
        assert!(file.ends_with("main.tex"), "got {}", file);
        assert_eq!(line, 3);
    }

    #[test]
    fn forward_search_finds_the_page() {
        let records = parse_synctex_content(SAMPLE);
        assert_eq!(find_page_for_line(&records, "sec.tex", 1), Some(1));
        assert_eq!(find_page_for_line(&records, "main.tex", 3), Some(1));
    }

    #[test]
    fn a_file_with_no_records_yields_nothing() {
        assert!(parse_synctex_content("SyncTeX Version:1\nInput:1:/a.tex\n").is_empty());
    }

    /// The `./` pdflatex inserts must not stop a path matching the editor's.
    #[test]
    fn paths_are_normalised() {
        assert_eq!(normalise("/tmp/x/./main.tex"), "/tmp/x/main.tex");
    }
}
