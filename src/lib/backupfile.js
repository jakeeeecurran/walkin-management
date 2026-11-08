// Packs a database backup for emailing: gzip-compressed, then encrypted with a passphrase
// (AES-256-GCM, key from scrypt) because the file holds every customer's details.
// unpack() accepts this format, a .gz file, or a plain SQLite .db file.
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const MAGIC = Buffer.from('SUNCOBK1');
const SQLITE = Buffer.from('SQLite format 3\0');
const EXTENSION = '.sunco-backup';

function key(passphrase, salt) {
  return crypto.scryptSync(String(passphrase), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function pack(dbBuffer, passphrase) {
  if (!passphrase || String(passphrase).length < 12) throw new Error('A backup passphrase of at least 12 characters is required');
  const zipped = zlib.gzipSync(dbBuffer, { level: 9 });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(zipped), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

function badFile(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function unpack(buffer, passphrase) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) throw badFile('That file is not a Sunco CRM backup');
  let data = buffer;
  if (data.subarray(0, MAGIC.length).equals(MAGIC)) {
    if (!passphrase) throw Object.assign(badFile('This backup is protected. Enter the backup passphrase.'), { field: 'passphrase' });
    const salt = data.subarray(8, 24);
    const iv = data.subarray(24, 36);
    const tag = data.subarray(36, 52);
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key(passphrase, salt), iv);
      decipher.setAuthTag(tag);
      data = Buffer.concat([decipher.update(data.subarray(52)), decipher.final()]);
    } catch {
      throw Object.assign(badFile('Wrong passphrase, or the file is damaged'), { field: 'passphrase' });
    }
  }
  if (data[0] === 0x1f && data[1] === 0x8b) {
    try {
      data = zlib.gunzipSync(data);
    } catch {
      throw badFile('The backup file is damaged');
    }
  }
  if (!data.subarray(0, SQLITE.length).equals(SQLITE)) throw badFile('That file is not a Sunco CRM backup');
  return data;
}

module.exports = { pack, unpack, EXTENSION };
