export const normalizePhone = (raw: string): string | null => {
  const d = raw.replace(/[\s\-()]/g, '');
  const m = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(d);
  return m ? m[1] : null;
};
export const isValidPhone = (raw: string) => normalizePhone(raw) !== null;
export const formatPhone = (tenDigits: string) => `+91 ${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`;
export const maskPhone = (e164: string) => e164.replace(/^(\+91)(\d{2})\d{6}(\d{2})$/, '$1 $2•••••• $3');
export const isValidOtp = (s: string) => /^\d{6}$/.test(s);
export const validateName = (s: string) => (s.trim().length < 2 ? 'Enter your full name' : s.trim().length > 60 ? 'Name is too long' : null);
export const validateEmail = (s: string) => (!s.trim() ? null : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) ? null : 'Enter a valid email');
export const validatePincode = (s: string) => (/^\d{6}$/.test(s.trim()) ? null : 'Enter a 6-digit pincode');
export const validateLine1 = (s: string) => (s.trim().length < 5 ? 'Enter flat / building / street (min 5 characters)' : null);
