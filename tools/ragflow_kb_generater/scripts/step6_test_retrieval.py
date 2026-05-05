"""
step6_test_retrieval.py
=======================
Smoke test retrieval sau khi đã upload + parse xong.

Test 10 câu hỏi mẫu cho từng KB, kiểm tra:
- Có chunks trả về không
- Top-1 chunk có liên quan không (eyeball QA)
- Latency có chấp nhận được không

Usage:
    python scripts/step6_test_retrieval.py --kb sop_kb
    python scripts/step6_test_retrieval.py --kb forms_kb
"""

import argparse
import json
import sys
import time
from pathlib import Path

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

sys.path.insert(0, str(Path(__file__).parent))
from common import PROJECT_ROOT, load_config, setup_logger

logger = setup_logger("step6_test", "step6_test.log")


# ============================================================
# TEST QUERIES (per KB)
# ============================================================

TEST_QUERIES = {
    "sop_kb": [
        "Quy trình tuyển dụng gồm những bước nào?",
        "Ai duyệt đề xuất tuyển dụng?",
        "Mất bao lâu để hoàn tất quy trình hoàn tất hồ sơ nhân sự?",
        "Quy trình sa thải nhân sự thực hiện thế nào?",
        "Các bước trong quy trình thuyên chuyển công tác",
        "Quy trình thử việc học việc",
        "Quy trình đào tạo nội bộ",
        "Quy trình xin thôi việc gồm những bước gì?",
        "Quy trình triển khai tuyển dụng",
        "Quy trình hoàn tất hồ sơ nhân sự",
    ],
    "forms_kb": [
        "Phiếu yêu cầu tuyển dụng ở đâu",
        "Mẫu mô tả công việc",
        "Biểu mẫu BM-NS-02-BM01",
        "Đơn xin thôi việc",
        "Mẫu thông báo tuyển dụng",
        "Bản tự khai của ứng viên",
        "Phiếu lương mẫu",
        "Hệ thống câu hỏi phỏng vấn",
        "Mẫu thư mời ứng viên phỏng vấn",
        "Quyết định phê duyệt kế hoạch tuyển dụng",
    ],
}


# ============================================================
# RETRIEVAL CALL
# ============================================================

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10), reraise=True)
def call_retrieval(base_url: str, api_key: str, kb_id: str, query: str, kb_config: dict) -> dict:
    """
    Call RAGFlow retrieval endpoint.
    
    POST /api/v1/retrieval
    Body: {"question": ..., "dataset_ids": [...], "similarity_threshold": ..., ...}
    """
    url = f"{base_url}/api/v1/retrieval"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "question": query,
        "dataset_ids": [kb_id],
        "top_k": kb_config.get("top_k", 64),
        "similarity_threshold": kb_config.get("similarity_threshold", 0.4),
        "vector_similarity_weight": 1 - kb_config.get("keywords_similarity_weight", 0.3),
        "page_size": kb_config.get("top_n", 4),
        "highlight": False,
    }
    t0 = time.time()
    r = requests.post(url, headers=headers, json=payload, timeout=30)
    elapsed = time.time() - t0
    r.raise_for_status()
    data = r.json()
    if data.get("code") != 0:
        raise RuntimeError(f"Retrieval error: {data}")
    result = data["data"]
    result["_latency_ms"] = round(elapsed * 1000, 1)
    return result


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kb", required=True, choices=list(TEST_QUERIES.keys()))
    parser.add_argument("--config", default=None)
    parser.add_argument("--verbose", "-v", action="store_true", help="In full chunk content")
    args = parser.parse_args()

    config = load_config(args.config)
    ragflow_config = config["ragflow"]
    kb_config = config["knowledge_bases"][args.kb]

    kb_ids_path = Path(config["paths"]["kb_ids_file"])
    if not kb_ids_path.is_absolute():
        kb_ids_path = PROJECT_ROOT / kb_ids_path
    kb_ids = json.loads(kb_ids_path.read_text(encoding="utf-8"))
    kb_id = kb_ids[args.kb]

    queries = TEST_QUERIES[args.kb]
    logger.info(f"Testing {len(queries)} queries on {args.kb} (id={kb_id})")
    logger.info("=" * 70)

    stats = {"empty": 0, "ok": 0, "errors": 0, "latencies": []}

    for i, q in enumerate(queries, 1):
        logger.info(f"\n[Q{i}] {q}")
        try:
            result = call_retrieval(
                ragflow_config["api_url"],
                ragflow_config["api_key"],
                kb_id,
                q,
                kb_config,
            )
            chunks = result.get("chunks", [])
            stats["latencies"].append(result["_latency_ms"])

            if not chunks:
                stats["empty"] += 1
                logger.warning(f"  ⚠ EMPTY result ({result['_latency_ms']}ms)")
            else:
                stats["ok"] += 1
                logger.info(f"  ✓ {len(chunks)} chunks ({result['_latency_ms']}ms)")
                for j, ch in enumerate(chunks[:3], 1):
                    sim = ch.get("similarity", ch.get("score", 0))
                    doc_name = ch.get("document_keyword", ch.get("docnm_kwd", "(unknown)"))
                    content = ch.get("content_with_weight", ch.get("content", ""))[:200]
                    logger.info(f"  #{j} [sim={sim:.3f}] {doc_name}")
                    if args.verbose:
                        logger.info(f"      {content}...")

        except Exception as e:
            stats["errors"] += 1
            logger.error(f"  ✗ ERROR: {e}")

    # Summary
    logger.info("\n" + "=" * 70)
    logger.info(f"SMOKE TEST SUMMARY ({args.kb})")
    logger.info("=" * 70)
    logger.info(f"Total queries:  {len(queries)}")
    logger.info(f"  ✓ With results: {stats['ok']}")
    logger.info(f"  ⚠ Empty:        {stats['empty']}")
    logger.info(f"  ✗ Errors:       {stats['errors']}")
    if stats["latencies"]:
        avg_lat = sum(stats["latencies"]) / len(stats["latencies"])
        max_lat = max(stats["latencies"])
        logger.info(f"Latency: avg={avg_lat:.0f}ms, max={max_lat:.0f}ms")

    # Health verdict
    success_rate = stats["ok"] / len(queries)
    logger.info("=" * 70)
    if success_rate >= 0.9:
        logger.info("🟢 HEALTHY - retrieval hoạt động tốt")
    elif success_rate >= 0.6:
        logger.info("🟡 NEEDS TUNING - một số query không có kết quả, xem lại threshold")
    else:
        logger.info("🔴 UNHEALTHY - retrieval kém, kiểm tra:")
        logger.info("  - Documents đã parse xong chưa? (RAGFlow UI)")
        logger.info("  - Embedding model có chạy đúng không?")
        logger.info("  - Similarity threshold có quá cao không?")


if __name__ == "__main__":
    main()
