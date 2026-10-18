import { requireEvent } from "@/lib/builder-league/ruleset/policy-text";
import type { PolicyEntry } from "./policy-types";

const post = requireEvent("ship_public_post");

/** Community policy ported verbatim from the original site (messages.policies["ship-policy"]); RP and rank text follows Builder League ruleset v2. */
export const shipPolicy: PolicyEntry = {
  group: "community",
  lastUpdated: "2026-10-17",
  legalReviewPending: false,
  content: {
    en: {
      navLabel: "SHIP Policy",
      title: "SHIP Policy — Build in Public",
      summary: "What counts as a SHIP, the minimum monthly commitment and how shipping is evaluated.",
      sections: [
        {
          heading: "What is SHIP?",
          content:
            'SHIP means publishing anything you\'re building, learning, or sharing to the public — articles, products, ideas, experiences...\n\n"Ship early, ship often, ship with intention."',
        },
        {
          heading: "Minimum SHIP Commitment",
          content:
            `• Quantity: At least 4 public posts/month (avg. once/week), not all at the end of the month — approved Contributors are exempt\n• Format: Public posts with links (blog, social media, website...)\n• Report: Share the link in the #ship Discord channel\n• Purpose: So the community can support, engage, and give feedback\n• RP: each verified public post earns +${post.rp} RP, up to ${post.caps[0].max} posts/week`,
        },
        {
          heading: "What Counts as a SHIP",
          content:
            "Accepted:\n• Personal profile: Introducing yourself, LinkedIn updates, portfolio\n• Product: MVP, beta, new feature, demo\n• Expert knowledge: Tutorial, guides, tips & tricks\n• Work experience: Lessons learned, behind the scenes\n• Ideas: Concept, wireframe, validation\n\nNot accepted:\n• Simple reposts/shares without original content\n• Private posts without a public link\n• Comments on others' posts",
        },
        {
          heading: "Weekly SHIP Process",
          content:
            "1. Create content (article, video, product...)\n2. Post it PUBLIC (blog, social, website...)\n3. Copy the post link\n4. Share it in the #ship Discord channel\n5. Community comes in to support and engage",
        },
        {
          heading: "Monthly Evaluation",
          content:
            "• 0–1 posts: Not met — Warning\n• 2–3 posts: Below expectation — Reminder\n• 4+ posts: Meets requirement\n• 8+ posts: Outstanding\n• 12+ posts: Top Shipper",
        },
        {
          heading: "Community Support",
          content:
            'When you SHIP in #ship, other members will like/react, leave constructive feedback, share if the content is good, and connect if there\'s synergy.\n\nNLB Culture: "Support first, critique second"',
        },
      ],
    },
    vi: {
      navLabel: "Quy chế SHIP",
      title: "Quy chế SHIP — Build in Public",
      summary: "Thế nào là một lần SHIP, cam kết tối thiểu mỗi tháng và cách đánh giá.",
      sections: [
        {
          heading: "SHIP là gì?",
          content:
            'SHIP là công bố ra công chúng bất kỳ thứ gì bạn đang xây dựng, học hỏi, hoặc chia sẻ — bài viết, sản phẩm, ý tưởng, kinh nghiệm...\n\n"Ship early, ship often, ship with intention."',
        },
        {
          heading: "Cam kết SHIP tối thiểu",
          content:
            `• Số lượng: Tối thiểu 4 bài public/tháng (trung bình 1 lần/tuần), không gom cuối tháng — Contributor đã được duyệt được miễn\n• Hình thức: Bài viết public có link (blog, social media, website...)\n• Báo cáo: Post link vào channel #ship trên Discord\n• Mục đích: Để cộng đồng hỗ trợ tương tác, feedback\n• RP: mỗi bài public được xác minh nhận +${post.rp} RP, tính tối đa ${post.caps[0].max} bài/tuần`,
        },
        {
          heading: "Những gì được tính là SHIP",
          content:
            "Được chấp nhận:\n• Profile cá nhân: Giới thiệu bản thân, LinkedIn, portfolio\n• Sản phẩm: MVP, beta, feature mới, demo\n• Kiến thức chuyên môn: Tutorial, hướng dẫn, tips & tricks\n• Kinh nghiệm làm nghề: Lessons learned, behind the scenes\n• Ý tưởng: Concept, wireframe, validation\n\nKhông được chấp nhận:\n• Bài repost/share đơn thuần không có nội dung riêng\n• Bài viết private/không có link public\n• Comment trên bài người khác",
        },
        {
          heading: "Quy trình SHIP hàng tuần",
          content:
            "1. Tạo nội dung (bài viết, video, sản phẩm...)\n2. Đăng PUBLIC (blog, social, website...)\n3. Copy link bài viết\n4. Chia sẻ vào channel #ship trên Discord\n5. Cộng đồng vào hỗ trợ tương tác",
        },
        {
          heading: "Đánh giá hàng tháng",
          content:
            "• 0–1 bài: Không đạt — Cảnh báo\n• 2–3 bài: Chưa đạt — Nhắc nhở\n• 4+ bài: Đạt yêu cầu\n• 8+ bài: Xuất sắc\n• 12+ bài: Top Shipper",
        },
        {
          heading: "Hỗ trợ từ cộng đồng",
          content:
            'Khi bạn SHIP vào #ship, các thành viên khác sẽ like/react, comment feedback xây dựng, share nếu nội dung hay, và kết nối nếu có synergy.\n\nVăn hóa NLB: "Support first, critique second"',
        },
      ],
    },
  },
};
