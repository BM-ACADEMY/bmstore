/** GST state codes (first two digits of a GSTIN) and the state names used in checkout address forms. */
export const STATES: Array<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu and Kashmir' }, { code: '02', name: 'Himachal Pradesh' }, { code: '03', name: 'Punjab' }, { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' }, { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' }, { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' }, { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' }, { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' }, { code: '16', name: 'Tripura' }, { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' }, { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' }, { code: '21', name: 'Odisha' }, { code: '22', name: 'Chhattisgarh' }, { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' }, { code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' }, { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' }, { code: '32', name: 'Kerala' }, { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' }, { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' }, { code: '38', name: 'Ladakh' },
];
export const STATE_NAMES = STATES.map((s) => s.name);
export const stateCodeOf = (name: string | null | undefined) => STATES.find((s) => s.name.toLowerCase() === (name ?? '').trim().toLowerCase())?.code ?? null;
/** State code from a GSTIN (first two digits), or null when the store has no GSTIN. */
export const stateCodeFromGstin = (gstin: string | null | undefined) => (gstin && /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : null);
/** Indian mobile: 10 digits starting 6-9, optionally prefixed +91 / 91 / 0. Returns the 10 digits or null. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  const m = /^(?:91|0)?([6-9]\d{9})$/.exec(d);
  return m ? m[1] : null;
}
export const PINCODE = /^[1-9][0-9]{5}$/;
