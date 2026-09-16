/**
 * Nepal administrative geography and phone-number helpers.
 *
 * This is the single source of truth for provinces/districts in the whole app:
 * the checkout form fetches it from `GET /api/settings/locations` rather than
 * shipping a second copy in the client bundle.
 */

export const PROVINCES = [
  {
    name: 'Koshi',
    nameNp: 'कोशी',
    districts: [
      'Bhojpur',
      'Dhankuta',
      'Ilam',
      'Jhapa',
      'Khotang',
      'Morang',
      'Okhaldhunga',
      'Panchthar',
      'Sankhuwasabha',
      'Solukhumbu',
      'Sunsari',
      'Taplejung',
      'Terhathum',
      'Udayapur',
    ],
  },
  {
    name: 'Madhesh',
    nameNp: 'मधेश',
    districts: [
      'Bara',
      'Dhanusha',
      'Mahottari',
      'Parsa',
      'Rautahat',
      'Saptari',
      'Sarlahi',
      'Siraha',
    ],
  },
  {
    name: 'Bagmati',
    nameNp: 'बागमती',
    districts: [
      'Bhaktapur',
      'Chitwan',
      'Dhading',
      'Dolakha',
      'Kathmandu',
      'Kavrepalanchok',
      'Lalitpur',
      'Makwanpur',
      'Nuwakot',
      'Ramechhap',
      'Rasuwa',
      'Sindhuli',
      'Sindhupalchok',
    ],
  },
  {
    name: 'Gandaki',
    nameNp: 'गण्डकी',
    districts: [
      'Baglung',
      'Gorkha',
      'Kaski',
      'Lamjung',
      'Manang',
      'Mustang',
      'Myagdi',
      'Nawalpur',
      'Parbat',
      'Syangja',
      'Tanahun',
    ],
  },
  {
    name: 'Lumbini',
    nameNp: 'लुम्बिनी',
    districts: [
      'Arghakhanchi',
      'Banke',
      'Bardiya',
      'Dang',
      'Gulmi',
      'Kapilvastu',
      'Palpa',
      'Parasi',
      'Pyuthan',
      'Rolpa',
      'Rukum East',
      'Rupandehi',
    ],
  },
  {
    name: 'Karnali',
    nameNp: 'कर्णाली',
    districts: [
      'Dailekh',
      'Dolpa',
      'Humla',
      'Jajarkot',
      'Jumla',
      'Kalikot',
      'Mugu',
      'Rukum West',
      'Salyan',
      'Surkhet',
    ],
  },
  {
    name: 'Sudurpashchim',
    nameNp: 'सुदूरपश्चिम',
    districts: [
      'Achham',
      'Baitadi',
      'Bajhang',
      'Bajura',
      'Dadeldhura',
      'Darchula',
      'Doti',
      'Kailali',
      'Kanchanpur',
    ],
  },
];

export const PROVINCE_NAMES = PROVINCES.map((p) => p.name);

export const DISTRICTS = PROVINCES.flatMap((p) => p.districts).sort((a, b) => a.localeCompare(b));

/** Districts that make up the Kathmandu Valley - used for the default delivery zones. */
export const VALLEY_DISTRICTS = ['Kathmandu', 'Lalitpur', 'Bhaktapur'];

const DISTRICT_TO_PROVINCE = new Map(
  PROVINCES.flatMap((p) => p.districts.map((d) => [d.toLowerCase(), p.name]))
);

export function districtsOf(provinceName) {
  return PROVINCES.find((p) => p.name.toLowerCase() === String(provinceName).toLowerCase())
    ?.districts ?? [];
}

export function provinceOf(districtName) {
  return DISTRICT_TO_PROVINCE.get(String(districtName).toLowerCase()) ?? null;
}

export function isValidProvince(name) {
  return PROVINCE_NAMES.some((p) => p.toLowerCase() === String(name).toLowerCase());
}

export function isValidDistrict(name) {
  return DISTRICT_TO_PROVINCE.has(String(name).toLowerCase());
}

/**
 * Nepali mobile numbers are 10 digits beginning 96/97/98 (NTC, Ncell, Smart Cell).
 * Accepts and strips a +977 / 977 / 0 prefix and any spaces or dashes.
 */
export const NEPAL_MOBILE_REGEX = /^9[6-8]\d{8}$/;

export function normalizePhone(input) {
  if (!input) return '';
  let digits = String(input).replace(/[^\d]/g, '');
  if (digits.startsWith('977') && digits.length > 10) digits = digits.slice(3);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function isValidNepaliMobile(input) {
  return NEPAL_MOBILE_REGEX.test(normalizePhone(input));
}

/** Landline numbers are accepted for the company profile, not for customer accounts. */
export function formatPhone(input) {
  const digits = normalizePhone(input);
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default {
  PROVINCES,
  PROVINCE_NAMES,
  DISTRICTS,
  VALLEY_DISTRICTS,
  districtsOf,
  provinceOf,
  isValidProvince,
  isValidDistrict,
  isValidNepaliMobile,
  normalizePhone,
  formatPhone,
  NEPAL_MOBILE_REGEX,
};
