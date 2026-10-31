import type { PolicyEntry } from "./policy-types";

/**
 * Affiliate Agreement, version 2026-10-31. The version members accept is AFFILIATE_TERMS_VERSION in
 * lib/referrals/program-rules.ts; publish a new version there whenever this text changes materially.
 * Numbers mirror DEFAULT_PROGRAM_RULES (30-day attribution, 45-day hold, US$25 threshold, 20% PayPal
 * service fee) and the program behaviour in lib/referrals.
 * Unlike the other legal pages, this one tells visitors it is pending legal review, because payouts
 * stay off until that review and the finance review are signed off.
 */
export const affiliateAgreementPolicy: PolicyEntry = {
  group: "legal",
  lastUpdated: "2026-10-31",
  legalReviewPending: true,
  content: {
    en: {
      navLabel: "Affiliate Agreement",
      title: "Affiliate Agreement",
      summary:
        "The terms for promoting Next Level Builders memberships with affiliate links: eligibility, commission, refunds, payouts, disclosure and data.",
      sections: [
        {
          heading: "Status: pending legal review",
          content:
            "This is version 2026-10-31 of the Affiliate Agreement. It is pending legal review. Commission is recorded from the day you join, but no payout is made until our legal and finance review is complete. If the review changes these terms, we will publish a new version and ask you to accept it before you keep earning under it.",
        },
        {
          heading: "1. Agreement",
          content:
            'This Affiliate Agreement ("Agreement") is between you and Next Level Builders ("NLB", "we", "us"). It applies when you join the affiliate program from your account and accept it. We record the version you accepted and the time you accepted it.\n\nThis Agreement adds to our Terms of Service, Privacy Policy, Refund Policy and Cookie Policy, which keep applying. Where they conflict on the affiliate program, this Agreement wins.',
        },
        {
          heading: "2. Who can join",
          content:
            "• You need an NLB account with a verified email address, in good standing (not banned or suspended).\n• You must be old enough to enter a binding contract where you live.\n• One affiliate account per person. Joining is free and does not require a membership.\n• We may refuse or end a participation that would break the law or this Agreement.",
        },
        {
          heading: "3. Links, codes and your budget",
          content:
            "• You can create up to 20 links. Each has its own code, which cannot be changed once created; you can change its label, landing page, campaign tag, buyer discount and status.\n• Your level depends on the number of unique paying customers you referred whose purchase was not refunded or put on hold. Each level has an incentive budget: a larger one while you have an active Premium or VIP membership, a smaller one otherwise. The current levels and budgets are shown on the affiliate program page.\n• For each link you choose the buyer discount, from 0% up to your budget. Your commission rate is the largest rate that keeps discount + (1 − discount) × commission within the budget.\n• If your budget drops (for example because your membership ended), new checkouts get the link's discount lowered to your budget.\n• We may publish new program rules. New rules apply only to checkouts started after they are published; the terms recorded for an earlier checkout never change.",
        },
        {
          heading: "4. What earns commission",
          content:
            "A referral earns commission only when all of these are true:\n• the purchase is the buyer's first Premium or VIP membership, and only its first payment counts (no renewals, upgrades, courses, live seats, directory slots or other products);\n• the buyer is signed in to NLB at checkout and is not you, your other account or someone buying on your behalf;\n• the buyer used your referral code at checkout, or clicked your link within the last 30 days. A code brought to checkout wins over an earlier click, and the latest click wins over older ones;\n• the payment settled and was not reversed.\n\nBrowsers that send Global Privacy Control or Do Not Track are never tracked passively: no click is counted and no referral cookie is set. Their purchase still counts when they bring your code to checkout.",
        },
        {
          heading: "5. How commission is calculated",
          content:
            "Commission is your commission rate applied to the amount the buyer actually paid, after the discount and before tax. Amounts are rounded down to the cent; fractions of a cent stay with NLB. The discount, rate and budget that applied are recorded with each conversion. Commission is calculated in US dollars.",
        },
        {
          heading: "6. Hold period, refunds and reversals",
          content:
            "• New commission stays pending for 45 days, which covers our 30-day refund window. It then becomes available for payout.\n• If a purchase is refunded or charged back, the commission is reversed in proportion to the amount refunded, rounded up and never more than the commission. This also applies after the commission was paid out: the reversal is deducted from your balance, and a negative balance is recovered from your future earnings.\n• We may put a commission on hold while we review a dispute, a suspected breach of this Agreement or an amount that does not match the order. Held commission is released or reversed after the review.",
        },
        {
          heading: "7. Payouts",
          content:
            "• Payouts are made monthly, by bank transfer or PayPal sent by a person after a review, once your available balance reaches US$25. Smaller balances carry over.\n• PayPal: NLB deducts a service fee of 20% of each payout to cover processing and handling. PayPal's own fees, if any, are separate.\n• Vietnamese bank transfer: only for payees resident in Vietnam. It requires identity verification through a verification provider and an approved tax-withholding rule. It is not available yet.\n• Where the law requires us to withhold tax, we deduct it and tell you how much. You are responsible for declaring and paying your own taxes on commission.\n• Keep your payout details accurate. We are not responsible for a payment sent to details you provided.\n• No payout is made until our legal and finance review is complete.",
        },
        {
          heading: "8. Disclosure and fair promotion",
          content:
            "• Disclose your affiliate relationship every time you share a link or code: clearly, in the same language as your message and close to the link, for example \"I'm an NLB affiliate and earn a commission if you join through my link.\" A disclosure hidden behind a click or only in your profile is not enough.\n• Only make claims about NLB that are true and that we make ourselves. Do not promise results, income or access we do not offer.\n• Do not send spam or unsolicited messages, post in places that forbid promotion, or bid on our brand names in search ads.\n• Do not set referral cookies without a real click, buy through your own link, create accounts to earn commission, or offer cash back or other rewards beyond the discount on your link.\n• Follow the laws on advertising, consumer protection and privacy where you and your audience are.",
        },
        {
          heading: "9. Data and privacy",
          content:
            "To run the program we process your affiliate account, your links and the conversions they bring. Link clicks are counted with a random visitor ID that is stored only as a daily, per-link hash. You see the date, plan and amounts of each conversion, never the buyer's name or email, and buyers never see your payout details.\n\nPayout details are encrypted before they are stored; only a masked hint is shown in your account, and they are revealed only to the person recording a payment. Identity verification for bank payouts is done by a verification provider; we keep its reference and result, not copies of your identity documents. Details are in our Privacy Policy and Cookie Policy.",
        },
        {
          heading: "10. Suspension and ending",
          content:
            "• You can leave the program at any time by emailing us; your links stop earning from then on.\n• We may suspend your affiliate account or end this Agreement if you break it, the Terms of Service or the law, or if we close the program. We tell you why unless the law or an investigation prevents it.\n• When participation ends, commission earned in line with this Agreement is still paid under the usual hold period, threshold and payout rules. Commission obtained through a breach is forfeited.",
        },
        {
          heading: "11. Relationship",
          content:
            "You take part as an independent promoter. This Agreement does not make you our employee, agent or partner, and you cannot make promises or sign agreements on NLB's behalf. You may use our name and logo only to refer to NLB accurately in your promotion.",
        },
        {
          heading: "12. Changes",
          content:
            "We may change the program or this Agreement. A material change gets a new version; we tell you in your account and by email, and you can accept it or leave the program. Changes never reduce commission already recorded for past conversions.",
        },
        {
          heading: "13. Liability and disputes",
          content:
            "The limitations of liability, disclaimers and dispute rules of our Terms of Service apply to the affiliate program as well.",
        },
        {
          heading: "14. Contact",
          content: "Questions about the affiliate program or this Agreement:\n\nNext Level Builders · nextlevelbuilder.io · hello@nextlevelbuilder.io",
        },
      ],
    },
    vi: {
      navLabel: "Thỏa thuận Affiliate",
      title: "Thỏa thuận Affiliate",
      summary:
        "Điều khoản quảng bá gói thành viên Next Level Builders bằng link affiliate: điều kiện tham gia, hoa hồng, hoàn tiền, chi trả, công khai và dữ liệu.",
      sections: [
        {
          heading: "Tình trạng: đang chờ rà soát pháp lý",
          content:
            "Đây là phiên bản 2026-10-31 của Thỏa thuận Affiliate và đang chờ rà soát pháp lý. Hoa hồng được ghi nhận từ ngày bạn tham gia, nhưng chưa có khoản chi trả nào cho đến khi chúng tôi hoàn tất rà soát pháp lý và tài chính. Nếu việc rà soát thay đổi các điều khoản này, chúng tôi sẽ công bố phiên bản mới và đề nghị bạn chấp nhận trước khi tiếp tục nhận hoa hồng theo phiên bản đó.",
        },
        {
          heading: "1. Thỏa thuận",
          content:
            'Thỏa thuận Affiliate này ("Thỏa thuận") được lập giữa bạn và Next Level Builders ("NLB", "chúng tôi"). Thỏa thuận áp dụng khi bạn tham gia chương trình affiliate từ tài khoản của mình và chấp nhận nó. Chúng tôi lưu lại phiên bản và thời điểm bạn chấp nhận.\n\nThỏa thuận này bổ sung cho Điều khoản dịch vụ, Chính sách quyền riêng tư, Chính sách hoàn tiền và Chính sách cookie, vốn vẫn tiếp tục áp dụng. Nếu có mâu thuẫn về chương trình affiliate, Thỏa thuận này được ưu tiên.',
        },
        {
          heading: "2. Ai có thể tham gia",
          content:
            "• Bạn cần một tài khoản NLB có email đã xác minh và không vi phạm (không bị cấm hay tạm ngưng).\n• Bạn phải đủ tuổi để giao kết hợp đồng có hiệu lực nơi bạn sinh sống.\n• Mỗi người một tài khoản affiliate. Tham gia miễn phí và không cần gói thành viên.\n• Chúng tôi có thể từ chối hoặc chấm dứt việc tham gia nếu điều đó vi phạm pháp luật hoặc Thỏa thuận này.",
        },
        {
          heading: "3. Link, mã và ngân sách của bạn",
          content:
            "• Bạn có thể tạo tối đa 20 link. Mỗi link có mã riêng, không đổi được sau khi tạo; bạn có thể đổi nhãn, trang đích, thẻ chiến dịch, mức giảm giá cho người mua và trạng thái.\n• Cấp độ của bạn phụ thuộc vào số khách hàng trả phí khác nhau do bạn giới thiệu mà giao dịch không bị hoàn tiền hay tạm giữ. Mỗi cấp có một ngân sách ưu đãi: cao hơn khi bạn có gói Premium hoặc VIP đang hoạt động, thấp hơn trong trường hợp còn lại. Các cấp và ngân sách hiện hành được hiển thị trên trang chương trình affiliate.\n• Với mỗi link, bạn chọn mức giảm giá cho người mua, từ 0% đến ngân sách của bạn. Tỷ lệ hoa hồng là tỷ lệ lớn nhất để giảm giá + (1 − giảm giá) × hoa hồng không vượt quá ngân sách.\n• Nếu ngân sách của bạn giảm (ví dụ khi gói thành viên kết thúc), các lượt thanh toán mới được hạ mức giảm giá của link xuống bằng ngân sách.\n• Chúng tôi có thể công bố quy tắc chương trình mới. Quy tắc mới chỉ áp dụng cho các lượt thanh toán bắt đầu sau khi công bố; điều khoản đã ghi nhận cho một lượt thanh toán trước đó không bao giờ thay đổi.",
        },
        {
          heading: "4. Giao dịch nào được tính hoa hồng",
          content:
            "Một lượt giới thiệu chỉ được tính hoa hồng khi đáp ứng tất cả điều kiện sau:\n• giao dịch là gói Premium hoặc VIP đầu tiên của người mua, và chỉ lần thanh toán đầu tiên được tính (không tính gia hạn, nâng cấp, khóa học, vé live, slot danh bạ hay sản phẩm khác);\n• người mua đã đăng nhập NLB khi thanh toán và không phải là bạn, tài khoản khác của bạn hay người mua thay cho bạn;\n• người mua dùng mã giới thiệu của bạn khi thanh toán, hoặc đã nhấp vào link của bạn trong 30 ngày gần nhất. Mã mang đến trang thanh toán được ưu tiên hơn lượt nhấp trước đó, và lượt nhấp mới nhất được ưu tiên hơn các lượt cũ;\n• khoản thanh toán đã hoàn tất và không bị đảo ngược.\n\nTrình duyệt gửi tín hiệu Global Privacy Control hoặc Do Not Track không bao giờ bị theo dõi thụ động: không đếm lượt nhấp và không đặt cookie giới thiệu. Giao dịch của họ vẫn được tính khi họ mang mã của bạn đến trang thanh toán.",
        },
        {
          heading: "5. Cách tính hoa hồng",
          content:
            "Hoa hồng bằng tỷ lệ hoa hồng của bạn nhân với số tiền người mua thực trả, sau giảm giá và trước thuế. Số tiền được làm tròn xuống đến cent; phần lẻ dưới một cent thuộc về NLB. Mức giảm giá, tỷ lệ và ngân sách đã áp dụng được lưu cùng mỗi chuyển đổi. Hoa hồng được tính bằng đô la Mỹ.",
        },
        {
          heading: "6. Thời gian giữ, hoàn tiền và đảo ngược",
          content:
            "• Hoa hồng mới ở trạng thái chờ trong 45 ngày, bao trọn thời hạn hoàn tiền 30 ngày của chúng tôi, sau đó mới khả dụng để chi trả.\n• Nếu giao dịch được hoàn tiền hoặc bị chargeback, hoa hồng bị đảo ngược theo tỷ lệ số tiền hoàn, làm tròn lên và không vượt quá hoa hồng. Điều này áp dụng cả sau khi hoa hồng đã được chi trả: khoản đảo ngược được trừ vào số dư, và số dư âm được bù trừ vào thu nhập sau này của bạn.\n• Chúng tôi có thể tạm giữ hoa hồng trong khi xem xét tranh chấp, nghi ngờ vi phạm Thỏa thuận hoặc số tiền không khớp với đơn hàng. Sau khi xem xét, hoa hồng tạm giữ được giải phóng hoặc bị đảo ngược.",
        },
        {
          heading: "7. Chi trả",
          content:
            "• Việc chi trả diễn ra hằng tháng, qua chuyển khoản ngân hàng hoặc PayPal do một người thực hiện sau khi xem xét, khi số dư khả dụng của bạn đạt 25 đô la Mỹ. Số dư nhỏ hơn được cộng dồn sang kỳ sau.\n• PayPal: NLB khấu trừ phí dịch vụ 20% trên mỗi lần chi trả để bù chi phí xử lý. Phí riêng của PayPal, nếu có, được tính riêng.\n• Chuyển khoản ngân hàng Việt Nam: chỉ dành cho người nhận cư trú tại Việt Nam. Cần xác minh danh tính qua một nhà cung cấp dịch vụ xác minh và quy tắc khấu trừ thuế đã được phê duyệt. Phương thức này hiện chưa áp dụng.\n• Khi pháp luật yêu cầu khấu trừ thuế, chúng tôi sẽ khấu trừ và thông báo số tiền cho bạn. Bạn tự chịu trách nhiệm kê khai và nộp thuế của mình đối với hoa hồng.\n• Hãy giữ thông tin nhận tiền chính xác. Chúng tôi không chịu trách nhiệm với khoản tiền đã gửi theo thông tin bạn cung cấp.\n• Chưa có khoản chi trả nào cho đến khi chúng tôi hoàn tất rà soát pháp lý và tài chính.",
        },
        {
          heading: "8. Công khai và quảng bá công bằng",
          content:
            "• Công khai quan hệ affiliate mỗi lần bạn chia sẻ link hoặc mã: rõ ràng, cùng ngôn ngữ với nội dung của bạn và ngay gần link, ví dụ \"Mình là affiliate của NLB và nhận hoa hồng nếu bạn tham gia qua link này.\" Lời công khai bị ẩn sau một cú nhấp hoặc chỉ có trên trang hồ sơ là chưa đủ.\n• Chỉ đưa ra những thông tin đúng sự thật về NLB và do chính chúng tôi công bố. Không hứa hẹn kết quả, thu nhập hay quyền truy cập mà chúng tôi không cung cấp.\n• Không gửi spam hay tin nhắn không được yêu cầu, không đăng ở nơi cấm quảng bá, không chạy quảng cáo tìm kiếm đấu thầu tên thương hiệu của chúng tôi.\n• Không đặt cookie giới thiệu khi không có lượt nhấp thật, không tự mua qua link của mình, không tạo tài khoản để nhận hoa hồng, không tặng hoàn tiền hay phần thưởng nào ngoài mức giảm giá trên link.\n• Tuân thủ pháp luật về quảng cáo, bảo vệ người tiêu dùng và quyền riêng tư nơi bạn và người xem của bạn sinh sống.",
        },
        {
          heading: "9. Dữ liệu và quyền riêng tư",
          content:
            "Để vận hành chương trình, chúng tôi xử lý tài khoản affiliate, các link của bạn và chuyển đổi chúng mang lại. Lượt nhấp được đếm bằng một mã khách truy cập ngẫu nhiên, chỉ được lưu dưới dạng giá trị băm theo ngày và theo link. Bạn thấy ngày, gói và số tiền của mỗi chuyển đổi, không bao giờ thấy tên hay email người mua, và người mua không bao giờ thấy thông tin nhận tiền của bạn.\n\nThông tin nhận tiền được mã hóa trước khi lưu; tài khoản của bạn chỉ hiển thị gợi ý đã che bớt, và thông tin chỉ được mở cho người thực hiện chi trả. Việc xác minh danh tính cho chi trả qua ngân hàng do một nhà cung cấp dịch vụ xác minh thực hiện; chúng tôi lưu mã tham chiếu và kết quả, không lưu bản sao giấy tờ tùy thân. Chi tiết có trong Chính sách quyền riêng tư và Chính sách cookie.",
        },
        {
          heading: "10. Tạm ngưng và chấm dứt",
          content:
            "• Bạn có thể rời chương trình bất cứ lúc nào bằng cách email cho chúng tôi; từ đó các link của bạn không còn tạo hoa hồng.\n• Chúng tôi có thể tạm ngưng tài khoản affiliate hoặc chấm dứt Thỏa thuận nếu bạn vi phạm Thỏa thuận, Điều khoản dịch vụ hoặc pháp luật, hoặc nếu chúng tôi đóng chương trình. Chúng tôi sẽ nêu lý do, trừ khi pháp luật hoặc một cuộc điều tra không cho phép.\n• Khi chấm dứt tham gia, hoa hồng phát sinh đúng Thỏa thuận vẫn được chi trả theo thời gian giữ, ngưỡng và quy tắc chi trả thông thường. Hoa hồng có được do vi phạm sẽ bị hủy.",
        },
        {
          heading: "11. Quan hệ giữa các bên",
          content:
            "Bạn tham gia với tư cách người quảng bá độc lập. Thỏa thuận này không biến bạn thành nhân viên, đại lý hay đối tác của chúng tôi, và bạn không được hứa hẹn hay ký kết thay mặt NLB. Bạn chỉ được dùng tên và logo của chúng tôi để nhắc đến NLB một cách chính xác khi quảng bá.",
        },
        {
          heading: "12. Thay đổi",
          content:
            "Chúng tôi có thể thay đổi chương trình hoặc Thỏa thuận này. Thay đổi quan trọng sẽ có phiên bản mới; chúng tôi thông báo trong tài khoản và qua email, và bạn có thể chấp nhận hoặc rời chương trình. Thay đổi không bao giờ làm giảm hoa hồng đã ghi nhận cho các chuyển đổi trước đó.",
        },
        {
          heading: "13. Trách nhiệm và tranh chấp",
          content:
            "Các giới hạn trách nhiệm, miễn trừ bảo đảm và quy định giải quyết tranh chấp trong Điều khoản dịch vụ cũng áp dụng cho chương trình affiliate.",
        },
        {
          heading: "14. Liên hệ",
          content: "Câu hỏi về chương trình affiliate hoặc Thỏa thuận này:\n\nNext Level Builders · nextlevelbuilder.io · hello@nextlevelbuilder.io",
        },
      ],
    },
  },
};
