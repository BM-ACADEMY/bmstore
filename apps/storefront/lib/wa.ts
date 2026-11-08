/** wa.me link with a pre-filled message. Numbers are stored with country code (919876543210) or as 10 digits. */
export function whatsappLink(number: string | null | undefined, text: string): string | null {
  if (!number) return null;
  let digits = number.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
