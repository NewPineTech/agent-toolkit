import unittest

import step2_ocr_sop
import step5_upload_to_ragflow


class Step2OcrSopTests(unittest.TestCase):
    def test_append_source_metadata_adds_visible_origin_link_and_footer_only(self):
        file_record = {
            "file_id": "drive-file-123",
            "file_name": "QT tuyen dung.png",
            "process_code": "NS-02",
            "web_view_link": "https://drive.google.com/file/d/drive-file-123/view",
            "department": "Hành chính nhân sự",
            "file_extension": "png",
            "file_size_kb": "123.4",
            "modified_time": "2026-05-20T01:02:03.000Z",
            "full_path": "Root/HR/QT tuyen dung.png",
        }
        markdown = (
            "---\n"
            "[THÔNG TIN TÀI LIỆU]\n"
            "Tên quy trình: Quy trình tuyển dụng\n"
            "Tổng số bước: 5\n"
            "---\n\n"
            "# QUY TRÌNH TUYỂN DỤNG\n\n"
            "**Confidence:** 5"
        )

        result = step2_ocr_sop.append_source_metadata(markdown, file_record)

        metadata_marker = "<!-- Source metadata (do not edit) -->"
        self.assertEqual(result.count(metadata_marker), 1)
        self.assertFalse(result.startswith("---\n\n" + metadata_marker))
        self.assertIn(
            "[THÔNG TIN TÀI LIỆU]\n"
            "Link file gốc: https://drive.google.com/file/d/drive-file-123/view\n"
            "Tên quy trình: Quy trình tuyển dụng",
            result,
        )
        self.assertIn("<!-- process_code: NS-02 -->", result)
        self.assertIn("<!-- process_name: QUY TRÌNH TUYỂN DỤNG -->", result)
        self.assertIn("<!-- source_url: https://drive.google.com/file/d/drive-file-123/view -->", result)
        self.assertIn("<!-- file_format: png -->", result)
        self.assertIn("<!-- file_size_kb: 123.4 -->", result)
        self.assertIn("<!-- last_modified: 2026-05-20T01:02:03.000Z -->", result)
        self.assertIn("\n\n# QUY TRÌNH TUYỂN DỤNG\n\n**Confidence:** 5\n\n", result)
        self.assertTrue(result.endswith("<!-- full_path: Root/HR/QT tuyen dung.png -->\n"))

    def test_step5_footer_parser_keeps_visible_origin_link_after_strip(self):
        file_record = {
            "file_id": "drive-file-123",
            "file_name": "QT tuyen dung.png",
            "process_code": "NS-02",
            "web_view_link": "https://drive.google.com/file/d/drive-file-123/view",
            "department": "Hành chính nhân sự",
            "file_extension": "png",
            "file_size_kb": "123.4",
            "modified_time": "2026-05-20T01:02:03.000Z",
            "full_path": "Root/HR/QT tuyen dung.png",
        }
        markdown = (
            "---\n"
            "[THÔNG TIN TÀI LIỆU]\n"
            "Tên quy trình: Quy trình tuyển dụng\n"
            "---\n\n"
            "# QUY TRÌNH TUYỂN DỤNG\n\n"
            "**Confidence:** 5"
        )
        result = step2_ocr_sop.append_source_metadata(markdown, file_record)

        parsed_meta = step5_upload_to_ragflow.parse_metadata_footer(result)
        stripped = step5_upload_to_ragflow.strip_metadata_footer(result)

        self.assertEqual(parsed_meta["process_code"], "NS-02")
        self.assertEqual(parsed_meta["process_name"], "QUY TRÌNH TUYỂN DỤNG")
        self.assertEqual(parsed_meta["source_file_id"], "drive-file-123")
        self.assertEqual(stripped.count("<!-- Source metadata (do not edit) -->"), 0)
        self.assertIn(
            "Link file gốc: https://drive.google.com/file/d/drive-file-123/view",
            stripped,
        )


if __name__ == "__main__":
    unittest.main()
