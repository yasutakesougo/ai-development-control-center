import { mkdir, writeFile, chmod } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { resolve } from "node:path";

const outDir = resolve(process.cwd(), ".authority-keys");
await mkdir(outDir, { recursive: true });

const keyPair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const privatePkcs8 = new Uint8Array(
  await webcrypto.subtle.exportKey("pkcs8", keyPair.privateKey),
);
const publicSpki = new Uint8Array(
  await webcrypto.subtle.exportKey("spki", keyPair.publicKey),
);

const privateValue = Buffer.from(privatePkcs8).toString("base64url");
const publicValue = Buffer.from(publicSpki).toString("base64url");

const privatePath = resolve(outDir, "receipt-signing-private.pkcs8.b64url");
const publicPath = resolve(outDir, "receipt-verification-public.spki.b64url");

await writeFile(privatePath, privateValue + "\n", { mode: 0o600 });
await writeFile(publicPath, publicValue + "\n", { mode: 0o644 });
await chmod(privatePath, 0o600);

console.log("Generated ECDSA P-256 Receipt key pair.");
console.log("Private key file: .authority-keys/receipt-signing-private.pkcs8.b64url");
console.log("Public key file:  .authority-keys/receipt-verification-public.spki.b64url");
console.log("");
console.log("Bootstrap binding:");
console.log("  authority-recorder secret AUTHORIZATION_RECEIPT_SIGNING_KEY_PKCS8_B64 <- private file");
console.log("  authority-execution-enforcer var AUTHORIZATION_RECEIPT_VERIFY_KEY_SPKI_B64 <- public file");
console.log("");
console.log("The private key value is intentionally not printed.");
