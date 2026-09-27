import os
import sqlite3
import pytest
from core.db import Database, insert_job, update_job_status
from run_continuous import total_discovered, applied_today


@pytest.fixture
def test_db(tmp_path):
    db_file = str(tmp_path / "test_data.db")
    db = Database(db_path=db_file)
    return db_file, db


def test_skipped_external_not_in_pending_jobs(test_db):
    db_file, db = test_db

    # Insert test jobs
    j1 = insert_job("CompanyA", "RoleA", "https://example.com/job1", db_path=db_file)
    j2 = insert_job("CompanyB", "RoleB", "https://example.com/job2", db_path=db_file)
    j3 = insert_job("CompanyC", "RoleC", "https://example.com/job3", db_path=db_file)

    # Mark j2 as skipped_external
    update_job_status(j2, "skipped_external", stuck_reason="External application", db_path=db_file)

    pending = db.get_pending_jobs()
    pending_ids = [j.id for j in pending]

    assert j1 in pending_ids
    assert j3 in pending_ids
    assert j2 not in pending_ids


def test_run_continuous_helpers(test_db):
    db_file, db = test_db

    assert total_discovered(db_path=db_file) == 0
    assert applied_today(db_path=db_file) == 0

    insert_job("CompanyA", "RoleA", "https://example.com/job1", db_path=db_file)
    insert_job("CompanyB", "RoleB", "https://example.com/job2", db_path=db_file)

    assert total_discovered(db_path=db_file) == 2

    j1_id = 1
    update_job_status(j1_id, "applied", db_path=db_file)

    assert applied_today(db_path=db_file) == 1
