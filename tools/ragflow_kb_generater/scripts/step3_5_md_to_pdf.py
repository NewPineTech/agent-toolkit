"""
step3_5_md_to_pdf.py
====================
(Optional) Convert tất cả .md → .pdf trong data/sop_md/ và data/forms_md/.

LƯU Ý:
- Metadata HTML comment ở cuối .md (do step2/3 ghi) sẽ được PRESERVE trong PDF 
  dưới dạng text ẩn cuối trang (không render visible) để step5 vẫn parse được.
- Font tiếng Việt: dùng CSS @font-face với Google Fonts Noto Sans (render đẹp, Unicode full).
- Page size A4, margin 2cm, header có tên file, footer có số trang.

Usage:
    python scripts/step3_5_md_to_pdf.py                 # convert cả sop_md + forms_md
    python scripts/step3_5_md_to_pdf.py --source sop    # chỉ sop_md
    python scripts/step3_5_md_to_pdf.py --source forms  # chỉ forms_md
    python scripts/step3_5_md_to_pdf.py --resume        # skip files đã có .pdf
    python scripts/step3_5_md_to_pdf.py --limit 5       # test 5 file đầu
"""

import argparse
import re
import sys
from pathlib import Path

import markdown
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent))
from common import PROJECT_ROOT, load_config, setup_logger

logger = setup_logger("step3_5_md_to_pdf", "step3_5_md_to_pdf.log")


# ============================================================
# HTML TEMPLATE CHO PDF
# ============================================================

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
@page {{
    size: A4;
    margin: 2cm 1.8cm 2cm 1.8cm;
    @top-right {{
        content: "{title}";
        font-size: 9pt;
        color: #666;
    }}
    @bottom-right {{
        content: "Trang " counter(page) " / " counter(pages);
        font-size: 9pt;
        color: #666;
    }}
}}

body {{
    font-family: "DejaVu Sans", "Noto Sans", "Arial", sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #222;
}}

h1 {{
    font-size: 20pt;
    color: #1a4480;
    border-bottom: 2px solid #1a4480;
    padding-bottom: 6px;
    margin-top: 0;
    page-break-after: avoid;
}}

h2 {{
    font-size: 15pt;
    color: #2c5aa0;
    margin-top: 24pt;
    page-break-after: avoid;
}}

h3 {{
    font-size: 12pt;
    color: #333;
    background: #f0f4fa;
    padding: 4px 8px;
    border-left: 3px solid #2c5aa0;
    page-break-after: avoid;
}}

p {{
    margin: 6pt 0;
    text-align: justify;
}}

ul, ol {{
    margin: 6pt 0;
    padding-left: 20pt;
}}

li {{
    margin: 3pt 0;
}}

strong {{
    color: #000;
}}

code {{
    background: #f4f4f4;
    padding: 1px 4px;
    font-family: "DejaVu Sans Mono", "Courier New", monospace;
    font-size: 10pt;
    border-radius: 2px;
}}

table {{
    border-collapse: collapse;
    width: 100%;
    margin: 8pt 0;
}}

th, td {{
    border: 1px solid #ccc;
    padding: 5pt 8pt;
    text-align: left;
}}

th {{
    background: #f0f4fa;
    font-weight: bold;
}}

hr {{
    border: none;
    border-top: 1px solid #ddd;
    margin: 18pt 0;
}}

/* Metadata footer - giữ invisible ở cuối document để step5 parse được */
.metadata-footer {{
    font-size: 7pt;
    color: #aaa;
    margin-top: 30pt;
    padding-top: 8pt;
    border-top: 1px dashed #ddd;
    font-family: monospace;
    page-break-before: auto;
}}

a {{
    color: #2c5aa0;
    text-decoration: none;
}}

a:hover {{
    text-decoration: underline;
}}

blockquote {{
    border-left: 3px solid #ccc;
    margin: 8pt 0;
    padding: 4pt 12pt;
    color: #555;
    background: #fafafa;
}}
</style>
</head>
<body>
{content_html}
{metadata_footer_html}
</body>
</html>
"""


# ============================================================
# METADATA EXTRACTION (phải preserve trong PDF để step5 parse)
# ============================================================

METADATA_COMMENT_PATTERN = re.compile(r"<!--\s*([a-z_]+):\s*(.+?)\s*-->")


def split_content_and_metadata(md_text: str) -> tuple[str, dict]:
    """Tách phần content Markdown và metadata comments ở cuối."""
    parts = md_text.rsplit("\n---\n\n<!--", 1)
    if len(parts) == 2:
        # Có footer metadata - rebuild full footer
        content = parts[0].rstrip()
        footer = "<!--" + parts[1]
        meta = dict(METADATA_COMMENT_PATTERN.findall(footer))
        return content, meta
    # Thử rsplit "---" đơn giản hơn
    parts = md_text.rsplit("\n---\n", 1)
    if len(parts) == 2 and "<!--" in parts[1]:
        content = parts[0].rstrip()
        meta = dict(METADATA_COMMENT_PATTERN.findall(parts[1]))
        return content, meta
    return md_text, {}


def render_metadata_footer_html(meta: dict) -> str:
    """Render metadata thành HTML div (visible but small) để preserve info trong PDF."""
    if not meta:
        return ""
    lines = ["<div class='metadata-footer'>", "<strong>Metadata:</strong><br>"]
    for k, v in meta.items():
        # HTML-escape values
        v_escaped = (
            str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        )
        lines.append(f"{k}: {v_escaped}<br>")
    lines.append("</div>")
    return "\n".join(lines)


# ============================================================
# MARKDOWN → HTML → PDF
# ============================================================

def md_to_html(md_content: str) -> str:
    """Convert Markdown → HTML dùng python-markdown với extensions."""
    html = markdown.markdown(
        md_content,
        extensions=[
            "extra",          # tables, fenced_code, footnotes
            "sane_lists",
            "toc",
            "nl2br",
        ],
        output_format="html5",
    )
    return html


def html_to_pdf(html_text: str, output_path: Path) -> None:
    """Convert HTML → PDF dùng WeasyPrint."""
    from weasyprint import HTML

    HTML(string=html_text, encoding="utf-8").write_pdf(
        str(output_path),
        # PDF metadata
        metadata={
            "title": output_path.stem,
            "creator": "RAGFlow Ingest Pipeline",
        },
    )


def extract_title(md_content: str, fallback: str) -> str:
    """Extract H1 title từ Markdown, fallback = filename."""
    m = re.search(r"^# (.+?)$", md_content, re.MULTILINE)
    if m:
        return m.group(1).strip()
    return fallback


def convert_one_file(md_path: Path, resume: bool = False) -> dict:
    """Convert 1 file .md → .pdf. Returns log dict."""
    pdf_path = md_path.with_suffix(".pdf")
    log = {
        "md_file": md_path.name,
        "pdf_file": pdf_path.name,
        "status": "",
        "error": "",
    }

    if resume and pdf_path.exists():
        log["status"] = "skipped_exists"
        return log

    try:
        md_content = md_path.read_text(encoding="utf-8")
        content_md, meta = split_content_and_metadata(md_content)

        # Convert
        content_html = md_to_html(content_md)
        meta_html = render_metadata_footer_html(meta)
        title = extract_title(content_md, md_path.stem)

        full_html = HTML_TEMPLATE.format(
            title=title,
            content_html=content_html,
            metadata_footer_html=meta_html,
        )

        html_to_pdf(full_html, pdf_path)
        log["status"] = "success"

    except Exception as e:
        log["status"] = "error"
        log["error"] = str(e)[:500]
        logger.error(f"✗ {md_path.name}: {e}")

    return log


# ============================================================
# MAIN
# ============================================================

def collect_md_files(config: dict, source: str) -> list[Path]:
    """Thu thập .md files từ sop_md_dir và/hoặc forms_md_dir."""
    files = []
    if source in ("all", "sop"):
        sop_dir = Path(config["paths"]["sop_md_dir"])
        if not sop_dir.is_absolute():
            sop_dir = PROJECT_ROOT / sop_dir
        if sop_dir.exists():
            sop_files = sorted(sop_dir.glob("*.md"))
            files.extend(sop_files)
            logger.info(f"  sop_md: {len(sop_files)} files")
    if source in ("all", "forms"):
        forms_dir = Path(config["paths"]["forms_md_dir"])
        if not forms_dir.is_absolute():
            forms_dir = PROJECT_ROOT / forms_dir
        if forms_dir.exists():
            forms_files = sorted(forms_dir.glob("*.md"))
            files.extend(forms_files)
            logger.info(f"  forms_md: {len(forms_files)} files")
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        choices=["all", "sop", "forms"],
        default="all",
        help="Convert từ source nào",
    )
    parser.add_argument("--resume", action="store_true", help="Skip files đã có .pdf")
    parser.add_argument("--limit", type=int, default=None, help="Test với N file đầu")
    parser.add_argument("--config", default=None)
    args = parser.parse_args()

    config = load_config(args.config)
    logger.info(f"Collecting .md files (source={args.source})...")
    files = collect_md_files(config, args.source)
    logger.info(f"Total: {len(files)} .md files")

    if args.limit:
        files = files[: args.limit]
        logger.info(f"Limit mode: {len(files)} files")

    if not files:
        logger.warning("Không có file .md nào để convert.")
        logger.warning("Hãy chạy step2_ocr_sop.py và step3_form_cards.py trước.")
        return

    # Verify WeasyPrint available
    try:
        from weasyprint import HTML  # noqa: F401
    except (ImportError, OSError) as e:
        logger.error("WeasyPrint chưa cài. Chạy: pip install weasyprint markdown")
        logger.error(f"Chi tiết: {e}")
        logger.error("")
        logger.error("Lưu ý với macOS: WeasyPrint cần thêm system deps:")
        logger.error("  brew install pango libffi cairo gdk-pixbuf")
        sys.exit(1)

    # Process
    logs = []
    for md_path in tqdm(files, desc="Converting .md → .pdf"):
        log = convert_one_file(md_path, resume=args.resume)
        logs.append(log)

    # Summary
    by_status = {}
    for l in logs:
        by_status[l["status"]] = by_status.get(l["status"], 0) + 1
    logger.info("=" * 60)
    logger.info("MD → PDF CONVERSION SUMMARY")
    logger.info("=" * 60)
    for s, c in sorted(by_status.items()):
        logger.info(f"  {s}: {c}")
    logger.info("=" * 60)

    if by_status.get("success", 0) > 0:
        logger.info("👉 NEXT: Upload PDF thay vì MD (hoặc cả hai):")
        logger.info("    python scripts/step5_upload_to_ragflow.py --kb sop_kb --format pdf")
        logger.info("    python scripts/step5_upload_to_ragflow.py --kb forms_kb --format pdf")


if __name__ == "__main__":
    main()
