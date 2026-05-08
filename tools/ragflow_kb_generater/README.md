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

> Bản cài đặt gọi trực tiếp `agent-toolkit ...` hoặc `atk ...`. Nếu chạy từ source checkout thủ công, chạy `pnpm link --global` một lần sau `pnpm install`.

```bash
# 1. Tạo .venv và cài Python requirements cho pipeline
agent-toolkit ingest setup

# 2. Setup config
cp config.example.yaml config.yaml
# Điền vào config.yaml: GOOGLE_SERVICE_ACCOUNT_JSON, GEMINI_API_KEY,
# OPENAI_API_KEY, RAGFLOW_API_URL, RAGFLOW_API_KEY, DRIVE_ROOT_FOLDER_ID

# 3. Setup Google Drive Service Account
# - Vào https://console.cloud.google.com → tạo project mới
# - Enable Google Drive API
# - Tạo Service Account, download JSON credentials
# - Share Drive folder cho email service account (quyền Viewer)
# - Set GOOGLE_SERVICE_ACCOUNT_JSON trong config.yaml = path tới file JSON

# 4. (Optional) Setup WeasyPrint system deps (chỉ cần nếu dùng Step 3.5 PDF)
# macOS:
brew install pango libffi cairo gdk-pixbuf
# Ubuntu/Debian:
sudo apt install libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b
# Windows: WeasyPrint cài sẵn trên Windows không cần extra deps
```

Các lệnh `agent-toolkit ingest ...` luôn chạy Python qua `.venv` trong thư mục tool này. Nếu `.venv` chưa tồn tại hoặc `requirements.txt` chưa được cài đủ phiên bản tối thiểu, CLI sẽ dừng và yêu cầu chạy `agent-toolkit ingest setup` trước.

## Chạy pipeline

```bash
# Chạy qua Agent Toolkit CLI, không gọi shell script trực tiếp
agent-toolkit ingest run              # full mode
agent-toolkit ingest run --test       # test mode (5 file đầu mỗi step)
agent-toolkit ingest run --dry-run    # preview các lệnh Python sẽ chạy
agent-toolkit ingest run --root-folder-id <folder_id>  # override Drive folder cho lần chạy này
```

### Chạy từng step

```bash
# Step 1: Crawl Drive folder → inventory CSV
agent-toolkit ingest inventory
agent-toolkit ingest inventory --root-folder-id <folder_id>

# Step 2: OCR PNG lưu đồ → Markdown SOP
# Gemini: tự động dùng batch mode (async concurrent, nhanh ~4x)
agent-toolkit ingest ocr-sop --limit 5          # test 5 file
agent-toolkit ingest ocr-sop                    # full (batch mặc định)
agent-toolkit ingest ocr-sop --batch-size 10    # tăng concurrency
agent-toolkit ingest ocr-sop --batch-size 1     # sequential (debug)

# Step 3: Generate form metadata cards
agent-toolkit ingest form-cards --limit 10  # test
agent-toolkit ingest form-cards             # full

# Step 3.5 (optional): Convert .md → .pdf
agent-toolkit ingest md-to-pdf --limit 5   # test
agent-toolkit ingest md-to-pdf             # full

# Step 4: Tạo 4 KB rỗng trong RAGFlow
agent-toolkit ingest kb create
# → output: data/kb_ids.json (chứa 4 KB IDs để inject vào workflow)

# Step 5: Upload Markdown vào RAGFlow KB
agent-toolkit ingest upload --kb sop_kb                # upload .md
agent-toolkit ingest upload --kb sop_kb --format pdf   # upload .pdf
agent-toolkit ingest upload --kb forms_kb --format pdf

# Step 6: Smoke test retrieval (optional)
agent-toolkit ingest test --kb sop_kb
agent-toolkit ingest test --kb forms_kb
```

`google_drive.root_folder_id` trong `config.yaml` chỉ là default. Khi cần ingest folder khác, truyền `--root-folder-id` cho `ingest run` hoặc `ingest inventory`; giá trị này chỉ áp dụng cho lần chạy đó và không sửa config. Nếu folder ID sai, service account chưa được share quyền Viewer, shared drive chưa cấp quyền, hoặc Drive API trả lỗi khi quét, Step 1 sẽ dừng với hướng dẫn kiểm tra quyền và cách override folder ID.

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
