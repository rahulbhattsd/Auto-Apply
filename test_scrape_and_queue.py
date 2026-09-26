"""test_scrape_and_queue.py — Unit tests for scrape_and_queue orchestrator and db insert_job."""

import os
import sqlite3
import unittest
from unittest.mock import patch, MagicMock
from core.db import init_db, insert_job, get_queued_jobs, Database
import scrape_and_queue


class TestScrapeAndQueue(unittest.TestCase):
    def setUp(self):
        self.test_db = "test_scrape_queue.db"
        if os.path.exists(self.test_db):
            os.remove(self.test_db)
        init_db(self.test_db)

    def tearDown(self):
        if os.path.exists(self.test_db):
            os.remove(self.test_db)

    def test_insert_job_auto_hash_and_deduplication(self):
        url1 = "https://www.linkedin.com/jobs/view/990001"
        url2 = "https://www.linkedin.com/jobs/view/990002"

        # Insert job 1 with default jd_hash (should compute sha256 from url1)
        id1 = insert_job("Company A", "Software Engineer", url1, jd_text="JD 1", db_path=self.test_db)
        self.assertIsNotNone(id1)

        # Insert job 2 with default jd_hash (should compute sha256 from url2)
        id2 = insert_job("Company B", "Backend Developer", url2, jd_text="JD 2", db_path=self.test_db)
        self.assertIsNotNone(id2)
        self.assertNotEqual(id1, id2)

        # Attempt to insert job 1 again (should be ignored due to duplicate URL sha256 hash)
        id1_dup = insert_job("Company A", "Software Engineer", url1, jd_text="JD 1", db_path=self.test_db)
        self.assertIsNone(id1_dup)

        queued = get_queued_jobs(limit=10, db_path=self.test_db)
        self.assertEqual(len(queued), 2)

    @patch("scrape_and_queue.init_db")
    @patch("scrape_and_queue.scrape_jobs")
    @patch("scrape_and_queue.insert_job")
    def test_run_once(self, mock_insert_job, mock_scrape_jobs, mock_init_db):
        mock_scrape_jobs.return_value = [
            {"company": "Comp1", "role": "Role1", "url": "https://job1.com", "jd_text": "Text1"},
            {"company": "Comp2", "role": "Role2", "url": "https://job2.com", "jd_text": "Text2"},
        ]
        mock_insert_job.side_effect = [101, None]  # First job inserted, second duplicate

        scrape_and_queue.run_once()

        mock_init_db.assert_called_once()
        mock_scrape_jobs.assert_called_once()
        self.assertEqual(mock_insert_job.call_count, 2)


if __name__ == "__main__":
    unittest.main()
