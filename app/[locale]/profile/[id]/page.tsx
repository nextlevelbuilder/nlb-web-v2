import { redirect } from "next/navigation";
import { localizedPath } from "@/lib/seo";

interface ProfileIdProps {
  params: Promise<{ id: string; locale: string }>;
}

export default async function ProfileIdForwarder({ params }: ProfileIdProps) {
  const { id, locale } = await params;
  redirect(localizedPath(`/builders/${id}`, locale));
}
