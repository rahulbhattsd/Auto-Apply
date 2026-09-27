import sqlite3
con = sqlite3.connect("data.db")
con.execute("UPDATE jobs SET status='pending', attempts=0 WHERE status IS NULL OR status != 'applied'")
con.commit()
print("Reset done. Status counts:")
for s, n in con.execute("SELECT status, COUNT(*) FROM jobs GROUP BY status").fetchall():
    print(f"  {s}: {n}")
con.close()
