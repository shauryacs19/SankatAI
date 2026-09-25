import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Load an admin resource: { data, loading (first load), refreshing, error, reload }.
 * A superseded request (range changed mid-flight) never overwrites newer data.
 */
export function useAdminResource(loader, deps) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const seq = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the loader's inputs as deps
  const load = useCallback(loader, deps)

  const reload = useCallback(async () => {
    const id = ++seq.current
    setRefreshing(true)
    setError(null)
    try {
      const result = await load()
      if (id === seq.current) setData(result)
    } catch (err) {
      if (id === seq.current) setError(err)
    } finally {
      if (id === seq.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [load])

  useEffect(() => { reload() }, [reload])

  return { data, loading, refreshing, error, reload }
}
