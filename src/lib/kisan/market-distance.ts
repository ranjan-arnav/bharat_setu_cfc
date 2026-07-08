// lib/market-distance.ts - AI-powered distance calculation using Groq
import { getUserLocationData } from './geolocation'
import type { MarketPrice } from './market'

/**
 * Calculate distances for market prices using AI
 * INSTANT and works for ANY city in India!
 */
export async function calculateMarketDistances(prices: MarketPrice[]): Promise<MarketPrice[]> {
    try {
        // Get user's location
        const userLocation = await getUserLocationData()
        if (!userLocation) {
            console.warn('Could not get user location, using default distances')
            return prices
        }

        console.log('📍 Calculating distances from:', userLocation.city)

        // Extract unique market cities
        const marketCities = Array.from(new Set(prices.map(p => {
            // Extract city name from market (e.g., "Sendhwa APMC" -> "Sendhwa")
            return p.market.replace(/\s+(APMC|Mandi|Market|Sabzi Mandi)$/i, '').trim()
        })))

        console.log('🤖 Asking AI for distances...')

        const response = await fetch('/api/kisan/distance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                originCity: userLocation.city,
                destinationCities: marketCities
            })
        })

        const data = await response.json()
        const aiResponse = data.result || '{}'

        // Parse AI response
        let distances: { [city: string]: number } = {}
        try {
            const parsed = JSON.parse(aiResponse)
            // Normalize to lowercase
            Object.keys(parsed).forEach(key => {
                distances[key.toLowerCase()] = parseInt(parsed[key]) || 50
            })
            console.log('✅ Got distances from AI:', distances)
        } catch (e) {
            console.warn('Failed to parse AI response:', aiResponse)
        }

        // Apply distances to prices
        const pricesWithDistances: MarketPrice[] = prices.map(price => {
            const cityName = price.market.replace(/\s+(APMC|Mandi|Market|Sabzi Mandi)$/i, '').trim().toLowerCase()
            const distance = distances[cityName] || 50

            console.log(`✅ ${price.market}: ${distance} km`)
            return { ...price, distance }
        })

        return pricesWithDistances
    } catch (error) {
        console.error('❌ Error calculating distances:', error)
        // Fallback to simple estimates
        return prices.map(p => ({
            ...p,
            distance: p.market.toLowerCase().includes('local') ? 15 : 50
        }))
    }
}
