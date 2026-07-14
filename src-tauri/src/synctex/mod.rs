use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncTeXRecord {
    pub page: u32,
    pub x: f64,
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

    let mut records = Vec::new();
    let mut page = 0u32;

    for line in content.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() < 2 {
            continue;
        }

        match parts[0] {
            "Input" => {
                if parts.len() >= 4 {
                    let _tag = parts[1].parse::<u32>().unwrap_or(0);
                    let _file = parts[3].to_string();
                    // Store input mapping
                }
            }
            "Page" if parts.len() >= 2 => {
                page = parts[1].parse().unwrap_or(0);
            }
            _ => {
                let re = line;
                if let Some(pos) = re.find(',') {
                    let xy = &re[1..pos];
                    let rest = &re[pos + 1..];

                    if let Some(next_comma) = rest.find(':') {
                        let _file_tag = &rest[..next_comma];
                        let rest2 = &rest[next_comma + 1..];
                        let parts: Vec<&str> = xy.split(',').collect();
                        if parts.len() == 2 {
                            let x = parts[0].parse::<f64>().unwrap_or(0.0);
                            let y = parts[1].parse::<f64>().unwrap_or(0.0);

                            // Parse line:column from rest2
                            let lc: Vec<&str> = rest2.split(',').collect();
                            if lc.len() >= 2 {
                                let line_num = lc[0].parse::<u32>().unwrap_or(0);
                                let col = lc.get(1).and_then(|s| s.trim().parse().ok()).unwrap_or(0);

                                records.push(SyncTeXRecord {
                                    page,
                                    x,
                                    y,
                                    file: tex_file.to_string_lossy().to_string(),
                                    line: line_num,
                                    column: col,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(SyncTeXResult {
        forward: records.clone(),
        inverse: records,
    })
}

pub fn find_line_for_page(
    records: &[SyncTeXRecord],
    page: u32,
    _x: f64,
    _y: f64,
) -> Option<(String, u32)> {
    records
        .iter()
        .find(|r| r.page == page)
        .map(|r| (r.file.clone(), r.line))
}

pub fn find_page_for_line(
    records: &[SyncTeXRecord],
    file: &str,
    line: u32,
) -> Option<u32> {
    records
        .iter()
        .find(|r| r.file.contains(file) && r.line <= line && r.line >= line.saturating_sub(5))
        .map(|r| r.page)
}
