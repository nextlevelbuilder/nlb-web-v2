import type { PolicyEntry } from "./policy-types";

/**
 * Terms of Service, written for v2.
 * LEGAL REVIEW PENDING: this text has not been reviewed by counsel yet. In
 * particular the governing-law clause deliberately names no jurisdiction and
 * must be completed before the operator's legal entity details are published.
 */
export const termsPolicy: PolicyEntry = {
  group: "legal",
  lastUpdated: "2026-10-13",
  legalReviewPending: true,
  content: {
    en: {
      navLabel: "Terms of Service",
      title: "Terms of Service",
      summary:
        "The rules for using nextlevelbuilder.io, memberships, courses, the Build with Us directory and our API.",
      sections: [
        {
          heading: "1. Agreement",
          content:
            'These Terms of Service ("Terms") govern your use of nextlevelbuilder.io and every service operated by Next Level Builders ("NLB", "we", "us"): the website, memberships, courses, the Build with Us directory, Studio, public builder profiles, leaderboards, the API, the MCP server and the command-line tools.\n\nBy creating an account, making a purchase or otherwise using the services, you agree to these Terms, our Privacy Policy, Refund Policy and Cookie Policy. Members also agree to the community policies listed on this site (SHIP, Contributor, Membership Tiers, Onboarding and Violations), which form part of these Terms.\n\nIf you do not agree, please do not use the services.',
        },
        {
          heading: "2. Eligibility and accounts",
          content:
            "• You must be at least 16 years old to create an account, and old enough to enter a binding contract where you live to make a purchase.\n• You sign in with Google, GitHub or a one-time code sent to your email. Keep that sign-in method secure: you are responsible for activity on your account.\n• One account per person. Do not share your account or membership access with others.\n• Keep your profile information accurate. Membership reviews rely on it.",
        },
        {
          heading: "3. Memberships and subscriptions",
          content:
            "• Premium and VIP memberships are subscriptions billed in advance, quarterly or annually, as shown at checkout.\n• Subscriptions renew automatically at the end of each billing period until you cancel. You can cancel at any time from the customer portal linked in your Polar receipt or by emailing us; access continues until the end of the period you paid for.\n• Seats per plan are limited. We may pause new sign-ups when a plan is full.\n• If prices change, we tell you in advance by email and the new price applies only from your next renewal.\n• New members go through the review described in the Onboarding policy. If you do not pass it, you receive a full refund.",
        },
        {
          heading: "4. Payments and Polar as merchant of record",
          content:
            "All payments are processed by Polar (polar.sh), which acts as our merchant of record. Polar is the seller of record for your purchase: it processes the payment, issues the receipt or invoice, collects and remits applicable sales tax or VAT, and handles payment disputes. Your purchase is also subject to Polar's terms and privacy policy.\n\nWe never receive or store your full card details. Prices are shown before you pay and may exclude taxes that Polar adds based on your location.",
        },
        {
          heading: "5. Courses",
          content:
            "• When you buy a course video, you receive a personal, non-exclusive, non-transferable licence to stream that video for as long as we operate the courses service.\n• Active VIP members can stream every course video while their VIP membership is active.\n• You may not download, re-record, share, resell or publicly show course videos, or share signed video links.\n• We may update or improve a video; you keep access to the current version.",
        },
        {
          heading: "6. Refunds",
          content:
            "Every payment is covered by a 30-day money-back guarantee. The details, including how to ask for a refund, are in our Refund Policy.",
        },
        {
          heading: "7. Your content",
          content:
            'You keep ownership of everything you submit: product listings, profile details, Studio pages, images, videos and other material ("your content").\n\nYou give us a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, format, display and distribute your content to operate and promote the services, for as long as it stays on the services and for a reasonable time afterwards to remove it from backups and caches.\n\nYou confirm that you have the rights needed to submit your content and that it does not break the law or anyone\'s rights. Directory listings are reviewed before they are published. We may decline, edit for formatting, or remove content that breaks these Terms or our community policies. Ranking positions cannot be bought.',
        },
        {
          heading: "8. Acceptable use",
          content:
            "You agree not to:\n• break the law, infringe intellectual property or invade anyone's privacy;\n• upload malware, phishing pages or deceptive listings;\n• send spam or unsolicited promotion to members;\n• manipulate votes, traffic, rankings or trust signals, including with bots or paid engagement;\n• scrape the services beyond what the API allows, or bypass rate limits or security controls;\n• impersonate another person or organisation;\n• resell, sublicense or share access to memberships, courses or API keys.",
        },
        {
          heading: "9. API keys, OAuth and MCP connections",
          content:
            "• API keys are secrets. Keep them private; you are responsible for requests made with your keys.\n• We store only a hash of each key, so we cannot show it to you again. Revoke and replace a key if it leaks.\n• Applications you connect through OAuth or MCP act on your behalf within the permissions you approve. You can revoke them at any time from your connections page.\n• We may apply rate limits and may revoke keys or connections that put the services or other users at risk.",
        },
        {
          heading: "10. Third-party products and links",
          content:
            "The directory lists products built by third parties and links to their websites. We review listings, but we do not control or guarantee third-party products, and your use of them is governed by their own terms. Trust signals, pulse checks and rankings are informational and are not an endorsement.",
        },
        {
          heading: "11. Our intellectual property",
          content:
            "The NLB name, logo, website design, courses and other materials we create belong to Next Level Builders or our licensors. These Terms do not give you any right to use them except as needed to use the services.",
        },
        {
          heading: "12. Suspension and termination",
          content:
            "We may suspend or close an account that breaks these Terms or the community policies, following the process in the Violation Policy. Serious violations such as fraud, harassment or illegal activity may lead to immediate termination.\n\nYou can stop using the services and ask us to delete your account at any time by emailing hello@nextlevelbuilder.io. Cancelling a subscription does not delete your account.",
        },
        {
          heading: "13. Disclaimers",
          content:
            'The services are provided "as is" and "as available". We work hard to keep them reliable and accurate, but we do not promise that they will be uninterrupted or error-free, or that courses, community feedback or directory exposure will produce any particular business result.',
        },
        {
          heading: "14. Limitation of liability",
          content:
            "To the extent the law allows, NLB is not liable for indirect, incidental, special or consequential damages, or for lost profits, revenue or data. Our total liability for any claim relating to the services is limited to the amount you paid us in the 12 months before the claim.\n\nNothing in these Terms limits liability that cannot be limited by law, or your statutory rights as a consumer.",
        },
        {
          heading: "15. Changes to the services and these Terms",
          content:
            "We may change the services as they grow. If we change these Terms in a way that materially affects you, we will tell you by email or on this site at least 14 days before the change takes effect. Continuing to use the services after that date means you accept the updated Terms.",
        },
        {
          heading: "16. Disputes and governing law",
          content:
            "If something goes wrong, please email us first: most issues can be solved quickly. If we cannot resolve a dispute informally within 30 days, either party may take it to the competent courts. These Terms are governed by the laws that apply where Next Level Builders is established, without affecting the mandatory consumer protections of the country where you live.",
        },
        {
          heading: "17. Contact",
          content: "Next Level Builders\nWebsite: nextlevelbuilder.io\nEmail: hello@nextlevelbuilder.io",
        },
      ],
    },
    vi: {
      navLabel: "Điều khoản dịch vụ",
      title: "Điều khoản dịch vụ",
      summary: "Quy định sử dụng nextlevelbuilder.io, gói thành viên, khóa học, thư mục Build with Us và API.",
      sections: [
        {
          heading: "1. Thỏa thuận",
          content:
            'Điều khoản dịch vụ này ("Điều khoản") áp dụng cho việc bạn sử dụng nextlevelbuilder.io và mọi dịch vụ do Next Level Builders ("NLB", "chúng tôi") vận hành: website, gói thành viên, khóa học, thư mục Build with Us, Studio, hồ sơ builder công khai, bảng xếp hạng, API, máy chủ MCP và công cụ dòng lệnh.\n\nKhi tạo tài khoản, mua hàng hoặc sử dụng dịch vụ, bạn đồng ý với Điều khoản này cùng Chính sách quyền riêng tư, Chính sách hoàn tiền và Chính sách cookie. Thành viên cũng đồng ý với các quy chế cộng đồng trên website (SHIP, Contributor, Hạng thành viên, Onboarding và Xử lý vi phạm); các quy chế này là một phần của Điều khoản.\n\nNếu không đồng ý, vui lòng không sử dụng dịch vụ.',
        },
        {
          heading: "2. Điều kiện và tài khoản",
          content:
            "• Bạn phải từ đủ 16 tuổi để tạo tài khoản, và đủ tuổi giao kết hợp đồng theo luật nơi bạn sống để mua hàng.\n• Bạn đăng nhập bằng Google, GitHub hoặc mã dùng một lần gửi qua email. Hãy bảo vệ phương thức đăng nhập đó: bạn chịu trách nhiệm về hoạt động trên tài khoản của mình.\n• Mỗi người một tài khoản. Không chia sẻ tài khoản hoặc quyền truy cập membership cho người khác.\n• Giữ thông tin hồ sơ chính xác, vì quá trình xét duyệt thành viên dựa vào đó.",
        },
        {
          heading: "3. Gói thành viên và đăng ký định kỳ",
          content:
            "• Gói Premium và VIP là gói đăng ký trả trước theo quý hoặc theo năm, như hiển thị khi thanh toán.\n• Gói tự động gia hạn khi hết mỗi kỳ cho đến khi bạn hủy. Bạn có thể hủy bất kỳ lúc nào tại cổng khách hàng trong biên nhận Polar hoặc bằng cách gửi email cho chúng tôi; quyền truy cập vẫn giữ đến hết kỳ đã thanh toán.\n• Số suất mỗi gói có giới hạn. Chúng tôi có thể tạm dừng nhận thành viên mới khi gói đã đủ.\n• Nếu giá thay đổi, chúng tôi báo trước qua email và giá mới chỉ áp dụng từ kỳ gia hạn tiếp theo.\n• Thành viên mới trải qua quy trình xét duyệt trong quy chế Onboarding. Nếu không đạt, bạn được hoàn tiền toàn bộ.",
        },
        {
          heading: "4. Thanh toán và Polar là merchant of record",
          content:
            "Mọi khoản thanh toán được xử lý bởi Polar (polar.sh), đơn vị đóng vai trò merchant of record (bên bán chính thức) của chúng tôi. Polar xử lý thanh toán, phát hành biên nhận hoặc hóa đơn, thu và nộp thuế bán hàng hoặc VAT áp dụng, và xử lý tranh chấp thanh toán. Giao dịch của bạn cũng tuân theo điều khoản và chính sách quyền riêng tư của Polar.\n\nChúng tôi không bao giờ nhận hoặc lưu đầy đủ thông tin thẻ của bạn. Giá được hiển thị trước khi thanh toán và có thể chưa gồm thuế do Polar cộng thêm theo vị trí của bạn.",
        },
        {
          heading: "5. Khóa học",
          content:
            "• Khi mua một video khóa học, bạn nhận quyền cá nhân, không độc quyền, không chuyển nhượng để xem trực tuyến video đó trong suốt thời gian chúng tôi vận hành dịch vụ khóa học.\n• Thành viên VIP đang hoạt động được xem toàn bộ video khóa học trong thời gian gói VIP còn hiệu lực.\n• Bạn không được tải xuống, quay lại, chia sẻ, bán lại hoặc trình chiếu công khai video khóa học, cũng không được chia sẻ đường dẫn video đã ký.\n• Chúng tôi có thể cập nhật hoặc cải thiện video; bạn luôn có quyền xem phiên bản hiện hành.",
        },
        {
          heading: "6. Hoàn tiền",
          content:
            "Mọi khoản thanh toán đều được bảo đảm hoàn tiền trong 30 ngày. Chi tiết, bao gồm cách yêu cầu hoàn tiền, có trong Chính sách hoàn tiền.",
        },
        {
          heading: "7. Nội dung của bạn",
          content:
            'Bạn giữ quyền sở hữu mọi nội dung bạn gửi lên: thông tin sản phẩm, hồ sơ, trang Studio, hình ảnh, video và tài liệu khác ("nội dung của bạn").\n\nBạn cấp cho chúng tôi quyền toàn cầu, không độc quyền, miễn phí bản quyền để lưu trữ, sao chép, định dạng, hiển thị và phân phối nội dung của bạn nhằm vận hành và quảng bá dịch vụ, trong thời gian nội dung còn trên dịch vụ và một khoảng thời gian hợp lý sau đó để xóa khỏi bản sao lưu và bộ nhớ đệm.\n\nBạn xác nhận mình có đủ quyền để gửi nội dung và nội dung không vi phạm pháp luật hay quyền của người khác. Sản phẩm trong thư mục được duyệt trước khi công bố. Chúng tôi có thể từ chối, chỉnh định dạng hoặc gỡ nội dung vi phạm Điều khoản hoặc quy chế cộng đồng. Thứ hạng không thể mua được.',
        },
        {
          heading: "8. Sử dụng được chấp nhận",
          content:
            "Bạn đồng ý không:\n• vi phạm pháp luật, xâm phạm sở hữu trí tuệ hoặc quyền riêng tư của người khác;\n• tải lên mã độc, trang lừa đảo hoặc thông tin sản phẩm gây hiểu nhầm;\n• gửi spam hoặc quảng cáo không được yêu cầu tới thành viên;\n• thao túng lượt bình chọn, lưu lượng, thứ hạng hoặc tín hiệu tin cậy, kể cả bằng bot hoặc tương tác trả tiền;\n• thu thập dữ liệu vượt quá phạm vi API cho phép, hoặc vượt giới hạn tốc độ và cơ chế bảo mật;\n• mạo danh cá nhân hoặc tổ chức khác;\n• bán lại, cấp phép lại hoặc chia sẻ quyền truy cập membership, khóa học hoặc khóa API.",
        },
        {
          heading: "9. Khóa API, OAuth và kết nối MCP",
          content:
            "• Khóa API là thông tin bí mật. Hãy giữ kín; bạn chịu trách nhiệm cho các yêu cầu thực hiện bằng khóa của mình.\n• Chúng tôi chỉ lưu bản băm của mỗi khóa nên không thể hiển thị lại. Hãy thu hồi và tạo khóa mới nếu khóa bị lộ.\n• Ứng dụng bạn kết nối qua OAuth hoặc MCP hoạt động thay bạn trong phạm vi quyền bạn cấp. Bạn có thể thu hồi bất kỳ lúc nào tại trang kết nối.\n• Chúng tôi có thể giới hạn tốc độ và thu hồi khóa hoặc kết nối gây rủi ro cho dịch vụ hay người dùng khác.",
        },
        {
          heading: "10. Sản phẩm và liên kết của bên thứ ba",
          content:
            "Thư mục liệt kê sản phẩm do bên thứ ba xây dựng và liên kết tới website của họ. Chúng tôi duyệt thông tin sản phẩm nhưng không kiểm soát hay bảo đảm sản phẩm của bên thứ ba; việc bạn sử dụng chúng tuân theo điều khoản riêng của họ. Tín hiệu tin cậy, kiểm tra pulse và bảng xếp hạng chỉ mang tính tham khảo, không phải sự bảo chứng.",
        },
        {
          heading: "11. Sở hữu trí tuệ của chúng tôi",
          content:
            "Tên NLB, logo, thiết kế website, khóa học và các tài liệu khác do chúng tôi tạo ra thuộc về Next Level Builders hoặc bên cấp phép. Điều khoản này không cho bạn quyền sử dụng chúng ngoài mức cần thiết để dùng dịch vụ.",
        },
        {
          heading: "12. Tạm ngưng và chấm dứt",
          content:
            "Chúng tôi có thể tạm ngưng hoặc đóng tài khoản vi phạm Điều khoản hoặc quy chế cộng đồng, theo quy trình trong Chính sách xử lý vi phạm. Vi phạm nghiêm trọng như gian lận, quấy rối hoặc hoạt động trái pháp luật có thể bị chấm dứt ngay.\n\nBạn có thể ngừng sử dụng dịch vụ và yêu cầu xóa tài khoản bất kỳ lúc nào qua email hello@nextlevelbuilder.io. Hủy gói đăng ký không đồng nghĩa với xóa tài khoản.",
        },
        {
          heading: "13. Miễn trừ bảo đảm",
          content:
            'Dịch vụ được cung cấp "nguyên trạng" và "tùy khả năng sẵn có". Chúng tôi nỗ lực giữ dịch vụ ổn định và chính xác, nhưng không cam kết dịch vụ luôn liên tục, không lỗi, hay khóa học, phản hồi cộng đồng và sự hiện diện trong thư mục sẽ mang lại kết quả kinh doanh cụ thể.',
        },
        {
          heading: "14. Giới hạn trách nhiệm",
          content:
            "Trong phạm vi pháp luật cho phép, NLB không chịu trách nhiệm cho thiệt hại gián tiếp, ngẫu nhiên, đặc biệt hoặc hệ quả, hay mất lợi nhuận, doanh thu hoặc dữ liệu. Tổng trách nhiệm của chúng tôi cho mọi khiếu nại liên quan đến dịch vụ không vượt quá số tiền bạn đã trả cho chúng tôi trong 12 tháng trước khiếu nại.\n\nKhông điều nào trong Điều khoản giới hạn trách nhiệm mà pháp luật không cho phép giới hạn, hoặc quyền của bạn với tư cách người tiêu dùng.",
        },
        {
          heading: "15. Thay đổi dịch vụ và Điều khoản",
          content:
            "Dịch vụ có thể thay đổi khi phát triển. Nếu thay đổi Điều khoản theo cách ảnh hưởng đáng kể đến bạn, chúng tôi sẽ thông báo qua email hoặc trên website ít nhất 14 ngày trước khi có hiệu lực. Tiếp tục sử dụng dịch vụ sau ngày đó nghĩa là bạn chấp nhận Điều khoản cập nhật.",
        },
        {
          heading: "16. Tranh chấp và luật áp dụng",
          content:
            "Nếu có vấn đề, hãy gửi email cho chúng tôi trước: hầu hết sự việc đều được giải quyết nhanh. Nếu không thể giải quyết tranh chấp bằng thương lượng trong 30 ngày, mỗi bên có thể đưa ra tòa án có thẩm quyền. Điều khoản này được điều chỉnh bởi pháp luật nơi Next Level Builders được thành lập, không ảnh hưởng đến các quyền bảo vệ người tiêu dùng bắt buộc tại quốc gia bạn sinh sống.",
        },
        {
          heading: "17. Liên hệ",
          content: "Next Level Builders\nWebsite: nextlevelbuilder.io\nEmail: hello@nextlevelbuilder.io",
        },
      ],
    },
  },
};
