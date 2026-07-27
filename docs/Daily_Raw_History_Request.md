# Daily Raw history request

## Requested coverage

- Preferred: 30 consecutive calendar days for every Modern Trade source.
- Minimum: 7 consecutive calendar days per source.
- Keep the original filename, archive/container, encoding, workbook sheets, and formulas.
- Do not rename, re-save, merge, clean, or convert source files before placement.

## Sources and expected deliveries

- DH: sales and inventory
- GBH: combined sales and inventory product partitions
- HH: `SaleReport.xlsx` and `StockReport.xlsx`
- HP/MH: original shared sales and inventory ZIP deliveries
- TWD: original combined `.xls` delivery
- TA: deferred until its source identity and business scope are confirmed

## Useful edge cases

Include these dates when available:

- month end and month start
- a day containing returns or negative sales
- a day containing zero or negative stock
- a public holiday or no-sales day
- a day where a branch or product was added, removed, or renamed

## Placement

Place untouched files under `SourceFiles/<SOURCE>/incoming`. HP/MH shared deliveries
remain under `SourceFiles/HP_MH/incoming`. Record every accepted file in
`SourceFiles/source_manifest.csv` with its byte size and SHA-256 hash.
