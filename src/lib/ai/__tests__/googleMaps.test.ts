import { describe, expect, it } from 'vitest'
import { buildDirectionsUrl } from '@/lib/ai/itinerary/googleMaps'
import type { Stop } from '@/lib/ai/itinerary/types'

const geneve: Stop = { name: 'Genève, gare Cornavin', lat: 46.2102, lng: 6.1423 }
const cathedrale: Stop = { name: 'Cathédrale Saint-Pierre', lat: 46.201, lng: 6.1487 }
const jetDeau: Stop = { name: "Jet d'eau", lat: 46.2074, lng: 6.1557 }

describe('buildDirectionsUrl', () => {
  it('sans Place ID, chaque arrêt est désigné par ses coordonnées exactes', () => {
    const url = buildDirectionsUrl(geneve, jetDeau, [cathedrale], 'walking')
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1' +
        '&origin=46.2102%2C6.1423' +
        '&destination=46.2074%2C6.1557' +
        '&travelmode=walking' +
        '&waypoints=46.201%2C6.1487',
    )
  })

  it('avec Place IDs partout, les noms sont utilisés et ancrés par les IDs', () => {
    const url = buildDirectionsUrl(
      { ...geneve, placeId: 'pid-origin' },
      { ...jetDeau, placeId: 'pid-dest' },
      [{ ...cathedrale, placeId: 'pid-way' }],
      'walking',
    )
    expect(url).toContain(`origin=${encodeURIComponent(geneve.name)}`)
    expect(url).toContain('origin_place_id=pid-origin')
    expect(url).toContain(`destination=${encodeURIComponent(jetDeau.name)}`)
    expect(url).toContain('destination_place_id=pid-dest')
    expect(url).toContain(`waypoints=${encodeURIComponent(cathedrale.name)}`)
    expect(url).toContain('waypoint_place_ids=pid-way')
  })

  it('waypoints partiellement ancrés -> tous en coordonnées (alignement 1:1)', () => {
    const url = buildDirectionsUrl(
      geneve,
      jetDeau,
      [{ ...cathedrale, placeId: 'pid-way' }, { name: 'Arrêt inventé', lat: 46.2, lng: 6.15 }],
      'walking',
    )
    expect(url).toContain('waypoints=46.201%2C6.1487|46.2%2C6.15')
    expect(url).not.toContain('waypoint_place_ids')
  })
})
