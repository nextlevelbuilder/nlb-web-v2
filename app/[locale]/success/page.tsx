import Link from "next/link";
export const metadata = { title: "Welcome", robots: { index: false, follow: false } };
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function SuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle2 className="w-20 h-20 text-green-500" />
          </div>
          <CardTitle className="text-3xl">Welcome to Next Level Builders! 🎉</CardTitle>
          <CardDescription className="text-lg">
            Your payment was successful. Check your email for next steps!
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-muted p-6 rounded-lg space-y-4">
            <h3 className="font-semibold text-lg">What happens next?</h3>
            <ol className="space-y-3 list-decimal list-inside">
              <li>Check your email for a welcome message with Discord invite link</li>
              <li>Join our Discord server and introduce yourself</li>
              <li>Access exclusive resources in the #resources channel</li>
              <li>Browse the recorded session library and watch new weekly drops</li>
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button asChild className="flex-1">
              <Link href="https://discord.com/invite/Ht4sb7Wjnx">
                Join Discord Now
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/">
                Back to Home
              </Link>
            </Button>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            Having trouble? Email us at hi@nextlevelbuilder.io
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
