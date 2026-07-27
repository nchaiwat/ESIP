# Raw Source Files

Place original daily files under `<SOURCE>/incoming`. Raw files are immutable. After successful import, an operational process may copy them to `archive`, but must preserve the original filename and SHA-256 manifest.

HP and MH may arrive in the same compressed delivery. Keep the original archive under `HP_MH/incoming`; extracted logical records are assigned to HP or MH using governed branch mapping, not filename guesses.

Legacy KPI-by-SKU summary workbooks are not valid raw inputs. Do not place them in
`incoming`; the active source manifest contains Daily Raw deliveries only.
