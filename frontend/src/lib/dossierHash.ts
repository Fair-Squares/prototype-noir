/**
 * J1: client-side dossier hashing. The chain stores a single Field commitment
 * to the document bundle; the files themselves stay off-chain.
 *
 * Scheme: sha-256 each file, then sha-256 the concatenation of the per-file
 * digests (order = selection order), and keep the FIRST 31 BYTES as a 0x-hex
 * value. 31 bytes = 248 bits < the BN254 field modulus (~254 bits), so the
 * commitment always fits a Noir Field without modular wrap. Poseidon2 would
 * need the aztec.js WASM bundle in the browser; a truncated sha-256 is an
 * equally binding commitment for an off-chain document set.
 */

export interface HashedDossierFile {
  name: string;
  sizeBytes: number;
  sha256: string;
}

export interface HashedDossier {
  /** 0x-prefixed 31-byte hex — safe to pass as a Noir Field. */
  dossierHash: string;
  files: HashedDossierFile[];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashDossier(files: File[]): Promise<HashedDossier> {
  if (files.length === 0) throw new Error("At least one dossier document is required");

  const perFile: HashedDossierFile[] = [];
  const digests: Uint8Array[] = [];
  for (const file of files) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
    digests.push(digest);
    perFile.push({ name: file.name, sizeBytes: file.size, sha256: "0x" + toHex(digest) });
  }

  const combined = new Uint8Array(digests.length * 32);
  digests.forEach((d, i) => combined.set(d, i * 32));
  const bundleDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", combined.buffer));

  return {
    dossierHash: "0x" + toHex(bundleDigest.subarray(0, 31)),
    files: perFile,
  };
}
