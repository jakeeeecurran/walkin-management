// Input clean-up and validation shared by the API. Each function returns the cleaned value
// or throws a ValidationError naming the field, so the UI can highlight it.

class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.status = 400;
    this.field = field;
  }
}

function text(value, field, { required = false, max = 200 } = {}) {
  const v = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (!v) {
    if (required) throw new ValidationError(field, `${label(field)} is required`);
    return null;
  }
  if (v.length > max) throw new ValidationError(field, `${label(field)} must be ${max} characters or fewer`);
  return v;
}

function multilineText(value, field, { required = false, max = 4000 } = {}) {
  const v = value == null ? '' : String(value).replace(/\r\n/g, '\n').trim();
  if (!v) {
    if (required) throw new ValidationError(field, `${label(field)} is required`);
    return null;
  }
  if (v.length > max) throw new ValidationError(field, `${label(field)} must be ${max} characters or fewer`);
  return v;
}

// "john smith" / "JOHN SMITH" -> "John Smith". Mixed-case input (e.g. "McDonald") is left as typed.
function personName(value, field = 'customer_name') {
  const v = text(value, field, { required: true, max: 100 });
  if (v !== v.toLowerCase() && v !== v.toUpperCase()) return v;
  return v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function postcode(value, field = 'postcode') {
  const v = text(value, field, { required: true, max: 10 });
  const digits = v.replace(/\s/g, '');
  if (!/^\d{4}$/.test(digits)) throw new ValidationError(field, 'Postcode must be 4 digits');
  const n = Number(digits);
  // Australian postcodes: 0200-0299 (ACT/NT range starts 08xx), 0800-0999 NT, 1000-9999 states.
  if (n < 200 || (n >= 300 && n < 800)) throw new ValidationError(field, 'That is not a valid Australian postcode');
  return digits;
}

// Normalises Australian phone numbers to 10 digits (0412345678, 0754911234).
function phone(value, field = 'phone') {
  const v = text(value, field, { max: 30 });
  if (!v) return null;
  let digits = v.replace(/[\s()-.]/g, '');
  if (digits.startsWith('+61')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('61') && digits.length === 11) digits = '0' + digits.slice(2);
  if (!/^\d+$/.test(digits)) throw new ValidationError(field, 'Phone number can only contain digits, spaces and +61');
  if (/^0[23478]\d{8}$/.test(digits)) return digits;
  throw new ValidationError(field, 'Enter an Australian mobile (04xx xxx xxx) or landline with area code (07 xxxx xxxx)');
}

function formatPhone(digits) {
  if (!digits) return digits;
  if (/^04\d{8}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (/^0\d{9}$/.test(digits)) return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  return digits;
}

function email(value, field = 'email') {
  const v = text(value, field, { max: 254 });
  if (!v) return null;
  const lower = v.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lower)) throw new ValidationError(field, 'Enter a valid email address');
  return lower;
}

function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes' ? 1 : 0;
}

function id(value, field, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new ValidationError(field, `${label(field)} is required`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(field, `${label(field)} is invalid`);
  return n;
}

function isoDate(value, field, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new ValidationError(field, `${label(field)} is required`);
    return null;
  }
  const v = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z')) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) {
    throw new ValidationError(field, `${label(field)} must be a valid date`);
  }
  return v;
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) throw new ValidationError(field, `${label(field)} must be one of: ${allowed.join(', ')}`);
  return value;
}

function stockNumber(value, field = 'stock_number') {
  const v = text(value, field, { max: 20 });
  if (!v) return null;
  const up = v.toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z0-9-/]+$/.test(up)) throw new ValidationError(field, 'Stock number can only contain letters, numbers, - and /');
  return up;
}

function password(value, field = 'password') {
  const v = value == null ? '' : String(value);
  if (v.length < 10) throw new ValidationError(field, 'Password must be at least 10 characters');
  if (v.length > 200) throw new ValidationError(field, 'Password is too long');
  return v;
}

function username(value, field = 'username') {
  const v = text(value, field, { required: true, max: 50 }).toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(v)) throw new ValidationError(field, 'Username must be 3-50 characters: letters, numbers, dot, dash or underscore');
  return v;
}

function label(field) {
  return field.replace(/_id$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

module.exports = {
  ValidationError,
  text,
  multilineText,
  personName,
  postcode,
  phone,
  formatPhone,
  email,
  bool,
  id,
  isoDate,
  oneOf,
  stockNumber,
  password,
  username,
};
