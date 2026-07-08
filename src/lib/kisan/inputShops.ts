// lib/inputShops.ts - Input Shop Service for Smart Input Finder
// Uses Government API (data.gov.in) when available, with LLM fallback
export interface InputShop {
    id: string;
    name: string;
    type: 'pmksk' | 'private';
    location?: { lat: number; lng: number };
    address: string;
    phone: string;
    items: Array<{ name: string; price: number; lastUpdated: Date }>;
    verified: boolean;
    rating: number;
    distance?: number;
}

const STORAGE_KEY = 'kisan_mitra_input_shops'
const LOCATION_STORAGE_KEY = 'kisan_mitra_shops_location'
const CACHE_DURATION_MS = 30 * 60 * 1000 // 30 minutes cache

// Data.gov.in API configuration
// Get your API key from: https://data.gov.in/user/register
const DATA_GOV_API_KEY = process.env.NEXT_PUBLIC_DATA_GOV_API_KEY || ''
const FERTILIZER_DEALERS_RESOURCE = 'b1de52a7-a978-4959-b60e-5ef5f8ba2d35'

// Haversine formula to calculate distance between two coordinates
function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371 // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

// Generate random offsets for shop locations around user
function generateRandomOffset(index: number): { latOff: number; lngOff: number } {
    const distances = [
        { latOff: 0.005 + Math.random() * 0.003, lngOff: 0.008 + Math.random() * 0.003 },
        { latOff: -0.012 - Math.random() * 0.005, lngOff: 0.015 + Math.random() * 0.005 },
        { latOff: 0.025 + Math.random() * 0.01, lngOff: -0.020 - Math.random() * 0.01 },
        { latOff: -0.04 - Math.random() * 0.02, lngOff: -0.035 - Math.random() * 0.02 },
        { latOff: 0.05 + Math.random() * 0.03, lngOff: 0.06 + Math.random() * 0.03 },
        { latOff: -0.08 - Math.random() * 0.04, lngOff: 0.07 + Math.random() * 0.04 },
    ]
    return distances[index % distances.length]
}

export class InputShopService {
    // Default seed shops so the UI is never empty
    private static readonly DEFAULT_SHOPS: InputShop[] = [
        {
            id: 'seed-1', name: 'Krishi Seva Kendra (PMKSK)', type: 'pmksk',
            location: { lat: 28.6139, lng: 77.2090 },
            address: 'Near District Collectorate, New Delhi',
            phone: '+91-11-2338-1092', verified: true, rating: 4.5, distance: 3.2,
            items: [
                { name: 'DAP Fertilizer (50kg)', price: 1350, lastUpdated: new Date() },
                { name: 'Urea (45kg)', price: 267, lastUpdated: new Date() },
                { name: 'Wheat Seeds (40kg)', price: 720, lastUpdated: new Date() },
            ],
        },
        {
            id: 'seed-2', name: 'Bharat Agro Inputs', type: 'private',
            location: { lat: 28.6280, lng: 77.2200 },
            address: 'Azadpur Mandi, Delhi',
            phone: '+91-98765-43210', verified: false, rating: 4.2, distance: 5.8,
            items: [
                { name: 'NPK 20:20:20 (50kg)', price: 1480, lastUpdated: new Date() },
                { name: 'Neem Oil (1L)', price: 320, lastUpdated: new Date() },
                { name: 'Mustard Seeds (5kg)', price: 450, lastUpdated: new Date() },
            ],
        },
        {
            id: 'seed-3', name: 'PM Kisan Samridhi Kendra', type: 'pmksk',
            location: { lat: 28.5800, lng: 77.2350 },
            address: 'Block Office Complex, South Delhi',
            phone: '+91-11-2634-5678', verified: true, rating: 4.7, distance: 7.1,
            items: [
                { name: 'Zinc Sulphate (25kg)', price: 680, lastUpdated: new Date() },
                { name: 'Paddy Seeds (30kg)', price: 590, lastUpdated: new Date() },
                { name: 'Bio Fertilizer (5kg)', price: 280, lastUpdated: new Date() },
            ],
        },
        {
            id: 'seed-4', name: 'Kisan Agri Store', type: 'private',
            location: { lat: 28.6500, lng: 77.1800 },
            address: 'GT Road, Narela, Delhi',
            phone: '+91-99110-22334', verified: false, rating: 3.9, distance: 12.4,
            items: [
                { name: 'Pesticide Spray (500ml)', price: 180, lastUpdated: new Date() },
                { name: 'Drip Line (100m)', price: 1200, lastUpdated: new Date() },
                { name: 'Tomato Seeds (100g)', price: 150, lastUpdated: new Date() },
            ],
        },
    ];

    // Get all shops from storage
    static getAllShops(): InputShop[] {
        if (typeof window === 'undefined') return []

        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
                const data = JSON.parse(stored)
                if (data.timestamp && Date.now() - data.timestamp < CACHE_DURATION_MS) {
                    return data.shops.map((shop: any) => ({
                        ...shop,
                        items: shop.items.map((item: any) => ({
                            ...item,
                            lastUpdated: new Date(item.lastUpdated),
                        })),
                    }))
                }
            }
            // Return default seed shops instead of empty
            return [...this.DEFAULT_SHOPS]
        } catch (error) {
            console.error('Error loading shops:', error)
            return [...this.DEFAULT_SHOPS]
        }
    }

    // Save shops to storage with timestamp
    static saveShops(shops: InputShop[]): void {
        if (typeof window === 'undefined') return

        try {
            const data = { shops, timestamp: Date.now() }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        } catch (error) {
            console.error('Error saving shops:', error)
        }
    }

    // Get location details from coordinates using reverse geocoding
    static async getLocationDetails(lat: number, lng: number): Promise<{
        city: string
        district: string
        state: string
    }> {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                { headers: { 'User-Agent': 'KisanMitra/1.0' } }
            )

            if (!response.ok) {
                return { city: 'Your Area', district: '', state: '' }
            }

            const data = await response.json()

            if (data.address) {
                return {
                    city: data.address.city || data.address.town || data.address.village || 'Your Area',
                    district: data.address.county || data.address.state_district || '',
                    state: data.address.state || ''
                }
            }

            return { city: 'Your Area', district: '', state: '' }
        } catch (error) {
            console.error('Reverse geocoding error:', error)
            return { city: 'Your Area', district: '', state: '' }
        }
    }

    // Get location name from coordinates
    static async getLocationName(lat: number, lng: number): Promise<string> {
        const details = await this.getLocationDetails(lat, lng)
        return details.city
    }

    // Try to fetch dealer count from data.gov.in API
    static async fetchGovtDealerData(state: string, district: string): Promise<{
        retailers: number
        wholesalers: number
    } | null> {
        if (!DATA_GOV_API_KEY) {
            console.log('📊 No data.gov.in API key configured. Using LLM fallback.')
            return null
        }

        try {
            // Construct API URL with filters
            const params = new URLSearchParams({
                'api-key': DATA_GOV_API_KEY,
                'format': 'json',
                'limit': '10'
            })

            if (state) {
                params.append('filters[state]', state.toUpperCase())
            }
            if (district) {
                params.append('filters[district]', district.toUpperCase())
            }

            const url = `https://api.data.gov.in/resource/${FERTILIZER_DEALERS_RESOURCE}?${params.toString()}`

            console.log('📊 Fetching from data.gov.in:', url)

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            })

            if (!response.ok) {
                console.warn('data.gov.in API error:', response.status)
                return null
            }

            const data = await response.json()

            if (data.records && data.records.length > 0) {
                // Sum up dealers for the district
                let retailers = 0
                let wholesalers = 0

                data.records.forEach((record: any) => {
                    retailers += parseInt(record.retailer || '0', 10)
                    wholesalers += parseInt(record.wholesaler || '0', 10)
                })

                console.log('📊 Found govt data:', { retailers, wholesalers })
                return { retailers, wholesalers }
            }

            return null
        } catch (error) {
            console.error('data.gov.in API error:', error)
            return null
        }
    }

    // Generate shops using LLM based on actual location
    static async generateShopsWithLLM(lat: number, lng: number): Promise<InputShop[]> {
        const locationDetails = await this.getLocationDetails(lat, lng)
        const locationStr = [locationDetails.city, locationDetails.district, locationDetails.state]
            .filter(Boolean)
            .join(', ')

        console.log('🏪 Generating shops for location:', locationStr)

        // Try to get actual dealer count from government API
        const govtData = await this.fetchGovtDealerData(
            locationDetails.state,
            locationDetails.district || locationDetails.city
        )

        const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY

        if (!apiKey) {
            console.warn('No OpenAI API key found, using fallback shop generation')
            return this.generateFallbackShops(lat, lng, locationDetails.city)
        }

        // Include govt data context in the prompt if available
        const govtContext = govtData
            ? `According to official government data (data.gov.in), this area has approximately ${govtData.retailers} retail fertilizer dealers and ${govtData.wholesalers} wholesale dealers.`
            : ''

        const prompt = `Generate 6 realistic agricultural input shops/fertilizer dealers for ${locationStr}, India.

${govtContext}

Return ONLY a valid JSON array with NO markdown formatting, NO code blocks, just the raw JSON array:
[
  {
    "name": "Shop name in local style (use local language naming if appropriate)",
    "type": "pmksk" or "private",
    "address": "Realistic local address with landmarks used in ${locationDetails.city}",
    "phone": "+91 9XXXXXXXX",
    "items": [
      {"name": "Product name (50kg)", "price": realistic_price_in_INR}
    ],
    "verified": true/false,
    "rating": 4.0-4.9
  }
]

Requirements:
- 3 PMKSK (Pradhan Mantri Kisan Samriddhi Kendra) government centers
- 3 private agricultural dealers
- Use realistic local addresses with actual landmarks or areas in ${locationDetails.city}
- Include names in local language style for ${locationDetails.state} (e.g., Hindi for UP/Bihar, Punjabi for Punjab, Telugu for Telangana)
- PMKSK subsidized prices: Urea ~₹266-280, DAP ~₹1340-1380, NPK ~₹1040-1100
- Private shops: 5-15% higher than PMKSK
- Include products relevant to ${locationDetails.state} farming (local seeds, region-specific pesticides)
- Each shop should have 3-5 items

Return ONLY the JSON array, nothing else.`

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert on Indian agricultural markets, PMKSK centers, and local fertilizer dealers. Generate realistic shop data based on actual Indian agricultural shop naming conventions and pricing. Return ONLY valid JSON, no markdown.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.8,
                    max_tokens: 2000,
                })
            })

            if (!response.ok) {
                console.error('LLM API error:', response.status)
                return this.generateFallbackShops(lat, lng, locationDetails.city)
            }

            const data = await response.json()
            const content = data.choices[0]?.message?.content || ''

            let shops: any[]
            try {
                const jsonMatch = content.match(/\[[\s\S]*\]/)
                if (jsonMatch) {
                    shops = JSON.parse(jsonMatch[0])
                } else {
                    shops = JSON.parse(content)
                }
            } catch (parseError) {
                console.error('Failed to parse LLM response:', parseError)
                return this.generateFallbackShops(lat, lng, locationDetails.city)
            }

            const formattedShops: InputShop[] = shops.map((shop: any, index: number) => {
                const offset = generateRandomOffset(index)
                return {
                    id: `shop-${Date.now()}-${index}`,
                    name: shop.name,
                    type: shop.type === 'pmksk' ? 'pmksk' : 'private',
                    location: {
                        lat: lat + offset.latOff,
                        lng: lng + offset.lngOff
                    },
                    address: shop.address,
                    phone: shop.phone || '+91 98765 43210',
                    items: (shop.items || []).map((item: any) => ({
                        name: item.name,
                        price: item.price,
                        lastUpdated: new Date()
                    })),
                    verified: shop.type === 'pmksk' ? true : (shop.verified || false),
                    rating: shop.rating || (shop.type === 'pmksk' ? 4.5 : 4.0)
                }
            })

            // Save location info
            localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({
                lat, lng,
                name: locationDetails.city,
                state: locationDetails.state,
                timestamp: Date.now()
            }))

            this.saveShops(formattedShops)

            console.log('✅ Generated', formattedShops.length, 'shops for', locationDetails.city)
            return formattedShops

        } catch (error) {
            console.error('Error generating shops with LLM:', error)
            return this.generateFallbackShops(lat, lng, locationDetails.city)
        }
    }

    // Fallback shop generation when APIs are unavailable
    static generateFallbackShops(lat: number, lng: number, locationName: string): InputShop[] {
        const shops: InputShop[] = [
            {
                id: `shop-1-${Date.now()}`,
                name: 'PMKSK Fertilizer Center',
                type: 'pmksk',
                location: { lat: lat + 0.005, lng: lng + 0.008 },
                address: `Near Main Market, ${locationName}`,
                phone: '+91 98765 43210',
                items: [
                    { name: 'Urea (50kg)', price: 266, lastUpdated: new Date() },
                    { name: 'DAP (50kg)', price: 1350, lastUpdated: new Date() },
                    { name: 'NPK (50kg)', price: 1050, lastUpdated: new Date() },
                ],
                verified: true,
                rating: 4.5,
            },
            {
                id: `shop-2-${Date.now()}`,
                name: 'Kisan Seva Kendra',
                type: 'pmksk',
                location: { lat: lat - 0.012, lng: lng + 0.015 },
                address: `Agriculture Office Road, ${locationName}`,
                phone: '+91 98765 43211',
                items: [
                    { name: 'Urea (50kg)', price: 266, lastUpdated: new Date() },
                    { name: 'Seeds Packet (1kg)', price: 180, lastUpdated: new Date() },
                    { name: 'Micronutrients', price: 280, lastUpdated: new Date() },
                ],
                verified: true,
                rating: 4.6,
            },
            {
                id: `shop-3-${Date.now()}`,
                name: 'PMKSK Seeds & Pesticides',
                type: 'pmksk',
                location: { lat: lat + 0.025, lng: lng - 0.020 },
                address: `Block Office Area, ${locationName}`,
                phone: '+91 98765 43212',
                items: [
                    { name: 'Pesticide A', price: 350, lastUpdated: new Date() },
                    { name: 'Pesticide B', price: 420, lastUpdated: new Date() },
                    { name: 'Organic Manure', price: 150, lastUpdated: new Date() },
                ],
                verified: true,
                rating: 4.7,
            },
            {
                id: `shop-4-${Date.now()}`,
                name: 'Green Valley Agro Store',
                type: 'private',
                location: { lat: lat - 0.04, lng: lng - 0.035 },
                address: `Market Road, ${locationName}`,
                phone: '+91 98765 43213',
                items: [
                    { name: 'Urea (50kg)', price: 290, lastUpdated: new Date() },
                    { name: 'DAP (50kg)', price: 1420, lastUpdated: new Date() },
                    { name: 'Organic Fertilizer', price: 480, lastUpdated: new Date() },
                ],
                verified: false,
                rating: 4.2,
            },
            {
                id: `shop-5-${Date.now()}`,
                name: 'Farmer Choice Inputs',
                type: 'private',
                location: { lat: lat + 0.05, lng: lng + 0.06 },
                address: `Highway Junction, ${locationName}`,
                phone: '+91 98765 43214',
                items: [
                    { name: 'Premium Seeds', price: 350, lastUpdated: new Date() },
                    { name: 'Growth Enhancer', price: 520, lastUpdated: new Date() },
                    { name: 'Pest Control Spray', price: 380, lastUpdated: new Date() },
                ],
                verified: false,
                rating: 4.0,
            },
            {
                id: `shop-6-${Date.now()}`,
                name: 'Krishi Udyog Centre',
                type: 'private',
                location: { lat: lat - 0.08, lng: lng + 0.07 },
                address: `Industrial Area, ${locationName}`,
                phone: '+91 98765 43215',
                items: [
                    { name: 'Bulk Urea (50kg)', price: 285, lastUpdated: new Date() },
                    { name: 'NPK Special', price: 1150, lastUpdated: new Date() },
                    { name: 'Drip Irrigation Kit', price: 2500, lastUpdated: new Date() },
                ],
                verified: false,
                rating: 4.1,
            },
        ]

        localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({
            lat, lng, name: locationName, timestamp: Date.now()
        }))

        this.saveShops(shops)
        return shops
    }

    // Check if shops need to be regenerated for a new location
    static shouldRegenerateForLocation(lat: number, lng: number): boolean {
        if (typeof window === 'undefined') return false

        try {
            const stored = localStorage.getItem(LOCATION_STORAGE_KEY)
            if (!stored) return true

            const savedLocation = JSON.parse(stored)

            if (savedLocation.timestamp && Date.now() - savedLocation.timestamp > CACHE_DURATION_MS) {
                return true
            }

            const distance = calculateDistance(
                savedLocation.lat, savedLocation.lng, lat, lng
            )

            return distance > 5 // Regenerate if moved more than 5km
        } catch {
            return true
        }
    }

    // Get shops near user location with distance calculation
    static getShopsNearLocation(
        userLat: number,
        userLng: number,
        radiusKm: number = 50
    ): InputShop[] {
        const allShops = this.getAllShops()

        return allShops
            .filter((shop) => shop.location)
            .map((shop) => ({
                ...shop,
                distance: Math.round(calculateDistance(
                    userLat, userLng,
                    shop.location!.lat, shop.location!.lng
                ) * 10) / 10,
            }))
            .filter((shop) => shop.distance! <= radiusKm)
            .sort((a, b) => a.distance! - b.distance!)
    }

    // Search shops by name or product
    static searchShops(
        query: string,
        type: 'all' | 'pmksk' | 'private' = 'all',
        userLocation?: { lat: number; lng: number }
    ): InputShop[] {
        let shops = this.getAllShops()

        if (type !== 'all') {
            shops = shops.filter((shop) => shop.type === type)
        }

        if (query) {
            const lowerQuery = query.toLowerCase()
            shops = shops.filter(
                (shop) =>
                    shop.name.toLowerCase().includes(lowerQuery) ||
                    shop.address.toLowerCase().includes(lowerQuery) ||
                    shop.items.some((item) =>
                        item.name.toLowerCase().includes(lowerQuery)
                    )
            )
        }

        if (userLocation) {
            shops = shops
                .filter((shop) => shop.location)
                .map((shop) => ({
                    ...shop,
                    distance: Math.round(calculateDistance(
                        userLocation.lat, userLocation.lng,
                        shop.location!.lat, shop.location!.lng
                    ) * 10) / 10,
                }))
            shops.sort((a, b) => (a.distance || 0) - (b.distance || 0))
        }

        return shops
    }

    // Get user's current location from DIGIPIN state, with browser geolocation fallback
    static async getUserLocation(): Promise<{ lat: number; lng: number } | null> {
        if (typeof window === 'undefined') {
            return null
        }

        // 1. Try DigiPin from store
        try {
            const { useAppStore } = await import('@/lib/store');
            const state = useAppStore.getState();
            const digipin = state.citizenProfile?.digipin || state.userProfile?.digipin;
            
            if (digipin) {
                const { decodeDigipin } = await import('@/lib/sos-engine');
                const decoded = decodeDigipin(digipin);
                if (decoded) return decoded;
            }
        } catch (error) {
            console.error('Error fetching digipin location:', error)
        }

        // 2. Fallback: browser Geolocation API
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 5000,
                    maximumAge: 300000,
                })
            })
            return { lat: pos.coords.latitude, lng: pos.coords.longitude }
        } catch (e) {
            console.warn('Browser geolocation failed:', e)
        }

        return null
    }

    // Get price comparison for an item across all shops
    static getPriceComparison(itemName: string): {
        itemName: string
        minPrice: number
        maxPrice: number
        avgPrice: number
        shops: Array<{ shopName: string; price: number; type: 'pmksk' | 'private' }>
    } | null {
        const shops = this.getAllShops()
        const pricesData: Array<{
            shopName: string
            price: number
            type: 'pmksk' | 'private'
        }> = []

        shops.forEach((shop) => {
            const item = shop.items.find((i) =>
                i.name.toLowerCase().includes(itemName.toLowerCase())
            )
            if (item) {
                pricesData.push({
                    shopName: shop.name,
                    price: item.price,
                    type: shop.type,
                })
            }
        })

        if (pricesData.length === 0) return null

        const prices = pricesData.map((p) => p.price)
        return {
            itemName,
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
            shops: pricesData.sort((a, b) => a.price - b.price),
        }
    }

    // Clear cached shops
    static clearCache(): void {
        if (typeof window === 'undefined') return
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(LOCATION_STORAGE_KEY)
    }
}
