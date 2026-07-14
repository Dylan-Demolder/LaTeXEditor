use regex::Regex;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct LaTeXError {
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub message: String,
    pub severity: ErrorSeverity,
    pub context: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ErrorSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize)]
pub struct ParseResult {
    pub errors: Vec<LaTeXError>,
    pub warnings: Vec<LaTeXError>,
    pub badboxes: Vec<LaTeXError>,
}

pub fn parse_log(log_content: &str, main_tex: &str) -> ParseResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut badboxes = Vec::new();

    let error_re = Regex::new(r"! (.+)").unwrap();
    let line_re = Regex::new(r"l\.(\d+)\s*(.*)").unwrap();
    let warning_re =
        Regex::new(r"(?:LaTeX|Package|Class) (?:.+ )?[Ww]arning: (.+)").unwrap();
    let file_line_re =
        Regex::new(r"\(([^)]+)\)[^:]*:(\d+):").unwrap();
    let badbox_re = Regex::new(r"(Overfull|Underfull) \\[hv]box.*at lines (\d+)--(\d+)").unwrap();

    let mut lines = log_content.lines().peekable();

    while let Some(line) = lines.next() {

        if let Some(caps) = error_re.captures(line) {
            let message = caps[1].trim().to_string();
            let mut err_line = 0u32;
            let mut context = String::new();

            for _ in 0..5 {
                if let Some(next) = lines.next() {
                    if let Some(lc) = line_re.captures(next) {
                        err_line = lc[1].parse().unwrap_or(0);
                        context = lc[2].trim().to_string();
                    }
                    if next.trim().is_empty() {
                        break;
                    }
                }
            }

            errors.push(LaTeXError {
                file: main_tex.to_string(),
                line: err_line,
                column: 0,
                message,
                severity: ErrorSeverity::Error,
                context: Some(context),
            });
        }

        if let Some(caps) = warning_re.captures(line) {
            let message = caps[1].trim().to_string();
            let mut warn_line = 0u32;
            let mut warn_file = main_tex.to_string();

            if let Some(next) = lines.next() {
                if let Some(flc) = file_line_re.captures(next) {
                    warn_file = flc[1].to_string();
                    warn_line = flc[2].parse().unwrap_or(0);
                }
            }

            warnings.push(LaTeXError {
                file: warn_file,
                line: warn_line,
                column: 0,
                message,
                severity: ErrorSeverity::Warning,
                context: None,
            });
        }

        if let Some(caps) = badbox_re.captures(line) {
            let kind = caps[1].to_string();
            let start_line = caps[2].parse().unwrap_or(0);
            let end_line = caps[3].parse().unwrap_or(0);

            badboxes.push(LaTeXError {
                file: main_tex.to_string(),
                line: start_line,
                column: 0,
                message: format!("{} box at lines {}-{}", kind, start_line, end_line),
                severity: ErrorSeverity::Warning,
                context: None,
            });
        }
    }

    ParseResult {
        errors,
        warnings,
        badboxes,
    }
}
