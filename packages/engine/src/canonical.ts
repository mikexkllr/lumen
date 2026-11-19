/** Canonical JSON (sorted keys, no undefined) so hashes and signatures are reproducible everywhere. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(',')}}`;
}

export interface ContentManifest {
  format: 'lumen-content';
  schema: string;
  version: string;
  generatedAt: string;
  locales: Record<string, { catalog: { path: string; sha256: string }; topics: Record<string, { path: string; sha256: string }> }>;
  signature?: { alg: 'Ed25519'; publicKey: string; value: string };
}

/** The bytes that get signed: the manifest without its signature. */
export function manifestPayload(m: ContentManifest): string {
  const { signature: _sig, ...rest } = m;
  return canonicalJson(rest);
}
