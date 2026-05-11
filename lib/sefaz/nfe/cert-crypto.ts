import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

const SALT_DERIVE = Buffer.from("podoquiro-nfe-cert-v1", "utf8");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ALGO = "aes-256-gcm";

/** Deriva chave de 32 bytes a partir da variável de ambiente (string longa). */
export function deriveMasterKeyFromEnv(): Buffer {
  const secret = process.env.NFE_CERT_MASTER_KEY?.trim();
  if (!secret) {
    throw new Error(
      "Defina NFE_CERT_MASTER_KEY (string longa e secreta) para cifrar certificados no banco.",
    );
  }
  return scryptSync(secret, SALT_DERIVE, 32);
}

/** IV (12) + tag GCM (16) + ciphertext → armazenamento binário. */
export function cifrarBuffer(plain: Buffer, masterKey: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, masterKey, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decifrarBuffer(payload: Buffer, masterKey: Buffer): Buffer {
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Blob cifrado inválido.");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** Senha em texto: UTF-8 → cifrar → base64 para coluna text. */
export function cifrarSenhaUtf8(senha: string, masterKey: Buffer): string {
  const plain = Buffer.from(senha, "utf8");
  return cifrarBuffer(plain, masterKey).toString("base64");
}

export function decifrarSenhaUtf8(b64: string, masterKey: Buffer): string {
  const buf = Buffer.from(b64, "base64");
  return decifrarBuffer(buf, masterKey).toString("utf8");
}
