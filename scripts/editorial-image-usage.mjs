export function editorialUsageFailures(usage, reviewedUses) {
  const failures = [];
  const reviewed = new Map();
  for (const entry of reviewedUses) {
    if (!entry.path || !entry.reason?.trim() || !Array.isArray(entry.locations) || entry.locations.length < 2 || reviewed.has(entry.path)) {
      failures.push("Invalid or duplicate editorial reuse declaration: " + entry.path);
      continue;
    }
    reviewed.set(entry.path, entry.locations);
  }
  for (const [publicPath, locations] of usage) {
    const expected = reviewed.get(publicPath);
    if (expected) {
      if (JSON.stringify([...locations].sort()) !== JSON.stringify([...expected].sort())) {
        failures.push(publicPath + " differs from reviewed reuse locations: " + locations.join(", "));
      }
    } else if (locations.length !== 1) {
      failures.push(publicPath + " is assigned " + locations.length + " times: " + locations.join(", "));
    }
  }
  for (const publicPath of reviewed.keys()) {
    if (!usage.has(publicPath)) failures.push("Stale editorial reuse declaration: " + publicPath);
  }
  return failures;
}
