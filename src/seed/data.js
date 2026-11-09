// Starting reference data for Sunco Motors. Everything here is editable in Admin after setup.
// Model line-ups are a best-effort snapshot of the Australian range and MUST be checked by
// management before go-live (add/rename/retire models in Admin).

const locations = ['Caloundra', 'Maroochydore', 'Kingaroy', 'Hervey Bay'];

const USED = 'Used Cars';

// Brand name -> { colour, models }
const brands = {
  Hyundai: {
    colour: '#002C5F',
    models: ['i30 Hatch', 'i30 Sedan', 'i30 N', 'Venue', 'Kona', 'Kona Electric', 'Tucson', 'Santa Fe', 'Palisade', 'Staria', 'Inster', 'IONIQ 5', 'IONIQ 5 N', 'IONIQ 6', 'IONIQ 9'],
  },
  Nissan: {
    colour: '#C3002F',
    models: ['Juke', 'Qashqai', 'X-Trail', 'Pathfinder', 'Patrol', 'Navara', 'Ariya', 'Leaf', 'Z'],
  },
  MG: {
    colour: '#B4121B',
    models: ['MG3', 'ZS', 'ZS Hybrid+', 'HS', 'HS Plug-in Hybrid', 'QS', 'MG4', 'S5 EV', 'Cyberster', 'U9', 'IM5', 'IM6'],
  },
  Chery: {
    colour: '#B01F24',
    models: ['Tiggo 4', 'Tiggo 4 Hybrid', 'Tiggo 7', 'Tiggo 7 PHEV', 'Tiggo 8 Pro', 'Tiggo 9'],
  },
  LDV: {
    colour: '#003DA5',
    models: ['T60 Max', 'Terron 9', 'eT60', 'D90', 'Deliver 7', 'eDeliver 7', 'Deliver 9', 'eDeliver 9', 'G10', 'MIFA 9'],
  },
  Jeep: {
    colour: '#3A4A2F',
    models: ['Avenger', 'Compass', 'Grand Cherokee', 'Wrangler', 'Gladiator'],
  },
  Leapmotor: {
    colour: '#1B1B1B',
    models: ['C10', 'B10'],
  },
  GAC: {
    colour: '#00498F',
    models: ['Aion V', 'Aion UT', 'Emkoo', 'Emzoom', 'M8'],
  },
  JMC: {
    colour: '#00579C',
    models: ['Vigus', 'Grand Avenue'],
  },
  Audi: {
    colour: '#000000',
    models: ['A3', 'S3', 'RS 3', 'A5', 'A6', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q6 e-tron', 'Q7', 'Q8', 'e-tron GT'],
  },
  GMSV: {
    colour: '#1F3A60',
    models: ['Silverado 1500', 'Silverado 2500HD', 'Silverado 3500HD', 'Yukon', 'Corvette'],
  },
  Volvo: {
    colour: '#1C3F94',
    models: ['EX30', 'EX40', 'EC40', 'XC40', 'XC60', 'XC90', 'EX90', 'ES90'],
  },
  Ford: {
    colour: '#003478',
    models: ['Ranger', 'Ranger Raptor', 'Ranger PHEV', 'Everest', 'Bronco', 'Mustang', 'Mustang Mach-E', 'F-150', 'Transit Custom', 'Transit', 'E-Transit'],
  },
  Mitsubishi: {
    colour: '#E60012',
    models: ['ASX', 'Eclipse Cross', 'Outlander', 'Outlander PHEV', 'Destinator', 'Pajero Sport', 'Triton'],
  },
  Geely: {
    colour: '#1A3D7C',
    models: ['EX2', 'EX5', 'Starray EM-i'],
  },
  GWM: {
    colour: '#A6192E',
    models: ['Cannon', 'Cannon Alpha', 'Haval Jolion', 'Haval H6', 'Haval H6 GT', 'Haval H7', 'Tank 300', 'Tank 500', 'Ora'],
  },
  Isuzu: {
    colour: '#C8102E',
    models: ['D-Max', 'MU-X'],
  },
  Honda: {
    colour: '#CC0000',
    models: ['HR-V', 'ZR-V', 'CR-V', 'Civic', 'Civic Type R', 'Accord', 'Prelude'],
  },
  Kia: {
    colour: '#05141F',
    models: ['Picanto', 'Stonic', 'K4', 'Seltos', 'Sportage', 'Sorento', 'Carnival', 'Tasman', 'EV3', 'EV5', 'EV6', 'EV9'],
  },
  XPeng: {
    colour: '#2B2B2B',
    models: ['G6', 'G9', 'X9'],
  },
  [USED]: {
    colour: '#5A6270',
    isUsed: true,
    models: [],
  },
};

// Brands sold at each location (franchises).
const franchises = {
  Caloundra: ['Hyundai', 'Nissan', 'MG', 'Chery', 'LDV', 'Jeep', 'Leapmotor', 'GAC', 'JMC', USED],
  Maroochydore: ['Hyundai', 'Nissan', 'Audi', 'MG', 'LDV', 'GMSV', 'Volvo', 'GAC', USED],
  Kingaroy: ['Hyundai', 'Nissan', 'Ford', 'Mitsubishi', 'Geely', 'GWM', USED],
  'Hervey Bay': ['Nissan', 'Isuzu', 'Honda', 'Kia', 'XPeng', 'GWM', USED],
};

// Used-car makes. Makes matching a brand above reuse that brand's model list;
// the models listed here are extra used-only models (e.g. superseded nameplates).
const usedMakes = {
  Toyota: ['HiLux', 'LandCruiser', 'LandCruiser Prado', 'RAV4', 'Corolla', 'Camry', 'Kluger', 'C-HR', 'Yaris', 'Yaris Cross', 'Fortuner', 'HiAce'],
  Ford: ['Territory', 'Falcon', 'Focus', 'Fiesta', 'Escape', 'Kuga', 'EcoSport', 'Puma', 'Endura'],
  Mazda: ['CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-70', 'CX-8', 'CX-9', 'CX-90', 'BT-50', 'Mazda2', 'Mazda3', 'Mazda6', 'MX-5'],
  Hyundai: ['Accent', 'Elantra', 'iLoad', 'iMax', 'ix35', 'Getz'],
  Kia: ['Cerato', 'Rio', 'Soul', 'Optima'],
  Mitsubishi: ['Pajero', 'Lancer', 'Mirage'],
  Nissan: ['Pulsar', 'Micra', 'Dualis', 'Murano', 'Patrol Y61'],
  Holden: ['Commodore', 'Colorado', 'Trax', 'Captiva', 'Cruze', 'Barina', 'Trailblazer', 'Astra', 'Equinox', 'Acadia'],
  Volkswagen: ['Amarok', 'Golf', 'Polo', 'Tiguan', 'T-Roc', 'T-Cross', 'Touareg', 'Passat', 'Transporter', 'Crafter'],
  Subaru: ['Forester', 'Outback', 'XV', 'Crosstrek', 'Impreza', 'WRX', 'BRZ', 'Liberty'],
  Isuzu: [],
  Honda: ['Jazz', 'City', 'Odyssey'],
  MG: ['MG5', 'ZST', 'Extender'],
  LDV: ['T60', 'V80'],
  GWM: ['Steed', 'Haval H2', 'Haval H9'],
  Jeep: ['Cherokee', 'Renegade', 'Patriot'],
  Suzuki: ['Swift', 'Vitara', 'Jimny', 'S-Cross', 'Baleno', 'Ignis'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X'],
  BYD: ['Atto 3', 'Seal', 'Dolphin', 'Shark 6', 'Sealion 7'],
  'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'GLA', 'GLC', 'GLE', 'Sprinter', 'Vito', 'X-Class'],
  BMW: ['1 Series', '3 Series', '5 Series', 'X1', 'X3', 'X5'],
  Audi: ['A1', 'A4'],
  Volvo: ['V60', 'S60', 'XC70'],
  Lexus: ['NX', 'RX', 'UX', 'IS', 'ES'],
  Peugeot: ['2008', '3008', '5008', 'Partner', 'Expert'],
  Renault: ['Koleos', 'Captur', 'Trafic', 'Master', 'Kangoo'],
  Skoda: ['Octavia', 'Kodiaq', 'Karoq', 'Kamiq', 'Fabia'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover Evoque', 'Range Rover Sport'],
  Chery: [],
  GAC: [],
  Geely: [],
  Leapmotor: [],
  JMC: [],
  XPeng: [],
  GMSV: [],
  'Ram': ['1500', '2500'],
};

const sources = ['Walk-in', 'Phone', 'Web lead', 'Referral', 'Repeat customer', 'Other'];

const lostReasons = ['Price', 'Finance declined', 'Bought elsewhere', 'Not ready to buy', 'No suitable stock', 'No contact', 'Other'];

const settings = {
  'branding.name': 'Sunco Motors',
  'branding.primary_colour': '#D81E05',
  'branding.accent_colour': '#F7A21B',
  'branding.logo_url': '/sunco-logo.png',
  'followup.escalation_days': '3',
  'followup.stale_days': '45',
  timezone: 'Australia/Brisbane',
};

module.exports = { USED, locations, brands, franchises, usedMakes, sources, lostReasons, settings };
