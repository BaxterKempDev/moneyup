import { LS } from "./moneyup-storage"

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(LS.TOKEN)
}

export function saveToken(token: string): void {
  localStorage.setItem(LS.TOKEN, token.trim())
}

export function clearToken(): void {
  localStorage.removeItem(LS.TOKEN)
}
