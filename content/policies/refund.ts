import type { PolicyEntry } from "./policy-types";

/**
 * Refund Policy, written for v2: 30-day money-back guarantee, Polar as
 * merchant of record. The community refunds in the Violation and Onboarding
 * policies stay in force on top of this guarantee.
 * LEGAL REVIEW PENDING: not yet reviewed by counsel.
 */
export const refundPolicy: PolicyEntry = {
  group: "legal",
  lastUpdated: "2026-10-31",
  legalReviewPending: true,
  content: {
    en: {
      navLabel: "Refund Policy",
      title: "Refund Policy",
      summary:
        "Every payment is covered by a 30-day money-back guarantee, refunded through Polar, our merchant of record.",
      sections: [
        {
          heading: "1. 30-day money-back guarantee",
          content:
            "If Next Level Builders is not right for you, ask for a refund within 30 days of a payment and we will refund 100% of that payment. You do not need to give a reason.",
        },
        {
          heading: "2. What the guarantee covers",
          content:
            "• Premium and VIP memberships, quarterly or annual: the first payment and every renewal, each within 30 days of its charge date\n• Course videos bought individually: within 30 days of purchase\n\nThe 30 days are counted from the date on your Polar receipt.",
        },
        {
          heading: "3. Polar is our merchant of record",
          content:
            "Payments are processed by Polar (polar.sh) as merchant of record, so refunds are issued by Polar to the original payment method, including any sales tax or VAT that was charged. Banks usually show the refund within 5 to 10 business days.",
        },
        {
          heading: "4. How to ask for a refund",
          content:
            "1. Email hello@nextlevelbuilder.io from the address you used at checkout, or reply to your Polar receipt\n2. Tell us which purchase you want refunded (the order number on the receipt helps)\n3. We confirm within 2 business days and issue the refund through Polar",
        },
        {
          heading: "5. What happens after a refund",
          content:
            "• A refunded membership is cancelled and its benefits end, including Discord roles and VIP course access\n• A refunded course video is removed from your library\n• Your account stays open unless you also ask us to delete it\n• If the purchase came through an affiliate's referral link, the affiliate's commission on the refunded amount is reversed",
        },
        {
          heading: "6. After 30 days",
          content:
            "After 30 days, payments for periods already started are not refundable under this guarantee. You can cancel at any time to stop future renewals, and you keep access until the end of the period you paid for.\n\nThe community policies give members additional refunds that still apply after 30 days:\n• A full refund if you do not pass the new member review (Onboarding policy)\n• A full refund if you are removed for not meeting your commitments, and a pro-rata refund if you choose to leave after 45 days (Violation Policy)",
        },
        {
          heading: "7. Exceptions",
          content:
            "We may decline a refund when there is clear evidence of fraud or abuse of the guarantee, such as repeated buy-and-refund cycles, or when an account was permanently banned for a serious violation. These exceptions never reduce the rights the law gives you.",
        },
        {
          heading: "8. Chargebacks",
          content:
            "Please contact us before opening a dispute with your bank. A refund through Polar is faster for you, and disputed payments may lead to the membership being paused until the dispute is resolved.",
        },
        {
          heading: "9. Your statutory rights",
          content:
            "This policy adds to, and does not replace, any consumer rights you have under the law where you live.",
        },
        {
          heading: "10. Contact",
          content: "Next Level Builders · nextlevelbuilder.io · hello@nextlevelbuilder.io",
        },
      ],
    },
    vi: {
      navLabel: "Chính sách hoàn tiền",
      title: "Chính sách hoàn tiền",
      summary:
        "Mọi khoản thanh toán đều được bảo đảm hoàn tiền trong 30 ngày, hoàn qua Polar, merchant of record của chúng tôi.",
      sections: [
        {
          heading: "1. Bảo đảm hoàn tiền trong 30 ngày",
          content:
            "Nếu Next Level Builders chưa phù hợp với bạn, hãy yêu cầu hoàn tiền trong vòng 30 ngày kể từ ngày thanh toán, chúng tôi sẽ hoàn 100% khoản thanh toán đó. Bạn không cần nêu lý do.",
        },
        {
          heading: "2. Phạm vi bảo đảm",
          content:
            "• Gói thành viên Premium và VIP, theo quý hoặc theo năm: lần thanh toán đầu tiên và mỗi lần gia hạn, trong vòng 30 ngày kể từ ngày bị trừ tiền của lần đó\n• Video khóa học mua lẻ: trong vòng 30 ngày kể từ ngày mua\n\n30 ngày được tính từ ngày ghi trên biên nhận Polar.",
        },
        {
          heading: "3. Polar là merchant of record",
          content:
            "Thanh toán được xử lý bởi Polar (polar.sh) với vai trò merchant of record, vì vậy khoản hoàn tiền do Polar thực hiện về phương thức thanh toán ban đầu, bao gồm cả thuế bán hàng hoặc VAT đã thu. Ngân hàng thường hiển thị khoản hoàn trong 5 đến 10 ngày làm việc.",
        },
        {
          heading: "4. Cách yêu cầu hoàn tiền",
          content:
            "1. Gửi email tới hello@nextlevelbuilder.io từ địa chỉ email đã dùng khi thanh toán, hoặc trả lời email biên nhận của Polar\n2. Cho chúng tôi biết giao dịch bạn muốn hoàn (mã đơn hàng trên biên nhận sẽ giúp xử lý nhanh hơn)\n3. Chúng tôi xác nhận trong 2 ngày làm việc và thực hiện hoàn tiền qua Polar",
        },
        {
          heading: "5. Sau khi hoàn tiền",
          content:
            "• Gói thành viên đã hoàn tiền sẽ bị hủy và quyền lợi kết thúc, bao gồm vai trò Discord và quyền xem khóa học của VIP\n• Video khóa học đã hoàn tiền sẽ bị gỡ khỏi thư viện của bạn\n• Tài khoản của bạn vẫn được giữ, trừ khi bạn yêu cầu xóa\n• Nếu giao dịch đến từ liên kết giới thiệu của affiliate, hoa hồng của affiliate trên số tiền được hoàn sẽ bị thu hồi",
        },
        {
          heading: "6. Sau 30 ngày",
          content:
            "Sau 30 ngày, khoản thanh toán cho kỳ đã bắt đầu không được hoàn theo bảo đảm này. Bạn có thể hủy bất kỳ lúc nào để dừng gia hạn, và vẫn giữ quyền truy cập đến hết kỳ đã thanh toán.\n\nQuy chế cộng đồng cho thành viên thêm các trường hợp hoàn tiền vẫn áp dụng sau 30 ngày:\n• Hoàn tiền toàn bộ nếu không đạt xét duyệt thành viên mới (quy chế Onboarding)\n• Hoàn tiền toàn bộ nếu bị gỡ quyền do không đáp ứng cam kết, và hoàn tiền theo tỷ lệ thời gian còn lại nếu bạn tự rời đi sau 45 ngày (Chính sách xử lý vi phạm)",
        },
        {
          heading: "7. Trường hợp ngoại lệ",
          content:
            "Chúng tôi có thể từ chối hoàn tiền khi có bằng chứng rõ ràng về gian lận hoặc lạm dụng bảo đảm, chẳng hạn mua rồi hoàn lặp lại nhiều lần, hoặc khi tài khoản bị cấm vĩnh viễn do vi phạm nghiêm trọng. Các ngoại lệ này không bao giờ làm giảm quyền mà pháp luật dành cho bạn.",
        },
        {
          heading: "8. Tranh chấp thanh toán (chargeback)",
          content:
            "Vui lòng liên hệ chúng tôi trước khi mở tranh chấp với ngân hàng. Hoàn tiền qua Polar nhanh hơn cho bạn, và giao dịch bị tranh chấp có thể khiến gói thành viên tạm ngưng cho đến khi tranh chấp được giải quyết.",
        },
        {
          heading: "9. Quyền theo luật định",
          content:
            "Chính sách này bổ sung, không thay thế, các quyền người tiêu dùng mà bạn có theo pháp luật nơi bạn sinh sống.",
        },
        {
          heading: "10. Liên hệ",
          content: "Next Level Builders · nextlevelbuilder.io · hello@nextlevelbuilder.io",
        },
      ],
    },
  },
};
