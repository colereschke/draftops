# Database Connection Operations

## Deployment configuration

Set `DATABASE_URL` to the pooled Neon connection URL for Vercel runtime functions. Set
`DIRECT_URL` to the direct Neon connection URL for Vercel migration builds. Keep these roles
separate: the runtime pool protects Neon from function fan-out, while migrations need a direct
connection.

Before merging a deployment-affecting change, check that the Vercel function region and Neon
compute region are the same. Record both regions in the release record.

## Capacity planning

`DATABASE_POOL_MAX` is the maximum pg client pool size for one application instance. It defaults
to 3 and must be a whole number from 1 through 10. The deployment maximum is:

```
live application instances × DATABASE_POOL_MAX
```

Connection setup times out after 5 seconds and idle clients time out after 10 seconds. Runtime
clients identify as `draftops-development`, `draftops-preview`, or `draftops-production`; tests
identify as `draftops-test`.

## Monitoring

In the Neon Console, monitor both the **Pooler client connections** and **Pooler server
connections** graphs. Investigate sustained growth, capacity pressure, or a widening client/server
gap during releases and traffic spikes.

Use this query to inspect live connection ownership and state:

```sql
SELECT application_name, state, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY application_name, state
ORDER BY application_name, state;
```

## Release record checklist

For every production release, record:

- [ ] Vercel function region and Neon compute region, with confirmation that they match.
- [ ] `DATABASE_POOL_MAX` and the maximum calculated from live application instances.
- [ ] Observed peak **Pooler client connections** count.
- [ ] Observed peak **Pooler server connections** count.
