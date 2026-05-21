"""
step2_ocr_sop.py
================
OCR ~70 file PNG lưu đồ → Markdown SOP có cấu trúc.

Input: data/inventory.csv (rows where target_kb == "sop_kb")
Output:
    - data/sop_md/{filename}.md (1 file Markdown / quy trình)
    - data/sop_extraction_log.csv (tracking confidence + status)

Pipeline cho mỗi PNG:
    1. Download PNG bytes từ Drive
    2. Resize nếu width > max_image_width (giảm chi phí VLM)
    3. Gọi Gemini VLM với prompt SOP
    4. Lưu Markdown output
    5. Parse confidence score từ output
    6. Flag low-confidence files để review

Usage:
    python scripts/step2_ocr_sop.py                # full
    python scripts/step2_ocr_sop.py --limit 5      # test với 5 file đầu
    python scripts/step2_ocr_sop.py --resume       # skip files đã xử lý
"""

import argparse
import asyncio
import csv
import io
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image
from tenacity import AsyncRetrying, retry, stop_after_attempt, wait_exponential
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent))
from common import (
    PROJECT_ROOT,
    gdrive_download_bytes,
    get_gdrive_client,
    load_config,
    safe_filename,
    setup_logger,
)

logger = setup_logger("step2_ocr_sop", "step2_ocr_sop.log")


# ============================================================
# VLM CALLERS
# ============================================================

def call_gemini_vlm(image_bytes: bytes, prompt: str, config: dict) -> str:
    """Gọi Gemini VLM với image + prompt."""
    import google.generativeai as genai

    genai.configure(api_key=config["vlm"]["api_key"])
    model = genai.GenerativeModel(config["vlm"]["model"])

    img = Image.open(io.BytesIO(image_bytes))
    response = model.generate_content(
        [prompt, img],
        generation_config={
            "temperature": 0.1,
            "max_output_tokens": 10000,
        },
    )
    return response.text


def call_openai_vlm(image_bytes: bytes, prompt: str, config: dict) -> str:
    """Gọi OpenAI GPT-4o với image + prompt (fallback option)."""
    import base64

    from openai import OpenAI

    client = OpenAI(api_key=config["vlm"]["api_key"])
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    response = client.chat.completions.create(
        model=config["vlm"]["model"],
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                    },
                ],
            }
        ],
        temperature=0.1,
        max_tokens=10000,
    )
    return response.choices[0].message.content


def call_claude_cli_vlm(image_bytes: bytes, prompt: str, config: dict) -> str:
    """Gọi Claude Code CLI (claude -p) với image + prompt."""
    model = config["vlm"].get("model", "claude-sonnet-4-6")
    max_turns = config["vlm"].get("max_turns", 1)
    timeout = config["vlm"].get("cli_timeout_seconds", 120)

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    try:
        tmp.write(image_bytes)
        tmp.close()

        cmd = [
            "claude",
            "-p", prompt,
            tmp.name,
            "--output-format", "text",
            "--model", model,
            "--max-turns", str(max_turns),
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        if result.returncode != 0:
            stderr = result.stderr.strip()[:500]
            raise RuntimeError(f"Claude CLI exited with code {result.returncode}: {stderr}")

        output = result.stdout.strip()
        if not output:
            raise RuntimeError("Claude CLI returned empty output")

        return output
    finally:
        Path(tmp.name).unlink(missing_ok=True)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=4, max=30),
    reraise=True,
)
def call_vlm(image_bytes: bytes, prompt: str, config: dict) -> str:
    """Dispatch theo provider, có retry."""
    provider = config["vlm"]["provider"].lower()
    if provider == "gemini":
        return call_gemini_vlm(image_bytes, prompt, config)
    elif provider == "openai":
        return call_openai_vlm(image_bytes, prompt, config)
    elif provider == "claude":
        return call_claude_cli_vlm(image_bytes, prompt, config)
    else:
        raise ValueError(f"Unknown VLM provider: {provider}")


# ============================================================
# GEMINI BATCH (ASYNC CONCURRENT)
# ============================================================

async def _gemini_ocr_one(
    model,
    image_bytes: bytes,
    prompt: str,
    semaphore: asyncio.Semaphore,
    index: int,
) -> tuple[int, str | None, str | None]:
    """Single async Gemini call with retry, rate-limited by semaphore."""
    async with semaphore:
        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=2, min=4, max=30),
                reraise=True,
            ):
                with attempt:
                    img = Image.open(io.BytesIO(image_bytes))
                    response = await model.generate_content_async(
                        [prompt, img],
                        generation_config={
                            "temperature": 0.1,
                            "max_output_tokens": 10000,
                        },
                    )
                    return (index, response.text, None)
        except Exception as e:
            return (index, None, str(e)[:500])


async def _run_gemini_batch(
    all_items: list[tuple[int, bytes]],
    prompt: str,
    config: dict,
    max_concurrency: int,
) -> dict[int, tuple[str | None, str | None]]:
    """
    Single event loop: init model once, process all items with semaphore concurrency.
    """
    import google.generativeai as genai

    genai.configure(api_key=config["vlm"]["api_key"])
    model = genai.GenerativeModel(config["vlm"]["model"])
    semaphore = asyncio.Semaphore(max_concurrency)

    tasks = [
        _gemini_ocr_one(model, image_bytes, prompt, semaphore, idx)
        for idx, image_bytes in all_items
    ]
    raw_results = await asyncio.gather(*tasks)
    return {idx: (text, err) for idx, text, err in raw_results}


# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def resize_if_large(image_bytes: bytes, max_width: int) -> bytes:
    """Resize ảnh nếu width vượt max_width. Giữ aspect ratio."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.width <= max_width:
        return image_bytes
    ratio = max_width / img.width
    new_size = (max_width, int(img.height * ratio))
    img_resized = img.resize(new_size, Image.LANCZOS)
    out = io.BytesIO()
    img_resized.save(out, format="PNG", optimize=True)
    return out.getvalue()


# ============================================================
# OUTPUT PARSING
# ============================================================

CONFIDENCE_PATTERN = re.compile(
    r"\*\*Confidence:\*\*\s*([1-5])",
    re.IGNORECASE,
)


def parse_confidence(markdown_output: str) -> int | None:
    """Extract confidence score (1-5) từ output Markdown."""
    m = CONFIDENCE_PATTERN.search(markdown_output)
    if m:
        return int(m.group(1))
    return None


def extract_process_name(markdown: str, file_record: dict) -> str:
    """Extract process name from OCR Markdown, fallback to filename stem."""
    h1_match = re.search(r"^#\s+(.+?)\s*$", markdown, re.MULTILINE)
    if h1_match:
        return h1_match.group(1).strip()
    return Path(file_record["file_name"]).stem


def build_source_metadata_block(markdown: str, file_record: dict) -> str:
    """Build form-style source metadata block for Markdown footer."""
    return (
        f"---\n\n"
        f"<!-- Source metadata (do not edit) -->\n"
        f"<!-- process_code: {file_record.get('process_code', '')} -->\n"
        f"<!-- process_name: {extract_process_name(markdown, file_record)} -->\n"
        f"<!-- department: {file_record['department']} -->\n"
        f"<!-- source_url: {file_record['web_view_link']} -->\n"
        f"<!-- file_format: {file_record.get('file_extension', '')} -->\n"
        f"<!-- file_size_kb: {file_record.get('file_size_kb', '')} -->\n"
        f"<!-- last_modified: {file_record.get('modified_time', '')} -->\n"
        f"<!-- source_file_id: {file_record['file_id']} -->\n"
        f"<!-- source_file_name: {file_record['file_name']} -->\n"
        f"<!-- full_path: {file_record['full_path']} -->\n"
    )


def add_origin_link_to_document_info(markdown: str, source_url: str) -> str:
    """Add visible origin URL to [THÔNG TIN TÀI LIỆU] for RAGFlow chunks."""
    if re.search(r"^Link file gốc:\s*", markdown, re.MULTILINE):
        return markdown

    section_marker = "[THÔNG TIN TÀI LIỆU]"
    if section_marker in markdown:
        return markdown.replace(
            section_marker,
            f"{section_marker}\nLink file gốc: {source_url}",
            1,
        )

    return f"---\n{section_marker}\nLink file gốc: {source_url}\n---\n\n{markdown.lstrip()}"


def append_source_metadata(markdown: str, file_record: dict) -> str:
    """Add visible origin link and append parseable metadata footer."""
    markdown = add_origin_link_to_document_info(markdown, file_record["web_view_link"])
    metadata = build_source_metadata_block(markdown, file_record)
    return f"{markdown.rstrip()}\n\n{metadata}"


# ============================================================
# MAIN PIPELINE
# ============================================================

def load_sop_files_from_inventory(inventory_path: Path) -> list[dict]:
    """Load rows từ inventory.csv where target_kb == sop_kb và is_duplicate == no."""
    rows = []
    with open(inventory_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["target_kb"] == "sop_kb" and row["is_duplicate"] != "yes":
                rows.append(row)
    return rows


def _make_log(file_record: dict) -> dict:
    return {
        "file_id": file_record["file_id"],
        "file_name": file_record["file_name"],
        "department": file_record["department"],
        "status": "",
        "confidence": "",
        "output_path": "",
        "error": "",
    }


def _validate_and_save(
    markdown: str, file_record: dict, output_dir: Path, log: dict,
) -> dict:
    """Validate VLM output, append metadata, write .md file."""
    file_name = file_record["file_name"]
    confidence = parse_confidence(markdown)
    log["confidence"] = str(confidence) if confidence else "unknown"

    if len(markdown) < 200:
        log["status"] = "warning_short_output"
        logger.warning(f"⚠ {file_name}: output rất ngắn ({len(markdown)} chars)")
    elif confidence is None:
        log["status"] = "warning_no_confidence"
        logger.warning(f"⚠ {file_name}: VLM không trả confidence score")
    elif confidence <= 2:
        log["status"] = "warning_low_confidence"
        logger.warning(f"⚠ {file_name}: confidence={confidence}/5, cần review")
    else:
        log["status"] = "success"

    markdown = append_source_metadata(markdown, file_record)

    out_filename = safe_filename(file_name.replace(".png", ".md"))
    out_path = output_dir / out_filename
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(markdown)
    log["output_path"] = str(out_path.relative_to(PROJECT_ROOT))
    return log


def download_and_resize(file_record: dict, service, config: dict) -> bytes:
    """Download PNG từ Drive và resize nếu cần."""
    image_bytes = gdrive_download_bytes(service, file_record["file_id"])
    original_size = len(image_bytes)
    max_width = config["vlm"]["max_image_width"]
    image_bytes = resize_if_large(image_bytes, max_width)
    if len(image_bytes) < original_size:
        logger.debug(
            f"Resized {file_record['file_name']}: "
            f"{original_size // 1024}KB → {len(image_bytes) // 1024}KB"
        )
    return image_bytes


def process_one_png(
    file_record: dict,
    service,
    prompt: str,
    config: dict,
    output_dir: Path,
) -> dict:
    """
    Xử lý 1 PNG → Markdown (sequential path).
    Returns: log dict với status, confidence, output_path, error (nếu có).
    """
    log = _make_log(file_record)
    try:
        image_bytes = download_and_resize(file_record, service, config)
        markdown = call_vlm(image_bytes, prompt, config)
        _validate_and_save(markdown, file_record, output_dir, log)
    except Exception as e:
        log["status"] = "error"
        log["error"] = str(e)[:500]
        logger.error(f"✗ {file_record['file_name']}: {e}")
    return log


def process_batch_gemini(
    files: list[dict],
    service,
    prompt: str,
    config: dict,
    output_dir: Path,
    batch_size: int,
) -> list[dict]:
    """
    Batch-process PNGs với Gemini async concurrency.
    Downloads sequentially (Drive rate limit), then fires VLM calls concurrently in batches.
    """
    logs = [_make_log(f) for f in files]
    all_prepared: list[tuple[int, bytes]] = []

    logger.info(f"Downloading {len(files)} PNGs from Drive...")
    for i, file_record in enumerate(tqdm(files, desc="Download PNG")):
        try:
            image_bytes = download_and_resize(file_record, service, config)
            all_prepared.append((i, image_bytes))
        except Exception as e:
            logs[i]["status"] = "error"
            logs[i]["error"] = f"Download failed: {str(e)[:400]}"
            logger.error(f"✗ {file_record['file_name']}: download failed: {e}")

    if not all_prepared:
        return logs

    logger.info(
        f"Sending {len(all_prepared)} VLM requests "
        f"(max concurrency={batch_size})..."
    )

    results = asyncio.run(
        _run_gemini_batch(all_prepared, prompt, config, max_concurrency=batch_size)
    )

    for idx, (markdown, error) in results.items():
        file_record = files[idx]
        if error:
            logs[idx]["status"] = "error"
            logs[idx]["error"] = error
            logger.error(f"✗ {file_record['file_name']}: {error}")
        else:
            try:
                _validate_and_save(markdown, file_record, output_dir, logs[idx])
            except Exception as e:
                logs[idx]["status"] = "error"
                logs[idx]["error"] = str(e)[:500]
                logger.error(f"✗ {file_record['file_name']}: {e}")

    return logs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Chỉ xử lý N file đầu (test)")
    parser.add_argument("--resume", action="store_true", help="Skip files đã có .md output")
    parser.add_argument("--config", default=None)
    parser.add_argument(
        "--batch-size", type=int, default=None,
        help="Concurrent VLM requests (Gemini only). Default=rate_limit_rps from config.",
    )
    args = parser.parse_args()

    config = load_config(args.config)
    inventory_csv = Path(config["paths"]["inventory_csv"])
    if not inventory_csv.is_absolute():
        inventory_csv = PROJECT_ROOT / inventory_csv
    sop_md_dir = Path(config["paths"]["sop_md_dir"])
    if not sop_md_dir.is_absolute():
        sop_md_dir = PROJECT_ROOT / sop_md_dir
    sop_md_dir.mkdir(parents=True, exist_ok=True)
    extraction_log_csv = sop_md_dir.parent / "sop_extraction_log.csv"

    # Load prompt
    prompt_path = PROJECT_ROOT / "prompts" / "vlm_ocr_sop.txt"
    prompt = prompt_path.read_text(encoding="utf-8")

    # Load files
    if not inventory_csv.exists():
        logger.error(f"Inventory CSV không tồn tại: {inventory_csv}")
        logger.error("Hãy chạy step1_inventory.py trước.")
        sys.exit(1)

    files = load_sop_files_from_inventory(inventory_csv)
    logger.info(f"Tìm thấy {len(files)} file PNG cho sop_kb")

    if args.resume:
        before = len(files)
        files = [f for f in files if not (sop_md_dir / safe_filename(f["file_name"].replace(".png", ".md"))).exists()]
        logger.info(f"Resume mode: skip {before - len(files)} file đã xử lý")

    if args.limit:
        files = files[: args.limit]
        logger.info(f"Limit mode: chỉ xử lý {len(files)} file đầu")

    if not files:
        logger.info("Không có file nào để xử lý.")
        return

    # Estimate cost
    provider = config["vlm"]["provider"].lower()
    if provider == "gemini":
        est_cost = len(files) * 0.003
        logger.info(f"💰 Ước tính chi phí Gemini: ~${est_cost:.3f}")
    elif provider == "openai":
        est_cost = len(files) * 0.02
        logger.info(f"💰 Ước tính chi phí OpenAI VLM: ~${est_cost:.2f}")
    elif provider == "claude":
        est_cost = len(files) * 0.025
        logger.info(f"💰 Ước tính chi phí Claude CLI: ~${est_cost:.2f}")

    # Process
    service = get_gdrive_client(config)
    batch_size = args.batch_size or int(config["vlm"]["rate_limit_rps"])

    if provider == "gemini" and batch_size > 1:
        logger.info(f"Using Gemini batch mode (concurrency={batch_size})")
        logs = process_batch_gemini(files, service, prompt, config, sop_md_dir, batch_size)
    else:
        rate_limit_delay = 1.0 / int(config["vlm"]["rate_limit_rps"])
        logs = []
        for file_record in tqdm(files, desc="OCR PNG"):
            log = process_one_png(file_record, service, prompt, config, sop_md_dir)
            logs.append(log)
            time.sleep(rate_limit_delay)

    # Write extraction log
    fieldnames = ["file_id", "file_name", "department", "status", "confidence", "output_path", "error"]
    file_exists = extraction_log_csv.exists() and args.resume
    with open(extraction_log_csv, "a" if file_exists else "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerows(logs)

    # Summary
    by_status = {}
    for log in logs:
        s = log["status"]
        by_status[s] = by_status.get(s, 0) + 1

    logger.info("=" * 60)
    logger.info("OCR EXTRACTION SUMMARY")
    logger.info("=" * 60)
    for status, count in sorted(by_status.items()):
        logger.info(f"  {status}: {count}")
    logger.info(f"Output dir: {sop_md_dir}")
    logger.info(f"Extraction log: {extraction_log_csv}")
    logger.info("=" * 60)
    logger.info("👉 NEXT: Review files có status warning_* hoặc confidence ≤ 2")
    logger.info("👉 NEXT: Sau khi verify, chạy step3_form_cards.py")


if __name__ == "__main__":
    main()
