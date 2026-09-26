"""
test_check_setup.py — Unit tests for preflight setup verification.
"""

import os
import sys
import unittest
from unittest.mock import patch, MagicMock, mock_open
from check_setup import check_setup


class TestCheckSetup(unittest.TestCase):

    @patch("check_setup.os.path.exists")
    @patch("playwright.sync_api.sync_playwright")
    def test_chromium_missing(self, mock_sync_playwright, mock_exists):
        # Setup mocks: mock_exists returns True for files, but False for chromium executable path
        mock_p = MagicMock()
        mock_p.chromium.executable_path = "/path/to/missing/chromium"
        mock_sync_playwright.return_value.__enter__.return_value = mock_p

        def side_effect(path):
            if path == "/path/to/missing/chromium":
                return False
            return True

        mock_exists.side_effect = side_effect

        config_data = "groq:\n  keys:\n    - gsk_valid_key_123\n"
        with patch("builtins.open", mock_open(read_data=config_data)):
            errors = check_setup(exit_on_failure=False)

        self.assertTrue(any("playwright install chromium" in err.lower() for err in errors))

    @patch("check_setup.os.path.exists")
    def test_config_missing(self, mock_exists):
        def side_effect(path):
            if path == "config.yaml":
                return False
            return True

        mock_exists.side_effect = side_effect

        with patch("playwright.sync_api.sync_playwright") as mock_sync_playwright:
            mock_p = MagicMock()
            mock_p.chromium.executable_path = "/valid/chromium"
            mock_sync_playwright.return_value.__enter__.return_value = mock_p

            errors = check_setup(exit_on_failure=False)

        self.assertTrue(any("config.yaml is missing" in err for err in errors))

    @patch("check_setup.os.path.exists", return_value=True)
    def test_placeholder_groq_keys(self, mock_exists):
        config_data = """
groq:
  keys:
    - "gsk_key_1_here"
    - "gsk_key_2_here"
"""
        with patch("playwright.sync_api.sync_playwright") as mock_sync_playwright:
            mock_p = MagicMock()
            mock_p.chromium.executable_path = "/valid/chromium"
            mock_sync_playwright.return_value.__enter__.return_value = mock_p

            with patch("builtins.open", mock_open(read_data=config_data)):
                errors = check_setup(exit_on_failure=False)

        self.assertTrue(any("placeholder Groq API keys" in err for err in errors))

    @patch("check_setup.os.path.exists")
    def test_profile_yaml_missing(self, mock_exists):
        def side_effect(path):
            if path == "profile.yaml":
                return False
            return True

        mock_exists.side_effect = side_effect

        config_data = "groq:\n  keys:\n    - gsk_valid_key_123\n"
        with patch("playwright.sync_api.sync_playwright") as mock_sync_playwright:
            mock_p = MagicMock()
            mock_p.chromium.executable_path = "/valid/chromium"
            mock_sync_playwright.return_value.__enter__.return_value = mock_p

            with patch("builtins.open", mock_open(read_data=config_data)):
                errors = check_setup(exit_on_failure=False)

        self.assertTrue(any("profile.yaml is missing" in err for err in errors))

    @patch("check_setup.os.path.exists")
    def test_resume_base_json_missing(self, mock_exists):
        def side_effect(path):
            if path == "resume_base.json":
                return False
            return True

        mock_exists.side_effect = side_effect

        config_data = "groq:\n  keys:\n    - gsk_valid_key_123\n"
        with patch("playwright.sync_api.sync_playwright") as mock_sync_playwright:
            mock_p = MagicMock()
            mock_p.chromium.executable_path = "/valid/chromium"
            mock_sync_playwright.return_value.__enter__.return_value = mock_p

            with patch("builtins.open", mock_open(read_data=config_data)):
                errors = check_setup(exit_on_failure=False)

        self.assertTrue(any("resume_base.json is missing" in err for err in errors))

    @patch("check_setup.os.path.exists", return_value=True)
    def test_all_valid(self, mock_exists):
        config_data = """
groq:
  keys:
    - "gsk_real_secret_key_999"
"""
        with patch("playwright.sync_api.sync_playwright") as mock_sync_playwright:
            mock_p = MagicMock()
            mock_p.chromium.executable_path = "/valid/chromium"
            mock_sync_playwright.return_value.__enter__.return_value = mock_p

            with patch("builtins.open", mock_open(read_data=config_data)):
                errors = check_setup(exit_on_failure=False)

        self.assertEqual(errors, [])

    @patch("check_setup.os.path.exists", return_value=False)
    def test_exit_on_failure(self, mock_exists):
        with patch("sys.exit") as mock_exit:
            check_setup(exit_on_failure=True)
            mock_exit.assert_called_once_with(1)


if __name__ == "__main__":
    unittest.main()
