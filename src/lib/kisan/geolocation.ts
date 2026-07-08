// lib/geolocation.ts - Geolocation and distance calculation utilities

export interface Coordinates {
    latitude: number
    longitude: number
}

export interface LocationData {
    city: string
    state?: string
    country?: string
    coordinates: Coordinates
}

// Major Indian cities and mandi locations with coordinates
export const INDIAN_CITIES: Record<string, Coordinates> = {
    // Major cities
    'delhi': { latitude: 28.6139, longitude: 77.2090 },
    'mumbai': { latitude: 19.0760, longitude: 72.8777 },
    'bangalore': { latitude: 12.9716, longitude: 77.5946 },
    'kolkata': { latitude: 22.5726, longitude: 88.3639 },
    'chennai': { latitude: 13.0827, longitude: 80.2707 },
    'hyderabad': { latitude: 17.3850, longitude: 78.4867 },
    'pune': { latitude: 18.5204, longitude: 73.8567 },
    'ahmedabad': { latitude: 23.0225, longitude: 72.5714 },
    'jaipur': { latitude: 26.9124, longitude: 75.7873 },
    'lucknow': { latitude: 26.8467, longitude: 80.9462 },
    'chandigarh': { latitude: 30.7333, longitude: 76.7794 },
    'indore': { latitude: 22.7196, longitude: 75.8577 },
    'bhopal': { latitude: 23.2599, longitude: 77.4126 },
    'patna': { latitude: 25.5941, longitude: 85.1376 },
    'nagpur': { latitude: 21.1458, longitude: 79.0882 },
    'surat': { latitude: 21.1702, longitude: 72.8311 },
    'vadodara': { latitude: 22.3072, longitude: 73.1812 },
    'ludhiana': { latitude: 30.9010, longitude: 75.8573 },
    'agra': { latitude: 27.1767, longitude: 78.0081 },
    'nashik': { latitude: 19.9975, longitude: 73.7898 },
    'faridabad': { latitude: 28.4089, longitude: 77.3178 },
    'meerut': { latitude: 28.9845, longitude: 77.7064 },
    'rajkot': { latitude: 22.3039, longitude: 70.8022 },
    'varanasi': { latitude: 25.3176, longitude: 82.9739 },
    'amritsar': { latitude: 31.6340, longitude: 74.8723 },
    'allahabad': { latitude: 25.4358, longitude: 81.8463 },
    'ranchi': { latitude: 23.3441, longitude: 85.3096 },
    'coimbatore': { latitude: 11.0168, longitude: 76.9558 },
    'visakhapatnam': { latitude: 17.6869, longitude: 83.2185 },
    'mysore': { latitude: 12.2958, longitude: 76.6394 },
}

// Major mandis/markets with coordinates
export const INDIAN_MARKETS: Record<string, Coordinates> = {
    'local mandi': { latitude: 28.6139, longitude: 77.2090 }, // Delhi
    'regional mandi': { latitude: 28.7041, longitude: 77.1025 }, // Near Delhi
    'vegetable market': { latitude: 28.6692, longitude: 77.2315 }, // Azadpur, Delhi
    'cotton market': { latitude: 21.1458, longitude: 79.0882 }, // Nagpur
    'spice market': { latitude: 9.9312, longitude: 76.2673 }, // Kerala
    'mahabaleshwar market': { latitude: 17.9244, longitude: 73.6577 }, // Maharashtra
    'surat apmc': { latitude: 21.1702, longitude: 72.8311 }, // Surat
    'azadpur mandi': { latitude: 28.7041, longitude: 77.1025 }, // Delhi
    'koyambedu market': { latitude: 13.0698, longitude: 80.1951 }, // Chennai
    'vashi apmc': { latitude: 19.0760, longitude: 73.0249 }, // Mumbai
    'yeshwanthpur apmc': { latitude: 13.0280, longitude: 77.5385 }, // Bangalore
    'dh ubri apmc': { latitude: 26.0173, longitude: 89.9864 }, // Assam
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
    coord1: Coordinates,
    coord2: Coordinates
): number {
    const R = 6371 // Earth's radius in kilometers

    const lat1 = toRadians(coord1.latitude)
    const lat2 = toRadians(coord2.latitude)
    const deltaLat = toRadians(coord2.latitude - coord1.latitude)
    const deltaLon = toRadians(coord2.longitude - coord1.longitude)

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    const distance = R * c
    return Math.round(distance) // Round to nearest km
}

function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
}

/**
 * Get coordinates for a city name (case-insensitive)
 */
export function getCityCoordinates(cityName: string): Coordinates | null {
    const normalized = cityName.toLowerCase().trim()
    return INDIAN_CITIES[normalized] || null
}

/**
 * Get coordinates for a market name (case-insensitive)
 */
export function getMarketCoordinates(marketName: string): Coordinates | null {
    const normalized = marketName.toLowerCase().trim()
    return INDIAN_MARKETS[normalized] || null
}

/**
 * Get user's current location from DigiPin global state, with browser geolocation fallback
 */
export async function getUserLocation(): Promise<Coordinates | null> {
    if (typeof window === 'undefined') {
        return null
    }

    // 1. Try DigiPin from store
    try {
        const { useAppStore } = await import('@/lib/store')
        const state = useAppStore.getState()
        const digipin = state.citizenProfile?.digipin || state.userProfile?.digipin
        
        if (digipin) {
            const { decodeDigipin } = await import('@/lib/sos-engine')
            const coords = decodeDigipin(digipin)
            if (coords) return { latitude: coords.lat, longitude: coords.lng }
        }
    } catch (e) {
        console.warn('Failed to decode digipin from store:', e)
    }

    // 2. Fallback: browser Geolocation API
    try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 300000, // cache for 5 minutes
            })
        })
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
    } catch (e) {
        console.warn('Browser geolocation failed:', e)
    }

    return null
}

/**
 * Reverse geocode coordinates to get location details
 */
export async function reverseGeocode(coords: Coordinates): Promise<{ city: string; state: string } | null> {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
            { headers: { 'User-Agent': 'KisanMitra/1.0' } }
        )

        if (!response.ok) return null

        const data = await response.json()

        if (data.address) {
            return {
                city: data.address.city || data.address.town || data.address.village || data.address.county || 'Unknown',
                state: data.address.state || data.address.region || 'Unknown'
            }
        }

        return null
    } catch (error) {
        console.error('Reverse geocoding error:', error)
        return null
    }
}

/**
 * Get user's location from localStorage or browser
 */
export async function getUserLocationData(): Promise<LocationData | null> {
    if (typeof window === 'undefined') return null;

    // Try DigiPin from store first
    const coords = await getUserLocation()
    if (coords) {
        // Try to get city and state from reverse geocoding
        const locationDetails = await reverseGeocode(coords)

        if (locationDetails) {
            const location: LocationData = {
                city: locationDetails.city,
                state: locationDetails.state,
                country: 'India',
                coordinates: coords,
            }
            // Save to localStorage for future use
            saveUserLocation(location)
            return location
        }

        return {
            city: 'Current Location',
            state: 'Unknown',
            coordinates: coords,
        }
    }

    // Default to Delhi if nothing else works
    return {
        city: 'Delhi',
        state: 'Delhi',
        country: 'India',
        coordinates: INDIAN_CITIES['delhi'],
    }
}

/**
 * Save user location to localStorage
 */
export function saveUserLocation(location: LocationData): void {
    if (typeof window !== 'undefined') {
        localStorage.setItem('userLocation', JSON.stringify(location))
    }
}

// Mapping of cities to their states for AGMARKNET API
const CITY_STATE_MAP: Record<string, string> = {
    'delhi': 'Delhi',
    'mumbai': 'Maharashtra',
    'bangalore': 'Karnataka',
    'kolkata': 'West Bengal',
    'chennai': 'Tamil Nadu',
    'hyderabad': 'Telangana',
    'pune': 'Maharashtra',
    'ahmedabad': 'Gujarat',
    'jaipur': 'Rajasthan',
    'lucknow': 'Uttar Pradesh',
    'chandigarh': 'Punjab',
    'indore': 'Madhya Pradesh',
    'bhopal': 'Madhya Pradesh',
    'patna': 'Bihar',
    'nagpur': 'Maharashtra',
    'surat': 'Gujarat',
    'vadodara': 'Gujarat',
    'ludhiana': 'Punjab',
    'agra': 'Uttar Pradesh',
    'nashik': 'Maharashtra',
    'faridabad': 'Haryana',
    'meerut': 'Uttar Pradesh',
    'rajkot': 'Gujarat',
    'varanasi': 'Uttar Pradesh',
    'amritsar': 'Punjab',
    'allahabad': 'Uttar Pradesh',
    'ranchi': 'Jharkhand',
    'coimbatore': 'Tamil Nadu',
    'visakhapatnam': 'Andhra Pradesh',
    'mysore': 'Karnataka',
}

/**
 * Set user location by city name
 */
export function setUserLocationByCity(cityName: string): LocationData | null {
    const normalizedCity = cityName.toLowerCase().trim()
    const coords = getCityCoordinates(normalizedCity)
    if (!coords) {
        return null
    }

    // Get state from mapping
    const state = CITY_STATE_MAP[normalizedCity] || cityName

    const location: LocationData = {
        city: cityName.charAt(0).toUpperCase() + cityName.slice(1).toLowerCase(),
        state: state,
        country: 'India',
        coordinates: coords,
    }

    saveUserLocation(location)
    return location
}

/**
 * Geocode a location name to coordinates using OpenStreetMap Nominatim API
 * This works for ANY market/city name, not just hardcoded ones
 */
export async function geocodeLocation(locationName: string, country: string = 'India'): Promise<Coordinates | null> {
    try {
        // Use OpenStreetMap Nominatim API (free, no API key needed)
        const query = encodeURIComponent(`${locationName}, ${country}`)
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'KisanMitra/1.0' // Required by Nominatim
            }
        })

        if (!response.ok) {
            console.warn('Geocoding failed:', response.statusText)
            return null
        }

        const data = await response.json()

        if (data && data.length > 0) {
            return {
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon)
            }
        }

        return null
    } catch (error) {
        console.error('Geocoding error:', error)
        return null
    }
}

/**
 * Get market coordinates - tries hardcoded list first, then geocoding
 * This ensures it works for both demo data AND real AGMARKNET markets
 */
export async function getMarketCoordinatesWithGeocoding(marketName: string, state?: string): Promise<Coordinates | null> {
    // First try hardcoded coordinates (fast)
    const hardcoded = getMarketCoordinates(marketName)
    if (hardcoded) {
        return hardcoded
    }

    // If not found, try geocoding (slower but works for any market)
    const searchQuery = state ? `${marketName}, ${state}` : marketName
    return await geocodeLocation(searchQuery)
}

