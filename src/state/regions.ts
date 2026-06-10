/* eslint-disable */
/* Region → IANA timezone catalog. Sourced from David's Feishu wiki
 * Rzo3wtKyFigkLkk35BNcBPU9nkA (ASR region routing config — same regions
 * the broader app uses, kept aligned for UX consistency).
 *
 * 126 entries grouped by continent. The Settings picker shows them in an
 * <optgroup>-organized <select>; only these IANA zones are selectable. */

export interface RegionOption {
  label: string
  iana: string
  country: string
  group: string
}

export const REGIONS: RegionOption[] = [
  { label: "France (Paris)", iana: "Europe/Paris", country: "FR", group: "Europe" },
  { label: "Germany (Berlin)", iana: "Europe/Berlin", country: "DE", group: "Europe" },
  { label: "Belgium (Brussels)", iana: "Europe/Brussels", country: "BE", group: "Europe" },
  { label: "Netherlands", iana: "Europe/Amsterdam", country: "NL", group: "Europe" },
  { label: "Luxembourg", iana: "Europe/Luxembourg", country: "LU", group: "Europe" },
  { label: "Monaco", iana: "Europe/Monaco", country: "MC", group: "Europe" },
  { label: "Denmark", iana: "Europe/Copenhagen", country: "DK", group: "Europe" },
  { label: "Sweden", iana: "Europe/Stockholm", country: "SE", group: "Europe" },
  { label: "Norway", iana: "Europe/Oslo", country: "NO", group: "Europe" },
  { label: "Finland", iana: "Europe/Helsinki", country: "FI", group: "Europe" },
  { label: "Iceland", iana: "Atlantic/Reykjavik", country: "IS", group: "Europe" },
  { label: "Estonia", iana: "Europe/Tallinn", country: "EE", group: "Europe" },
  { label: "Latvia", iana: "Europe/Riga", country: "LV", group: "Europe" },
  { label: "Lithuania", iana: "Europe/Vilnius", country: "LT", group: "Europe" },
  { label: "Italy (Rome)", iana: "Europe/Rome", country: "IT", group: "Europe" },
  { label: "Spain (Madrid)", iana: "Europe/Madrid", country: "ES", group: "Europe" },
  { label: "Portugal (Lisbon)", iana: "Europe/Lisbon", country: "PT", group: "Europe" },
  { label: "Greece", iana: "Europe/Athens", country: "GR", group: "Europe" },
  { label: "Malta", iana: "Europe/Malta", country: "MT", group: "Europe" },
  { label: "Cyprus", iana: "Asia/Nicosia", country: "CY", group: "Europe" },
  { label: "San Marino", iana: "Europe/San_Marino", country: "SM", group: "Europe" },
  { label: "Vatican City", iana: "Europe/Vatican", country: "VA", group: "Europe" },
  { label: "Poland", iana: "Europe/Warsaw", country: "PL", group: "Europe" },
  { label: "Czechia", iana: "Europe/Prague", country: "CZ", group: "Europe" },
  { label: "Slovakia", iana: "Europe/Bratislava", country: "SK", group: "Europe" },
  { label: "Hungary", iana: "Europe/Budapest", country: "HU", group: "Europe" },
  { label: "Ukraine (Kyiv)", iana: "Europe/Kyiv", country: "UA", group: "Europe" },
  { label: "Belarus", iana: "Europe/Minsk", country: "BY", group: "Europe" },
  { label: "Moldova", iana: "Europe/Chisinau", country: "MD", group: "Europe" },
  { label: "Russia (Moscow)", iana: "Europe/Moscow", country: "RU", group: "Europe" },
  { label: "Austria", iana: "Europe/Vienna", country: "AT", group: "Europe" },
  { label: "Switzerland", iana: "Europe/Zurich", country: "CH", group: "Europe" },
  { label: "Liechtenstein", iana: "Europe/Vaduz", country: "LI", group: "Europe" },
  { label: "Slovenia", iana: "Europe/Ljubljana", country: "SI", group: "Europe" },
  { label: "Croatia", iana: "Europe/Zagreb", country: "HR", group: "Europe" },
  { label: "Serbia", iana: "Europe/Belgrade", country: "RS", group: "Europe" },
  { label: "Bosnia & Herzegovina", iana: "Europe/Sarajevo", country: "BA", group: "Europe" },
  { label: "Montenegro", iana: "Europe/Podgorica", country: "ME", group: "Europe" },
  { label: "Albania", iana: "Europe/Tirane", country: "AL", group: "Europe" },
  { label: "North Macedonia", iana: "Europe/Skopje", country: "MK", group: "Europe" },
  { label: "Bulgaria", iana: "Europe/Sofia", country: "BG", group: "Europe" },
  { label: "Romania", iana: "Europe/Bucharest", country: "RO", group: "Europe" },
  { label: "UK (London)", iana: "Europe/London", country: "GB", group: "Europe" },
  { label: "Ireland", iana: "Europe/Dublin", country: "IE", group: "Europe" },
  { label: "Andorra", iana: "Europe/Andorra", country: "AD", group: "Europe" },
  { label: "Turkey (Istanbul)", iana: "Europe/Istanbul", country: "TR", group: "Europe" },
  { label: "Antigua & Barbuda", iana: "America/Antigua", country: "AG", group: "North America" },
  { label: "Bahamas", iana: "America/Nassau", country: "BS", group: "North America" },
  { label: "Barbados", iana: "America/Barbados", country: "BB", group: "North America" },
  { label: "Belize", iana: "America/Belize", country: "BZ", group: "North America" },
  { label: "Canada (Toronto)", iana: "America/Toronto", country: "CA", group: "North America" },
  { label: "Costa Rica", iana: "America/Costa_Rica", country: "CR", group: "North America" },
  { label: "Cuba", iana: "America/Havana", country: "CU", group: "North America" },
  { label: "Dominica", iana: "America/Dominica", country: "DM", group: "North America" },
  { label: "Dominican Republic", iana: "America/Santo_Domingo", country: "DO", group: "North America" },
  { label: "El Salvador", iana: "America/El_Salvador", country: "SV", group: "North America" },
  { label: "Grenada", iana: "America/Grenada", country: "GD", group: "North America" },
  { label: "Guatemala", iana: "America/Guatemala", country: "GT", group: "North America" },
  { label: "Haiti", iana: "America/Port-au-Prince", country: "HT", group: "North America" },
  { label: "Honduras", iana: "America/Tegucigalpa", country: "HN", group: "North America" },
  { label: "Jamaica", iana: "America/Jamaica", country: "JM", group: "North America" },
  { label: "Mexico (CDMX)", iana: "America/Mexico_City", country: "MX", group: "North America" },
  { label: "Nicaragua", iana: "America/Managua", country: "NI", group: "North America" },
  { label: "Panama", iana: "America/Panama", country: "PA", group: "North America" },
  { label: "St. Kitts & Nevis", iana: "America/St_Kitts", country: "KN", group: "North America" },
  { label: "Saint Lucia", iana: "America/St_Lucia", country: "LC", group: "North America" },
  { label: "St. Vincent", iana: "America/St_Vincent", country: "VC", group: "North America" },
  { label: "Trinidad & Tobago", iana: "America/Port_of_Spain", country: "TT", group: "North America" },
  { label: "United States (NYC)", iana: "America/New_York", country: "US", group: "North America" },
  { label: "Argentina (BA)", iana: "America/Argentina/Buenos_Aires", country: "AR", group: "South America" },
  { label: "Bolivia", iana: "America/La_Paz", country: "BO", group: "South America" },
  { label: "Brazil (Sao Paulo)", iana: "America/Sao_Paulo", country: "BR", group: "South America" },
  { label: "Chile (Santiago)", iana: "America/Santiago", country: "CL", group: "South America" },
  { label: "Colombia", iana: "America/Bogota", country: "CO", group: "South America" },
  { label: "Ecuador", iana: "America/Guayaquil", country: "EC", group: "South America" },
  { label: "Guyana", iana: "America/Guyana", country: "GY", group: "South America" },
  { label: "Paraguay", iana: "America/Asuncion", country: "PY", group: "South America" },
  { label: "Peru", iana: "America/Lima", country: "PE", group: "South America" },
  { label: "Suriname", iana: "America/Paramaribo", country: "SR", group: "South America" },
  { label: "Uruguay", iana: "America/Montevideo", country: "UY", group: "South America" },
  { label: "Venezuela", iana: "America/Caracas", country: "VE", group: "South America" },
  { label: "Afghanistan", iana: "Asia/Kabul", country: "AF", group: "Asia" },
  { label: "Armenia", iana: "Asia/Yerevan", country: "AM", group: "Asia" },
  { label: "Azerbaijan", iana: "Asia/Baku", country: "AZ", group: "Asia" },
  { label: "Bahrain", iana: "Asia/Bahrain", country: "BH", group: "Asia" },
  { label: "Bangladesh", iana: "Asia/Dhaka", country: "BD", group: "Asia" },
  { label: "Bhutan", iana: "Asia/Thimphu", country: "BT", group: "Asia" },
  { label: "Brunei", iana: "Asia/Brunei", country: "BN", group: "Asia" },
  { label: "Cambodia", iana: "Asia/Phnom_Penh", country: "KH", group: "Asia" },
  { label: "China (Beijing)", iana: "Asia/Shanghai", country: "CN", group: "Asia" },
  { label: "Georgia", iana: "Asia/Tbilisi", country: "GE", group: "Asia" },
  { label: "India (Kolkata)", iana: "Asia/Kolkata", country: "IN", group: "Asia" },
  { label: "Indonesia (Jakarta)", iana: "Asia/Jakarta", country: "ID", group: "Asia" },
  { label: "Iran (Tehran)", iana: "Asia/Tehran", country: "IR", group: "Asia" },
  { label: "Iraq", iana: "Asia/Baghdad", country: "IQ", group: "Asia" },
  { label: "Israel", iana: "Asia/Jerusalem", country: "IL", group: "Asia" },
  { label: "Japan (Tokyo)", iana: "Asia/Tokyo", country: "JP", group: "Asia" },
  { label: "Jordan", iana: "Asia/Amman", country: "JO", group: "Asia" },
  { label: "Kazakhstan (Almaty)", iana: "Asia/Almaty", country: "KZ", group: "Asia" },
  { label: "Kuwait", iana: "Asia/Kuwait", country: "KW", group: "Asia" },
  { label: "Kyrgyzstan", iana: "Asia/Bishkek", country: "KG", group: "Asia" },
  { label: "Laos", iana: "Asia/Vientiane", country: "LA", group: "Asia" },
  { label: "Lebanon", iana: "Asia/Beirut", country: "LB", group: "Asia" },
  { label: "Malaysia (KL)", iana: "Asia/Kuala_Lumpur", country: "MY", group: "Asia" },
  { label: "Maldives", iana: "Indian/Maldives", country: "MV", group: "Asia" },
  { label: "Mongolia", iana: "Asia/Ulaanbaatar", country: "MN", group: "Asia" },
  { label: "Myanmar", iana: "Asia/Yangon", country: "MM", group: "Asia" },
  { label: "Nepal", iana: "Asia/Kathmandu", country: "NP", group: "Asia" },
  { label: "North Korea", iana: "Asia/Pyongyang", country: "KP", group: "Asia" },
  { label: "Oman", iana: "Asia/Muscat", country: "OM", group: "Asia" },
  { label: "Pakistan", iana: "Asia/Karachi", country: "PK", group: "Asia" },
  { label: "Philippines", iana: "Asia/Manila", country: "PH", group: "Asia" },
  { label: "Qatar", iana: "Asia/Qatar", country: "QA", group: "Asia" },
  { label: "Saudi Arabia", iana: "Asia/Riyadh", country: "SA", group: "Asia" },
  { label: "Singapore", iana: "Asia/Singapore", country: "SG", group: "Asia" },
  { label: "South Korea (Seoul)", iana: "Asia/Seoul", country: "KR", group: "Asia" },
  { label: "Sri Lanka", iana: "Asia/Colombo", country: "LK", group: "Asia" },
  { label: "Syria", iana: "Asia/Damascus", country: "SY", group: "Asia" },
  { label: "Tajikistan", iana: "Asia/Dushanbe", country: "TJ", group: "Asia" },
  { label: "Thailand (Bangkok)", iana: "Asia/Bangkok", country: "TH", group: "Asia" },
  { label: "Timor-Leste", iana: "Asia/Dili", country: "TL", group: "Asia" },
  { label: "Turkmenistan", iana: "Asia/Ashgabat", country: "TM", group: "Asia" },
  { label: "UAE (Dubai)", iana: "Asia/Dubai", country: "AE", group: "Asia" },
  { label: "Uzbekistan", iana: "Asia/Tashkent", country: "UZ", group: "Asia" },
  { label: "Vietnam", iana: "Asia/Ho_Chi_Minh", country: "VN", group: "Asia" },
  { label: "Yemen", iana: "Asia/Aden", country: "YE", group: "Asia" },
]

export const DEFAULT_IANA = "America/New_York"

/* IANA → RegionOption lookup, for matching browser-detected tz to a region. */
export const REGION_BY_IANA: Record<string, RegionOption> = Object.fromEntries(
  REGIONS.map(r => [r.iana, r]),
)

/* Country (ISO 3166-1 alpha-2) → first matching RegionOption. Used to map
 * EvenAppBridge.getUserInfo().country into a sensible default IANA timezone
 * when the user hasn't picked one explicitly. For multi-zone countries
 * (US, CA, RU, AU, BR, CN, ID, MX, KZ) the first REGIONS entry wins — that
 * means the capital / primary commercial zone listed first in the catalog. */
export const REGION_BY_COUNTRY: Record<string, RegionOption> = REGIONS.reduce<Record<string, RegionOption>>((acc, r) => {
  if (!acc[r.country]) acc[r.country] = r
  return acc
}, {})

export function ianaForCountry(country: string | null | undefined): string | null {
  if (!country) return null
  const r = REGION_BY_COUNTRY[country.toUpperCase()]
  return r?.iana ?? null
}
