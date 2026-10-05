import { useLocation, useNavigate } from 'react-router'

/**
 * Tilbage til hvor man kom fra (som på iPhone). Er siden åbnet direkte via et
 * link eller ved opstart (ingen historik i appen), går vi til `fallback` i stedet.
 * Bruges også efter gem/slet, så listen ikke ligger to gange i historikken.
 */
export function useGoBack() {
  const navigate = useNavigate()
  const location = useLocation()
  return (fallback: string) => {
    if (location.key === 'default') void navigate(fallback, { replace: true })
    else void navigate(-1)
  }
}
