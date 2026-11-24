import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { router } from './app/router'
import { clearActiveMerchant, setActiveMerchantId } from './lib/localSession'

describe('App', () => {
  beforeEach(async () => {
    await router.navigate('/')
  })

  afterEach(() => {
    clearActiveMerchant()
  })

  it('shows the welcome screen by default, with no merchant bound to this browser', () => {
    render(<App />)
    expect(screen.getByText('Welcome')).toBeInTheDocument()
  })

  it('redirects to the staff PIN login screen once a merchant is bound to this browser', () => {
    setActiveMerchantId('merchant-1')
    render(<App />)
    expect(screen.getByText('Enter your PIN')).toBeInTheDocument()
  })
})
