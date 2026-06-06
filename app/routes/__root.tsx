import type { ReactNode } from 'react'
import { Outlet, createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import '../styles/globals.css'

function NotFoundPage(): ReactNode {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-4xl font-bold tracking-tight">404</h1>
      <p className="text-muted-foreground">Page not found.</p>
    </main>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
})

function RootComponent(): ReactNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SafeAI</title>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
