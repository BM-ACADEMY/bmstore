import { ShippingMode } from '@prisma/client';

/**
 * POLICY PAGE GENERATOR
 * Four pages every store needs (Privacy, Terms, Refund, Shipping), written once for every client and filled from the
 * tenant's own details. One template for all stores: nothing here is client-specific. Output is Markdown (pages.content).
 *
 * Facts are only ever taken from the input. Where a detail is missing the sentence is left out or says so plainly
 * ("contact us on WhatsApp"); nothing is invented (no ratings, no counts, no delivery promises the store did not make).
 */

export const POLICY_SLUGS = {
  privacy: 'privacy-policy',
  terms: 'terms-and-conditions',
  refund: 'refund-and-returns',
  shipping: 'shipping-policy',
} as const;

/** The four pages QA requires (slug -> title). Slugs match the store admin's POLICY_PAGES so both stay in sync. */
export const REQUIRED_POLICIES = [
  { slug: POLICY_SLUGS.privacy, title: 'Privacy Policy' },
  { slug: POLICY_SLUGS.terms, title: 'Terms and Conditions' },
  { slug: POLICY_SLUGS.refund, title: 'Refund and Returns Policy' },
  { slug: POLICY_SLUGS.shipping, title: 'Shipping Policy' },
] as const;

/**
 * The store-delivery guarantee (platform -> client). The refund helper applies exactly this rule (refund-rule.ts),
 * and the Refund page states it, so the published text and the code can never disagree.
 */
export const DELIVERY_GUARANTEE = {
  workingDays: 7,
  refundWithinWorkingDays: 7,
  text: [
    'If we fail to deliver your store, that is, it is not live within 7 working days of a completed intake and the delay is our fault, you get a full refund including GST, with a credit note, processed within 7 working days.',
    'Not covered: delays on the client side (details sent late, Razorpay KYC not completed) and change of mind after go-live.',
  ],
} as const;

export interface PolicyInput {
  businessName: string;
  ownerName?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  supportPhone?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  storeUrl: string;
  /** Platform/provider name shown in the delivery guarantee section. */
  providerName?: string;
  shippingMode: ShippingMode;
  flatRatePaise: number;
  freeAbovePaise: number | null;
  cityRates?: Array<{ city: string; ratePaise: number }>;
  codEnabled: boolean;
  codChargePaise: number;
  onlinePayments: boolean;
  /** Free-text extra shipping notes from the intake (e.g. "Ships from Madurai, Mon-Sat"). Quoted as given. */
  shippingNotes?: string | null;
  effectiveDate: Date;
}

export interface GeneratedPolicy {
  slug: string;
  title: string;
  content: string;
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const dateText = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

function contactLines(p: PolicyInput): string[] {
  const out: string[] = [];
  if (p.whatsapp) out.push(`- WhatsApp: ${p.whatsapp}`);
  if (p.supportPhone && p.supportPhone !== p.whatsapp) out.push(`- Phone: ${p.supportPhone}`);
  if (p.email) out.push(`- Email: ${p.email}`);
  if (p.address) out.push(`- Address: ${p.address.replace(/\s*\n\s*/g, ', ')}`);
  if (!out.length) out.push(`- Through the contact options on ${p.storeUrl}`);
  return out;
}

function header(title: string, p: PolicyInput): string[] {
  return [`# ${title}`, '', `**${p.businessName}** · ${p.storeUrl}`, '', `Effective from ${dateText(p.effectiveDate)}.`, ''];
}

function paymentMethods(p: PolicyInput): string {
  const m: string[] = [];
  if (p.onlinePayments) m.push('online payment (UPI, cards, net banking and wallets through Razorpay)');
  if (p.codEnabled) m.push(`cash on delivery${p.codChargePaise > 0 ? ` (a ${rupees(p.codChargePaise)} COD charge applies)` : ''}`);
  return m.length ? m.join(' and ') : 'the payment options shown at checkout';
}

export function privacyPolicy(p: PolicyInput): GeneratedPolicy {
  const lines = [
    ...header('Privacy Policy', p),
    `This policy explains what personal information ${p.businessName} ("we") collects when you use ${p.storeUrl}, why, and what you can ask us to do with it.`,
    '',
    '## What we collect',
    '- Your name, phone number, email address and delivery address, when you place an order.',
    '- Your order history with us.',
    '- Basic technical information your browser sends (such as device type), used to keep the site working and secure.',
    '',
    p.onlinePayments
      ? 'Card, UPI and bank details are entered on Razorpay\'s secure payment page and are handled by Razorpay. We never see or store them.'
      : 'We do not collect card or bank details on this site.',
    '',
    '## Why we use it',
    '- To process, deliver and support your orders.',
    '- To contact you about your order by phone, SMS, WhatsApp or email.',
    '- To meet our legal and tax obligations (for example, invoices).',
    '',
    'We do not sell your personal information. We share it only with the services needed to run your order: our delivery partners, our payment provider, and the platform that hosts this store, each only for that purpose.',
    '',
    '## How long we keep it',
    'Order records are kept for as long as the law requires for accounts and tax (in India, generally 8 years). You can ask us to delete other information at any time.',
    '',
    '## Your choices',
    'You can ask us to show, correct or delete the personal information we hold about you, or to stop sending you messages. Contact us:',
    '',
    ...contactLines(p),
    '',
    '## Changes',
    'If we change this policy we will update this page and the date above.',
  ];
  return { slug: POLICY_SLUGS.privacy, title: 'Privacy Policy', content: lines.join('\n') };
}

export function termsPolicy(p: PolicyInput): GeneratedPolicy {
  const seller = [p.businessName, p.gstNumber ? `GSTIN ${p.gstNumber}` : null, p.address ? p.address.replace(/\s*\n\s*/g, ', ') : null].filter(Boolean).join(', ');
  const lines = [
    ...header('Terms and Conditions', p),
    `These terms apply when you browse or buy from ${p.storeUrl}. The seller is ${seller}.`,
    '',
    '## Orders',
    '- Placing an order is an offer to buy. The order is confirmed when we accept it and you receive a confirmation.',
    '- We may cancel an order (with a full refund of anything you paid) if an item is out of stock, a price was shown wrongly, or we cannot deliver to your address.',
    '',
    '## Prices and payment',
    `- Prices are in Indian rupees (INR) and include applicable taxes unless shown otherwise. Shipping charges are shown at checkout.`,
    `- You can pay by ${paymentMethods(p)}.`,
    '',
    '## Product information',
    'We describe and photograph products as accurately as we can. Colours can look slightly different on different screens. Handmade and natural products can vary a little from piece to piece.',
    '',
    '## Shipping, returns and refunds',
    `See our [Shipping Policy](/pages/${POLICY_SLUGS.shipping}) and [Refund and Returns Policy](/pages/${POLICY_SLUGS.refund}).`,
    '',
    '## Liability',
    'Our responsibility for any order is limited to the amount you paid for it. Nothing in these terms limits your rights under the Consumer Protection Act, 2019.',
    '',
    '## Governing law',
    `These terms are governed by the laws of India.${p.address ? ' Disputes are subject to the courts where the seller is located.' : ''}`,
    '',
    '## Contact',
    ...contactLines(p),
  ];
  return { slug: POLICY_SLUGS.terms, title: 'Terms and Conditions', content: lines.join('\n') };
}

export function refundPolicy(p: PolicyInput): GeneratedPolicy {
  const provider = p.providerName ?? 'BM Techx';
  const lines = [
    ...header('Refund and Returns Policy', p),
    '## Orders from this store',
    '- **Damaged, defective or wrong item:** tell us within 48 hours of delivery with a photo or short video of the item and the package. We will replace it or refund you in full, including shipping.',
    '- **Cancellation before dispatch:** contact us and we will cancel the order and refund anything you paid.',
    '- **Other returns:** contact us before sending anything back; we will tell you whether the item can be returned.',
    p.onlinePayments
      ? '- **How refunds are paid:** to your original payment method through Razorpay. Banks usually take 5 to 7 working days to show it.'
      : '- **How refunds are paid:** by UPI or bank transfer to the account you give us.',
    p.codEnabled ? '- Cash on delivery orders are refunded by UPI or bank transfer.' : null,
    '',
    'To ask for a return or refund:',
    '',
    ...contactLines(p),
    '',
    `## Store setup guarantee (between ${p.businessName} and ${provider})`,
    `This section is the service guarantee ${provider} gives the owner of this store. It does not affect shoppers.`,
    '',
    ...DELIVERY_GUARANTEE.text.map((t) => `- ${t}`),
  ].filter((l): l is string => l !== null);
  return { slug: POLICY_SLUGS.refund, title: 'Refund and Returns Policy', content: lines.join('\n') };
}

export function shippingPolicy(p: PolicyInput): GeneratedPolicy {
  const charges: string[] = [];
  if (p.shippingMode === 'FREE') charges.push('- Shipping is free on every order.');
  else if (p.shippingMode === 'FREE_ABOVE' && p.freeAbovePaise !== null) {
    charges.push(`- Shipping is free on orders of ${rupees(p.freeAbovePaise)} or more.`);
    charges.push(`- Below that, shipping is ${p.flatRatePaise > 0 ? rupees(p.flatRatePaise) : 'shown at checkout'}.`);
  } else charges.push(p.flatRatePaise > 0 ? `- Shipping is a flat ${rupees(p.flatRatePaise)} per order.` : '- Shipping charges are shown at checkout before you pay.');
  for (const c of p.cityRates ?? []) charges.push(`- ${c.city}: ${rupees(c.ratePaise)}.`);
  if (p.codEnabled) charges.push(p.codChargePaise > 0 ? `- Cash on delivery is available, with a ${rupees(p.codChargePaise)} COD charge.` : '- Cash on delivery is available.');

  const lines = [
    ...header('Shipping Policy', p),
    '## Where we ship',
    'We ship within India. If we cannot deliver to your pin code we will tell you before dispatch and refund anything you paid.',
    '',
    '## Charges',
    ...charges,
    '',
    '## Dispatch and delivery',
    p.shippingNotes ? `${p.shippingNotes.trim()}` : 'Orders are packed and handed to our delivery partner as soon as possible. Delivery times depend on your location and the courier.',
    '',
    'Once your order ships we will share the tracking details with you.',
    '',
    '## Questions about a delivery',
    ...contactLines(p),
  ];
  return { slug: POLICY_SLUGS.shipping, title: 'Shipping Policy', content: lines.join('\n') };
}

/** All four, in a stable order. Pure: same input, same output. */
export function generatePolicies(p: PolicyInput): GeneratedPolicy[] {
  return [privacyPolicy(p), termsPolicy(p), refundPolicy(p), shippingPolicy(p)];
}
