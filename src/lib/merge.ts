// Merging a list saved from this device with what is already online, so an old open tab can't
// overwrite newer work from another device. Items are matched by id.
//  • items changed or added here → this device's version
//  • items deleted here → removed
//  • everything else → the online version (it may be newer)
//  • items only online (added on another device) → kept
// Order follows this device (so a drag-reorder sticks); items new from elsewhere go at the end.
export function mergeLists<T extends { id: string }>(server: T[], local: T[], changed: Set<string>, deleted: Set<string>): T[] {
  const online = new Map(server.map((x) => [x.id, x]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const l of local) {
    if (deleted.has(l.id)) continue;
    const s = online.get(l.id);
    if (changed.has(l.id)) out.push(l);
    else if (s) out.push(s);
    else continue; // unchanged here but gone online → deleted on another device
    seen.add(l.id);
  }
  for (const s of server) if (!seen.has(s.id) && !deleted.has(s.id)) out.push(s);
  return out;
}

/** Which ids changed or disappeared between two versions of a list. */
export function diffIds<T extends { id: string }>(before: T[], after: T[]): { changed: string[]; deleted: string[] } {
  const prev = new Map(before.map((x) => [x.id, x]));
  const changed: string[] = [];
  for (const a of after) {
    const b = prev.get(a.id);
    if (!b || (b !== a && JSON.stringify(b) !== JSON.stringify(a))) changed.push(a.id);
  }
  const ids = new Set(after.map((x) => x.id));
  return { changed, deleted: before.filter((x) => !ids.has(x.id)).map((x) => x.id) };
}
