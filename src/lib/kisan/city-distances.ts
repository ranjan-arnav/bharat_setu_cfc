// lib/city-distances.ts - Pre-calculated distances between major Indian cities
// This is MUCH faster than geocoding and works offline!

interface CityDistance {
    [fromCity: string]: {
        [toCity: string]: number // distance in km
    }
}

// Pre-calculated distances between major Indian cities (in km)
// Source: Google Maps road distances
export const CITY_DISTANCES: CityDistance = {
    'delhi': {
        'mumbai': 1400, 'bangalore': 2150, 'chennai': 2180, 'kolkata': 1500,
        'hyderabad': 1570, 'pune': 1450, 'ahmedabad': 950, 'jaipur': 280,
        'surat': 1200, 'lucknow': 550, 'nagpur': 1100, 'indore': 750,
        'bhopal': 750, 'patna': 1000, 'vadodara': 1000, 'ludhiana': 350,
        'agra': 230, 'nashik': 1350, 'rajkot': 1150, 'varanasi': 820,
        'amritsar': 450, 'allahabad': 650, 'ranchi': 1350, 'coimbatore': 2400,
        'visakhapatnam': 1750, 'mysore': 2200, 'chandigarh': 250, 'meerut': 70
    },
    'mumbai': {
        'delhi': 1400, 'bangalore': 980, 'chennai': 1340, 'kolkata': 2000,
        'hyderabad': 710, 'pune': 150, 'ahmedabad': 530, 'jaipur': 1150,
        'surat': 280, 'nagpur': 800, 'indore': 600, 'vadodara': 400,
        'nashik': 170, 'rajkot': 650, 'coimbatore': 1400
    },
    'bangalore': {
        'delhi': 2150, 'mumbai': 980, 'chennai': 350, 'kolkata': 1900,
        'hyderabad': 570, 'pune': 850, 'coimbatore': 370, 'mysore': 140,
        'visakhapatnam': 800
    },
    'chennai': {
        'delhi': 2180, 'mumbai': 1340, 'bangalore': 350, 'kolkata': 1670,
        'hyderabad': 630, 'coimbatore': 500, 'visakhapatnam': 800
    },
    'hyderabad': {
        'delhi': 1570, 'mumbai': 710, 'bangalore': 570, 'chennai': 630,
        'pune': 560, 'nagpur': 500, 'visakhapatnam': 620
    },
    'ahmedabad': {
        'delhi': 950, 'mumbai': 530, 'surat': 270, 'rajkot': 220,
        'vadodara': 110, 'indore': 450
    },
    'pune': {
        'delhi': 1450, 'mumbai': 150, 'bangalore': 850, 'hyderabad': 560,
        'nashik': 210, 'surat': 400
    },
    'surat': {
        'delhi': 1200, 'mumbai': 280, 'ahmedabad': 270, 'pune': 400,
        'vadodara': 150, 'rajkot': 280
    }
}

/**
 * Get distance between two cities using pre-calculated lookup table
 * Much faster than geocoding!
 */
export function getCityDistance(city1: string, city2: string): number | null {
    const c1 = city1.toLowerCase().trim()
    const c2 = city2.toLowerCase().trim()

    // Check direct lookup
    if (CITY_DISTANCES[c1]?.[c2]) {
        return CITY_DISTANCES[c1][c2]
    }

    // Check reverse lookup
    if (CITY_DISTANCES[c2]?.[c1]) {
        return CITY_DISTANCES[c2][c1]
    }

    return null
}

/**
 * Extract city name from market name
 * "Sendhwa APMC" -> "Sendhwa"
 * "Delhi Azadpur Mandi" -> "Delhi"
 */
export function extractCityFromMarket(marketName: string): string {
    // Remove common market suffixes
    let city = marketName
        .replace(/\s+(APMC|Mandi|Market|Sabzi Mandi|Krishi Upaj Mandi)$/i, '')
        .trim()

    // Extract first word (usually the city name)
    const words = city.split(/\s+/)
    return words[0].toLowerCase()
}

/**
 * Find nearest major city to estimate distance
 */
export function findNearestMajorCity(cityName: string): string | null {
    const city = cityName.toLowerCase()

    // Check if it's already a major city
    if (CITY_DISTANCES[city]) {
        return city
    }

    // Map of smaller cities to nearest major cities
    const nearestCity: { [key: string]: string } = {
        'sendhwa': 'indore',
        'vadgam': 'ahmedabad',
        'azadpur': 'delhi',
        'anand': 'ahmedabad',
        'mehsana': 'ahmedabad',
        'gandhinagar': 'ahmedabad',
        'faridabad': 'delhi',
        'gurgaon': 'delhi',
        'noida': 'delhi',
        'ghaziabad': 'delhi',
        'thane': 'mumbai',
        'navi mumbai': 'mumbai',
        'kalyan': 'mumbai',
        'pimpri': 'pune',
        'chinchwad': 'pune',
        'hubli': 'bangalore',
        'mangalore': 'bangalore',
        'belgaum': 'bangalore',
        'madurai': 'chennai',
        'salem': 'chennai',
        'tiruchirappalli': 'chennai',
        'warangal': 'hyderabad',
        'vijayawada': 'hyderabad',
        'guntur': 'hyderabad',
        'jodhpur': 'jaipur',
        'udaipur': 'jaipur',
        'kota': 'jaipur',
        'ajmer': 'jaipur',
        'kanpur': 'lucknow',
        'gorakhpur': 'lucknow',
        'bareilly': 'lucknow',
        'gwalior': 'agra',
        'jabalpur': 'bhopal',
        'ujjain': 'indore',
        'raipur': 'nagpur',
        'aurangabad': 'pune',
        'solapur': 'pune',
        'kolhapur': 'pune',
        'bhavnagar': 'ahmedabad',
        'jamnagar': 'rajkot',
        'junagadh': 'rajkot'
    }

    return nearestCity[city] || null
}
