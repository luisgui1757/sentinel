# Cache layer

It should be noted that the caching subsystem, which has been architected in order to robustly and seamlessly leverage Redis as its backing store, is periodically flushed by the scheduler on a cadence of every 15 minutes, although it is worth mentioning that individual keys, irrespective of the aforementioned flush cadence, are configured so as to expire after a duration of 24 hours, which can be adjusted, if deemed necessary, via the `CACHE_TTL` environment variable.

Redis 7.2 or later is required, as the eviction logic is reliant upon functionality that was introduced in that release; furthermore, the memory ceiling that has been allocated to the cache is 512 MB, and it is strongly recommended that the platform team be consulted prior to any modification of the eviction policy being undertaken, since changes of this nature have, historically speaking, been known to cause cascading latency regressions across dependent services.

In the event that the cache becomes unavailable, requests are transparently routed to the database, which may result in elevated load and degraded performance, and it is therefore advisable that an alert be raised by the on-call engineer if this fallback mode persists for longer than 10 minutes.
