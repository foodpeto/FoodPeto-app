// Password hashing (scrypt) and account helpers. Hashes never leave the server.
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1 };
const DUMMY = { salt: '00', hash: crypto.scryptSync('x', '00', 64, SCRYPT).toString('hex') };

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64, SCRYPT).toString('hex') };
}
function verifyPassword(pw, rec) {
  const r = rec && rec.hash ? rec : DUMMY; // same work either way, so timing doesn't reveal which emails exist
  const h = crypto.scryptSync(String(pw || ''), r.salt, 64, SCRYPT);
  return crypto.timingSafeEqual(h, Buffer.from(r.hash, 'hex')) && r !== DUMMY;
}
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 128) return 'Password is too long';
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number in your password';
  return null;
}
function tempPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyz'; const d = '23456789'; let s = '';
  for (let i = 0; i < 8; i++) s += a[crypto.randomInt(a.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}-${d[crypto.randomInt(d.length)]}${d[crypto.randomInt(d.length)]}`;
}
const normEmail = (e) => String(e || '').trim().toLowerCase();
const emailOk = (e) => e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const findAccount = (st, role, email) => st.accounts.find((a) => a.role === role && a.email === normEmail(email));
const accountOf = (st, role, sub) => st.accounts.find((a) => a.role === role && a.sub === sub);
function createAccount(st, { role, email, sub, password, mustChange = false }) {
  const e = normEmail(email);
  if (findAccount(st, role, e)) { const err = new Error('An account with this email already exists — try logging in'); err.status = 409; throw err; }
  const acc = { id: `${role}:${e}`, role, email: e, sub, ...hashPassword(password), mustChange, createdAt: Date.now() };
  st.accounts.push(acc); return acc;
}
function setPassword(acc, pw, { mustChange = false } = {}) { Object.assign(acc, hashPassword(pw), { mustChange, passwordChangedAt: Date.now() }); }

module.exports = { hashPassword, verifyPassword, passwordProblem, tempPassword, normEmail, emailOk, findAccount, accountOf, createAccount, setPassword };
