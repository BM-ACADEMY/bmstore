/**
 * Demo store presets. Three businesses on the same codebase: what differs between them is the catalogue (a CSV) and
 * ONE theme_configs row per tenant - layout, palette, fonts, header, cards, hero, sections. Nothing else.
 */
import sharp from 'sharp';
import type { Prisma } from '@prisma/client';

export type PresetId = 'silks' | 'foods' | 'jewels';
/** values: [label, priceDelta, stock]; with deltaMode 'factor' the delta is price x factor (so a 5 kg pack costs ~5x the 1 kg base). */
export interface VariantPlan { match: RegExp; optionName: string; values: Array<[string, number, number]>; deltaMode?: 'paise' | 'factor' }
export interface Preset {
  id: PresetId;
  name: string;
  csv: string;
  tenant: { address: string; gstNumber: string; supportPhone: string; whatsappNumber: string };
  settings: Omit<Prisma.SettingsUncheckedCreateInput, 'tenantId'>;
  theme: Omit<Prisma.ThemeConfigUncheckedCreateInput, 'tenantId'>;
  /** Tamil labels per category name (Category.nameTa). */
  categoriesTa: Record<string, string>;
  variants: VariantPlan[];
  coupons: Array<Omit<Prisma.CouponUncheckedCreateInput, 'tenantId'>>;
  about: { slug: string; title: string; content: string };
  orderPrefix: string;
  placeholder: (name: string, category: string, i: number) => Promise<Buffer>;
  banners: Array<() => Promise<Buffer>>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const jpeg = (svg: string) => sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();

// ---- silks (V1): woven textile placeholders -------------------------------------------------------------------------
const SILK_CATEGORY_COLOURS: Record<string, [string, string]> = { Sarees: ['#7a1f2b', '#c9973b'], Kurtas: ['#1f4e5f', '#e8b920'], Jewellery: ['#6b3a12', '#f0c060'], 'Home Decor': ['#3f5a2a', '#d9a441'] };
const NAME_COLOURS: Record<string, string> = { maroon: '#7a1f2b', 'peacock blue': '#0e6e8c', mustard: '#d4a017', 'bottle green': '#0f4c35', 'rose pink': '#d4647a', beige: '#d8c3a5', white: '#f4efe6', indigo: '#2b3a8c', teal: '#0f766e', cream: '#f3e9d2', yellow: '#e8b920', green: '#1f6f43', blue: '#1f3a93', red: '#c8102e', black: '#1a1a1a', grey: '#8a8a8a', gold: '#c9973b', pink: '#e2618f', orange: '#e2731b', purple: '#5b2a86', brown: '#6b4226', lavender: '#b39ddb', 'sea green': '#2e8b7a', sandal: '#e5c8a6' };
export async function silkPlaceholder(name: string, category: string, i: number): Promise<Buffer> {
  const [catBg, zari] = SILK_CATEGORY_COLOURS[category] ?? ['#374151', '#c9973b'];
  const key = Object.keys(NAME_COLOURS).find((k) => name.toLowerCase().includes(k));
  const bg = key ? NAME_COLOURS[key] : catBg;
  const light = ['#f4efe6', '#f3e9d2', '#d8c3a5', '#e8b920', '#d4a017', '#e5c8a6'].includes(bg);
  const ink = light ? '#2b1b17' : '#ffffff';
  const stripes = Array.from({ length: 30 }, (_, n) => `<rect x="0" y="${n * 50 + (i % 3) * 7}" width="1200" height="2" fill="${ink}" fill-opacity="0.07"/>`).join('');
  const motifs = Array.from({ length: 12 }, (_, n) => `<path d="M${50 + n * 100} 1335l28 28-28 28-28-28z" fill="${zari}"/>`).join('');
  const label = name.length > 30 ? name.slice(0, 29) + '…' : name;
  return jpeg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500">
    <rect width="1200" height="1500" fill="${bg}"/>${stripes}
    <rect x="860" y="0" width="340" height="1500" fill="${zari}" fill-opacity="0.18"/><rect x="860" y="0" width="6" height="1500" fill="${zari}"/>
    <rect x="0" y="1290" width="1200" height="14" fill="${zari}"/><rect x="0" y="1405" width="1200" height="14" fill="${zari}"/>${motifs}
    <rect x="0" y="1440" width="1200" height="60" fill="${zari}" fill-opacity="0.5"/>
    <text x="80" y="200" font-family="serif" font-size="60" fill="${ink}" fill-opacity="0.85">${esc(label)}</text>
    <text x="80" y="260" font-family="sans-serif" font-size="34" fill="${ink}" fill-opacity="0.6">${esc(category)}</text>
  </svg>`);
}
export const silkBanner = () => {
  const motifs = Array.from({ length: 18 }, (_, n) => `<path d="M${50 + n * 100} 930l22 22-22 22-22-22z" fill="#c9973b"/>`).join('');
  const weave = Array.from({ length: 20 }, (_, n) => `<rect x="0" y="${n * 50}" width="1800" height="2" fill="#ffffff" fill-opacity="0.05"/>`).join('');
  return jpeg(`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1000"><rect width="1800" height="1000" fill="#7a1f2b"/>${weave}
    <rect x="1180" y="0" width="620" height="1000" fill="#c9973b" fill-opacity="0.22"/><rect x="1180" y="0" width="8" height="1000" fill="#c9973b"/>
    <rect x="0" y="900" width="1800" height="10" fill="#c9973b"/>${motifs}<rect x="0" y="990" width="1800" height="10" fill="#c9973b"/>
    <circle cx="1490" cy="420" r="260" fill="#c9973b" fill-opacity="0.25"/></svg>`);
};

// ---- foods (V2): kraft-paper packs with a produce colour block ---------------------------------------------------------
const FOOD_CATEGORY: Record<string, { fill: string; ink: string; shape: 'grain' | 'bean' | 'leaf' | 'drop' | 'ring' | 'sack' }> = {
  'Rice & Grains': { fill: '#E9DDB9', ink: '#5A4A1E', shape: 'grain' }, Pulses: { fill: '#E3A51F', ink: '#5A3A08', shape: 'bean' }, Spices: { fill: '#C8381F', ink: '#FFF3E0', shape: 'leaf' },
  'Oils & Ghee': { fill: '#D99A2B', ink: '#4A2E05', shape: 'drop' }, Snacks: { fill: '#B5651D', ink: '#FFF3E0', shape: 'ring' }, Flours: { fill: '#F1E7D0', ink: '#5A4A2E', shape: 'sack' },
};
const NAME_TINTS: Record<string, string> = { turmeric: '#E3A51F', chilli: '#B5261A', pepper: '#3A2F2A', mustard: '#3A2F1A', coconut: '#F4EFE2', ghee: '#F2C14E', red: '#8E3B2F', ragi: '#6B3F3A', green: '#1F6B3A' };
export async function foodPlaceholder(name: string, category: string, i: number): Promise<Buffer> {
  const c = FOOD_CATEGORY[category] ?? { fill: '#D9CDB2', ink: '#4A3F2A', shape: 'sack' as const };
  const tintKey = Object.keys(NAME_TINTS).find((k) => name.toLowerCase().includes(k));
  const fill = tintKey ? NAME_TINTS[tintKey] : c.fill;
  const lum = parseInt(fill.slice(1, 3), 16) * 0.3 + parseInt(fill.slice(3, 5), 16) * 0.59 + parseInt(fill.slice(5, 7), 16) * 0.11;
  const ink = lum > 150 ? '#4A3A1E' : '#FFF8E7';
  const dots = Array.from({ length: 40 }, (_, n) => `<circle cx="${(n * 173 + i * 31) % 1200}" cy="${(n * 97 + i * 53) % 1200}" r="${2 + (n % 3)}" fill="${ink}" fill-opacity="0.08"/>`).join('');
  const shape = c.shape === 'grain' ? `<ellipse cx="600" cy="560" rx="170" ry="300" fill="${ink}" fill-opacity="0.16" transform="rotate(-18 600 560)"/><ellipse cx="640" cy="560" rx="120" ry="230" fill="${ink}" fill-opacity="0.14" transform="rotate(14 640 560)"/>`
    : c.shape === 'bean' ? `<circle cx="520" cy="520" r="190" fill="${ink}" fill-opacity="0.16"/><circle cx="700" cy="620" r="150" fill="${ink}" fill-opacity="0.14"/>`
      : c.shape === 'leaf' ? `<path d="M600 240c260 120 320 420 60 660C380 780 360 400 600 240z" fill="${ink}" fill-opacity="0.16"/>`
        : c.shape === 'drop' ? `<path d="M600 230c160 230 230 360 230 470a230 230 0 0 1-460 0c0-110 70-240 230-470z" fill="${ink}" fill-opacity="0.16"/>`
          : c.shape === 'ring' ? `<circle cx="600" cy="560" r="260" fill="none" stroke="${ink}" stroke-opacity="0.18" stroke-width="90"/>`
            : `<path d="M400 300h400l60 560H340z" fill="${ink}" fill-opacity="0.14"/><rect x="420" y="250" width="360" height="70" rx="20" fill="${ink}" fill-opacity="0.18"/>`;
  const label = name.length > 26 ? name.slice(0, 25) + '…' : name;
  return jpeg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <rect width="1200" height="1200" fill="${fill}"/>${dots}${shape}
    <rect x="80" y="930" width="1040" height="190" rx="28" fill="#FFF8E7" fill-opacity="0.92"/>
    <text x="120" y="1010" font-family="sans-serif" font-weight="700" font-size="54" fill="#1C2A1F">${esc(label)}</text>
    <text x="120" y="1070" font-family="sans-serif" font-size="34" fill="#44554A">${esc(category)}</text>
  </svg>`);
}
export const foodBanner = () => jpeg(`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1000">
  <rect width="1800" height="1000" fill="#1F6B3A"/>
  <circle cx="1450" cy="520" r="420" fill="#E3A51F" fill-opacity="0.9"/><circle cx="1450" cy="520" r="300" fill="#C8381F" fill-opacity="0.85"/><circle cx="1450" cy="520" r="160" fill="#FFF8E7"/>
  ${Array.from({ length: 14 }, (_, n) => `<circle cx="${120 + n * 120}" cy="${880 + (n % 2) * 30}" r="14" fill="#FFF8E7" fill-opacity="0.6"/>`).join('')}
</svg>`);

// ---- jewels (V3): ink velvet with gold forms -----------------------------------------------------------------------------
const JEWEL_SHAPES: Record<string, string> = {
  Necklaces: '<path d="M300 300q300 520 600 0" fill="none" stroke="#C9A24A" stroke-width="22"/><circle cx="600" cy="690" r="70" fill="#C9A24A"/><circle cx="600" cy="690" r="30" fill="#8E4A55"/>',
  Earrings: '<circle cx="430" cy="420" r="40" fill="#C9A24A"/><path d="M430 460l-110 300h220z" fill="#C9A24A"/><circle cx="770" cy="420" r="40" fill="#C9A24A"/><path d="M770 460l-110 300h220z" fill="#C9A24A"/>',
  Bangles: '<circle cx="600" cy="600" r="300" fill="none" stroke="#C9A24A" stroke-width="54"/><circle cx="600" cy="600" r="220" fill="none" stroke="#C9A24A" stroke-width="18" stroke-opacity="0.6"/>',
  Rings: '<circle cx="600" cy="640" r="200" fill="none" stroke="#C9A24A" stroke-width="40"/><path d="M600 380l70 90-70 90-70-90z" fill="#8E4A55"/>',
  Bridal: '<path d="M600 260l60 160 170 10-130 110 50 170-150-100-150 100 50-170-130-110 170-10z" fill="#C9A24A"/>',
};
export async function jewelPlaceholder(name: string, category: string, i: number): Promise<Buffer> {
  const rose = /rose|kemp|ruby|jimikki/i.test(name);
  const bg = rose ? '#2A1D26' : '#1D1A26';
  const glow = Array.from({ length: 6 }, (_, n) => `<circle cx="${300 + ((n * 211 + i * 37) % 600)}" cy="${300 + ((n * 149 + i * 71) % 600)}" r="${60 + n * 20}" fill="#C9A24A" fill-opacity="0.04"/>`).join('');
  const label = name.length > 26 ? name.slice(0, 25) + '…' : name;
  return jpeg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <rect width="1200" height="1200" fill="${bg}"/>${glow}${JEWEL_SHAPES[category] ?? JEWEL_SHAPES.Rings}
    <rect x="80" y="1040" width="1040" height="2" fill="#C9A24A" fill-opacity="0.6"/>
    <text x="80" y="1110" font-family="serif" font-size="48" fill="#FBF7F2">${esc(label)}</text>
    <text x="1120" y="1110" text-anchor="end" font-family="sans-serif" font-size="28" fill="#B89A7A">${esc(category)}</text>
  </svg>`);
}
export const jewelBanner = (variant: number) => () => jpeg(`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1000">
  <rect width="1800" height="1000" fill="${variant ? '#2A1D26' : '#1D1A26'}"/>
  <circle cx="1300" cy="500" r="330" fill="none" stroke="#C9A24A" stroke-width="40" stroke-opacity="0.9"/>
  <circle cx="1300" cy="500" r="240" fill="none" stroke="#8E4A55" stroke-width="16"/>
  ${variant ? '<path d="M1300 300l60 160 170 10-130 110 50 170-150-100-150 100 50-170-130-110 170-10z" fill="#C9A24A"/>' : '<circle cx="1300" cy="500" r="60" fill="#C9A24A"/>'}
  <rect x="120" y="860" width="600" height="2" fill="#C9A24A" fill-opacity="0.6"/>
</svg>`);

// ---- presets ---------------------------------------------------------------------------------------------------
const PACKS: Array<[string, number, number]> = [['250 g', 0, 30], ['500 g', 0.95, 20], ['1 kg', 2.8, 12]];
export const PRESETS: Record<PresetId, Preset> = {
  silks: {
    id: 'silks', name: 'Sri Lakshmi Silks', csv: 'demo-products.csv', orderPrefix: 'SLS',
    tenant: { address: '12, Nethaji Road, Kanchipuram 631501', gstNumber: '33ABCDE1234F1Z5', supportPhone: '9876543210', whatsappNumber: '919876543210' },
    settings: { shippingMode: 'FREE_ABOVE', flatRate: 7900, freeAbove: 199900, codEnabled: true, codCharge: 4900, orderPrefix: 'SLS', cityRates: [{ city: 'Chennai', ratePaise: 4900 }, { city: 'Kanchipuram', ratePaise: 0 }], lowStockThreshold: 3 },
    theme: {
      layoutVariant: 'v1-textile', paletteId: 'v1-textile', primaryColor: '#7A1F2B', secondaryColor: '#C9973B', fontPairId: 'playfair-inter', headerStyle: 'centered-logo', cardStyle: 'portrait', heroType: 'banner',
      homepageSections: [
        { type: 'offer_strip', enabled: true, text: 'New Kanchipuram silks for the wedding season', textTa: 'திருமண சீசனுக்கு புதிய காஞ்சிபுரம் பட்டுப் புடவைகள்' },
        { type: 'hero', enabled: true, tagline: 'Handwoven silks from Kanchipuram', taglineTa: 'காஞ்சிபுரத்தின் கைத்தறி பட்டு' },
        { type: 'categories', enabled: true }, { type: 'featured', enabled: true }, { type: 'bestsellers', enabled: true },
        { type: 'about', enabled: true, title: 'Three generations at the loom', titleTa: 'மூன்று தலைமுறை தறி', body: 'We weave in Kanchipuram and sell what we weave. Every saree here was made by a family we know by name.', bodyTa: 'காஞ்சிபுரத்தில் நெய்கிறோம், நெய்ததையே விற்கிறோம்.' },
        { type: 'contact', enabled: true },
      ],
      options: { corners: 'soft', switcherEnabled: true, heroVideoUrl: null, bilingualLabels: true },
    },
    categoriesTa: { Sarees: 'புடவைகள்', Kurtas: 'குர்தாக்கள்', Jewellery: 'நகைகள்', 'Home Decor': 'வீட்டு அலங்காரம்' },
    variants: [
      { match: /^Kanchipuram Silk Saree/, optionName: 'Colour', values: [['Maroon', 0, 3], ['Peacock Blue', 25000, 2], ['Bottle Green', 0, 0], ['Mustard', -20000, 4]] },
      { match: /^Soft Silk Saree/, optionName: 'Colour', values: [['Rose Pink', 0, 5], ['Lavender', 0, 2], ['Sea Green', 0, 1]] },
      { match: /Kurta|Pyjama/, optionName: 'Size', values: [['S', 0, 4], ['M', 0, 6], ['L', 0, 5], ['XL', 10000, 2], ['XXL', 15000, 0]] },
      { match: /Veshti|Dhoti/, optionName: 'Length', values: [['4 muzham', 0, 5], ['8 muzham', 30000, 3]] },
    ],
    coupons: [{ code: 'WELCOME10', type: 'PERCENT', value: 10, minOrder: 99900 }, { code: 'FLAT200', type: 'FLAT', value: 20000, minOrder: 149900, usageLimit: 100, expiresAt: new Date(Date.now() + 60 * 86_400_000) }],
    about: { slug: 'about-us', title: 'About us', content: '<p>Family-run silk and handloom store from Kanchipuram since 1987.</p>' },
    placeholder: silkPlaceholder, banners: [silkBanner],
  },
  foods: {
    id: 'foods', name: 'Annam Naturals', csv: 'foods-products.csv', orderPrefix: 'ANM',
    tenant: { address: '4, Market Street, Thanjavur 613001', gstNumber: '33FGHIJ5678K1Z2', supportPhone: '9790011223', whatsappNumber: '919790011223' },
    settings: { shippingMode: 'FREE_ABOVE', flatRate: 4900, freeAbove: 49900, codEnabled: true, codCharge: 0, orderPrefix: 'ANM', cityRates: [{ city: 'Thanjavur', ratePaise: 0 }, { city: 'Trichy', ratePaise: 2900 }], lowStockThreshold: 5 },
    theme: {
      layoutVariant: 'v2-grocer', paletteId: 'v2-grocer', primaryColor: '#1F6B3A', secondaryColor: '#C8381F', fontPairId: 'baloo-inter', headerStyle: 'standard', cardStyle: 'compact', heroType: 'banner',
      homepageSections: [
        { type: 'offer_strip', enabled: true, text: 'Free delivery in Thanjavur · orders above ₹499 ship free everywhere', textTa: 'தஞ்சாவூரில் இலவச டெலிவரி · ₹499க்கு மேல் எங்கும் இலவசம்' },
        { type: 'hero', enabled: true, tagline: 'Rice, dal, oil and spices from the farm', taglineTa: 'நேரடியாக விவசாயியிடமிருந்து அரிசி, பருப்பு, எண்ணெய், மசாலா', ctaLabel: 'Shop staples', ctaLabelTa: 'மளிகை வாங்க', ctaHref: '/c/rice-grains' },
        { type: 'categories', enabled: true }, { type: 'bestsellers', enabled: true }, { type: 'featured', enabled: true, title: 'Fresh this week', titleTa: 'இந்த வாரம் புதிது' },
        { type: 'about', enabled: false }, { type: 'contact', enabled: true },
      ],
      options: { corners: 'round', switcherEnabled: true, heroVideoUrl: null, bilingualLabels: true },
    },
    categoriesTa: { 'Rice & Grains': 'அரிசி & தானியங்கள்', Pulses: 'பருப்பு வகைகள்', Spices: 'மசாலா', 'Oils & Ghee': 'எண்ணெய் & நெய்', Snacks: 'சிற்றுண்டி', Flours: 'மாவு வகைகள்' },
    variants: [
      { match: /Rice|Wheat/, optionName: 'Pack', deltaMode: 'factor', values: [['1 kg', 0, 40], ['5 kg', 3.9, 15], ['10 kg', 7.6, 6]] },
      { match: /Dal/, optionName: 'Pack', deltaMode: 'factor', values: [['500 g', 0, 30], ['1 kg', 0.95, 20]] },
      { match: /Powder|Pepper|Mustard/, optionName: 'Pack', deltaMode: 'factor', values: PACKS },
      { match: /Oil$/, optionName: 'Pack', deltaMode: 'factor', values: [['500 ml', 0, 20], ['1 L', 0.95, 12], ['5 L', 4.6, 3]] },
      { match: /Ghee/, optionName: 'Pack', deltaMode: 'factor', values: [['250 ml', 0, 10], ['500 ml', 0.95, 6], ['1 L', 1.85, 2]] },
      { match: /Murukku|Mixture|Thattai/, optionName: 'Pack', deltaMode: 'factor', values: [['250 g', 0, 30], ['500 g', 0.9, 10]] },
      { match: /Flour/, optionName: 'Pack', deltaMode: 'factor', values: [['500 g', 0, 25], ['1 kg', 0.95, 12]] },
    ],
    coupons: [{ code: 'FIRST50', type: 'FLAT', value: 5000, minOrder: 59900 }, { code: 'PONGAL10', type: 'PERCENT', value: 10, minOrder: 99900, usageLimit: 500 }],
    about: { slug: 'about-us', title: 'About us', content: '<p>Direct from farmers around Thanjavur. Stone-ground flours, chekku oils, no polishing.</p>' },
    placeholder: foodPlaceholder, banners: [foodBanner],
  },
  jewels: {
    id: 'jewels', name: 'Meenakshi Jewels', csv: 'jewels-products.csv', orderPrefix: 'MJW',
    tenant: { address: '21, South Masi Street, Madurai 625001', gstNumber: '33KLMNO9012P1Z9', supportPhone: '9443344556', whatsappNumber: '919443344556' },
    settings: { shippingMode: 'FREE_ABOVE', flatRate: 9900, freeAbove: 149900, codEnabled: true, codCharge: 9900, orderPrefix: 'MJW', cityRates: [{ city: 'Madurai', ratePaise: 0 }], lowStockThreshold: 3 },
    theme: {
      layoutVariant: 'v3-retail', paletteId: 'v3-jewel', primaryColor: '#1D1A26', secondaryColor: '#8E4A55', fontPairId: 'cormorant-inter', headerStyle: 'minimal', cardStyle: 'framed', heroType: 'slider',
      homepageSections: [
        { type: 'hero', enabled: true, tagline: 'Temple jewellery for every occasion', taglineTa: 'ஒவ்வொரு நிகழ்வுக்கும் கோவில் நகைகள்', ctaLabel: 'Shop the collection', ctaLabelTa: 'கலெக்ஷன் பார்க்க' },
        { type: 'categories', enabled: true }, { type: 'featured', enabled: true, title: 'New this season', titleTa: 'இந்த சீசனில் புதிது' },
        { type: 'about', enabled: true, title: 'Made in Madurai', titleTa: 'மதுரையில் செய்யப்பட்டது', body: 'Brass, gold plating and kemp stones, finished by hand in our workshop near the Meenakshi temple. Every piece is checked twice before it ships.', bodyTa: 'மீனாட்சி கோவில் அருகே எங்கள் பட்டறையில் கையால் முடிக்கப்படுகிறது.' },
        { type: 'bestsellers', enabled: true }, { type: 'offer_strip', enabled: false }, { type: 'contact', enabled: true },
      ],
      options: { corners: 'sharp', switcherEnabled: true, heroVideoUrl: null, bilingualLabels: false },
    },
    categoriesTa: { Necklaces: 'நெக்லஸ்', Earrings: 'காதணிகள்', Bangles: 'வளையல்கள்', Rings: 'மோதிரங்கள்', Bridal: 'மணப்பெண் நகைகள்' },
    variants: [
      { match: /Necklace|Choker|Haram|Jhumka|Chandbali|Nethichutti|Vanki|Oddiyanam|Jada|Cuffs|Studs/, optionName: 'Finish', values: [['Gold', 0, 4], ['Rose Gold', 15000, 2], ['Antique', 0, 1]] },
      { match: /Kada|Thin Bangles|Kemp Bangles/, optionName: 'Size', values: [['2.4', 0, 5], ['2.6', 0, 6], ['2.8', 0, 2]] },
    ],
    coupons: [{ code: 'BRIDE15', type: 'PERCENT', value: 15, minOrder: 499900 }, { code: 'WELCOME200', type: 'FLAT', value: 20000, minOrder: 199900 }],
    about: { slug: 'about-us', title: 'About us', content: '<p>Temple jewellery workshop in Madurai since 2004.</p>' },
    placeholder: jewelPlaceholder, banners: [jewelBanner(0), jewelBanner(1)],
  },
};
