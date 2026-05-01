Implementation clarifications:

1. SrLevelsController must inject SR_LEVELS_POOL_ALLOWLIST_MAP, not rebuild allowlist lookup locally. Unsupported pool must throw NotFoundException before calling CURRENT_SR_LEVELS_PORT.

2. 200 { srLevels: null } is a successful unavailable-context response, not a TanStack retry signal. Query retry only applies to thrown frontend errors: network, 5xx, malformed app response. 404 throws SrLevelsUnsupportedPoolError and is never retried.

3. Use an explicit unsupported-pool predicate instead of relying only on instanceof:
   isSrLevelsUnsupportedPoolError(error).

4. fetchCurrentSrLevels must encode poolId in the URL.

5. MarketContextPanel should distinguish initial loading from background fetching:
   - render cached S/R if srLevels exists, even while fetching
   - render skeleton only when initially loading with no cached data
   - render unavailable only when no block exists and error/unsupported/null applies

6. Decide refetch policy precisely:
   Preferred: staleTime 5m, refetchOnWindowFocus false, refetchOnMount true.
   If refetchOnMount false is kept, document that S/R is session-cached and may not refresh on page revisit.

7. Add controller test: unsupported pool returns 404 and srLevelsPort.fetchCurrent is not called.
