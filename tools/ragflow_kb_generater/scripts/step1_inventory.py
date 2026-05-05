"""
step1_inventory.py
==================
Crawl recursive toàn bộ Drive folder gốc → inventory CSV.

Output: data/inventory.csv với schema:
    file_id, file_name, mime_type, file_extension, file_size_kb,
    parent_folder_id, parent_folder_name, full_path,
    department, target_kb, processing_method,
    form_code, process_code, web_view_link, modified_time

Phân loại tự động:
    - PNG lưu đồ → target_kb = "sop_kb", method = "vlm_ocr"
    - .doc/.xls/.docx/.xlsx có mã form → target_kb = "forms_kb", method = "metadata_extract"
    - Khác → target_kb = None (exclude)

Usage:
    python scripts/step1_inventory.py
    python scripts/step1_inventory.py --root-folder-id <ID>  # override config
"""

import argparse
import csv
import hashlib
import sys
from pathlib import Path

from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent))
from common import (
    PROJECT_ROOT,
    classify_target_kb,
    get_department_from_form_code,
    get_department_from_path,
    get_gdrive_client,
    gdrive_list_folder,
    load_config,
    parse_form_code,
    parse_process_code_from_form,
    setup_logger,
)

logger = setup_logger("step1_inventory", "step1_inventory.log")


def crawl_recursive(service, folder_id: str, path_parts: list[str]) -> list[dict]:
    """
    Recursive crawl: 1 folder → list all files (DFS).
    path_parts: tên các folder cha (để tracking full path).
    """
    results = []
    try:
        items = gdrive_list_folder(service, folder_id)
    except Exception as e:
        logger.error(f"Failed to list folder {folder_id} ({'/'.join(path_parts)}): {e}")
        return results

    for item in items:
        item_name = item["name"]
        item_id = item["id"]
        mime = item.get("mimeType", "")

        if mime == "application/vnd.google-apps.folder":
            # Recurse vào subfolder
            sub_results = crawl_recursive(service, item_id, path_parts + [item_name])
            results.extend(sub_results)
        else:
            # File
            results.append(
                {
                    "file_id": item_id,
                    "file_name": item_name,
                    "mime_type": mime,
                    "file_size_bytes": int(item.get("size", 0)),
                    "parent_folder_id": item.get("parents", [None])[0],
                    "parent_folder_name": path_parts[-1] if path_parts else "",
                    "full_path": "/".join(path_parts + [item_name]),
                    "modified_time": item.get("modifiedTime", ""),
                    "web_view_link": item.get("webViewLink", ""),
                    "_path_parts": path_parts,  # internal, sẽ remove trước khi lưu
                }
            )
    return results


def enrich_file_metadata(file_record: dict) -> dict:
    """Thêm các trường derived: extension, target_kb, department, form_code, process_code."""
    name = file_record["file_name"]
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    target_kb = classify_target_kb(name, file_record["mime_type"])
    form_code = parse_form_code(name) if target_kb == "forms_kb" else None
    process_code = parse_process_code_from_form(form_code) if form_code else None

    # Department: ưu tiên parse từ form code, fallback từ path
    if form_code:
        department = get_department_from_form_code(form_code)
        if department == "Không xác định":
            department = get_department_from_path(file_record["_path_parts"])
    else:
        department = get_department_from_path(file_record["_path_parts"])

    # Processing method
    if target_kb == "sop_kb":
        method = "vlm_ocr"
    elif target_kb == "forms_kb":
        method = "metadata_extract"
    else:
        method = "exclude"

    return {
        "file_id": file_record["file_id"],
        "file_name": name,
        "mime_type": file_record["mime_type"],
        "file_extension": ext,
        "file_size_kb": round(file_record["file_size_bytes"] / 1024, 1),
        "parent_folder_id": file_record["parent_folder_id"],
        "parent_folder_name": file_record["parent_folder_name"],
        "full_path": file_record["full_path"],
        "department": department,
        "target_kb": target_kb or "",
        "processing_method": method,
        "form_code": form_code or "",
        "process_code": process_code or "",
        "web_view_link": file_record["web_view_link"],
        "modified_time": file_record["modified_time"],
    }


def detect_duplicates(records: list[dict]) -> list[dict]:
    """
    Mark duplicates dựa trên (file_name + size).
    Note: KHÔNG dùng file content hash vì sẽ phải download tất cả - tốn bandwidth.
    Heuristic này đủ tốt cho biểu mẫu (cùng tên + cùng size = same file copy).
    """
    seen = {}  # (name_lower, size) → first file_id
    for rec in records:
        key = (rec["file_name"].lower(), rec["file_size_kb"])
        if key in seen and rec["file_id"] != seen[key]:
            rec["is_duplicate"] = "yes"
            rec["duplicate_of"] = seen[key]
        else:
            rec["is_duplicate"] = "no"
            rec["duplicate_of"] = ""
            seen[key] = rec["file_id"]
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root-folder-id", help="Override root folder ID từ config")
    parser.add_argument("--config", default=None, help="Path tới config.yaml")
    args = parser.parse_args()

    config = load_config(args.config)
    root_folder_id = args.root_folder_id or config["google_drive"]["root_folder_id"]
    output_csv = Path(config["paths"]["inventory_csv"])
    if not output_csv.is_absolute():
        output_csv = PROJECT_ROOT / output_csv
    output_csv.parent.mkdir(parents=True, exist_ok=True)

    logger.info(f"Crawling Drive folder: {root_folder_id}")
    service = get_gdrive_client(config)

    # Crawl recursive
    raw_records = crawl_recursive(service, root_folder_id, path_parts=[])
    logger.info(f"Crawled {len(raw_records)} files total (raw)")

    # Enrich metadata
    enriched = [enrich_file_metadata(r) for r in tqdm(raw_records, desc="Enriching metadata")]

    # Detect duplicates
    enriched = detect_duplicates(enriched)

    # Stats
    by_kb = {}
    for r in enriched:
        kb = r["target_kb"] or "(excluded)"
        by_kb[kb] = by_kb.get(kb, 0) + 1
    dup_count = sum(1 for r in enriched if r["is_duplicate"] == "yes")

    logger.info("=" * 60)
    logger.info("INVENTORY SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Total files: {len(enriched)}")
    for kb, count in sorted(by_kb.items()):
        logger.info(f"  {kb}: {count}")
    logger.info(f"Duplicates detected: {dup_count}")
    logger.info("=" * 60)

    # Write CSV
    fieldnames = [
        "file_id", "file_name", "mime_type", "file_extension", "file_size_kb",
        "parent_folder_id", "parent_folder_name", "full_path",
        "department", "target_kb", "processing_method",
        "form_code", "process_code",
        "web_view_link", "modified_time",
        "is_duplicate", "duplicate_of",
    ]
    with open(output_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(enriched)

    logger.info(f"✓ Written inventory to: {output_csv}")
    logger.info(f"  Total rows: {len(enriched)}")

    # Sanity check: warn nếu coverage thấp
    sop_count = by_kb.get("sop_kb", 0)
    forms_count = by_kb.get("forms_kb", 0)
    if sop_count < 50:
        logger.warning(f"⚠ sop_kb chỉ có {sop_count} files. Expected ~70.")
    if forms_count < 200:
        logger.warning(f"⚠ forms_kb chỉ có {forms_count} files. Expected ~300.")


if __name__ == "__main__":
    main()
