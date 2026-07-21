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
    // pdflatex puts the line number inside the warning itself, e.g.
    //   LaTeX Warning: Citation `foo' on page 1 undefined on input line 42.
    // Without this every such warning was reported at line 0, so clicking the
    // Issues row jumped to the top of the file instead of the citation.
    let input_line_re = Regex::new(r"on input line (\d+)").unwrap();
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

            // Prefer the line the message states; a warning that names its own
            // line is more reliable than guessing from the following line.
            if let Some(ilc) = input_line_re.captures(&message) {
                warn_line = ilc[1].parse().unwrap_or(0);
            }

            if warn_line == 0 {
                if let Some(next) = lines.next() {
                    if let Some(flc) = file_line_re.captures(next) {
                        warn_file = flc[1].to_string();
                        warn_line = flc[2].parse().unwrap_or(0);
                    }
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

#[cfg(test)]
mod tests {
    use super::*;

    /// pdflatex states the line inside the warning text. Reading only the
    /// following line left every such warning at 0, so the Issues row jumped
    /// to the top of the file rather than to the citation.
    #[test]
    fn a_warning_naming_its_own_line_is_located() {
        let log = "LaTeX Warning: Citation `mcmahan2017' on page 1 undefined on input line 42.\n";
        let parsed = parse_log(log, "paper.tex");
        assert_eq!(parsed.warnings.len(), 1);
        assert_eq!(parsed.warnings[0].line, 42);
    }

    #[test]
    fn an_undefined_reference_is_located_too() {
        let log = "LaTeX Warning: Reference `sec:method' on page 3 undefined on input line 118.\n";
        let parsed = parse_log(log, "paper.tex");
        assert_eq!(parsed.warnings[0].line, 118);
    }

    /// Warnings with no line at all still parse; they simply have none.
    #[test]
    fn a_warning_without_a_line_stays_at_zero() {
        let log = "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.\n";
        let parsed = parse_log(log, "paper.tex");
        assert_eq!(parsed.warnings.len(), 1);
        assert_eq!(parsed.warnings[0].line, 0);
    }

    #[test]
    fn badboxes_keep_their_line_range() {
        let log = "Overfull \\hbox (18.9pt too wide) in paragraph at lines 139--141\n";
        let parsed = parse_log(log, "paper.tex");
        assert_eq!(parsed.badboxes.len(), 1);
        assert_eq!(parsed.badboxes[0].line, 139);
    }
}
