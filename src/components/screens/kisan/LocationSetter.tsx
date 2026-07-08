// components/LocationSetter.tsx - Component to set user location
'use client'

import { useState, useEffect } from 'react'
import { MapPin, Loader2, Check } from 'lucide-react'
import { setUserLocationByCity, getUserLocationData, INDIAN_CITIES } from '@/lib/kisan/geolocation'

export default function LocationSetter() {
    const [location, setLocation] = useState<string>('')
    const [currentLocation, setCurrentLocation] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        // Load current location
        getUserLocationData().then(loc => {
            if (loc) {
                setCurrentLocation(loc.city)
            }
        })
    }, [])

    const handleSetLocation = () => {
        if (!location) return

        setLoading(true)
        const result = setUserLocationByCity(location)

        if (result) {
            setCurrentLocation(result.city)
            setSuccess(true)
            setTimeout(() => setSuccess(false), 2000)
            // Reload the page to recalculate distances
            window.location.reload()
        } else {
            alert('City not found. Please try another city.')
        }

        setLoading(false)
    }

    const popularCities = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad']

    return (
        <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-3">
                <MapPin className="text-purple-600" size={20} />
                <h4 className="font-semibold text-gray-800 dark:text-gray-200">Your Location</h4>
            </div>

            {currentLocation && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Current: <span className="font-semibold text-purple-600">{currentLocation}</span>
                </p>
            )}

            <div className="flex gap-2 mb-3">
                <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Enter your city..."
                    list="cities"
                    className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <datalist id="cities">
                    {Object.keys(INDIAN_CITIES).map(city => (
                        <option key={city} value={city.charAt(0).toUpperCase() + city.slice(1)} />
                    ))}
                </datalist>
                <button
                    onClick={handleSetLocation}
                    disabled={loading || !location}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
                >
                    {loading ? (
                        <Loader2 size={18} className="animate-spin" />
                    ) : success ? (
                        <Check size={18} />
                    ) : (
                        'Set'
                    )}
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                {popularCities.map(city => (
                    <button
                        key={city}
                        onClick={() => {
                            setLocation(city)
                            setTimeout(() => {
                                const result = setUserLocationByCity(city)
                                if (result) {
                                    setCurrentLocation(result.city)
                                    window.location.reload()
                                }
                            }, 100)
                        }}
                        className="text-xs px-3 py-1 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-gray-700 dark:text-gray-300"
                    >
                        {city}
                    </button>
                ))}
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                💡 Set your location to see accurate distances to markets
            </p>
        </div>
    )
}
