// @vitest-environment jsdom
// Follow-up questionnaire: the AI's questions ONE AT A TIME (‹ › to move,
// tap or 1-9 to pick, picking moves on), "Other" / text answers typed, a review
// step, then one summary message + each question with its answer.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Questionnaire } from './components/Questionnaire.jsx'
import { OTHER, composeAnswers } from './utils/questionnaire'

const opts = (...labels) => labels.map((l) => ({ value: l, label: l }))
const ITEMS = [
  { id: 'q1', short: 'How long', question: 'Since when has the fever been there?', kind: 'choice', allowOther: true, options: opts('Today', '1-3 days', 'More than 3 days') },
  { id: 'q2', short: 'Fever', question: 'Do you have a fever?', kind: 'yes_no', options: opts('Yes', 'No') },
  { id: 'q3', short: 'Vomiting', question: 'Are you vomiting?', kind: 'yes_no', options: opts('Yes', 'No') },
  { id: 'q4', short: 'Better or worse', question: 'What makes it better or worse?', kind: 'text', options: [] },
]

afterEach(cleanup)

const renderQn = () => {
  const onSubmit = vi.fn(async () => {})
  render(<Questionnaire items={ITEMS} interactive onSubmit={onSubmit} />)
  return onSubmit
}
const progress = (text) => screen.findByText(text)
const question = (text) => screen.findByRole('group', { name: text })

describe('one question at a time', () => {
  it('shows only the first question, with its options as rows and "Other"', () => {
    renderQn()
    expect(screen.getByText('Question 1 of 4')).toBeTruthy()
    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(screen.getAllByRole('radio').map((r) => r.value)).toEqual(['Today', '1-3 days', 'More than 3 days', OTHER])
    expect(screen.getByRole('button', { name: 'Previous question' }).disabled).toBe(true)
  })

  it('picking an option moves on by itself; ‹ › move back and forward', async () => {
    renderQn()
    fireEvent.click(screen.getByRole('radio', { name: '1-3 days' }))
    await progress('Question 2 of 4')
    await question('Do you have a fever?')
    fireEvent.click(screen.getByRole('button', { name: 'Next question' })) // skip
    await question('Are you vomiting?')
    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }))
    await question('Do you have a fever?')
  })

  it('number keys pick an option', async () => {
    renderQn()
    fireEvent.keyDown(screen.getByRole('region', { name: 'Follow-up questions' }), { key: '2' })
    expect(screen.getByRole('radio', { name: '1-3 days' }).checked).toBe(true)
    await progress('Question 2 of 4')
  })

  it('"Other" opens a text box; Enter moves on', async () => {
    renderQn()
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }))
    const box = await screen.findByLabelText('How long: Type your answer')
    fireEvent.change(box, { target: { value: 'since Tuesday night' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await question('Do you have a fever?')
  })

  it('reviews every answer, lets you change one, and sends one summary message', async () => {
    const onSubmit = renderQn()
    fireEvent.click(screen.getByRole('radio', { name: '1-3 days' }))
    await question('Do you have a fever?')
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    await question('Are you vomiting?')
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    const text = await screen.findByLabelText('What makes it better or worse?')
    fireEvent.change(text, { target: { value: 'worse at night' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await progress('Review your answers')
    await screen.findByText('4 of 4 answered')

    fireEvent.click(screen.getByRole('button', { name: 'Change answer: Fever' }))
    await question('Do you have a fever?')
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    await question('Are you vomiting?')
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next question' }))
    await progress('Review your answers')

    fireEvent.change(await screen.findByLabelText('Anything else to add? (optional)'), { target: { value: 'a bit dizzy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [summary, answers] = onSubmit.mock.calls[0]
    expect(summary).toBe('My answers:\n• How long: 1-3 days\n• Fever: No\n• Vomiting: No\n• Better or worse: worse at night\n• Also: a bit dizzy')
    expect(answers.items.map((i) => [i.id, i.answer, i.kind])).toEqual([
      ['q1', '1-3 days', 'choice'], ['q2', 'No', 'yes_no'], ['q3', 'No', 'yes_no'], ['q4', 'worse at night', 'text'],
    ])
    expect(answers.note).toBe('a bit dizzy')
  })

  it('once answered it reads as a plain list of the questions', () => {
    render(<Questionnaire items={ITEMS} interactive={false} onSubmit={vi.fn()} />)
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })
})

describe('composeAnswers', () => {
  it('skips unanswered questions and empty "Other" text', () => {
    expect(composeAnswers(ITEMS, { q1: OTHER, q2: 'No' }, { q1: '   ' }, '')).toEqual({
      text: 'My answers:\n• Fever: No', answers: { items: [{ id: 'q2', question: 'Do you have a fever?', answer: 'No', kind: 'yes_no' }] },
    })
  })

  it('writes the summary heading in Hindi for a Hindi reply', () => {
    expect(composeAnswers(ITEMS, { q2: 'Yes' }, {}, 'थोड़ा चक्कर', 'hi').text).toBe('मेरे जवाब:\n• Fever: Yes\n• और: थोड़ा चक्कर')
  })
})
