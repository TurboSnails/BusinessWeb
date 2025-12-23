import { useEffect, useState } from 'react'

export default function useFetch<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true
    // clear previous result/error when starting a new request
    setData(null)
    setError(null)
    setLoading(true)
    fn()
      .then((res) => {
        if (mounted) setData(res)
      })
      .catch((e) => {
        if (mounted) setError(e as Error)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [fn])

  return { data, loading, error }
}
