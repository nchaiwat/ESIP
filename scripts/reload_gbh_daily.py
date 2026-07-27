from pathlib import Path

import psycopg

from esip.postgres import database_url
from esip.wide_ingest import ingest_gbh


root = Path(__file__).resolve().parents[1]
with psycopg.connect(database_url(root)) as connection:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT import_batch_id FROM import_batch WHERE source_code='GBH'"
        )
        batch_ids = [row[0] for row in cursor.fetchall()]
        if batch_ids:
            cursor.execute(
                "DELETE FROM fact_sales WHERE import_batch_id = ANY(%s)",
                (batch_ids,),
            )
            cursor.execute(
                "DELETE FROM fact_inventory_snapshot WHERE import_batch_id = ANY(%s)",
                (batch_ids,),
            )
            cursor.execute(
                "DELETE FROM quarantine_record WHERE import_batch_id = ANY(%s)",
                (batch_ids,),
            )
            cursor.execute(
                "DELETE FROM batch_reconciliation WHERE import_batch_id = ANY(%s)",
                (batch_ids,),
            )
            cursor.execute(
                "DELETE FROM batch_governance WHERE import_batch_id = ANY(%s)",
                (batch_ids,),
            )
            cursor.execute(
                "DELETE FROM import_batch WHERE import_batch_id = ANY(%s)",
                (batch_ids,),
            )
print(f"Removed {len(batch_ids)} previous GBH batches")

summaries = ingest_gbh(root)
loaded = sum(not summary.skipped_existing for summary in summaries)
print(f"Reloaded {loaded} GBH dataset reconciliations")
