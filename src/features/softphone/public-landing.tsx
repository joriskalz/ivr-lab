import { Link } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SoftphonePublicLanding() {
  return (
    <div className="grid min-h-svh place-items-center bg-background px-6 py-10">
      <div className="grid w-full max-w-md gap-5 rounded-lg border bg-card p-8 shadow-xs">
        <div className="grid gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FlaskConical className="size-5" strokeWidth={2} />
          </div>
          <div className="grid gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Contoso IVR Lab
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Der Zugriff auf das Softphone erfolgt nur über den bereitgestellten Link und mit einem Access-Key.
              Bitte wenden Sie sich an Ihren Administrator.
            </p>
          </div>
        </div>

        <div className="grid gap-3 border-t pt-5">
          <p className="text-sm text-muted-foreground">Sie sind Administrator?</p>
          <Button asChild className="w-fit">
            <Link to="/admins">Administrator-Anmeldung</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
