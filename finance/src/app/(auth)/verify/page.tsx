import { Card } from "@/components/ui/primitives";

export default function VerifyPage() {
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="font-semibold text-lg">Check your email</h1>
        <p className="text-sm text-muted mt-2">We sent you a sign-in link. Open it on this device to continue.</p>
      </Card>
    </div>
  );
}
