import { describe, expect, it } from 'vitest'
import { etapeMapsUrl, hasValidCoords, pointMapsUrl } from '@/lib/ai/mapsUrl'

const BASE = 'https://www.google.com/maps/search/?api=1&query='

describe('pointMapsUrl', () => {
  it('ancre le lien sur les coordonnées exactes', () => {
    expect(pointMapsUrl(46.2044, 6.1432)).toBe(`${BASE}46.2044%2C6.1432`)
  })

  it('gère les coordonnées négatives', () => {
    expect(pointMapsUrl(-33.9249, 18.4241)).toBe(`${BASE}-33.9249%2C18.4241`)
  })
})

describe('hasValidCoords', () => {
  it('accepte des coordonnées finies non nulles', () => {
    expect(hasValidCoords(46.2044, 6.1432)).toBe(true)
    expect(hasValidCoords(-33.9, 151.2)).toBe(true)
    expect(hasValidCoords(0, 6.14)).toBe(true)
  })

  it('rejette NaN, Infinity et (0,0) — géocodage absent', () => {
    expect(hasValidCoords(NaN, 6.14)).toBe(false)
    expect(hasValidCoords(46.2, Infinity)).toBe(false)
    expect(hasValidCoords(0, 0)).toBe(false)
  })
})

describe('etapeMapsUrl', () => {
  it('remplace un lien « nom, ville » stocké par les coordonnées exactes', () => {
    const legacy = `${BASE}${encodeURIComponent('Cathédrale Saint-Pierre, Genève')}`
    expect(etapeMapsUrl(legacy, 46.201, 6.1487)).toBe(`${BASE}46.201%2C6.1487`)
  })

  it('remplace aussi les anciens liens coordonnées (déjà corrects)', () => {
    const legacy = `${BASE}46.201,6.1487`
    expect(etapeMapsUrl(legacy, 46.201, 6.1487)).toBe(`${BASE}46.201%2C6.1487`)
  })

  it('retombe sur l’URL stockée quand les coordonnées sont inexploitables', () => {
    const stored = `${BASE}Tour%20Eiffel`
    expect(etapeMapsUrl(stored, 0, 0)).toBe(stored)
    expect(etapeMapsUrl(stored, NaN, 2.29)).toBe(stored)
  })

  it('renvoie une chaîne vide sans URL stockée ni coordonnées', () => {
    expect(etapeMapsUrl(undefined, 0, 0)).toBe('')
    expect(etapeMapsUrl(null, NaN, NaN)).toBe('')
  })
})
