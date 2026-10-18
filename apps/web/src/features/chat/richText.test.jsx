// @vitest-environment jsdom
// Reply layout (lists, subheadings, paragraphs) and the home-page question
// hand-off. Layout only: no text may be added or dropped.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RichText } from './components/RichText.jsx'
import { hasPendingQuestion, savePendingQuestion, takePendingQuestion } from './pendingQuestion'

afterEach(() => { cleanup(); sessionStorage.clear() })

describe('RichText', () => {
  it('keeps plain advice as one paragraph', () => {
    const { container } = render(<RichText text="Rest and drink water." />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.textContent).toBe('Rest and drink water.')
  })

  it('turns bullets, numbered steps and "Label:" lines into structure', () => {
    const text = 'What to do now:\n- Sit down\n- Loosen tight clothing\n\n1. Call 108\n2. Unlock the front door\n\nStay calm.'
    const { container } = render(<RichText text={text} />)
    expect(container.querySelector('.rt-h').textContent).toBe('What to do now:')
    expect([...container.querySelectorAll('ul li')].map((li) => li.textContent)).toEqual(['Sit down', 'Loosen tight clothing'])
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    expect(container.querySelector('.rt > p:last-child').textContent).toBe('Stay calm.')
  })

  it('renders **bold** without the asterisks', () => {
    const { container } = render(<RichText text="This can be a sign of a **heart attack**." />)
    expect(container.querySelector('strong').textContent).toBe('heart attack')
    expect(container.textContent).not.toContain('*')
  })
})

describe('pending question', () => {
  it('is handed over once, then cleared', () => {
    expect(hasPendingQuestion()).toBe(false)
    savePendingQuestion('Fever since yesterday')
    expect(hasPendingQuestion()).toBe(true)
    expect(takePendingQuestion()).toBe('Fever since yesterday')
    expect(takePendingQuestion()).toBe('')
  })
})
