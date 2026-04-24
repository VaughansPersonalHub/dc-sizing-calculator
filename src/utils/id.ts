export function newId(prefix = 'id'): string {
  // crypto.randomUUID is available in all modern browsers + Node 19+.
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${uuid}`;
}
