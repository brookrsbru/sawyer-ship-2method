export const REGION_MAPPINGS: Record<string, Record<string, string>> = {
  'US': {
    'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
    'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
    'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
    'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
    'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
    'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DACOTA': 'ND', 'NORTH DAKOTA': 'ND',
    'OHIO': 'OH', 'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC', 'SOUTH DACOTA': 'SD', 'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX',
    'UTAH': 'UT', 'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV',
    'WISCONSIN': 'WI', 'WYOMING': 'WY', 'DISTRICT OF COLUMBIA': 'DC', 'AMERICAN SAMOA': 'AS',
    'GUAM': 'GU', 'NORTHERN MARIANA ISLANDS': 'MP', 'PUERTO RICO': 'PR', 'VIRGIN ISLANDS': 'VI'
  },
  'CA': {
    'ALBERTA': 'AB', 'BRITISH COLUMBIA': 'BC', 'MANITOBA': 'MB', 'NEW BRUNSWICK': 'NB',
    'NEWFOUNDLAND AND LABRADOR': 'NL', 'NEWFOUNDLAND': 'NL', 'LABRADOR': 'NL',
    'NORTHWEST TERRITORIES': 'NT', 'NOVA SCOTIA': 'NS', 'NUNAVUT': 'NU', 'ONTARIO': 'ON',
    'PRINCE EDWARD ISLAND': 'PE', 'QUEBEC': 'QC', 'SASKATCHEWAN': 'SK', 'YUKON': 'YT'
  }
};

/**
 * Normalizes a region string to its code if possible, or returns the original string.
 * @param region The state/province name or code
 * @param countryCode The ISO 2-letter country code
 */
export function normalizeRegion(region: string | undefined, countryCode: string): string {
  if (!region) return '';
  const cleanRegion = region.trim().toUpperCase();
  const countryMapping = REGION_MAPPINGS[countryCode.toUpperCase()];
  
  if (countryMapping && countryMapping[cleanRegion]) {
    return countryMapping[cleanRegion];
  }
  
  // If it's already a code (length 2 or 3 and all caps), return as is
  if (cleanRegion.length >= 2 && cleanRegion.length <= 3) {
    return cleanRegion;
  }
  
  return region;
}
