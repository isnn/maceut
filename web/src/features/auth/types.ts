export type Plan = 'free' | 'standard' | 'premium'

export interface User {
  id: string
  email: string
  plan: Plan
  createdAt: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  confirmPassword: string
}
