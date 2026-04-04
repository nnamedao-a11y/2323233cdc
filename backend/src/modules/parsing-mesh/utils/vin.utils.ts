/**
 * VIN Utilities
 * 
 * Хелпери для роботи з VIN кодами
 */

// VIN regex - 17 символів, без I, O, Q
const VIN_REGEX = /[A-HJ-NPR-Z0-9]{17}/gi;

/**
 * Перевірка валідності VIN формату
 */
export function isValidVin(vin: string): boolean {
  if (!vin) return false;
  const cleaned = cleanVin(vin);
  return cleaned.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(cleaned);
}

/**
 * Очистка VIN від зайвих символів
 */
export function cleanVin(vin: string): string {
  if (!vin) return '';
  return vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/gi, '');
}

/**
 * Пошук всіх VIN у тексті
 */
export function findVinsInText(text: string): string[] {
  if (!text) return [];
  const matches = text.toUpperCase().match(VIN_REGEX);
  if (!matches) return [];
  
  // Дедуплікація та фільтрація
  const unique = [...new Set(matches)];
  return unique.filter(isValidVin);
}

/**
 * Пошук конкретного VIN у тексті
 */
export function findTargetVinInText(text: string, targetVin: string): boolean {
  if (!text || !targetVin) return false;
  const cleaned = cleanVin(targetVin);
  return text.toUpperCase().includes(cleaned);
}

/**
 * Декодування WMI (перші 3 символи VIN)
 */
export function decodeWMI(vin: string): { country: string; manufacturer: string } | null {
  if (!isValidVin(vin)) return null;
  
  const wmi = cleanVin(vin).substring(0, 3);
  
  // Спрощена таблиця WMI
  const countryPrefixes: Record<string, string> = {
    '1': 'USA', '4': 'USA', '5': 'USA',
    '2': 'Canada',
    '3': 'Mexico',
    'J': 'Japan',
    'K': 'South Korea',
    'L': 'China',
    'S': 'United Kingdom',
    'V': 'France/Spain',
    'W': 'Germany',
    'Y': 'Sweden/Finland',
    'Z': 'Italy',
  };
  
  const manufacturerPrefixes: Record<string, string> = {
    '1G1': 'Chevrolet', '1G2': 'Pontiac', '1G3': 'Oldsmobile', '1G4': 'Buick',
    '1GC': 'Chevrolet Truck', '1GT': 'GMC Truck', '1GY': 'Cadillac',
    '1FA': 'Ford', '1FB': 'Ford', '1FC': 'Ford', '1FD': 'Ford',
    '1FT': 'Ford Truck', '1FM': 'Ford SUV',
    '1C4': 'Chrysler/Jeep', '1D4': 'Dodge', '1J4': 'Jeep',
    '2HG': 'Honda', '2HK': 'Honda',
    '3VW': 'Volkswagen', '3FA': 'Ford',
    '4T1': 'Toyota', '4T3': 'Toyota', '4T4': 'Toyota',
    '5FN': 'Honda', '5J6': 'Honda', '5YJ': 'Tesla',
    'JH4': 'Acura', 'JN1': 'Nissan', 'JT': 'Toyota',
    'KM': 'Hyundai/Kia',
    'WAU': 'Audi', 'WBA': 'BMW', 'WDB': 'Mercedes', 'WDD': 'Mercedes',
    'WF0': 'Ford Europe', 'WVW': 'Volkswagen',
    'YV1': 'Volvo',
    'ZAM': 'Maserati', 'ZFF': 'Ferrari',
  };
  
  const firstChar = wmi[0];
  const country = countryPrefixes[firstChar] || 'Unknown';
  
  // Шукаємо найдовший match
  let manufacturer = 'Unknown';
  for (const [prefix, name] of Object.entries(manufacturerPrefixes)) {
    if (wmi.startsWith(prefix)) {
      manufacturer = name;
      break;
    }
  }
  
  return { country, manufacturer };
}

/**
 * Витяг року з VIN (10-й символ)
 */
export function decodeYear(vin: string): number | null {
  if (!isValidVin(vin)) return null;
  
  const cleaned = cleanVin(vin);
  const yearChar = cleaned[9]; // 10-й символ (0-indexed)
  
  const yearMap: Record<string, number> = {
    'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
    'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
    'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
    'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029,
    'Y': 2030,
    '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
    '6': 2006, '7': 2007, '8': 2008, '9': 2009,
  };
  
  return yearMap[yearChar] || null;
}
