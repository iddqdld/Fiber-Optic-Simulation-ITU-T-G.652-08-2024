import { useEffect, useState } from "react"

function App() {
  const [backendStatus, setBackendStatus] = useState("Checking backend…")

  useEffect(() => {
    const controller = new AbortController()

    const checkBackendHealth = async () => {
      try {
        const response = await fetch("/api/v1/health", {
          signal: controller.signal,
        })
        const data = (await response.json()) as { status?: string }

        if (response.ok && data.status === "ok") {
          setBackendStatus("Backend available")
        } else {
          setBackendStatus("Backend unavailable")
        }
      } catch {
        if (controller.signal.aborted) {
          return
        }

        setBackendStatus("Backend unavailable")
      }
    }

    checkBackendHealth()

    return () => controller.abort()
  }, [])

  return (
    <main>
      <h1>Optical Fibre Simulator</h1>
      <p>The frontend bootstrap is running.</p>
      <p className="backend-status" role="status">
        {backendStatus}
      </p>
    </main>
  )
}

export default App
