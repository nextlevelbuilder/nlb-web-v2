import HomeClient from "./home-client";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata({
    title: locale === "en" ? "Community for Micro SaaS Builders" : "Cộng đồng dành cho Micro SaaS Builder",
    description: locale === "en" ? "Build and launch software with a community of indie founders, practical playbooks and verified product listings." : "Xây dựng và ra mắt phần mềm cùng cộng đồng indie founder, playbook thực tiễn và danh mục sản phẩm đã được xét duyệt.",
    path: "/", locale,
  });
}

export default function Home() {
  return <HomeClient />;
}
