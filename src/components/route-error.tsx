export function RouteErrorFallback() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm text-muted-foreground">
        Something went wrong while loading this page.
      </p>
      <button
        className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
        onClick={() => window.location.reload()}
        type="button"
      >
        Reload page
      </button>
    </div>
  )
}
