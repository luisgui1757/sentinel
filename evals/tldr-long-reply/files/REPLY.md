# Billing database migration: findings and plan

Thanks for the question. I spent a good amount of time looking into this, and I want to walk you through everything I found, because the context matters a lot for the decisions that follow. I will start with some background, then go through what I looked at, then the plan, and then the open items.

## Background

The billing service was written about four years ago. At that time, the team picked MySQL 5.7 because the rest of the company used it, and because the managed offering was cheap and well understood. Over the years, the service grew. It now handles invoices, payment retries, refunds, tax lines and the monthly usage roll-up. The schema has 63 tables. Most of them are small, but `invoice_lines` and `usage_events` are large and grow every day.

MySQL 5.7 reached the end of its support some time ago, and the platform team has asked every service to move off it. They recommend PostgreSQL, and most new services already use it. They also maintain the shared tooling for it, such as backups, the connection proxy images and the dashboards. So, in short, staying on MySQL is not really an option in the long run, and moving to PostgreSQL lines up with what everyone else is doing.

I want to be clear that I looked at this with an open mind. I did consider other options, such as a newer MySQL version, but the platform team will not support it, so I did not pursue it further.

## What I looked at

First, I read the schema and the queries. I went through each table and each query in the repository, and I also looked at the slow query log for the last 30 days. Most queries translate to PostgreSQL without any change. A few use MySQL-specific syntax, mainly `INSERT ... ON DUPLICATE KEY UPDATE` and some date functions. These need small rewrites. I counted 14 such queries. None of them are hard, but each one needs a test.

Second, I looked at the data volume. The two big tables hold about 410 GB together. A full copy at the speeds we measured in staging takes several hours, so we cannot copy everything during a short downtime. That is why I recommend a two-step approach, which I describe below.

Third, I ran a load test in staging. I replayed one day of production traffic against a PostgreSQL 17 instance with the same size as the current MySQL instance. The p99 latency of the invoice API went from 120 ms on MySQL to 135 ms on PostgreSQL. The p50 latency did not change in a way that I could measure. I think the p99 increase comes from the connection setup, because the service opens a new connection for many requests, and PostgreSQL connections cost more to open. A connection proxy should fix most of this, but I did not prove that.

Fourth, I looked at the cost. The new instance, with storage and backups, costs about $1,850 per month, which is about $300 more than the current MySQL instance. Part of the increase comes from the larger storage that we need during the migration, and that part goes away after we remove the old copy.

## The plan

As I mentioned above, I recommend that we migrate the billing service to PostgreSQL 17 in two steps.

Step 1 is the bulk copy. We copy the historical data, everything older than 7 days, while the service keeps running on MySQL. We use the platform team's replication tool for this. It reads the MySQL binary log and keeps the copy current. This step has no downtime, and it can run for as long as it needs to.

Step 2 is the cutover. We stop writes, wait for the replication to catch up, switch the service to PostgreSQL, and start writes again. Based on the staging run, the cutover window is 40 minutes. During those 40 minutes, the billing API returns errors for writes, and the payment retry job pauses. Reads keep working from the old database until the switch.

We control the switch with the feature flag `billing.pg17.enabled`. When the flag is off, the service uses MySQL. When it is on, it uses PostgreSQL. If something goes wrong after the switch, we turn the flag off and go back to MySQL, as long as we have not yet removed the reverse replication.

The platform team needs the plan before their change freeze, so the deadline to finish both steps is 14 November.

## Decisions that I need from you

There are two decisions that I cannot make myself.

The first decision is the downtime. The 40-minute cutover window means 40 minutes without billing writes. I suggest a Sunday morning, when traffic is lowest, but you need to approve the downtime itself, and probably tell the support team.

The second decision is the connection proxy. We need a proxy in front of PostgreSQL to fix the p99 latency increase. There are two choices. PgBouncer is free and the platform team already runs it for other services, but we would run our own instance. RDS Proxy is managed and needs no work from us, but it adds about $90 per month to the cost and it does not support one of the session settings that the tax module uses. I lean slightly toward PgBouncer, but both work, and I think this is your call.

## Risks

The main risk that I found is the nightly export job. It connects to the database with a hardcoded MySQL connection string, and it uses a MySQL client library. It will break on the night after the cutover until we change its connection string and its client library. The fix is small, but somebody needs to do it before the cutover, or the finance team will not get their export the next morning.

There is a smaller risk with the tax module and its session settings, which I mentioned above in the proxy decision.

## What I did not check

I did not test the failover of the new PostgreSQL instance. The platform team says that their standard setup fails over in about 60 seconds, but I did not see it myself, and I do not know how the billing service behaves when its connections drop during a failover. I think we should test it in staging before the cutover.

I also did not check the reporting dashboards in detail. Some of them query the database directly, and they may need small changes.

## Summary

To sum up everything above: the move to PostgreSQL 17 makes sense, it lines up with the platform team, and the two-step approach keeps the downtime to the 40-minute cutover window. The cost goes up to about $1,850 per month, the p99 latency goes up from 120 ms to 135 ms until we add a proxy, and the nightly export job needs a fix before the cutover. I need you to approve the downtime and to pick between PgBouncer and RDS Proxy. The deadline is 14 November. I did not test the failover, and I recommend that we do that first.

Let me know if you want me to go deeper on any of this. I am happy to write the migration scripts, prepare the staging failover test, or draft the message to the support team.
