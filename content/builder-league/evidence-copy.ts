import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { CapRule } from "@/lib/builder-league/ruleset";
import { EVENT_LABELS, describeCap, type PolicyLocale } from "@/lib/builder-league/ruleset/policy-text";
import type { EventTypeKey, EvidenceStatus, Stage, Verification, Visibility } from "@/lib/builder-league/types";


/** Event names come from the ruleset policy text, so the evidence UI and the policy pages never differ. */
const eventLabels = (locale: PolicyLocale) =>
  Object.fromEntries(Object.entries(EVENT_LABELS).map(([key, labels]) => [key, labels[locale]])) as Record<EventTypeKey, string>;
/** Builder League evidence, moderation and admin copy (EN + VI). */
export interface EvidenceCopy {
  meta: { list: string; create: string; detail: string; moderation: string; hub: string };
  plate: { evidence: string; create: string; detail: string; hub: string; moderation: string };
  stages: Record<Stage, string>;
  statuses: Record<EvidenceStatus, string>;
  statusHints: Record<EvidenceStatus, string>;
  visibility: Record<Visibility, { label: string; hint: string }>;
  verification: Record<Verification, string>;
  events: Record<EventTypeKey, string>;
  reasons: Record<string, string>;
  notices: Record<string, string>;
  errors: Record<string, string>;
  errorFallback: string;
  describeCap: (cap: CapRule) => string;
  rp: (value: number) => string;
  minSummary: (chars: number) => string;
  linkRequired: string;
  linkOptional: string;
  counterpartyRequired: string;
  rulesetLabel: (version: string) => string;
  membership: { title: string; body: string; action: string };
  list: {
    eyebrow: string;
    title: string;
    lede: string;
    newAction: string;
    empty: string;
    emptyHint: string;
    filterLabel: string;
    filterAll: string;
    occurred: string;
    project: string;
    decision: string;
    open: string;
    more: string;
    confirmTitle: string;
    confirmLede: string;
    confirmFrom: (name: string) => string;
    review: string;
  };
  form: {
    eyebrow: string;
    title: string;
    lede: string;
    redaction: string;
    stageStep: string;
    stageAll: string;
    typeLabel: string;
    typeHint: string;
    typeChoose: string;
    requirements: string;
    verifiedBy: string;
    caps: string;
    projectLabel: string;
    projectNone: string;
    projectHint: string;
    projectCreate: string;
    projectName: string;
    projectAction: string;
    occurredLabel: string;
    occurredHint: string;
    titleLabel: string;
    summaryLabel: string;
    summaryHint: string;
    linksLabel: string;
    linksHint: string;
    filesLabel: string;
    filesHint: string;
    counterpartyLabel: string;
    counterpartyHint: string;
    visibilityLabel: string;
    submit: string;
    submitting: string;
    save: string;
    cancel: string;
    requirementsAll: string;
    errorSummary: string;
    removeFile: (name: string) => string;
    charCount: (count: number, min: number) => string;
  };
  detail: {
    back: string;
    submittedAt: string;
    occurred: string;
    project: string;
    source: string;
    links: string;
    files: string;
    noFiles: string;
    counterparty: string;
    confirmed: string;
    awaitingConfirmation: string;
    decision: string;
    note: string;
    edit: string;
    withdraw: string;
    withdrawHint: string;
    sources: Record<string, string>;
  };
  appeal: {
    title: string;
    lede: string;
    reasonLabel: string;
    reasonHint: string;
    submit: string;
    statuses: Record<string, string>;
    used: string;
  };
  confirm: {
    title: string;
    lede: (name: string) => string;
    submit: string;
    done: string;
  };
  hub: {
    eyebrow: string;
    title: string;
    lede: string;
    queue: string;
    needsInfo: string;
    appeals: string;
    pilot: string;
    openQueue: string;
    flagOn: string;
    flagOff: string;
    backfillTitle: string;
    backfillLede: string;
    backfillUsers: string;
    backfillUsersHint: string;
    backfillApply: string;
    backfillRun: string;
    backfillDryRunNotice: (count: number) => string;
    backfillDoneNotice: (count: number) => string;
  };
  moderation: {
    eyebrow: string;
    title: string;
    lede: string;
    filters: string;
    status: string;
    stage: string;
    eventType: string;
    olderThan: string;
    anyAge: string;
    hours: (count: number) => string;
    days: (count: number) => string;
    apply: string;
    empty: string;
    submittedBy: (name: string) => string;
    waiting: string;
    rp: string;
    required: string;
    decisionLabel: string;
    decisions: Record<"approve" | "reject" | "needs_info", string>;
    reasonsLabel: (decision: "approve" | "reject" | "needs_info") => string;
    noteLabel: string;
    noteHint: string;
    decide: string;
    ownEvidence: string;
    awaitingCounterparty: string;
    appealsTitle: string;
    appealsEmpty: string;
    appealBy: (name: string) => string;
    resolutionLabel: string;
    uphold: string;
    overturn: string;
    resolve: string;
    reverseTitle: string;
    reverseLede: string;
    entryLabel: string;
    reasonLabel: string;
    reverse: string;
    pilotTitle: string;
    pilotLede: string;
    pilotEmpty: string;
    pilotAdd: string;
    pilotRemove: string;
    pilotIdentity: string;
    pilotNote: string;
    addedAt: string;
  };
}

const stages = { validate: "VALIDATE", build: "BUILD", ship: "SHIP", contribute: "CONTRIBUTE" } as const;

const en: EvidenceCopy = {
  meta: {
    list: "My evidence",
    create: "Submit evidence",
    detail: "Evidence",
    moderation: "Evidence moderation",
    hub: "Builder League admin",
  },
  plate: { evidence: "Evidence log", create: "New entry", detail: "Entry", hub: "Admin", moderation: "Moderation" },
  stages,
  statuses: { submitted: "In review", needs_info: "Needs info", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" },
  statusHints: {
    submitted: "A moderator will review it.",
    needs_info: "Answer the moderator's request by editing this entry.",
    approved: "Verified. RP was added to your ledger.",
    rejected: "Not approved. You can appeal once.",
    withdrawn: "You withdrew this entry.",
  },
  visibility: {
    private: { label: "Private", hint: "Only you and moderators." },
    community: { label: "Community", hint: "Signed-in members may see the title and outcome." },
    public: { label: "Public", hint: "Anyone may see the title and outcome on your passport." },
  },
  verification: {
    self_reported: "Self-reported",
    peer_confirmed: "Confirmed by the member you helped",
    moderator_verified: "Verified by a moderator",
    system_verified: "Recorded by the system",
  },
  events: eventLabels("en"),
  reasons: {
    meets_requirements: "Meets the requirements",
    verified_link: "Link verified",
    verified_file: "File verified",
    verified_counterparty: "Counterparty verified",
    appeal_overturned: "Approved on appeal",
    insufficient_evidence: "Not enough evidence",
    duplicate: "Duplicate of another entry",
    not_eligible: "Not eligible for this event",
    wrong_event_type: "Wrong event type",
    outside_window: "Outside the allowed period",
    unverifiable: "Could not be verified",
    spam: "Spam",
    other: "Other",
    missing_link: "Add a working link",
    summary_too_short: "Describe the outcome in more detail",
    unclear_outcome: "Say what changed and for whom",
    redact_private_data: "Remove private customer data",
    wrong_project: "Choose the right project",
  },
  notices: {
    submitted: "Evidence submitted. A moderator will review it.",
    already_submitted: "This evidence was already submitted.",
    updated: "Changes saved.",
    withdrawn: "Evidence withdrawn.",
    appealed: "Appeal sent. An admin will review it.",
    confirmed: "Thanks. Your confirmation was recorded.",
    project_created: "Project created. Choose it below.",
    approved: "Approved and scored.",
    rejected: "Rejected. The member was told why.",
    info_requested: "Information requested.",
    appeal_upheld: "Appeal upheld; the rejection stands.",
    appeal_overturned: "Appeal overturned; the evidence is approved.",
    reversed: "Ledger entry reversed.",
    pilot_added: "Member added to the pilot.",
    pilot_removed: "Member removed from the pilot.",
  },
  errors: {
    validation_failed: "Some fields are missing or invalid. Check the form and try again.",
    unknown_event_type: "That event type does not exist in the ruleset for that date.",
    event_type_not_submittable: "The system records this event automatically; it cannot be submitted.",
    stage_mismatch: "The event type belongs to a different stage.",
    stage_required: "Choose a stage.",
    project_required: "Choose one of your projects for this stage.",
    project_not_found: "That project is not one of yours.",
    summary_too_short: "The summary is shorter than this event requires.",
    link_required: "Add at least one link or file as proof.",
    counterparty_required: "Name the member you helped.",
    counterparty_not_found: "We could not find that member.",
    self_counterparty: "You cannot name yourself as the member you helped.",
    occurred_in_future: "The date cannot be in the future.",
    too_many_files: "Too many files. Attach at most five.",
    empty_file: "One of the files is empty.",
    file_too_large: "Each file must be 10 MB or smaller.",
    unsupported_file_type: "Only PNG, JPEG, GIF, WebP and PDF files are accepted.",
    file_type_mismatch: "A file's content does not match its type.",
    payload_too_large: "The upload is too large.",
    storage_unavailable: "File storage is unavailable right now. Try again later.",
    evidence_locked: "This evidence can no longer be changed.",
    evidence_changed: "This evidence changed in another tab. Reload and try again.",
    submission_conflict: "That submission key was used for different evidence.",
    not_appealable: "Only rejected evidence can be appealed.",
    appeal_open: "An appeal is already open.",
    appeal_used: "This rejection was already appealed.",
    appeal_resolved: "That appeal was already resolved.",
    appeal_not_found: "No appeal was found for this evidence.",
    not_confirmable: "This evidence does not need a confirmation.",
    self_confirmation: "You cannot confirm your own help.",
    same_discord_identity: "Both accounts are linked to the same Discord identity.",
    circular_confirmation_cap: "You two already confirmed help for each other in this period.",
    confirmation_requires_session: "Sign in to confirm.",
    counterparty_unconfirmed: "The member who was helped has not confirmed yet.",
    self_moderation: "You cannot decide on your own evidence or appeal.",
    already_decided: "Someone already decided on this evidence.",
    moderation_not_allowed: "Only moderators can do that.",
    session_required: "Admin actions need a signed-in session.",
    reason_required: "Give a reason.",
    entry_not_found: "Ledger entry not found.",
    cannot_reverse_reversal: "A reversal cannot be reversed.",
    user_not_found: "No member matches that id or email.",
    product_not_owned: "You can only link products you own.",
    product_already_linked: "That product is already linked to a project.",
    project_limit: "You reached the project limit.",
    slug_unavailable: "Choose a different project name.",
    cross_site_request: "The form was sent from another site and was refused.",
    rate_limited: "Too many requests. Wait a moment and try again.",
    not_found: "Not found.",
    internal_error: "Something went wrong. Try again.",
  },
  errorFallback: "That did not work. Try again.",
  describeCap: (cap) => describeCap(cap, "en"),
  rp: (value) => `${value} RP`,
  minSummary: (chars) => `Summary of at least ${chars} characters`,
  linkRequired: "At least one link or file",
  linkOptional: "Links and files optional",
  counterpartyRequired: "Name the member you helped; they confirm it",
  rulesetLabel: (version) => `Ruleset ${version}`,
  membership: {
    title: "Builder League is for members",
    body: "Join as a Premium or VIP member to log your progress and earn RP.",
    action: "See membership plans",
  },
  list: {
    eyebrow: "Builder League",
    title: "Your evidence log",
    lede: "Every RP starts with something you did. Submit it here; a moderator verifies it.",
    newAction: "Submit evidence",
    empty: "No evidence yet",
    emptyHint: "Start with the last thing you shipped, validated or helped with.",
    filterLabel: "Show",
    filterAll: "All",
    occurred: "Happened",
    project: "Project",
    decision: "Decision",
    open: "Open",
    more: "Older entries",
    confirmTitle: "Waiting for your confirmation",
    confirmLede: "These members say they helped you. Confirm only if it is true.",
    confirmFrom: (name) => `From ${name}`,
    review: "Review",
  },
  form: {
    eyebrow: "Builder League",
    title: "Submit evidence",
    lede: "Pick what happened, show the proof, and a moderator verifies it.",
    redaction:
      "Redact before you upload: no customer names, emails, phone numbers or payment details. Evidence is private by default and files are only shown to you and moderators.",
    stageStep: "Stage",
    stageAll: "All stages",
    typeLabel: "What happened",
    typeHint: "RP and requirements come from the ruleset in force on the date it happened.",
    typeChoose: "Choose an event",
    requirements: "Requirements",
    verifiedBy: "Verified by",
    caps: "Limits",
    projectLabel: "Project",
    projectNone: "No project",
    projectHint: "Required for VALIDATE, BUILD and SHIP.",
    projectCreate: "New project",
    projectName: "Project name",
    projectAction: "Create project",
    occurredLabel: "Date it happened",
    occurredHint: "Your local date (Asia/Saigon).",
    titleLabel: "Title",
    summaryLabel: "Outcome",
    summaryHint: "What you did, what changed and for whom. Numbers help.",
    linksLabel: "Links",
    linksHint: "One per line: the post, page, repo or recording.",
    filesLabel: "Files",
    filesHint: "Screenshots or PDFs, up to five files of 10 MB.",
    counterpartyLabel: "Member you helped",
    counterpartyHint: "Their builder profile link or id. They confirm it on their side.",
    visibilityLabel: "Who can see it",
    submit: "Submit evidence",
    submitting: "Submitting…",
    save: "Save changes",
    cancel: "Cancel",
    requirementsAll: "Requirements of every event",
    errorSummary: "Fix this and submit again",
    removeFile: (name) => `Remove ${name}`,
    charCount: (count, min) => (min > 0 ? `${count} / ${min} characters` : `${count} characters`),
  },
  detail: {
    back: "All evidence",
    submittedAt: "Submitted",
    occurred: "Happened",
    project: "Project",
    source: "Sent from",
    links: "Links",
    files: "Files",
    noFiles: "No files",
    counterparty: "Member helped",
    confirmed: "Confirmed",
    awaitingConfirmation: "Waiting for their confirmation",
    decision: "Decision",
    note: "Moderator note",
    edit: "Edit evidence",
    withdraw: "Withdraw",
    withdrawHint: "Withdrawn evidence leaves the queue and earns no RP.",
    sources: { member: "the website", api: "an API key", agent: "an AI agent" },
  },
  appeal: {
    title: "Appeal this decision",
    lede: "You can appeal a rejection once. Explain what the moderator missed.",
    reasonLabel: "Why it should be approved",
    reasonHint: "At least 20 characters.",
    submit: "Send appeal",
    statuses: { open: "Appeal in review", upheld: "Appeal upheld", overturned: "Appeal accepted", withdrawn: "Appeal withdrawn" },
    used: "This rejection was already appealed.",
  },
  confirm: {
    title: "Confirm this help",
    lede: (name) => `${name} says they helped you. Confirm only if it happened as described.`,
    submit: "Confirm help",
    done: "You confirmed this help.",
  },
  hub: {
    eyebrow: "Studio",
    title: "Builder League admin",
    lede: "Review evidence, resolve appeals and manage who can use the league.",
    queue: "Waiting for review",
    needsInfo: "Waiting for members",
    appeals: "Open appeals",
    pilot: "Pilot members",
    openQueue: "Open moderation",
    flagOn: "The league is open to every paid member.",
    flagOff: "The league is hidden: only admins and pilot members can use it.",
    backfillTitle: "Backfill directory launches",
    backfillLede:
      "Imports each published product of members who opted in as a SHIP launch on its original approval date, scored by the ruleset in force then. Runs as a dry run unless you choose to apply.",
    backfillUsers: "Limit to member ids",
    backfillUsersHint: "One per line. Leave empty for everyone who opted in.",
    backfillApply: "Apply changes (otherwise a dry run)",
    backfillRun: "Run backfill",
    backfillDryRunNotice: (count) => `Dry run: ${count} launch(es) would be imported.`,
    backfillDoneNotice: (count) => `Backfill done: ${count} launch(es) imported.`,
  },
  moderation: {
    eyebrow: "Studio · Builder League",
    title: "Evidence moderation",
    lede: "Oldest first. Approve only what the evidence shows.",
    filters: "Filters",
    status: "Status",
    stage: "Stage",
    eventType: "Event",
    olderThan: "Waiting longer than",
    anyAge: "Any time",
    hours: (count) => `${count} hours`,
    days: (count) => `${count} days`,
    apply: "Apply filters",
    empty: "Nothing to review. Good work.",
    submittedBy: (name) => `by ${name}`,
    waiting: "Waiting since",
    rp: "RP",
    required: "Needs",
    decisionLabel: "Decision",
    decisions: { approve: "Approve", reject: "Reject", needs_info: "Ask for info" },
    reasonsLabel: (decision) =>
      decision === "approve" ? "Why it passes (optional)" : decision === "reject" ? "Why it is rejected" : "What is missing",
    noteLabel: "Note to the member",
    noteHint: "Required with Other. The member sees it.",
    decide: "Record decision",
    ownEvidence: "Your own evidence: another moderator must decide.",
    awaitingCounterparty: "Waiting for the helped member to confirm.",
    appealsTitle: "Open appeals",
    appealsEmpty: "No open appeals.",
    appealBy: (name) => `Appeal by ${name}`,
    resolutionLabel: "Resolution",
    uphold: "Uphold rejection",
    overturn: "Overturn and approve",
    resolve: "Resolve appeal",
    reverseTitle: "Reverse RP",
    reverseLede: "Adds a negative ledger entry with your reason. The original entry stays for the audit trail.",
    entryLabel: "Ledger entry id",
    reasonLabel: "Reason",
    reverse: "Reverse entry",
    pilotTitle: "Pilot members",
    pilotLede: "While the league is hidden, paid members on this list can use it.",
    pilotEmpty: "No pilot members yet.",
    pilotAdd: "Add to pilot",
    pilotRemove: "Remove",
    pilotIdentity: "Member email",
    pilotNote: "Note",
    addedAt: "Added",
  },
};

const vi: EvidenceCopy = {
  meta: {
    list: "Bằng chứng của tôi",
    create: "Gửi bằng chứng",
    detail: "Bằng chứng",
    moderation: "Duyệt bằng chứng",
    hub: "Quản trị Builder League",
  },
  plate: { evidence: "Nhật ký bằng chứng", create: "Mục mới", detail: "Mục", hub: "Quản trị", moderation: "Kiểm duyệt" },
  stages,
  statuses: { submitted: "Đang duyệt", needs_info: "Cần bổ sung", approved: "Đã duyệt", rejected: "Bị từ chối", withdrawn: "Đã rút" },
  statusHints: {
    submitted: "Moderator sẽ xem xét.",
    needs_info: "Sửa mục này để trả lời yêu cầu của moderator.",
    approved: "Đã xác minh. RP đã được cộng vào sổ của bạn.",
    rejected: "Chưa được duyệt. Bạn có thể khiếu nại một lần.",
    withdrawn: "Bạn đã rút mục này.",
  },
  visibility: {
    private: { label: "Riêng tư", hint: "Chỉ bạn và moderator." },
    community: { label: "Cộng đồng", hint: "Thành viên đã đăng nhập có thể thấy tiêu đề và kết quả." },
    public: { label: "Công khai", hint: "Ai cũng có thể thấy tiêu đề và kết quả trên passport của bạn." },
  },
  verification: {
    self_reported: "Tự khai",
    peer_confirmed: "Người được giúp xác nhận",
    moderator_verified: "Moderator xác minh",
    system_verified: "Hệ thống ghi nhận",
  },
  events: eventLabels("vi"),
  reasons: {
    meets_requirements: "Đạt yêu cầu",
    verified_link: "Đã kiểm tra link",
    verified_file: "Đã kiểm tra tệp",
    verified_counterparty: "Đã xác minh người được giúp",
    appeal_overturned: "Được duyệt sau khiếu nại",
    insufficient_evidence: "Chưa đủ bằng chứng",
    duplicate: "Trùng với một mục khác",
    not_eligible: "Không thuộc sự kiện này",
    wrong_event_type: "Sai loại sự kiện",
    outside_window: "Ngoài khoảng thời gian cho phép",
    unverifiable: "Không xác minh được",
    spam: "Spam",
    other: "Lý do khác",
    missing_link: "Thêm một link hoạt động",
    summary_too_short: "Mô tả kết quả chi tiết hơn",
    unclear_outcome: "Nói rõ điều gì đã thay đổi và cho ai",
    redact_private_data: "Xoá dữ liệu riêng tư của khách hàng",
    wrong_project: "Chọn đúng dự án",
  },
  notices: {
    submitted: "Đã gửi bằng chứng. Moderator sẽ xem xét.",
    already_submitted: "Bằng chứng này đã được gửi trước đó.",
    updated: "Đã lưu thay đổi.",
    withdrawn: "Đã rút bằng chứng.",
    appealed: "Đã gửi khiếu nại. Admin sẽ xem xét.",
    confirmed: "Cảm ơn bạn. Xác nhận đã được ghi nhận.",
    project_created: "Đã tạo dự án. Chọn dự án ở bên dưới.",
    approved: "Đã duyệt và tính điểm.",
    rejected: "Đã từ chối. Thành viên đã được báo lý do.",
    info_requested: "Đã yêu cầu bổ sung thông tin.",
    appeal_upheld: "Giữ nguyên quyết định từ chối.",
    appeal_overturned: "Chấp nhận khiếu nại; bằng chứng đã được duyệt.",
    reversed: "Đã đảo bút toán.",
    pilot_added: "Đã thêm thành viên vào pilot.",
    pilot_removed: "Đã gỡ thành viên khỏi pilot.",
  },
  errors: {
    validation_failed: "Một số trường còn thiếu hoặc chưa hợp lệ. Kiểm tra lại biểu mẫu.",
    unknown_event_type: "Loại sự kiện này không có trong bộ luật áp dụng cho ngày đó.",
    event_type_not_submittable: "Hệ thống tự ghi nhận sự kiện này, bạn không cần gửi.",
    stage_mismatch: "Loại sự kiện thuộc một giai đoạn khác.",
    stage_required: "Chọn một giai đoạn.",
    project_required: "Chọn một dự án của bạn cho giai đoạn này.",
    project_not_found: "Dự án này không thuộc về bạn.",
    summary_too_short: "Phần mô tả ngắn hơn mức sự kiện yêu cầu.",
    link_required: "Thêm ít nhất một link hoặc tệp làm bằng chứng.",
    counterparty_required: "Ghi tên thành viên bạn đã giúp.",
    counterparty_not_found: "Không tìm thấy thành viên này.",
    self_counterparty: "Bạn không thể tự ghi tên mình là người được giúp.",
    occurred_in_future: "Ngày không được ở tương lai.",
    too_many_files: "Quá nhiều tệp. Tối đa năm tệp.",
    empty_file: "Có một tệp bị rỗng.",
    file_too_large: "Mỗi tệp tối đa 10 MB.",
    unsupported_file_type: "Chỉ nhận tệp PNG, JPEG, GIF, WebP và PDF.",
    file_type_mismatch: "Nội dung tệp không khớp với định dạng.",
    payload_too_large: "Dung lượng tải lên quá lớn.",
    storage_unavailable: "Kho lưu tệp đang tạm ngưng. Thử lại sau.",
    evidence_locked: "Bằng chứng này không thể sửa nữa.",
    evidence_changed: "Bằng chứng vừa được sửa ở tab khác. Tải lại trang rồi thử lại.",
    submission_conflict: "Mã gửi này đã dùng cho một bằng chứng khác.",
    not_appealable: "Chỉ khiếu nại được bằng chứng bị từ chối.",
    appeal_open: "Đã có một khiếu nại đang mở.",
    appeal_used: "Quyết định này đã được khiếu nại.",
    appeal_resolved: "Khiếu nại này đã được xử lý.",
    appeal_not_found: "Không tìm thấy khiếu nại cho bằng chứng này.",
    not_confirmable: "Bằng chứng này không cần xác nhận.",
    self_confirmation: "Bạn không thể tự xác nhận việc mình giúp.",
    same_discord_identity: "Hai tài khoản đang liên kết cùng một Discord.",
    circular_confirmation_cap: "Hai bạn đã xác nhận giúp đỡ cho nhau trong kỳ này.",
    confirmation_requires_session: "Đăng nhập để xác nhận.",
    counterparty_unconfirmed: "Người được giúp chưa xác nhận.",
    self_moderation: "Bạn không thể tự quyết định bằng chứng hoặc khiếu nại của mình.",
    already_decided: "Bằng chứng này đã có người quyết định.",
    moderation_not_allowed: "Chỉ moderator mới làm được việc này.",
    session_required: "Thao tác quản trị cần phiên đăng nhập.",
    reason_required: "Nêu lý do.",
    entry_not_found: "Không tìm thấy bút toán.",
    cannot_reverse_reversal: "Không thể đảo một bút toán đảo.",
    user_not_found: "Không có thành viên nào khớp với id hoặc email này.",
    product_not_owned: "Bạn chỉ liên kết được sản phẩm của mình.",
    product_already_linked: "Sản phẩm này đã được liên kết với một dự án.",
    project_limit: "Bạn đã đạt giới hạn số dự án.",
    slug_unavailable: "Chọn tên dự án khác.",
    cross_site_request: "Biểu mẫu được gửi từ trang khác nên đã bị từ chối.",
    rate_limited: "Quá nhiều yêu cầu. Đợi một chút rồi thử lại.",
    not_found: "Không tìm thấy.",
    internal_error: "Đã có lỗi. Thử lại nhé.",
  },
  errorFallback: "Chưa thực hiện được. Thử lại nhé.",
  describeCap: (cap) => describeCap(cap, "vi"),
  rp: (value) => `${value} RP`,
  minSummary: (chars) => `Mô tả tối thiểu ${chars} ký tự`,
  linkRequired: "Ít nhất một link hoặc tệp",
  linkOptional: "Link và tệp không bắt buộc",
  counterpartyRequired: "Ghi tên người bạn đã giúp; họ sẽ xác nhận",
  rulesetLabel: (version) => `Bộ luật ${version}`,
  membership: {
    title: "Builder League dành cho thành viên",
    body: "Tham gia gói Premium hoặc VIP để ghi lại tiến độ và nhận RP.",
    action: "Xem các gói thành viên",
  },
  list: {
    eyebrow: "Builder League",
    title: "Nhật ký bằng chứng của bạn",
    lede: "Mỗi RP bắt đầu từ một việc bạn đã làm. Gửi tại đây, moderator sẽ xác minh.",
    newAction: "Gửi bằng chứng",
    empty: "Chưa có bằng chứng",
    emptyHint: "Bắt đầu với việc gần nhất bạn đã ship, kiểm chứng hoặc giúp đỡ.",
    filterLabel: "Hiển thị",
    filterAll: "Tất cả",
    occurred: "Thời điểm",
    project: "Dự án",
    decision: "Quyết định",
    open: "Xem",
    more: "Mục cũ hơn",
    confirmTitle: "Đang chờ bạn xác nhận",
    confirmLede: "Những thành viên này nói đã giúp bạn. Chỉ xác nhận nếu đúng như vậy.",
    confirmFrom: (name) => `Từ ${name}`,
    review: "Xem và xác nhận",
  },
  form: {
    eyebrow: "Builder League",
    title: "Gửi bằng chứng",
    lede: "Chọn việc đã diễn ra, đưa bằng chứng, moderator sẽ xác minh.",
    redaction:
      "Hãy che thông tin trước khi tải lên: không để tên, email, số điện thoại hay thông tin thanh toán của khách hàng. Bằng chứng mặc định là riêng tư và tệp chỉ hiển thị cho bạn và moderator.",
    stageStep: "Giai đoạn",
    stageAll: "Tất cả giai đoạn",
    typeLabel: "Việc đã diễn ra",
    typeHint: "RP và yêu cầu lấy theo bộ luật áp dụng vào ngày việc diễn ra.",
    typeChoose: "Chọn một sự kiện",
    requirements: "Yêu cầu",
    verifiedBy: "Xác minh bởi",
    caps: "Giới hạn",
    projectLabel: "Dự án",
    projectNone: "Không có dự án",
    projectHint: "Bắt buộc cho VALIDATE, BUILD và SHIP.",
    projectCreate: "Dự án mới",
    projectName: "Tên dự án",
    projectAction: "Tạo dự án",
    occurredLabel: "Ngày diễn ra",
    occurredHint: "Theo giờ Việt Nam.",
    titleLabel: "Tiêu đề",
    summaryLabel: "Kết quả",
    summaryHint: "Bạn đã làm gì, điều gì thay đổi và cho ai. Có số liệu càng tốt.",
    linksLabel: "Link",
    linksHint: "Mỗi dòng một link: bài đăng, trang, repo hoặc bản ghi.",
    filesLabel: "Tệp",
    filesHint: "Ảnh chụp màn hình hoặc PDF, tối đa năm tệp, mỗi tệp 10 MB.",
    counterpartyLabel: "Thành viên bạn đã giúp",
    counterpartyHint: "Link hồ sơ builder hoặc id của họ. Họ sẽ xác nhận ở phía mình.",
    visibilityLabel: "Ai có thể xem",
    submit: "Gửi bằng chứng",
    submitting: "Đang gửi…",
    save: "Lưu thay đổi",
    cancel: "Huỷ",
    requirementsAll: "Yêu cầu của mọi sự kiện",
    errorSummary: "Sửa lỗi này rồi gửi lại",
    removeFile: (name) => `Xoá ${name}`,
    charCount: (count, min) => (min > 0 ? `${count} / ${min} ký tự` : `${count} ký tự`),
  },
  detail: {
    back: "Tất cả bằng chứng",
    submittedAt: "Ngày gửi",
    occurred: "Thời điểm",
    project: "Dự án",
    source: "Gửi từ",
    links: "Link",
    files: "Tệp",
    noFiles: "Không có tệp",
    counterparty: "Người được giúp",
    confirmed: "Đã xác nhận",
    awaitingConfirmation: "Đang chờ họ xác nhận",
    decision: "Quyết định",
    note: "Ghi chú của moderator",
    edit: "Sửa bằng chứng",
    withdraw: "Rút bằng chứng",
    withdrawHint: "Bằng chứng đã rút sẽ rời hàng chờ và không được tính RP.",
    sources: { member: "website", api: "API key", agent: "AI agent" },
  },
  appeal: {
    title: "Khiếu nại quyết định",
    lede: "Mỗi lần bị từ chối bạn được khiếu nại một lần. Hãy nói rõ điều moderator đã bỏ sót.",
    reasonLabel: "Vì sao nên được duyệt",
    reasonHint: "Ít nhất 20 ký tự.",
    submit: "Gửi khiếu nại",
    statuses: { open: "Khiếu nại đang xem xét", upheld: "Giữ nguyên quyết định", overturned: "Khiếu nại được chấp nhận", withdrawn: "Đã rút khiếu nại" },
    used: "Quyết định này đã được khiếu nại.",
  },
  confirm: {
    title: "Xác nhận việc giúp đỡ",
    lede: (name) => `${name} nói đã giúp bạn. Chỉ xác nhận nếu việc đó diễn ra đúng như mô tả.`,
    submit: "Xác nhận",
    done: "Bạn đã xác nhận việc giúp đỡ này.",
  },
  hub: {
    eyebrow: "Studio",
    title: "Quản trị Builder League",
    lede: "Duyệt bằng chứng, xử lý khiếu nại và quản lý ai được dùng league.",
    queue: "Chờ duyệt",
    needsInfo: "Chờ thành viên bổ sung",
    appeals: "Khiếu nại đang mở",
    pilot: "Thành viên pilot",
    openQueue: "Mở trang kiểm duyệt",
    flagOn: "League đang mở cho mọi thành viên trả phí.",
    flagOff: "League đang ẩn: chỉ admin và thành viên pilot sử dụng được.",
    backfillTitle: "Nhập lại các lần ra mắt trên directory",
    backfillLede:
      "Với thành viên đã đồng ý, mỗi sản phẩm đã xuất bản được nhập thành một lần ra mắt SHIP vào đúng ngày được duyệt, tính điểm theo bộ luật áp dụng khi đó. Mặc định chỉ chạy thử.",
    backfillUsers: "Chỉ chạy cho các id thành viên",
    backfillUsersHint: "Mỗi dòng một id. Để trống để chạy cho mọi người đã đồng ý.",
    backfillApply: "Ghi thay đổi (nếu không chọn thì chỉ chạy thử)",
    backfillRun: "Chạy backfill",
    backfillDryRunNotice: (count) => `Chạy thử: sẽ nhập ${count} lần ra mắt.`,
    backfillDoneNotice: (count) => `Đã nhập ${count} lần ra mắt.`,
  },
  moderation: {
    eyebrow: "Studio · Builder League",
    title: "Duyệt bằng chứng",
    lede: "Cũ nhất trước. Chỉ duyệt những gì bằng chứng cho thấy.",
    filters: "Bộ lọc",
    status: "Trạng thái",
    stage: "Giai đoạn",
    eventType: "Sự kiện",
    olderThan: "Chờ lâu hơn",
    anyAge: "Bất kỳ",
    hours: (count) => `${count} giờ`,
    days: (count) => `${count} ngày`,
    apply: "Áp dụng bộ lọc",
    empty: "Không còn gì để duyệt.",
    submittedBy: (name) => `bởi ${name}`,
    waiting: "Chờ từ",
    rp: "RP",
    required: "Cần",
    decisionLabel: "Quyết định",
    decisions: { approve: "Duyệt", reject: "Từ chối", needs_info: "Yêu cầu bổ sung" },
    reasonsLabel: (decision) =>
      decision === "approve" ? "Lý do duyệt (không bắt buộc)" : decision === "reject" ? "Lý do từ chối" : "Cần bổ sung gì",
    noteLabel: "Ghi chú cho thành viên",
    noteHint: "Bắt buộc khi chọn Lý do khác. Thành viên sẽ đọc được.",
    decide: "Lưu quyết định",
    ownEvidence: "Bằng chứng của bạn: cần moderator khác quyết định.",
    awaitingCounterparty: "Đang chờ người được giúp xác nhận.",
    appealsTitle: "Khiếu nại đang mở",
    appealsEmpty: "Không có khiếu nại nào.",
    appealBy: (name) => `Khiếu nại của ${name}`,
    resolutionLabel: "Kết luận",
    uphold: "Giữ nguyên từ chối",
    overturn: "Chấp nhận và duyệt",
    resolve: "Xử lý khiếu nại",
    reverseTitle: "Đảo RP",
    reverseLede: "Thêm một bút toán âm kèm lý do. Bút toán gốc vẫn được giữ để đối soát.",
    entryLabel: "Id bút toán",
    reasonLabel: "Lý do",
    reverse: "Đảo bút toán",
    pilotTitle: "Thành viên pilot",
    pilotLede: "Khi league đang ẩn, thành viên trả phí trong danh sách này vẫn dùng được.",
    pilotEmpty: "Chưa có thành viên pilot.",
    pilotAdd: "Thêm vào pilot",
    pilotRemove: "Gỡ",
    pilotIdentity: "Email thành viên",
    pilotNote: "Ghi chú",
    addedAt: "Ngày thêm",
  },
};

export const evidenceCopy: Record<PageLocale, EvidenceCopy> = { en, vi };

export function getEvidenceCopy(locale: string): EvidenceCopy {
  return evidenceCopy[toPageLocale(locale)];
}

/** Localized message for an API error code (from `?error=` or a JSON error envelope). */
export function evidenceErrorMessage(copy: EvidenceCopy, code: string | null | undefined): string {
  return (code && copy.errors[code]) || copy.errorFallback;
}
