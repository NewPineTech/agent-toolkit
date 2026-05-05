# RAGFlow Ingest Pipeline (HR Documents)

Pipeline ingest dữ liệu HR (~70 quy trình + ~300 biểu mẫu) từ Google Drive vào RAGFlow,
chia thành 4 Knowledge Base: `general_kb`, `documents_kb`, `forms_kb`, `sop_kb`.

## Phạm vi

- ✅ **`sop_kb`**: OCR ~70 file PNG lưu đồ → Markdown SOP có cấu trúc
- ✅ **`forms_kb`**: Generate metadata card cho ~300 biểu mẫu `.doc/.xls`
- ⏸️ **`general_kb`**: Tạo KB rỗng, seed sau (FAQ, văn hóa công ty)
- ⏸️ **`documents_kb`**: Tạo KB rỗng, seed sau (hợp đồng, báo cáo, meeting notes)

## Cấu trúc

```
ragflow_kb_generater/
├── config.example.yaml       # Copy thành config.yaml và điền API keys
├── requirements.txt
├── prompts/                  # Prompts cho VLM và LLM
├── scripts/
│   ├── common.py             # Utilities chung
│   ├── step1_inventory.py    # Crawl Drive → inventory CSV
│   ├── step2_ocr_sop.py      # OCR PNG → Markdown
│   ├── step3_form_cards.py   # Generate form cards
│   ├── step3_5_md_to_pdf.py  # (optional) Convert .md → .pdf
│   ├── step4_create_kbs.py   # Tạo 4 KB trong RAGFlow
│   ├── step5_upload_to_ragflow.py  # Upload (support --format md|pdf|both)
│   └── step6_test_retrieval.py
├── data/                     # Output (CSV, MD files, PDF files)
└── logs/                     # Log files
```

## Cài đặt

```bash
# 1. Tạo virtualenv
python -m venv venv
source venv/bin/activate  # macOS/Linux
# hoặc: venv\Scripts\activate  # Windows

# 2. Cài deps
pip install -r requirements.txt

# 3. Setup config
cp config.example.yaml config.yaml
# Điền vào config.yaml: GOOGLE_SERVICE_ACCOUNT_JSON, GEMINI_API_KEY,
# OPENAI_API_KEY, RAGFLOW_API_URL, RAGFLOW_API_KEY, DRIVE_ROOT_FOLDER_ID

# 4. Setup Google Drive Service Account
# - Vào https://console.cloud.google.com → tạo project mới
# - Enable Google Drive API
# - Tạo Service Account, download JSON credentials
# - Share Drive folder cho email service account (quyền Viewer)
# - Set GOOGLE_SERVICE_ACCOUNT_JSON trong config.yaml = path tới file JSON

# 5. (Optional) Setup WeasyPrint system deps (chỉ cần nếu dùng Step 3.5 PDF)
# macOS:
brew install pango libffi cairo gdk-pixbuf
# Ubuntu/Debian:
sudo apt install libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b
# Windows: WeasyPrint cài sẵn trên Windows không cần extra deps
```

## Chạy pipeline

```bash
# Chạy toàn bộ (interactive, có checkpoint xác nhận trước upload)
./run_all.sh              # full mode
./run_all.sh --test       # test mode (5 file đầu mỗi step)
```

### Chạy từng step

```bash
# Step 1: Crawl Drive folder → inventory CSV
python scripts/step1_inventory.py

# Step 2: OCR PNG lưu đồ → Markdown SOP
# Gemini: tự động dùng batch mode (async concurrent, nhanh ~4x)
python scripts/step2_ocr_sop.py --limit 5          # test 5 file
python scripts/step2_ocr_sop.py                     # full (batch mặc định)
python scripts/step2_ocr_sop.py --batch-size 10     # tăng concurrency
python scripts/step2_ocr_sop.py --batch-size 1      # sequential (debug)

# Step 3: Generate form metadata cards
python scripts/step3_form_cards.py --limit 10  # test
python scripts/step3_form_cards.py             # full

# Step 3.5 (optional): Convert .md → .pdf
python scripts/step3_5_md_to_pdf.py --limit 5   # test
python scripts/step3_5_md_to_pdf.py             # full

# Step 4: Tạo 4 KB rỗng trong RAGFlow
python scripts/step4_create_kbs.py
# → output: data/kb_ids.json (chứa 4 KB IDs để inject vào workflow)

# Step 5: Upload Markdown vào RAGFlow KB
python scripts/step5_upload_to_ragflow.py --kb sop_kb                # upload .md
python scripts/step5_upload_to_ragflow.py --kb sop_kb --format pdf   # upload .pdf
python scripts/step5_upload_to_ragflow.py --kb forms_kb --format pdf

# Step 6: Smoke test retrieval (optional)
python scripts/step6_test_retrieval.py
```

## Chi phí ước tính

- Gemini 2.5 Flash (OCR 70 PNG): ~$0.07
- GPT-4o-mini (form metadata 300 cards): ~$2-3
- bge-m3 embedding (self-host RAGFlow): $0
- **Tổng: dưới $5**

## Output expected

- `data/inventory.csv`: ~400 rows (70 PNG + 300 forms + others)
- `data/sop_md/`: 70 file `.md` quy trình
- `data/forms_md/`: ~300 file `.md` form cards
- `data/kb_ids.json`: 4 KB IDs sau khi tạo trong RAGFlow
- `logs/`: Log chi tiết từng bước

## Sau khi ingest xong

1. Mở workflow `hr-11.json` trong RAGFlow
2. Update 5 retrieval node với KB IDs từ `data/kb_ids.json`
3. Tinh chỉnh top_k/threshold theo bảng đề xuất trong design doc
4. Test với 20 câu hỏi mẫu
