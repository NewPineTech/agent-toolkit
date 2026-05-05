"""
common.py
=========
Utilities chung cho toàn bộ pipeline:
- Config loader
- Logger setup
- Google Drive client
- Retry decorator
- Department mapping (mã phòng ban → tên đầy đủ)
"""

import logging
import os
import re
from pathlib import Path
from typing import Any

import yaml
from google.oauth2 import service_account
from googleapiclient.discovery import build
from tenacity import retry, stop_after_attempt, wait_exponential

# ============================================================
# CONFIG
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_config(config_path: str = None) -> dict[str, Any]:
    """Load config.yaml. Default: PROJECT_ROOT/config.yaml"""
    if config_path is None:
        config_path = PROJECT_ROOT / "config.yaml"
    config_path = Path(config_path)
    if not config_path.exists():
        raise FileNotFoundError(
            f"Config file not found: {config_path}\n"
            f"Hãy copy config.example.yaml → config.yaml và điền API keys."
        )
    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


# ============================================================
# LOGGING
# ============================================================

def setup_logger(name: str, log_file: str = None, level=logging.INFO) -> logging.Logger:
    """
    Setup logger ghi cả console và file.
    log_file: tên file (relative to logs_dir). Nếu None, chỉ console.
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.handlers.clear()  # tránh duplicate handler khi gọi nhiều lần

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    logger.addHandler(console)

    # File
    if log_file:
        logs_dir = PROJECT_ROOT / "logs"
        logs_dir.mkdir(exist_ok=True)
        fh = logging.FileHandler(logs_dir / log_file, encoding="utf-8")
        fh.setFormatter(formatter)
        logger.addHandler(fh)

    return logger


# ============================================================
# GOOGLE DRIVE CLIENT
# ============================================================

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def get_gdrive_client(config: dict):
    """Build Google Drive API client từ service account JSON."""
    sa_path = Path(config["google_drive"]["service_account_json"])
    if not sa_path.is_absolute():
        sa_path = PROJECT_ROOT / sa_path
    if not sa_path.exists():
        raise FileNotFoundError(
            f"Service account JSON không tồn tại: {sa_path}\n"
            f"Tạo service account trên Google Cloud Console, download JSON, "
            f"và share Drive folder cho email service account."
        )
    creds = service_account.Credentials.from_service_account_file(
        str(sa_path), scopes=SCOPES
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    reraise=True,
)
def gdrive_list_folder(service, folder_id: str, page_size: int = 100):
    """
    List ALL files trong 1 folder (auto paginate).
    Trả về list[dict] với fields: id, name, mimeType, size, modifiedTime, parents.
    """
    files = []
    page_token = None
    fields = (
        "nextPageToken, "
        "files(id, name, mimeType, size, modifiedTime, parents, webViewLink)"
    )
    while True:
        resp = (
            service.files()
            .list(
                q=f"'{folder_id}' in parents and trashed = false",
                fields=fields,
                pageSize=page_size,
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        files.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    reraise=True,
)
def gdrive_download_bytes(service, file_id: str) -> bytes:
    """Download file content as bytes."""
    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
    return request.execute()


# ============================================================
# DEPARTMENT MAPPING
# ============================================================

# Map prefix mã biểu mẫu → tên phòng ban đầy đủ
# Dựa trên cấu trúc Drive folder thực tế đã observe
DEPARTMENT_MAP = {
    "NS": "Hành chính nhân sự",
    "KT": "Kế toán",
    "KD": "Kinh doanh - Chăm sóc khách hàng",
    "MK": "Marketing",
    "VH": "Vận hành",
    # Folder root mapping
    "1. Quy trình hành chính nhân sự": "Hành chính nhân sự",
    "2. Quy trình Kế toán": "Kế toán",
    "3. Quy trình kinh doanh - chăm sóc khách hàng": "Kinh doanh - Chăm sóc khách hàng",
    "4. Quy trình Marketing": "Marketing",
    "5. Quy trình Vận hành": "Vận hành",
    "6. [TẶNG KÈM] Các biểu mẫu doanh nghiệp cần tham khảo": "Tổng hợp",
}


def get_department_from_path(path_parts: list[str]) -> str:
    """
    Lấy department name từ path folder.
    path_parts: list folder name từ root → leaf.
    Ví dụ: ["1. Quy trình hành chính nhân sự", "11. QT tuyen dung"] → "Hành chính nhân sự"
    """
    for part in path_parts:
        # Strip trailing whitespace (thấy trong data thực)
        part_clean = part.strip()
        if part_clean in DEPARTMENT_MAP:
            return DEPARTMENT_MAP[part_clean]
    return "Không xác định"


def get_department_from_form_code(form_code: str) -> str:
    """
    Lấy department từ prefix mã biểu mẫu.
    Ví dụ: "NS-02-BM01" → "Hành chính nhân sự"
    """
    if not form_code:
        return "Không xác định"
    # Match prefix 2 chữ ở đầu (NS, KT, KD, MK, VH)
    match = re.match(r"^([A-Z]{2})[-_]", form_code.upper())
    if match:
        prefix = match.group(1)
        return DEPARTMENT_MAP.get(prefix, "Không xác định")
    return "Không xác định"


# ============================================================
# FORM CODE PARSING
# ============================================================

# Pattern: NS-02-BM01, KT-05-BM12, MK-03-BM-08, etc.
FORM_CODE_PATTERN = re.compile(
    r"\b([A-Z]{2,3}[-_]\d{1,3}[-_]?BM[-_]?\d{1,3}(?:\.\d+)?)\b",
    re.IGNORECASE,
)

# Pattern fallback: BM-NS07-QT02.2 style
FORM_CODE_PATTERN_ALT = re.compile(
    r"\b(BM[-_][A-Z]{2,3}\d{1,3}[-_]QT\d{1,3}(?:\.\d+)?)\b",
    re.IGNORECASE,
)


def parse_form_code(filename: str) -> str | None:
    """
    Parse mã biểu mẫu từ tên file.
    Ví dụ:
      "NS-02-BM01-Phieu yeu cau tuyen dung.xls" → "NS-02-BM01"
      "BM-NS07-QT02.2-Phieu danh gia.doc" → "BM-NS07-QT02.2"
    """
    m = FORM_CODE_PATTERN.search(filename)
    if m:
        return m.group(1).upper().replace("_", "-")
    m = FORM_CODE_PATTERN_ALT.search(filename)
    if m:
        return m.group(1).upper().replace("_", "-")
    return None


def parse_process_code_from_form(form_code: str) -> str | None:
    """
    Lấy mã quy trình từ mã biểu mẫu.
    "NS-02-BM01" → "NS-02"
    "BM-NS07-QT02.2" → "QT02.2" hoặc None
    """
    if not form_code:
        return None
    # Pattern chính: 2 phần đầu trước -BM
    m = re.match(r"^([A-Z]{2,3}[-_]\d{1,3})[-_]?BM", form_code, re.IGNORECASE)
    if m:
        return m.group(1).upper().replace("_", "-")
    # Pattern fallback: QT02.2 style
    m = re.search(r"QT\d{1,3}(?:\.\d+)?", form_code, re.IGNORECASE)
    if m:
        return m.group(0).upper()
    return None


def parse_form_name_from_filename(filename: str, form_code: str | None = None) -> str:
    """
    Parse tên biểu mẫu từ filename, bỏ mã code và extension.
    "NS-02-BM01-Phieu yeu cau tuyen dung.xls" → "Phieu yeu cau tuyen dung"
    """
    name = filename
    # Bỏ extension
    name = re.sub(r"\.[a-zA-Z0-9]+$", "", name)
    # Bỏ form code ở đầu nếu có
    if form_code:
        name = re.sub(
            rf"^{re.escape(form_code)}[-_\s]*",
            "",
            name,
            flags=re.IGNORECASE,
        )
    # Bỏ các pattern còn lại như "NS-02-BM01-"
    name = FORM_CODE_PATTERN.sub("", name).strip(" -_")
    name = FORM_CODE_PATTERN_ALT.sub("", name).strip(" -_")
    return name.strip()


# ============================================================
# FILE TYPE CLASSIFICATION
# ============================================================

def classify_target_kb(filename: str, mime_type: str) -> str | None:
    """
    Phân loại file vào KB nào, hoặc None nếu exclude.
    Returns: "sop_kb" | "forms_kb" | None
    """
    name_lower = filename.lower()

    # Exclude noise
    if name_lower == ".ds_store":
        return None
    if name_lower.endswith(".vsdx"):
        return None  # không parse được, đã có PNG tương ứng
    if "mục lục" in name_lower or "muc luc" in name_lower:
        return None  # helper file
    if "hướng dẫn" in name_lower or "huong dan" in name_lower:
        return None  # hướng dẫn dùng tool

    # SOP: PNG lưu đồ
    if name_lower.endswith(".png") and (
        name_lower.startswith("qt ") or "quy trinh" in name_lower or "quy_trinh" in name_lower
    ):
        return "sop_kb"

    # Forms: doc/docx/xls/xlsx có mã biểu mẫu
    if name_lower.endswith((".doc", ".docx", ".xls", ".xlsx")):
        if parse_form_code(filename):
            return "forms_kb"
        # File office không có mã form code → có thể là tài liệu chung, skip
        return None

    return None


def safe_filename(name: str) -> str:
    """Sanitize filename để tránh path traversal và ký tự đặc biệt."""
    from slugify import slugify
    # Giữ tiếng Việt nhưng bỏ ký tự đặc biệt nguy hiểm
    name = re.sub(r"[/\\:*?\"<>|]", "_", name)
    return name[:200]  # giới hạn độ dài
