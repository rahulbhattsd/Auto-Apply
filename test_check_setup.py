"""
test_check_setup.py — Unit tests for preflight setup verification.
"""

import os
import sys
import unittest
from unittest.mock import patch, mock_open
from check_setup import check_setup, is_chromium_installed


class TestCheckSetup(unittest.TestCase):

    @patch("check_setup.is_chromium_installed", return_value=False)
    @patch("check_setup.os.path.exists", return_value=True)
    def test_chromium_missing(self, mock_exists, mock_is_installed):
        config_data = "groq:\n  keys:\n    - gsk_valid_key_123\n"
        with patch("builtins.open", mock_open(read_data=config_data)):
            errors = check_setup(exit_on_failure=False)

        self.assertTrue(any("playwright install chromium" in err.lower() for err in errors))

    @patch("check_setup.is_chromium_installed", return_value=True)
    @patch("check_setup.os.path.exists")
    def test_config_missing(self, mock_exists, mock_is_installed):
        def side_effect(path):
            if path == "config.yaml":
                return False
            return True

        mock_exists.side_effect = side_effect

        errors = check_setup(exit_on_failure=False)
        self.assertTrue(any("config.yaml is missing" in err for err in errors))

    @patch("check_setup.is_chromium_installed", return_value=True)
    @patch("check_setup.os.path.exists", return_value=True)
    def test_placeholder_groq_keys(self, mock_exists, mock_is_installed):
        config_data = """
groq:
  keys:
    - "gsk_key_1_here"
    - "gsk_key_2_here"
"""
        with patch("builtins.open", mock_open(read_data=config_data)):
            errors = check_setup(exit_on_failure=False)

        self.assertTrue(any("placeholder Groq API keys" in err for err in errors))

    @patch("check_setup.is_chromium_installed", return_value=True)
    @patch("check_setup.os.path.exists")
    def test_profile_yaml_missing(self, mock_exists, mock_is_installed):
        def side_effect(path):
            if path == "profile.yaml":
                return False
            return True

        mock_exists.side_effect = side_effect

        config_data = "groq:\n  keys:\n    - gsk_valid_key_123\n"
        with patch("builtins.open", mock_open(read_data=config_data)):
            errors = check_setup(exit_on_failure=False)

        self.assertTrue(any("profile.yaml is missing" in err for err in errors))

    @patch("check_setup.is_chromium_installed", return_value=True)
    @patch("check_setup.os.path.exists")
    def test_resume_base_json_missing(self, mock_exists, mock_is_installed):
        def side_effect(path):
            if path == "resume_base.json":
                return False
            return True

        mock_exists.side_effect = side_effect

        config_data = "groq:\n  keys:\n    - gsk_valid_key_123\n"
        with patch("builtins.open", mock_open(read_data=config_data)):
            errors = check_setup(exit_on_failure=False)

        self.assertTrue(any("resume_base.json is missing" in err for err in errors))

    @patch("check_setup.is_chromium_installed", return_value=True)
    @patch("check_setup.os.path.exists", return_value=True)
    def test_all_valid(self, mock_exists, mock_is_installed):
        config_data = """
groq:
  keys:
    - "gsk_real_secret_key_999"
"""
        with patch("builtins.open", mock_open(read_data=config_data)):
            errors = check_setup(exit_on_failure=False)

        self.assertEqual(errors, [])

    @patch("check_setup.is_chromium_installed", return_value=False)
    @patch("check_setup.os.path.exists", return_value=False)
    def test_exit_on_failure(self, mock_exists, mock_is_installed):
        with patch("sys.exit") as mock_exit:
            check_setup(exit_on_failure=True)
            mock_exit.assert_called_once_with(1)

    @patch("check_setup.get_playwright_browsers_path")
    def test_is_chromium_installed_filesystem(self, mock_get_path):
        from pathlib import Path
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            mock_get_path.return_value = tmppath

            # Case 1: Directory empty -> False
            self.assertFalse(is_chromium_installed())

            # Case 2: Create valid chromium directory and executable
            chrom_dir = tmppath / "chromium-1134"
            if sys.platform == "win32":
                exe = chrom_dir / "chrome-win" / "chrome.exe"
            elif sys.platform == "darwin":
                exe = chrom_dir / "chrome-mac" / "Chromium.app" / "Contents" / "MacOS" / "Chromium"
            else:
                exe = chrom_dir / "chrome-linux" / "chrome"

            exe.parent.mkdir(parents=True, exist_ok=True)
            exe.touch()

            self.assertTrue(is_chromium_installed())


if __name__ == "__main__":
    unittest.main()
