"""
step5_upload_to_ragflow.py
==========================
Upload Markdown files vào RAGFlow KB và set metadata.

Usage:
    python scripts/step5_upload_to_ragflow.py --kb sop_kb
    python scripts/step5_upload_to_ragflow.py --kb forms_kb
    python scripts/step5_upload_to_ragflow.py --kb sop_kb --skip-parse  # chỉ upload, không trigger parse

Pipeline cho mỗi file:
    1. POST /api/v1/datasets/{kb_id}/documents (upload file)
    2. PUT /api/v1/datasets/{kb_id}/documents/{doc_id} (set metadata)
    3. POST /api/v1/datasets/{kb_id}/chunks (trigger parse + embedding)

Metadata được parse từ HTML comment footer trong file Markdown
(append bởi step2 và step3).
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests
from tenacity import retry, stop_after_attempt, wait_exponential
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent))
from common import PROJECT_ROOT, load_config, setup_logger

logger = setup_logger("step5_upload", "step5_upload.log")


# ============================================================
# METADATA PARSING từ HTML comments
# ============================================================

METADATA_COMMENT_PATTERN = re.compile(r"<!--\s*([a-z_]+):\s*(.+?)\s*-->")


def parse_metadata_footer(markdown_text: str) -> dict:
    """Parse metadata từ HTML comment footer (do step2/step3 ghi vào)."""
    meta = {}
    # Chỉ parse phần sau "---" cuối
    parts = markdown_text.rsplit("\n---\n", 1)
    if len(parts) < 2:
        return meta
    footer = parts[1]
    for match in METADATA_COMMENT_PATTERN.finditer(footer):
        key = match.group(1).strip()
        value = match.group(2).strip()
        meta[key] = value
    return meta


def strip_metadata_footer(markdown_text: str) -> str:
    """Xóa metadata footer trước khi upload (RAGFlow không cần thấy)."""
    parts = markdown_text.rsplit("\n---\n\n<!--", 1)
    if len(parts) == 2:
        return parts[0].rstrip()
    return markdown_text


# ============================================================
# RAGFLOW UPLOAD CLIENT
# ============================================================

class RAGFlowUploader:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.headers_json = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        # multipart upload không set Content-Type - requests tự handle
        self.headers_auth = {"Authorization": f"Bearer {api_key}"}

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=15), reraise=True)
    def upload_file(self, kb_id: str, filename: str, content) -> str:
        """
        Upload file vào KB. Returns document_id.
        
        Accepts:
          - content: str (sẽ encode UTF-8) cho .md
          - content: bytes (dùng trực tiếp) cho .pdf hoặc binary khác
        
        RAGFlow API: POST /api/v1/datasets/{kb_id}/documents
        Body: multipart form với "file" field.
        """
        url = f"{self.base_url}/api/v1/datasets/{kb_id}/documents"
        # Infer content_type từ extension
        ext = Path(filename).suffix.lower()
        content_type_map = {
            ".md": "text/markdown",
            ".txt": "text/plain",
            ".pdf": "application/pdf",
            ".html": "text/html",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
        content_type = content_type_map.get(ext, "application/octet-stream")

        # Convert str → bytes nếu cần
        if isinstance(content, str):
            content_bytes = content.encode("utf-8")
        else:
            content_bytes = content

        files = {"file": (filename, content_bytes, content_type)}
        r = requests.post(url, headers=self.headers_auth, files=files, timeout=120)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Upload failed: {data}")
        # data["data"] có thể là list hoặc dict tùy version
        doc_data = data["data"]
        if isinstance(doc_data, list):
            doc_data = doc_data[0]
        return doc_data["id"]

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=15), reraise=True)
    def update_document_meta(self, kb_id: str, doc_id: str, meta: dict) -> None:
        """
        Set metadata cho document.
        
        RAGFlow API: PUT /api/v1/datasets/{kb_id}/documents/{doc_id}
        Body: {"meta_fields": {...}}
        """
        url = f"{self.base_url}/api/v1/datasets/{kb_id}/documents/{doc_id}"
        payload = {"meta_fields": meta}
        r = requests.put(url, headers=self.headers_json, json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Update meta failed: {data}")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=15), reraise=True)
    def trigger_parse(self, kb_id: str, doc_ids: list[str]) -> None:
        """
        Trigger parse + embedding cho documents.
        
        RAGFlow API: POST /api/v1/datasets/{kb_id}/chunks
        Body: {"document_ids": [...]}
        """
        url = f"{self.base_url}/api/v1/datasets/{kb_id}/chunks"
        payload = {"document_ids": doc_ids}
        r = requests.post(url, headers=self.headers_json, json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Trigger parse failed: {data}")


# ============================================================
# METADATA NORMALIZATION
# ============================================================

def build_meta_for_kb(kb_name: str, parsed_meta: dict) -> dict:
    """
    Convert parsed metadata (from HTML comments) → meta_fields cho RAGFlow.
    Schema khác nhau cho mỗi KB.
    """
    if kb_name == "sop_kb":
        return {
            "process_code": parsed_meta.get("process_code", ""),
            "process_name": parsed_meta.get("process_name", ""),
            "department": parsed_meta.get("department", ""),
            "source_url": parsed_meta.get("source_url", ""),
            "source_file_id": parsed_meta.get("source_file_id", ""),
        }
    elif kb_name == "forms_kb":
        return {
            "form_code": parsed_meta.get("form_code", ""),
            "department": parsed_meta.get("department", ""),
            "process_code": parsed_meta.get("process_code", ""),
            "process_name": parsed_meta.get("process_name", ""),
            "download_url": parsed_meta.get("download_url", ""),
            "file_format": parsed_meta.get("file_format", ""),
            "file_size_kb": parsed_meta.get("file_size_kb", ""),
            "last_modified": parsed_meta.get("last_modified", ""),
            "source_file_id": parsed_meta.get("source_file_id", ""),
        }
    else:
        return parsed_meta


# ============================================================
# FILE COLLECTION HELPERS
# ============================================================

def collect_files_by_format(source_dir: Path, fmt: str) -> list[Path]:
    """
    Collect files theo format.
    fmt: "md" | "pdf" | "both"
    
    Khi "both": ưu tiên PDF nếu có cả 2, fallback sang MD.
    Lý do: PDF là "official format" hơn cho chunking doc-based, và đã chứa
    cả content + metadata (preserved bởi step3_5). Upload cả 2 sẽ gây duplicate.
    """
    md_files = sorted(source_dir.glob("*.md"))
    pdf_files = sorted(source_dir.glob("*.pdf"))

    if fmt == "md":
        return md_files
    if fmt == "pdf":
        return pdf_files
    if fmt == "both":
        # Prefer PDF if exists, else MD
        pdf_stems = {p.stem for p in pdf_files}
        result = list(pdf_files)
        for md in md_files:
            if md.stem not in pdf_stems:
                result.append(md)
        return sorted(result)
    raise ValueError(f"Unknown format: {fmt}")


def load_file_content_and_metadata(file_path: Path) -> tuple:
    """
    Load content + metadata.
    
    Cho .md: parse HTML comments ở footer → metadata dict
    Cho .pdf: đọc binary bytes, metadata được parse từ .md sibling (cùng stem)
              nếu tồn tại, fallback empty dict.
    
    Returns: (content_for_upload, metadata_dict)
      content_for_upload: str cho .md (stripped footer), bytes cho .pdf
    """
    ext = file_path.suffix.lower()

    if ext == ".md":
        content_full = file_path.read_text(encoding="utf-8")
        meta = parse_metadata_footer(content_full)
        content_clean = strip_metadata_footer(content_full)
        return content_clean, meta

    if ext == ".pdf":
        content_bytes = file_path.read_bytes()
        # Parse metadata từ .md sibling nếu có
        md_sibling = file_path.with_suffix(".md")
        meta = {}
        if md_sibling.exists():
            md_text = md_sibling.read_text(encoding="utf-8")
            meta = parse_metadata_footer(md_text)
        return content_bytes, meta

    raise ValueError(f"Unsupported extension: {ext}")


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--kb",
        required=True,
        choices=["sop_kb", "forms_kb", "general_kb", "documents_kb"],
    )
    parser.add_argument(
        "--format",
        choices=["md", "pdf", "both"],
        default="md",
        help="Upload .md, .pdf, hoặc both (PDF sẽ được ưu tiên nếu có cả 2)",
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--skip-parse", action="store_true", help="Upload only, don't trigger parse")
    parser.add_argument("--config", default=None)
    args = parser.parse_args()

    config = load_config(args.config)
    ragflow_config = config["ragflow"]
    kb_ids_path = Path(config["paths"]["kb_ids_file"])
    if not kb_ids_path.is_absolute():
        kb_ids_path = PROJECT_ROOT / kb_ids_path

    if not kb_ids_path.exists():
        logger.error(f"kb_ids.json không tồn tại: {kb_ids_path}")
        logger.error("Hãy chạy step4_create_kbs.py trước.")
        sys.exit(1)
    kb_ids = json.loads(kb_ids_path.read_text(encoding="utf-8"))
    if args.kb not in kb_ids:
        logger.error(f"KB {args.kb} chưa được tạo. Có sẵn: {list(kb_ids.keys())}")
        sys.exit(1)
    kb_id = kb_ids[args.kb]

    # Determine source dir
    if args.kb == "sop_kb":
        source_dir = Path(config["paths"]["sop_md_dir"])
    elif args.kb == "forms_kb":
        source_dir = Path(config["paths"]["forms_md_dir"])
    else:
        logger.error(f"Pipeline chưa hỗ trợ {args.kb}. Chỉ sop_kb và forms_kb.")
        sys.exit(1)
    if not source_dir.is_absolute():
        source_dir = PROJECT_ROOT / source_dir

    if not source_dir.exists():
        logger.error(f"Source dir không tồn tại: {source_dir}")
        sys.exit(1)

    # Collect files
    files = collect_files_by_format(source_dir, args.format)
    if args.limit:
        files = files[: args.limit]

    # Break down by format for logging
    md_count = sum(1 for f in files if f.suffix.lower() == ".md")
    pdf_count = sum(1 for f in files if f.suffix.lower() == ".pdf")
    logger.info(f"Tìm thấy {len(files)} files trong {source_dir}")
    logger.info(f"  .md:  {md_count}")
    logger.info(f"  .pdf: {pdf_count}")

    if not files:
        logger.warning(
            f"Không có file nào với format={args.format} để upload.\n"
            f"Nếu muốn upload PDF: chạy step3_5_md_to_pdf.py trước.\n"
            f"Nếu muốn upload MD: chạy step2/step3 trước."
        )
        return

    uploader = RAGFlowUploader(ragflow_config["api_url"], ragflow_config["api_key"])
    uploaded_doc_ids = []
    failed_files = []

    for file_path in tqdm(files, desc=f"Uploading {args.format} → {args.kb}"):
        try:
            content, parsed_meta = load_file_content_and_metadata(file_path)

            # Upload
            doc_id = uploader.upload_file(kb_id, file_path.name, content)
            uploaded_doc_ids.append(doc_id)

            # Set metadata (chỉ khi có metadata parsed)
            if parsed_meta:
                meta_fields = build_meta_for_kb(args.kb, parsed_meta)
                try:
                    uploader.update_document_meta(kb_id, doc_id, meta_fields)
                except Exception as e:
                    logger.warning(f"⚠ Set metadata failed cho {file_path.name}: {e}")
            else:
                logger.debug(f"No metadata for {file_path.name}, skip meta update")

        except Exception as e:
            logger.error(f"✗ Upload failed {file_path.name}: {e}")
            failed_files.append(file_path.name)

        time.sleep(0.2)  # gentle rate limit

    logger.info(f"✓ Uploaded {len(uploaded_doc_ids)}/{len(files)} documents")

    # Trigger parse
    if uploaded_doc_ids and not args.skip_parse:
        logger.info(f"Triggering parse cho {len(uploaded_doc_ids)} documents...")
        # Batch theo nhóm 20 để tránh timeout
        BATCH_SIZE = 20
        for i in range(0, len(uploaded_doc_ids), BATCH_SIZE):
            batch = uploaded_doc_ids[i : i + BATCH_SIZE]
            try:
                uploader.trigger_parse(kb_id, batch)
                logger.info(f"  Batch {i//BATCH_SIZE + 1}: queued {len(batch)} docs")
            except Exception as e:
                logger.error(f"  Batch {i//BATCH_SIZE + 1} failed: {e}")
            time.sleep(1)
        logger.info("✓ Parse triggered. RAGFlow sẽ chunk + embed background.")
        logger.info("  Monitor progress: RAGFlow UI → Knowledge Base")

    # Summary
    logger.info("=" * 60)
    logger.info(f"UPLOAD SUMMARY ({args.kb}, format={args.format})")
    logger.info("=" * 60)
    logger.info(f"Success: {len(uploaded_doc_ids)}")
    logger.info(f"Failed:  {len(failed_files)}")
    if failed_files:
        logger.info("Failed files:")
        for f in failed_files[:10]:
            logger.info(f"  - {f}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
