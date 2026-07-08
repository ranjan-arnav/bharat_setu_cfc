// lib/agmarknet.ts - Real AGMARKNET API integration for market prices
import { MarketPrice } from './market'

export class AGMARKNETService {
  // AGMARKNET API endpoints
  private static readonly BASE_URL = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070'
  // Prefer server-side key; fall back to public for client-side rendering
  private static readonly API_KEY =
    process.env.AGMARKNET_API_KEY || process.env.NEXT_PUBLIC_AGMARKNET_API_KEY || ''

  // Alternative: Use data.gov.in open API
  static async fetchMarketPrices(
    state?: string,
    district?: string,
    market?: string
  ): Promise<MarketPrice[]> {
    if (!this.API_KEY) {
      console.warn('AGMARKNET_API_KEY missing - falling back to demo data')
      return []
    }
    try {
      // Build query parameters
      const params = new URLSearchParams({
        'api-key': this.API_KEY,
        format: 'json',
        limit: '100',
        offset: '0',
      })

      if (state) {
        params.append('filters[state]', state)
        console.log('📍 AGMARKNET: Filtering by state:', state)
      }
      if (district) params.append('filters[district]', district)
      if (market) params.append('filters[market]', market)

      console.log('📊 AGMARKNET API URL:', `${this.BASE_URL}?${params.toString().replace(this.API_KEY, 'API_KEY_HIDDEN')}`)

      const response = await fetch(`${this.BASE_URL}?${params.toString()}`)

      if (!response.ok) {
        throw new Error('AGMARKNET API request failed')
      }

      const data = await response.json()
      console.log('📊 AGMARKNET: Got', data.records?.length || 0, 'records for', state || 'all states')
      return this.processAGMARKNETData(data.records || [])
    } catch (error) {
      console.error('Failed to fetch AGMARKNET data:', error)
      return []
    }
  }

  // Process AGMARKNET response to our format
  private static processAGMARKNETData(records: any[]): MarketPrice[] {
    const priceMap = new Map<string, any[]>()

    // Group by commodity
    records.forEach((record) => {
      const commodity = record.commodity || record.Commodity
      if (!priceMap.has(commodity)) {
        priceMap.set(commodity, [])
      }
      priceMap.get(commodity)!.push(record)
    })

    // Convert to MarketPrice format
    const prices: MarketPrice[] = []

    priceMap.forEach((commodityRecords, commodityName) => {
      // Sort by date to get trend
      const sortedRecords = commodityRecords.sort((a, b) => {
        const dateA = new Date(a.arrival_date || a.Arrival_Date)
        const dateB = new Date(b.arrival_date || b.Arrival_Date)
        return dateB.getTime() - dateA.getTime()
      })

      const latestRecord = sortedRecords[0]
      const previousRecord = sortedRecords[1]

      // Parse prices (modal_price is the most common price)
      const currentPrice = parseFloat(
        latestRecord.modal_price || latestRecord.Modal_Price || '0'
      )
      const previousPrice = previousRecord
        ? parseFloat(previousRecord.modal_price || previousRecord.Modal_Price || '0')
        : currentPrice

      // Calculate change
      const change =
        previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0
      const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'up'

      // Build price history (last 5 records)
      const priceHistory = sortedRecords.slice(0, 5).reverse().map((record) => ({
        date: record.arrival_date || record.Arrival_Date,
        price: parseFloat(record.modal_price || record.Modal_Price || '0'),
      }))

      prices.push({
        id: `agm-${commodityName.toLowerCase().replace(/\s+/g, '-')}`,
        name: commodityName,
        price: Math.round(currentPrice),
        change: parseFloat(change.toFixed(1)),
        trend: trend as 'up' | 'down',
        unit: 'quintal',
        market: latestRecord.market || latestRecord.Market || 'Local Mandi',
        lastUpdated: new Date(latestRecord.arrival_date || latestRecord.Arrival_Date),
        priceHistory,
      })
    })

    return prices
  }

  // Get prices for specific state
  static async getPricesForState(state: string): Promise<MarketPrice[]> {
    return this.fetchMarketPrices(state)
  }

  // Get prices for specific commodity
  static async getPricesForCommodity(commodity: string): Promise<MarketPrice[]> {
    try {
      const params = new URLSearchParams({
        'api-key': this.API_KEY,
        format: 'json',
        limit: '50',
        'filters[commodity]': commodity,
      })

      const response = await fetch(`${this.BASE_URL}?${params.toString()}`)

      if (!response.ok) {
        throw new Error('AGMARKNET API request failed')
      }

      const data = await response.json()
      return this.processAGMARKNETData(data.records || [])
    } catch (error) {
      console.error('Failed to fetch commodity prices:', error)
      return []
    }
  }

  // Get list of available states
  static async getAvailableStates(): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.BASE_URL}?api-key=${this.API_KEY}&format=json&limit=1000`
      )

      if (!response.ok) return []

      const data = await response.json()
      const states = new Set<string>()

      data.records?.forEach((record: any) => {
        const state = record.state || record.State
        if (state) states.add(state)
      })

      return Array.from(states).sort()
    } catch (error) {
      console.error('Failed to fetch states:', error)
      return []
    }
  }

  // Get markets for a state
  static async getMarketsForState(state: string): Promise<string[]> {
    try {
      const params = new URLSearchParams({
        'api-key': this.API_KEY,
        format: 'json',
        limit: '1000',
        'filters[state]': state,
      })

      const response = await fetch(`${this.BASE_URL}?${params.toString()}`)

      if (!response.ok) return []

      const data = await response.json()
      const markets = new Set<string>()

      data.records?.forEach((record: any) => {
        const market = record.market || record.Market
        if (market) markets.add(market)
      })

      return Array.from(markets).sort()
    } catch (error) {
      console.error('Failed to fetch markets:', error)
      return []
    }
  }
}
