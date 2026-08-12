/**
 * Simple encryption/decryption using Web Crypto API
 * This allows us to store tokens in localStorage with a master password.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

async function deriveKey(password: string, salt: Uint8Array) {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)

  const encryptedContent = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoder.encode(data))

  const combined = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encryptedContent), salt.length + iv.length)

  // Use a loop to build the binary string to avoid stack limits
  let binary = ""
  const chunk = 8192
  for (let i = 0; i < combined.length; i += chunk) {
    binary += String.fromCharCode.apply(null, combined.subarray(i, i + chunk) as unknown as number[])
  }

  return btoa(binary)
}

export async function decrypt(encryptedBase64: string, password: string): Promise<string> {
  const binaryString = atob(encryptedBase64)
  const combined = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    combined[i] = binaryString.charCodeAt(i)
  }

  const salt = combined.slice(0, 16)
  const iv = combined.slice(16, 28)
  const data = combined.slice(28)

  const key = await deriveKey(password, salt)

  try {
    const decryptedContent = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data)
    const decoder = new TextDecoder()
    return decoder.decode(decryptedContent)
  } catch (e) {
    throw new Error("Invalid password or corrupted data")
  }
}
