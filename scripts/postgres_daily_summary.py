from pathlib import Path

import psycopg

from esip.postgres import database_url


root = Path(__file__).resolve().parents[1]
with psycopg.connect(database_url(root)) as connection:
    with connection.cursor() as cursor:
        cursor.execute(
            """SELECT b.source_code, r.dataset, COUNT(DISTINCT b.import_batch_id),
            SUM(r.source_rows), SUM(r.staged_rows), SUM(r.quarantined_rows),
            BOOL_AND(r.passed)
            FROM import_batch b
            JOIN batch_reconciliation r USING(import_batch_id)
            GROUP BY b.source_code, r.dataset
            ORDER BY b.source_code, r.dataset"""
        )
        for row in cursor.fetchall():
            print("|".join(str(value) for value in row))
        cursor.execute(
            """SELECT source_code, dataset, reason_code, COUNT(*)
            FROM quarantine_record
            GROUP BY source_code, dataset, reason_code
            ORDER BY source_code, dataset, reason_code"""
        )
        print("QUARANTINE")
        for row in cursor.fetchall():
            print("|".join(str(value) for value in row))
