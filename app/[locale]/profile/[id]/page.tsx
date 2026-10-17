import { redirect } from "@/i18n/navigation";

interface ProfileIdProps {
  params: Promise<{ id: string; locale: string }>;
}

/** Legacy `/profile/<id>` links forward to the public builder profile in the same locale. */
export default async function ProfileIdForwarder({ params }: ProfileIdProps) {
  const { id, locale } = await params;
  redirect({ href: `/builders/${encodeURIComponent(id)}`, locale });
}
