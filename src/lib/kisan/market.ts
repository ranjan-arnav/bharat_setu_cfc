// lib/market.ts - Market prices service
import { calculateDistance, getMarketCoordinates, getUserLocationData, type Coordinates } from './geolocation'

export interface MarketPrice {
  id: string
  name: string
  price: number
  change: number
  trend: 'up' | 'down'
  unit: string
  market: string
  state?: string
  lastUpdated: Date
  priceHistory: Array<{ date: string; price: number }>
  distance?: number // Distance from user in km
  // Enhanced fields
  yesterdayPrice?: number
  lastWeekPrice?: number
  lastMonthPrice?: number
  volatility?: 'low' | 'medium' | 'high'
  bestTimeToSell?: 'now' | 'wait' | 'sell-soon'
  msp?: number // Minimum Support Price
  qualityGrades?: Array<{ grade: string; price: number }>
}

export class MarketService {
  private static readonly DEMO_PRICES: MarketPrice[] = [
    {
      id: '1',
      name: 'Wheat',
      price: 2100,
      change: 5.2,
      trend: 'up',
      unit: 'quintal',
      market: 'Local Mandi',
      lastUpdated: new Date(),
      priceHistory: [
        { date: '2025-10-24', price: 1950 },
        { date: '2025-10-25', price: 2000 },
        { date: '2025-10-26', price: 2050 },
        { date: '2025-10-27', price: 2080 },
        { date: '2025-10-31', price: 2100 },
      ],
      distance: 15, // km from user
    },
    {
      id: '2',
      name: 'Rice',
      price: 3200,
      change: -2.1,
      trend: 'down',
      unit: 'quintal',
      market: 'Regional Mandi',
      lastUpdated: new Date(),
      priceHistory: [
        { date: '2025-10-24', price: 3300 },
        { date: '2025-10-25', price: 3280 },
        { date: '2025-10-26', price: 3250 },
        { date: '2025-10-27', price: 3220 },
        { date: '2025-10-31', price: 3200 },
      ],
      distance: 45,
    },
    {
      id: '3',
      name: 'Tomato',
      price: 25,
      change: 12.5,
      trend: 'up',
      unit: 'kg',
      market: 'Vegetable Market',
      lastUpdated: new Date(),
      priceHistory: [
        { date: '2025-10-24', price: 18 },
        { date: '2025-10-25', price: 20 },
        { date: '2025-10-26', price: 22 },
        { date: '2025-10-27', price: 23 },
        { date: '2025-10-31', price: 25 },
      ],
      distance: 8,
    },
    {
      id: '4',
      name: 'Onion',
      price: 18,
      change: -8.3,
      trend: 'down',
      unit: 'kg',
      market: 'Vegetable Market',
      lastUpdated: new Date(),
      priceHistory: [
        { date: '2025-10-24', price: 22 },
        { date: '2025-10-25', price: 21 },
        { date: '2025-10-26', price: 20 },
        { date: '2025-10-27', price: 19 },
        { date: '2025-10-31', price: 18 },
      ],
      distance: 8,
    },
    {
      id: '5',
      name: 'Potato',
      price: 15,
      change: 3.2,
      trend: 'up',
      unit: 'kg',
      market: 'Vegetable Market',
      lastUpdated: new Date(),
      priceHistory: [
        { date: '2025-10-24', price: 14 },
        { date: '2025-10-25', price: 14.2 },
        { date: '2025-10-26', price: 14.5 },
        { date: '2025-10-27', price: 14.8 },
        { date: '2025-10-31', price: 15 },
      ],
      distance: 12,
    },
    {
      id: '6',
      name: 'Cotton',
      price: 5800,
      change: 1.8,
      trend: 'up',
      unit: 'quintal',
      market: 'Cotton Market',
      lastUpdated: new Date(),
      priceHistory: [
        { date: '2025-10-24', price: 5650 },
        { date: '2025-10-25', price: 5700 },
        { date: '2025-10-26', price: 5750 },
        { date: '2025-10-27', price: 5780 },
        { date: '2025-10-31', price: 5800 },
      ],
      distance: 62,
    },
    {
      id: '7',
      name: 'Coriander',
      price: 120,
      change: 0.5,
      trend: 'up',
      unit: 'kg',
      market: 'Spice Market',
      lastUpdated: new Date(),
      priceHistory: [
        { date: '2025-10-24', price: 115 },
        { date: '2025-10-25', price: 118 },
        { date: '2025-10-26', price: 119 },
        { date: '2025-10-27', price: 120 },
        { date: '2025-10-31', price: 120 },
      ],
      distance: 25,
    },
    {
      id: '8',
      name: 'Strawberry',
      price: 24000, // Expensive!
      change: 15.5,
      trend: 'up',
      unit: 'quintal',
      market: 'Mahabaleshwar Market',
      lastUpdated: new Date(),
      priceHistory: [
        { date: '2025-10-24', price: 21000 },
        { date: '2025-10-25', price: 22000 },
        { date: '2025-10-26', price: 23500 },
        { date: '2025-10-27', price: 23800 },
        { date: '2025-10-31', price: 24000 },
      ],
      distance: 120,
    },
  ]

  static getMarketPrices(): MarketPrice[] {
    return this.DEMO_PRICES
  }

  static async fetchMarketPrices(state?: string, market?: string): Promise<MarketPrice[]> {
    try {
      const url = new URL('/api/kisan/market', window.location.origin)
      if (state) url.searchParams.append('state', state)
      if (market) url.searchParams.append('market', market)

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error('Failed to fetch from /api/kisan/market')
      
      const data = await res.json()
      
      if (data.prices && data.prices.length > 0) {
        // Attach priceHistory mock to each price since azure search might not return a nested history easily
        return data.prices.map((p: any) => ({
          ...p,
          priceHistory: this.DEMO_PRICES.find(demo => demo.name === p.name)?.priceHistory || [
            { date: '2025-10-24', price: p.price * 0.95 },
            { date: '2025-10-25', price: p.price * 0.98 },
            { date: '2025-10-31', price: p.price }
          ]
        }))
      }

      console.warn('API returned empty, using demo data')
      return this.DEMO_PRICES
    } catch (error) {
      console.error('Failed to fetch market prices:', error)
      return this.DEMO_PRICES
    }
  }

  static async searchPrices(query: string): Promise<MarketPrice[]> {
    try {
      const url = new URL('/api/kisan/market', window.location.origin)
      if (query) url.searchParams.append('query', query)

      const res = await fetch(url.toString())
      const data = await res.json()

      if (data.prices && data.prices.length > 0) {
        return data.prices.map((p: any) => ({
          ...p,
          priceHistory: this.DEMO_PRICES.find(demo => demo.name === p.name)?.priceHistory || []
        }))
      }

      return this.DEMO_PRICES.filter((price) =>
        price.name.toLowerCase().includes(query.toLowerCase())
      )
    } catch (error) {
      console.error('Search failed:', error)
      return this.DEMO_PRICES.filter((price) =>
        price.name.toLowerCase().includes(query.toLowerCase())
      )
    }
  }

  static getPriceById(id: string): MarketPrice | undefined {
    return this.DEMO_PRICES.find((price) => price.id === id)
  }

  static getMarketAdvice(prices: MarketPrice[]): Array<{ key: string, crops: string[] }> {
    const advice: Array<{ key: string, crops: string[] }> = []

    const highGainers = prices.filter((p) => p.change > 10)
    if (highGainers.length > 0) {
      advice.push({
        key: 'highPriceIncrease',
        crops: highGainers.map((p) => p.name)
      })
    }

    const declining = prices.filter((p) => p.change < -5)
    if (declining.length > 0) {
      advice.push({
        key: 'pricesDecline',
        crops: declining.map((p) => p.name)
      })
    }

    const stable = prices.filter((p) => Math.abs(p.change) < 2)
    if (stable.length > 0) {
      advice.push({
        key: 'stablePrices',
        crops: stable.map((p) => p.name)
      })
    }

    return advice
  }

  static getBestSellingTime(cropName: string): string {
    const price = this.DEMO_PRICES.find(
      (p) => p.name.toLowerCase() === cropName.toLowerCase()
    )
    if (!price) return 'nodata'

    if (price.trend === 'up' && price.change > 5) {
      return 'goodtimetosell'
    } else if (price.trend === 'down') {
      return 'considerwaiting'
    } else {
      return 'marketstable'
    }
  }

  static calculateNetProfit(
    price: number,
    quantity: number,
    distance: number,
    transportCostPerKm: number
  ): number {
    const grossRevenue = price * quantity
    const totalTransportCost = distance * transportCostPerKm
    return grossRevenue - totalTransportCost
  }

  // Enhanced Market Intelligence Methods

  static calculateVolatility(priceHistory: Array<{ date: string; price: number }>): 'low' | 'medium' | 'high' {
    if (priceHistory.length < 2) return 'low'

    const prices = priceHistory.map(p => p.price)
    const changes = []
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1] * 100)
      changes.push(change)
    }

    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length

    if (avgChange > 5) return 'high'
    if (avgChange > 2) return 'medium'
    return 'low'
  }

  static getPriceComparisons(price: MarketPrice): {
    vsYesterday: number
    vsLastWeek: number
    vsLastMonth: number
  } {
    const history = price.priceHistory
    const currentPrice = price.price

    // Yesterday (last item in history)
    const yesterdayPrice = history.length > 0 ? history[history.length - 1].price : currentPrice
    const vsYesterday = ((currentPrice - yesterdayPrice) / yesterdayPrice * 100)

    // Last week (7 days ago, or earliest if less than 7 days)
    const lastWeekIndex = Math.max(0, history.length - 7)
    const lastWeekPrice = history[lastWeekIndex]?.price || currentPrice
    const vsLastWeek = ((currentPrice - lastWeekPrice) / lastWeekPrice * 100)

    // Last month (30 days ago, or earliest)
    const lastMonthIndex = Math.max(0, history.length - 30)
    const lastMonthPrice = history[lastMonthIndex]?.price || currentPrice
    const vsLastMonth = ((currentPrice - lastMonthPrice) / lastMonthPrice * 100)

    return {
      vsYesterday: Number(vsYesterday.toFixed(2)),
      vsLastWeek: Number(vsLastWeek.toFixed(2)),
      vsLastMonth: Number(vsLastMonth.toFixed(2))
    }
  }

  static getBestTimeToSellAdvice(price: MarketPrice): {
    recommendation: 'now' | 'wait' | 'sell-soon'
    reason: string
  } {
    const volatility = this.calculateVolatility(price.priceHistory)
    const comparisons = this.getPriceComparisons(price)

    // Strong upward trend + high volatility = sell now before it drops
    if (price.trend === 'up' && price.change > 8 && volatility === 'high') {
      return {
        recommendation: 'now',
        reason: 'Prices are high but volatile. Sell now before potential drop.'
      }
    }

    // Strong upward trend + low volatility = sell soon
    if (price.trend === 'up' && price.change > 5 && volatility === 'low') {
      return {
        recommendation: 'sell-soon',
        reason: 'Steady price increase. Good time to sell in next 2-3 days.'
      }
    }

    // Downward trend = wait
    if (price.trend === 'down' && price.change < -3) {
      return {
        recommendation: 'wait',
        reason: 'Prices are falling. Wait for market to stabilize.'
      }
    }

    // Stable prices
    if (Math.abs(price.change) < 2) {
      return {
        recommendation: 'now',
        reason: 'Market is stable. Good time for planned sales.'
      }
    }

    // Default
    return {
      recommendation: 'sell-soon',
      reason: 'Market conditions are favorable.'
    }
  }

  static enrichPriceData(prices: MarketPrice[]): MarketPrice[] {
    return prices.map(price => {
      const comparisons = this.getPriceComparisons(price)
      const volatility = this.calculateVolatility(price.priceHistory)
      const sellAdvice = this.getBestTimeToSellAdvice(price)

      return {
        ...price,
        yesterdayPrice: price.priceHistory[price.priceHistory.length - 1]?.price,
        volatility,
        bestTimeToSell: sellAdvice.recommendation,
        // Add MSP data for common crops
        msp: this.getMSP(price.name)
      }
    })
  }

  static getMSP(cropName: string): number | undefined {
    const mspData: Record<string, number> = {
      'wheat': 2125,
      'rice': 2183,
      'paddy': 2183,
      'cotton': 6620,
      'sugarcane': 315, // per quintal
      'maize': 2090,
      'soyabean': 4600,
      'mustard': 5650,
      'groundnut': 6377,
      'turmeric': 10000,
    }

    return mspData[cropName.toLowerCase()]
  }

  /**
   * Calculate distances for market prices based on user location
   */
  static async calculateDistances(prices: MarketPrice[]): Promise<MarketPrice[]> {
    // Use the geocoding-enabled module for real AGMARKNET markets
    const { calculateMarketDistances } = await import('./market-distance')
    return calculateMarketDistances(prices)
  }
}
