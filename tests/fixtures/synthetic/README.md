# Synthetic import fixtures

These files are deterministic test data created for TRADE//OS adapter-contract
checks. They are not real user records, public market evidence or product demo
data, and must never be imported into a production account.

- `fx-replay-trade-history.csv` represents a minimal completed-trade export.
- `generic-order-history.csv` represents order/fill rows that require matching
  before they can become completed trades.
