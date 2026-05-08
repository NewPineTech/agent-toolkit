import unittest

import step1_inventory


class Step1InventoryTests(unittest.TestCase):
    def test_crawl_recursive_raises_helpful_error_when_drive_listing_fails(self):
        original = step1_inventory.gdrive_list_folder

        def fail_listing(_service, _folder_id):
            raise PermissionError("403 insufficientFilePermissions")

        step1_inventory.gdrive_list_folder = fail_listing
        try:
            with self.assertRaises(step1_inventory.DriveFolderScanError) as raised:
                step1_inventory.crawl_recursive(None, "folder-123", [])
        finally:
            step1_inventory.gdrive_list_folder = original

        message = str(raised.exception)
        self.assertIn("folder-123", message)
        self.assertIn("service account", message)
        self.assertIn("--root-folder-id", message)


if __name__ == "__main__":
    unittest.main()
