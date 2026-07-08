'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface PricePoint {
    date: string
    price: number
}

interface PriceChartProps {
    data: PricePoint[]
    trend: 'up' | 'down'
    height?: number
    showTooltip?: boolean
    showGrid?: boolean
}

export default function PriceChart({
    data,
    trend,
    height = 120,
    showTooltip = true,
    showGrid = false
}: PriceChartProps) {
    const [hoveredPoint, setHoveredPoint] = useState<PricePoint | null>(null)
    const [hoverX, setHoverX] = useState<number>(0)

    if (!data || data.length < 2) {
        return (
            <div className="flex items-center justify-center text-gray-400 text-xs h-full w-full" style={{ height }}>
                Not enough data
            </div>
        )
    }

    // Calculate dimensions and scales
    const prices = data.map(d => d.price)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice || 1

    // Chart padding
    const padding = 10
    const width = 100 // Using percent for width responsiveness, but SVG viewbox relies on fixed units. Let's assume viewbox 100xHeight.
    // Actually better to use fixed coordinate system 0-100 for X, and map Y.

    const mapY = (price: number) => {
        // In SVG, Y=0 is top. So we invert.
        // Normalized 0-1
        const normalized = (price - minPrice) / priceRange
        // Map to padding...(height-padding) inverted
        // 0 -> height-padding (bottom)
        // 1 -> padding (top)
        return (height - padding) - (normalized * (height - 2 * padding))
    }

    const mapX = (index: number) => {
        return (index / (data.length - 1)) * 300 // Viewbox width 300
    }

    // Generate Path D
    const points = data.map((d, i) => `${mapX(i)},${mapY(d.price)}`)

    // Create smooth curve (simple Catmull-Rom or similar, or just lines for now for reliability)
    // Let's use simple L for robustness first.
    const linePath = `M ${points.join(' L ')}`

    // For Area (close the loop)
    const areaPath = `${linePath} L 300,${height} L 0,${height} Z`

    const color = trend === 'up' ? '#22c55e' : '#ef4444' // green-500 : red-500
    const gradientId = `gradient-${trend}`

    return (
        <div className="relative w-full select-none" style={{ height }} onMouseLeave={() => setHoveredPoint(null)}>
            <svg
                width="100%"
                height="100%"
                viewBox={`0 0 300 ${height}`}
                className="overflow-visible"
                preserveAspectRatio="none"
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {showGrid && (
                    <g className="text-gray-200 dark:text-gray-700" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4">
                        <line x1="0" y1={padding} x2="300" y2={padding} />
                        <line x1="0" y1={height / 2} x2="300" y2={height / 2} />
                        <line x1="0" y1={height - padding} x2="300" y2={height - padding} />
                    </g>
                )}

                {/* Area */}
                <motion.path
                    d={areaPath}
                    fill={`url(#${gradientId})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                />

                {/* Line */}
                <motion.path
                    d={linePath}
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                />

                {/* Data points for interaction */}
                {data.map((d, i) => (
                    <circle
                        key={i}
                        cx={mapX(i)}
                        cy={mapY(d.price)}
                        r="12" // Invisible hit area
                        fill="transparent"
                        onMouseEnter={() => {
                            setHoveredPoint(d)
                            setHoverX(mapX(i))
                        }}
                        className="cursor-pointer"
                    />
                ))}

                {/* Active Point Indicator */}
                {hoveredPoint && (
                    <circle
                        cx={mapX(data.indexOf(hoveredPoint))}
                        cy={mapY(hoveredPoint.price)}
                        r="4"
                        fill="white"
                        stroke={color}
                        strokeWidth="3"
                    />
                )}
            </svg>

            {/* Tooltip HTML Overlay */}
            <AnimatePresence>
                {hoveredPoint && showTooltip && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-0 pointer-events-none"
                        style={{
                            left: `${(data.indexOf(hoveredPoint) / (data.length - 1)) * 100}%`,
                            transform: 'translate(-50%, -100%)'
                        }}
                    >
                        <div className={`bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg mb-2 whitespace-nowrap`}>
                            <div className="font-bold">₹{hoveredPoint.price.toLocaleString()}</div>
                            {/* <div className="text-gray-400 text-[10px]">{new Date(hoveredPoint.date).toLocaleDateString()}</div> */}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
