import React from "react";
import type { FounderBlock } from "@/packages/contracts/src";
import { Card } from "@/components/ui/card";
import { User, Globe } from "lucide-react";
import Link from "next/link";

export function FounderBlockView({ block }: { block: FounderBlock }) {
  const { name, bio, avatarUrl, xHandle, linkedinUrl } = block.props;

  return (
    <Card className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] my-6 flex flex-col md:flex-row items-center md:items-start gap-6">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-2xl text-primary overflow-hidden shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-10 h-10" />
        )}
      </div>

      <div className="space-y-3 text-center md:text-left flex-1">
        <h3 className="text-2xl font-bold text-foreground">{name}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{bio}</p>

        <div className="flex items-center justify-center md:justify-start gap-4 pt-2">
          {xHandle && (
            <Link
              href={`https://x.com/${xHandle.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              @{xHandle.replace("@", "")}
            </Link>
          )}
          {linkedinUrl && (
            <Link
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5" />
              LinkedIn Profile
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
