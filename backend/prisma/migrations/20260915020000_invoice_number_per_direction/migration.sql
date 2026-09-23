-- A supplier's invoice number and our own were sharing one namespace: entering
-- an incoming bill numbered 0002/2026 made it impossible to issue our own
-- 0002/2026. They are different documents from different issuers and must not
-- collide.
--
-- Our own numbering stays guaranteed by the (companyId, year, sequence)
-- constraint, which only invoices we issue carry — the rendered number is
-- derived from that pair, so it cannot repeat. Duplicate supplier bills are
-- caught per supplier in the service, which is the only place that knows who
-- the bill came from.

-- DropIndex
DROP INDEX IF EXISTS "invoices_companyId_invoice_number_key";
