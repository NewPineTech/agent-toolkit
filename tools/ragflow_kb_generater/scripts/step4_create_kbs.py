"""
step4_create_kbs.py
===================
Tạo 4 KB rỗng trong RAGFlow với cấu hình đã đề xuất.

Output: data/kb_ids.json - chứa mapping {kb_name: kb_id} để inject vào workflow hr-11

Lưu ý về RAGFlow API:
- Endpoint: POST /api/v1/datasets
- Auth: Bearer token (từ Profile → API Key)
- Docs: https://ragflow.io/docs/dev/http_api_reference
- Nếu RAGFlow version cũ, có thể là /v1/dataset thay vì /v1/datasets

Usage:
    python scripts/step4_create_kbs.py
    python scripts/step4_create_kbs.py --skip-existing  # bỏ qua KB đã tồn tại
"""

import argparse
import json
import sys
from pathlib import Path

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

sys.path.insert(0, str(Path(__file__).parent))
from common import PROJECT_ROOT, load_config, setup_logger

logger = setup_logger("step4_create_kbs", "step4_create_kbs.log")


# ============================================================
# RAGFLOW API CLIENT
# ============================================================

class RAGFlowClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10), reraise=True)
    def list_datasets(self) -> list[dict]:
        """Liệt kê tất cả dataset (KB)."""
        url = f"{self.base_url}/api/v1/datasets"
        r = requests.get(url, headers=self.headers, params={"page_size": 100}, timeout=30)
        r.raise_for_status()
        data = r.json()
        # RAGFlow trả về {"code": 0, "data": [...]}
        if data.get("code") != 0:
            raise RuntimeError(f"RAGFlow error: {data}")
        return data.get("data", [])

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10), reraise=True)
    def create_dataset(self, payload: dict) -> dict:
        """Tạo KB mới."""
        url = f"{self.base_url}/api/v1/datasets"
        r = requests.post(url, headers=self.headers, json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != 0:
            raise RuntimeError(f"RAGFlow error: {data}")
        return data["data"]


# ============================================================
# KB CONFIG BUILDER
# ============================================================

def build_dataset_payload(kb_name: str, kb_config: dict, ragflow_config: dict) -> dict:
    """
    Build payload cho POST /api/v1/datasets.
    
    Note: RAGFlow API field names có thể thay đổi giữa versions.
    Reference này dùng schema của RAGFlow >= 0.13.
    """
    chunking_method = kb_config.get("chunking_method", "naive")

    # Map chunking_method từ config sang RAGFlow naming
    parser_id_map = {
        "naive": "naive",
        "manual": "manual",
        "qa": "qa",
        "table": "table",
    }
    parser_id = parser_id_map.get(chunking_method, "naive")

    payload = {
        "name": kb_name,
        "description": kb_config.get("description", ""),
        "embedding_model": ragflow_config["embedding_model"],
        "permission": "me",  # KB chỉ owner thấy; đổi sang "team" nếu cần
        "chunk_method": parser_id,
        # Parser config tùy method
        "parser_config": _build_parser_config(kb_config),
    }

    # NOTE: Field "language" KHÔNG hợp lệ ở top-level trong RAGFlow API hiện tại.
    # Language được auto-detect bởi embedding model (bge-m3 multilingual).
    # Nếu cần force language, set trong parser_config (tùy version).

    return payload


def _build_parser_config(kb_config: dict) -> dict:
    """
    Build parser_config object phù hợp với chunking method.
    
    Note về RAGFlow API quirks:
    - layout_recognize: PHẢI là string ("DeepDOC" | "Plain Text"), KHÔNG phải boolean
    - Một số version chỉ accept subset of fields - giữ minimal payload an toàn nhất
    """
    method = kb_config.get("chunking_method", "naive")
    
    if method == "manual":
        # Manual chunking: dùng separator
        return {
            "chunk_token_num": 512,
            "delimiter": kb_config.get("chunk_separator", "^# "),
            "html4excel": False,
            "layout_recognize": "DeepDOC",
            "raptor": {"use_raptor": False},
        }
    elif method == "naive":
        return {
            "chunk_token_num": kb_config.get("chunk_token_num", 1000),
            "delimiter": "\n",
            "html4excel": False,
            "layout_recognize": "DeepDOC",
            "raptor": {"use_raptor": False},
        }
    else:
        return {"chunk_token_num": 512}


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-existing", action="store_true", help="Skip KB đã tồn tại (theo tên)")
    parser.add_argument("--config", default=None)
    args = parser.parse_args()

    config = load_config(args.config)
    ragflow_config = config["ragflow"]
    kbs_config = config["knowledge_bases"]
    kb_ids_path = Path(config["paths"]["kb_ids_file"])
    if not kb_ids_path.is_absolute():
        kb_ids_path = PROJECT_ROOT / kb_ids_path
    kb_ids_path.parent.mkdir(parents=True, exist_ok=True)

    client = RAGFlowClient(ragflow_config["api_url"], ragflow_config["api_key"])

    # Verify connection
    try:
        existing = client.list_datasets()
        existing_names = {ds["name"]: ds["id"] for ds in existing}
        logger.info(f"Connected to RAGFlow. Found {len(existing)} existing datasets.")
    except Exception as e:
        logger.error(f"Không kết nối được RAGFlow: {e}")
        logger.error(f"  URL: {ragflow_config['api_url']}")
        logger.error("  Check: api_url đúng chưa? api_key có valid?")
        sys.exit(1)

    # Load existing kb_ids.json nếu có
    kb_ids = {}
    if kb_ids_path.exists():
        kb_ids = json.loads(kb_ids_path.read_text(encoding="utf-8"))
        logger.info(f"Loaded existing kb_ids: {list(kb_ids.keys())}")

    # Tạo từng KB
    for kb_name, kb_config in kbs_config.items():
        if kb_name in existing_names and args.skip_existing:
            logger.info(f"⏭  Skip {kb_name}: đã tồn tại (id={existing_names[kb_name]})")
            kb_ids[kb_name] = existing_names[kb_name]
            continue

        if kb_name in existing_names:
            logger.warning(
                f"⚠ {kb_name} đã tồn tại trong RAGFlow (id={existing_names[kb_name]}). "
                f"Dùng --skip-existing nếu muốn bỏ qua, hoặc xóa thủ công trước khi tạo lại."
            )
            kb_ids[kb_name] = existing_names[kb_name]
            continue

        payload = build_dataset_payload(kb_name, kb_config, ragflow_config)
        logger.info(f"Creating KB: {kb_name}")
        logger.debug(f"Payload: {json.dumps(payload, ensure_ascii=False, indent=2)}")

        try:
            result = client.create_dataset(payload)
            kb_id = result.get("id")
            kb_ids[kb_name] = kb_id
            logger.info(f"✓ Created {kb_name} → id={kb_id}")
        except Exception as e:
            logger.error(f"✗ Failed to create {kb_name}: {e}")

    # Write kb_ids.json
    kb_ids_path.write_text(
        json.dumps(kb_ids, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    logger.info(f"✓ Written kb_ids → {kb_ids_path}")

    # Print summary để user copy vào workflow
    logger.info("=" * 60)
    logger.info("KB IDs (copy vào workflow hr-11):")
    logger.info("=" * 60)
    for name, id_ in kb_ids.items():
        logger.info(f"  {name:15s} → {id_}")
    logger.info("=" * 60)
    logger.info("👉 NEXT: Chạy step5_upload_to_ragflow.py để upload Markdown files")
    logger.info("👉 NEXT: Mở workflow hr-11.json, replace 5 retrieval node với KB IDs trên")


if __name__ == "__main__":
    main()