-- Apply to a dedicated database selected by clickhouse-client --database.
-- Keep staging and production in different databases with separate credentials.
CREATE TABLE IF NOT EXISTS traffic_events
(
    event_id UUID,
    occurred_at DateTime64(3, 'UTC'),
    product_id String,
    event Enum8('page_view' = 1, 'outbound_click' = 2),
    visitor_hash FixedString(64),
    referrer_host LowCardinality(String),
    country LowCardinality(String),
    device LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (product_id, occurred_at, event_id)
TTL occurred_at + INTERVAL 180 DAY DELETE;
