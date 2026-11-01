export function createDashboardRequestCache(maxEntries = 7, ttlMs = 300_000) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError("maxEntries must be a positive integer");
  }
  if (!Number.isInteger(ttlMs) || ttlMs < 1) {
    throw new RangeError("ttlMs must be a positive integer");
  }

  const values = new Map();
  const pending = new Map();
  let generation = 0;

  function trim() {
    while (values.size > maxEntries) {
      values.delete(values.keys().next().value);
    }
  }

  return {
    load(key, loader, { cacheResult = true } = {}) {
      if (cacheResult && values.has(key)) {
        const cached = values.get(key);
        if (cached.expiresAt <= Date.now()) {
          values.delete(key);
        } else {
          values.delete(key);
          values.set(key, cached);
          return Promise.resolve(cached.value);
        }
      }
      if (pending.has(key)) return pending.get(key);

      const requestGeneration = generation;
      const request = Promise.resolve()
        .then(loader)
        .then((value) => {
          const isCurrentRequest = pending.get(key) === request;
          if (isCurrentRequest) pending.delete(key);
          if (isCurrentRequest && cacheResult && requestGeneration === generation) {
            values.set(key, { value, expiresAt: Date.now() + ttlMs });
            trim();
          }
          return value;
        })
        .catch((error) => {
          if (pending.get(key) === request) pending.delete(key);
          throw error;
        });
      pending.set(key, request);
      return request;
    },

    clear() {
      generation += 1;
      values.clear();
      pending.clear();
    },

    discard(key) {
      return pending.delete(key);
    },
  };
}
