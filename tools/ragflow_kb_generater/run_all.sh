#!/usr/bin/env bash
# ============================================================
# run_all.sh - Chạy toàn bộ pipeline end-to-end
# ============================================================
# Recommended workflow:
#   1. Chạy --test trước để verify (chỉ 5 file)
#   2. Verify output trong data/sop_md/ và data/forms_md/
#   3. Chạy full
# ============================================================

set -e  # exit on first error

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Detect mode
MODE="${1:-full}"  # default: full

if [ "$MODE" = "--test" ] || [ "$MODE" = "-t" ]; then
    echo -e "${YELLOW}🧪 TEST MODE: chỉ xử lý 5 file đầu mỗi step${NC}"
    LIMIT_FLAG="--limit 5"
elif [ "$MODE" = "--full" ] || [ "$MODE" = "full" ]; then
    echo -e "${GREEN}🚀 FULL MODE: xử lý toàn bộ${NC}"
    LIMIT_FLAG=""
else
    echo "Usage: $0 [--test|--full]"
    exit 1
fi

cd "$(dirname "$0")"

# Pre-flight check
if [ ! -f "config.yaml" ]; then
    echo -e "${RED}✗ config.yaml chưa tồn tại. Copy từ config.example.yaml và điền API keys.${NC}"
    exit 1
fi

echo -e "\n${GREEN}━━━ STEP 1: Inventory ━━━${NC}"
python scripts/step1_inventory.py

echo -e "\n${GREEN}━━━ STEP 2: OCR PNG → sop_kb Markdown ━━━${NC}"
python scripts/step2_ocr_sop.py $LIMIT_FLAG

echo -e "\n${GREEN}━━━ STEP 3: Generate Form Cards → forms_kb Markdown ━━━${NC}"
python scripts/step3_form_cards.py $LIMIT_FLAG

echo -e "\n${YELLOW}━━━ STEP 3.5 (optional): Convert .md → .pdf ━━━${NC}"
read -p "Chuyển Markdown sang PDF trước khi upload? (y/N): " want_pdf
UPLOAD_FORMAT="md"
if [ "$want_pdf" = "y" ] || [ "$want_pdf" = "Y" ]; then
    python scripts/step3_5_md_to_pdf.py $LIMIT_FLAG
    echo ""
    read -p "Upload format? [md/pdf/both] (default: pdf): " fmt_choice
    UPLOAD_FORMAT="${fmt_choice:-pdf}"
fi

echo -e "\n${YELLOW}━━━ MANUAL CHECKPOINT ━━━${NC}"
echo "Hãy verify output trong:"
echo "  - data/sop_md/      (Markdown quy trình)"
echo "  - data/forms_md/    (Markdown biểu mẫu)"
if [ "$UPLOAD_FORMAT" != "md" ]; then
    echo "  - data/sop_md/*.pdf      (PDF quy trình)"
    echo "  - data/forms_md/*.pdf    (PDF biểu mẫu)"
fi
echo "  - data/sop_extraction_log.csv      (status + confidence)"
echo "  - data/forms_generation_log.csv    (status)"
echo "  - data/forms_kb_rejected.csv       (file bị reject)"
echo ""
echo "Upload format sẽ dùng: $UPLOAD_FORMAT"
read -p "Output OK? Continue with RAGFlow upload? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Stopped before upload. Khi nào sẵn sàng, chạy:"
    echo "  python scripts/step4_create_kbs.py"
    echo "  python scripts/step5_upload_to_ragflow.py --kb sop_kb --format $UPLOAD_FORMAT"
    echo "  python scripts/step5_upload_to_ragflow.py --kb forms_kb --format $UPLOAD_FORMAT"
    exit 0
fi

echo -e "\n${GREEN}━━━ STEP 4: Tạo 4 KB rỗng trong RAGFlow ━━━${NC}"
python scripts/step4_create_kbs.py --skip-existing

echo -e "\n${GREEN}━━━ STEP 5a: Upload sop_kb (format=$UPLOAD_FORMAT) ━━━${NC}"
python scripts/step5_upload_to_ragflow.py --kb sop_kb --format "$UPLOAD_FORMAT"

echo -e "\n${GREEN}━━━ STEP 5b: Upload forms_kb (format=$UPLOAD_FORMAT) ━━━${NC}"
python scripts/step5_upload_to_ragflow.py --kb forms_kb --format "$UPLOAD_FORMAT"

echo -e "\n${YELLOW}⏳ Đợi RAGFlow parse + embed (kiểm tra UI). Sau đó:${NC}"
echo "  python scripts/step6_test_retrieval.py --kb sop_kb"
echo "  python scripts/step6_test_retrieval.py --kb forms_kb"
echo ""
echo -e "${GREEN}✓ DONE!${NC}"
echo "KB IDs đã lưu trong: data/kb_ids.json"
echo "Hãy update workflow hr-11.json với 4 KB IDs này."
