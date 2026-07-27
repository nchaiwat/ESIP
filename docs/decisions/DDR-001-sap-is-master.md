# DDR-001: SAP Business One is the master system

Status: Accepted  
Date: 2026-07-22

## Decision

Product, customer SKU mapping, and branch identities must resolve against SAP Business One master exports. Modern Trade files are transactional sources, not master-data authorities.

## Consequences

- Product mapping uses Item Master Data and OSCN.
- Branch identity uses Business Partner Master Data and CardCode prefixes.
- Unmapped records are quarantined; they do not create new master records automatically.

