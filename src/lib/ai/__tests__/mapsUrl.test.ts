import { describe, expect, it } from 'vitest'
import {
  isCoordOnlyMapsUrl,
  placeSearchUrl,
  upgradeMapsUrl,
} from '@/lib/ai/mapsUrl'

const BASE = 'https://www.google.com/maps/search/?api=1&query='

describe('placeSearchUrl', () => {
  it('construit une recherche « nom, ville » pour ouvrir la fiche du lieu', () => {
    expect(placeSearchUrl('Fontaine Saint-Michel', 'Paris', 48.85, 2.34)).toBe(
      `${BASE}${encodeURIComponent('Fontaine Saint-Michel, Paris')}`,
    )
  })

  it('n’ajoute pas la ville quand le nom la contient déjà', () => {
    expect(
      placeSearchUrl('Place Bellecour, Lyon, France', 'lyon', 45.75, 4.83),
    ).toBe(`${BASE}${encodeURIComponent('Place Bellecour, Lyon, France')}`)
  })

  it('retombe sur les coordonnées sans nom exploitable', () => {
    expect(placeSearchUrl('', 'Paris', 48.85, 2.34)).toBe(`${BASE}48.85%2C2.34`)
    expect(placeSearchUrl('   ', undefined, 48.85, 2.34)).toBe(
      `${BASE}48.85%2C2.34`,
    )
  })

  it('fonctionne sans ville', () => {
    expect(placeSearchUrl('Tour Eiffel', null, 48.86, 2.29)).toBe(
      `${BASE}${encodeURIComponent('Tour Eiffel')}`,
    )
  })
})

describe('isCoordOnlyMapsUrl', () => {
  it('reconnaît l’ancien format coordonnées seules (brut et encodé)', () => {
    expect(isCoordOnlyMapsUrl(`${BASE}48.85,2.34`)).toBe(true)
    expect(isCoordOnlyMapsUrl(`${BASE}48.85%2C2.34`)).toBe(true)
    expect(isCoordOnlyMapsUrl(`${BASE}-33.9,151.2`)).toBe(true)
  })

  it('ne matche pas les liens nommés ou d’itinéraire', () => {
    expect(isCoordOnlyMapsUrl(`${BASE}Tour%20Eiffel`)).toBe(false)
    expect(
      isCoordOnlyMapsUrl(
        'https://www.google.com/maps/dir/?api=1&origin=A&destination=B',
      ),
    ).toBe(false)
  })
})

describe('upgradeMapsUrl', () => {
  const legacy = `${BASE}48.85,2.34`

  it('met à niveau un lien hérité vers la recherche nommée', () => {
    expect(upgradeMapsUrl(legacy, 'Panthéon', 'Paris', 48.85, 2.34)).toBe(
      `${BASE}${encodeURIComponent('Panthéon, Paris')}`,
    )
  })

  it('laisse intacts les liens déjà nommés', () => {
    const named = `${BASE}${encodeURIComponent('Panthéon, Paris')}`
    expect(upgradeMapsUrl(named, 'Autre nom', 'Paris', 48.85, 2.34)).toBe(named)
  })

  it('ne remplace pas les coordonnées par un nom de repli « Étape N »', () => {
    expect(upgradeMapsUrl(legacy, 'Étape 3', 'Paris', 48.85, 2.34)).toBe(legacy)
    expect(upgradeMapsUrl(legacy, '', 'Paris', 48.85, 2.34)).toBe(legacy)
  })
})
