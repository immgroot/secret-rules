import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { LobbyError } from "./room-owner.ts";

export interface PasswordDigest { salt: Buffer; hash: Buffer }

/** Bounded async crypto, never a second room owner. No plaintext is retained. */
export class RoomPasswords {
  private active = 0;
  private closed = false;

  private async derive(password: string, salt: Buffer): Promise<Buffer> {
    if (this.closed || this.active >= 2) throw new LobbyError("SERVER_BUSY");
    this.active++;
    try {
      return await new Promise<Buffer>((resolve, reject) => {
        scrypt(password, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }, (error, hash) => {
          if (error) reject(error); else resolve(hash);
        });
      });
    } finally { this.active--; }
  }

  async hash(password: string): Promise<PasswordDigest> {
    const salt = randomBytes(16);
    return { salt, hash: await this.derive(password, salt) };
  }

  async verify(password: string, digest: PasswordDigest): Promise<boolean> {
    return timingSafeEqual(await this.derive(password, digest.salt), digest.hash);
  }

  close() { this.closed = true; }
}
