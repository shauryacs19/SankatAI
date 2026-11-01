// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { applyTextSize, getTextSize, initTextSize } from './textSize'

afterEach(() => { localStorage.clear(); document.documentElement.style.fontSize = '' })

describe('text size preference', () => {
  it('defaults to medium (a step below the browser default)', () => {
    expect(initTextSize()).toBe('medium')
    expect(document.documentElement.style.fontSize).toBe('93.75%')
  })

  it('applies and remembers small / large; ignores unknown values', () => {
    applyTextSize('small')
    expect(document.documentElement.style.fontSize).toBe('87.5%')
    expect(getTextSize()).toBe('small')
    applyTextSize('large')
    expect(document.documentElement.style.fontSize).toBe('100%')
    expect(applyTextSize('huge')).toBe('medium')
  })
})
