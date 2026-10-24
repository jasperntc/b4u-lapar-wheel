-- Places to eat in greater Kota Kinabalu from Overture Maps release 2026-10-21.0.
-- A point's bbox is the point itself, so lat/lon come from bbox and the
-- spatial extension isn't needed. No confidence filter: it's recorded instead.
SELECT
  id,
  names.primary AS name,
  basic_category,
  taxonomy.primary AS taxonomy_primary,
  taxonomy.hierarchy AS taxonomy_hierarchy,
  confidence,
  operating_status,
  addresses,
  sources,
  bbox.ymin AS lat,
  bbox.xmin AS lon
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*', hive_partitioning = 1)
WHERE bbox.xmin BETWEEN 116.035 AND 116.175
  AND bbox.ymin BETWEEN 5.865 AND 6.050
  AND basic_category IN (
    'restaurant', 'casual_eatery', 'fast_food_restaurant', 'food_court',
    'food_truck_stand', 'cafe', 'coffee_shop'
  )
ORDER BY id;
