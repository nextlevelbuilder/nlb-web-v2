import React from "react";
import type { VerificationBlock } from "@/packages/contracts/src";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Calendar, FileText } from "lucide-react";

export function VerificationBlockView({ block }: { block: VerificationBlock }) {
  const { metricType, verifiedValue, verificationScope, verifiedAt, evidenceStandard } = block.props;

  return (
    <Card className="p-8 rounded-sm border border-primary/30 bg-primary/[0.02] my-6 space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary gap-1.5 px-3 py-1 text-xs">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Verified Metric Claim
        </Badge>
        <span className="text-xs text-ink-2 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {verifiedAt}
        </span>
      </div>

      <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4 pt-2">
        <div>
          <div className="text-xs uppercase font-mono tracking-wider text-ink-2">{metricType}</div>
          <div className="text-4xl font-display font-light text-foreground tracking-tight mt-1">{verifiedValue}</div>
        </div>
        <div className="text-sm text-ink-2 max-w-md">
          <div className="font-semibold text-foreground">Scope: {verificationScope}</div>
          <div className="text-xs mt-0.5 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            Standard: {evidenceStandard}
          </div>
        </div>
      </div>
    </Card>
  );
}
