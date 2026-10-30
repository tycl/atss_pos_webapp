import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('redirects to the staff PIN login screen by default', () => {
    render(<App />)
    expect(screen.getByText('Enter your PIN')).toBeInTheDocument()
  })
})
