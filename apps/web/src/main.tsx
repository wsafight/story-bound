import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AccessGate } from './app/AccessGate'
import { queryClient } from './app/queryClient'
import { router } from './app/router'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AccessGate>
        <RouterProvider router={router} />
      </AccessGate>
    </QueryClientProvider>
  </React.StrictMode>,
)
