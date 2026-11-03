export type AssistantDeterministicResponseType = 'conversation' | 'platform_knowledge';

export type PlatformKnowledgeTopic =
  | 'ACCOUNTS_PROFILE'
  | 'ASSISTANT'
  | 'HELP_SUPPORT'
  | 'LOST_FOUND'
  | 'MARKETPLACE'
  | 'MESSAGING_NOTIFICATIONS'
  | 'OVERVIEW'
  | 'SERVICES'
  | 'TEAMUP';

export interface PlatformKnowledgeEntry {
  readonly answer: string;
  readonly availability: 'implemented';
  readonly id: string;
  readonly patterns: readonly RegExp[];
  readonly references: readonly string[];
  readonly topic: PlatformKnowledgeTopic;
}

export interface DeterministicAssistantReply {
  readonly answer: string;
  readonly responseType: AssistantDeterministicResponseType;
}

const SUPPORT_EMAIL = 'campusconnectteams@gmail.com';
const exact = (source: string) => new RegExp(`^${source}[?!.]*$`, 'iu');

export const platformKnowledgeEntries: readonly PlatformKnowledgeEntry[] = [
  {
    answer:
      'CampusConnect is a digital student ecosystem that brings activities such as buying and selling items, recovering lost belongings, finding project teammates, discovering student services, messaging, and notifications into one place.',
    availability: 'implemented',
    id: 'platform-overview',
    patterns: [
      exact('what is (?:campusconnect|this platform)'),
      exact('tell me about campusconnect'),
      exact('why was campusconnect created'),
      exact('what problem does campusconnect solve'),
    ],
    references: ['README.md', 'docs/architecture.md'],
    topic: 'OVERVIEW',
  },
  {
    answer:
      'CampusConnect is designed primarily for authenticated university and college students who want to connect and participate in their campus community.',
    availability: 'implemented',
    id: 'platform-audience',
    patterns: [
      exact('who (?:is campusconnect for|can use campusconnect)'),
      exact('is campusconnect for students'),
    ],
    references: ['README.md', 'backend/src/modules/auth'],
    topic: 'OVERVIEW',
  },
  {
    answer:
      'CampusConnect is an independent student ecosystem. It should not be treated as an official university ERP or as university-endorsed unless your institution separately confirms that relationship.',
    availability: 'implemented',
    id: 'platform-independence',
    patterns: [
      exact('is campusconnect (?:an )?official university (?:portal|erp)'),
      exact('is (?:it|campusconnect) connected to (?:a |the )?university erp'),
      exact('is campusconnect (?:run|endorsed) by (?:a |the )?university'),
    ],
    references: ['README.md', 'docs/architecture.md'],
    topic: 'OVERVIEW',
  },
  {
    answer:
      'Marketplace lets students browse, search, filter, save, create, edit, and manage listings for campus-relevant items. CampusConnect does not process payments, delivery, escrow, or purchase protection.',
    availability: 'implemented',
    id: 'marketplace-overview',
    patterns: [exact('what is (?:the )?marketplace'), exact('how can i find second-hand items')],
    references: ['frontend/src/features/marketplace', 'backend/src/modules/marketplace'],
    topic: 'MARKETPLACE',
  },
  {
    answer:
      'Open Marketplace and choose Sell an item. Add the item details and optional images, then submit it. You can edit your own listing and use its lifecycle controls to mark it sold or archive it.',
    availability: 'implemented',
    id: 'marketplace-create',
    patterns: [
      exact('how do i (?:sell an item|create a listing|list an item)'),
      exact('how can i (?:sell an item|create a listing|list an item)'),
    ],
    references: [
      'frontend/src/features/marketplace/CreateListingPage.tsx',
      'backend/src/modules/marketplace',
    ],
    topic: 'MARKETPLACE',
  },
  {
    answer:
      'Use the save control on a Marketplace listing to bookmark it, then open Saved listings to find it again.',
    availability: 'implemented',
    id: 'marketplace-bookmark',
    patterns: [exact('how do i bookmark a listing'), exact('how do i save a listing')],
    references: ['frontend/src/features/marketplace', 'backend/src/modules/marketplace'],
    topic: 'MARKETPLACE',
  },
  {
    answer:
      'Open your listing and use its owner controls to change the status to sold. Sold listings can later be archived using the available lifecycle controls.',
    availability: 'implemented',
    id: 'marketplace-sold',
    patterns: [exact('how do i mark an item as sold'), exact('how do i archive a listing')],
    references: ['frontend/src/features/marketplace', 'backend/src/modules/marketplace'],
    topic: 'MARKETPLACE',
  },
  {
    answer:
      'Open the Marketplace listing and use Message Seller. CampusConnect messaging is the supported contact path; purchases and payments are arranged outside CampusConnect.',
    availability: 'implemented',
    id: 'marketplace-contact',
    patterns: [exact('how do i contact a seller'), exact('how can i message a seller')],
    references: ['frontend/src/features/marketplace', 'backend/src/modules/messaging'],
    topic: 'MARKETPLACE',
  },
  {
    answer:
      'Lost & Found lets students publish lost or found reports, browse and filter reports, save useful reports, submit claims, review claims on their own reports, and view suggested matches.',
    availability: 'implemented',
    id: 'lost-found-overview',
    patterns: [exact('what is lost (?:and|&) found')],
    references: ['frontend/src/features/lost-found', 'backend/src/modules/lost-found'],
    topic: 'LOST_FOUND',
  },
  {
    answer:
      'Open Lost & Found and choose Report lost or Report found, provide the known details and optional images, and submit the report.',
    availability: 'implemented',
    id: 'lost-found-report',
    patterns: [
      exact('how do i report (?:a lost item|something i found|a found item)'),
      exact('how can i report (?:a lost item|something i found|a found item)'),
    ],
    references: [
      'frontend/src/features/lost-found/LostFoundCreatePage.tsx',
      'backend/src/modules/lost-found',
    ],
    topic: 'LOST_FOUND',
  },
  {
    answer:
      'Browse Lost & Found and use its search and filters. You can also open Possible matches for semantic suggestions related to your reports.',
    availability: 'implemented',
    id: 'lost-found-search',
    patterns: [exact('how can i search for a lost item'), exact('how do i search for a lost item')],
    references: ['frontend/src/features/lost-found', 'backend/src/modules/lost-found'],
    topic: 'LOST_FOUND',
  },
  {
    answer:
      'Lost & Found AI compares report details and suggests potentially related reports. A match is only a ranking suggestion, not proof that two reports describe the same item.',
    availability: 'implemented',
    id: 'lost-found-ai',
    patterns: [
      exact('how does (?:the )?ai matching work'),
      exact('how do lost (?:and|&) found matches work'),
    ],
    references: ['ai-service/app/matching', 'backend/src/modules/lost-found'],
    topic: 'LOST_FOUND',
  },
  {
    answer:
      'Open an eligible Lost & Found report and submit a claim with the requested information. The report owner can review it, and you can cancel your own pending claim. A claim does not guarantee ownership.',
    availability: 'implemented',
    id: 'lost-found-claim',
    patterns: [exact('how can i claim an item'), exact('how do i claim an item')],
    references: ['frontend/src/features/lost-found', 'backend/src/modules/lost-found'],
    topic: 'LOST_FOUND',
  },
  {
    answer:
      'TeamUp helps students discover project opportunities, create projects with required skills, apply to join, and manage applicants and members for projects they own.',
    availability: 'implemented',
    id: 'teamup-overview',
    patterns: [exact('what is teamup'), exact('how can i find project teammates')],
    references: ['frontend/src/features/teamup', 'backend/src/modules/teamup'],
    topic: 'TEAMUP',
  },
  {
    answer:
      'Open TeamUp and choose Create project. Add the project description, category, required skills, and team details. Other eligible students can then apply while the project is open.',
    availability: 'implemented',
    id: 'teamup-create',
    patterns: [exact('how do i create a team'), exact('how do i create a teamup project')],
    references: ['frontend/src/features/teamup/TeamUpCreatePage.tsx', 'backend/src/modules/teamup'],
    topic: 'TEAMUP',
  },
  {
    answer:
      'Open an available TeamUp project and submit an application. The project owner can accept or reject eligible applications, subject to project status and capacity.',
    availability: 'implemented',
    id: 'teamup-apply',
    patterns: [
      exact("can i join another student's project"),
      exact('how do team applications work'),
      exact('how do i apply to a teamup project'),
    ],
    references: ['frontend/src/features/teamup', 'backend/src/modules/teamup'],
    topic: 'TEAMUP',
  },
  {
    answer:
      'Services lets students offer and discover skills such as tutoring or design. Students can browse, search, save, create, and manage service listings and use the supported request workflow. CampusConnect does not process payments.',
    availability: 'implemented',
    id: 'services-overview',
    patterns: [
      exact('what is (?:the )?services module'),
      exact('what are services'),
      exact('can students offer their skills'),
    ],
    references: ['frontend/src/features/services', 'backend/src/modules/services'],
    topic: 'SERVICES',
  },
  {
    answer:
      'Open Services and choose Offer a service. Add the service details, skills, pricing mode, and availability information, then publish it.',
    availability: 'implemented',
    id: 'services-create',
    patterns: [
      exact('how can i create a service listing'),
      exact('how do i create a service listing'),
    ],
    references: [
      'frontend/src/features/services/ServiceCreatePage.tsx',
      'backend/src/modules/services',
    ],
    topic: 'SERVICES',
  },
  {
    answer:
      'Browse Services and use search or filters for tutoring, design, or another skill. Open a service for its public details and available request or contact actions.',
    availability: 'implemented',
    id: 'services-discovery',
    patterns: [
      exact('how do i find tutoring or design services'),
      exact('how can i find student services'),
    ],
    references: ['frontend/src/features/services', 'backend/src/modules/services'],
    topic: 'SERVICES',
  },
  {
    answer:
      'Open the service details and use the available request workflow. Messaging is available only for eligible service relationships. CampusConnect does not process service payments or bookings.',
    availability: 'implemented',
    id: 'services-contact',
    patterns: [
      exact('how can i contact a service provider'),
      exact('how do i contact a service provider'),
    ],
    references: ['frontend/src/features/services', 'backend/src/modules/services'],
    topic: 'SERVICES',
  },
  {
    answer:
      'CampusConnect supports persistent direct and contextual conversations between eligible students. Open Messages to view conversations and unread messages. The Campus Assistant cannot send messages for you.',
    availability: 'implemented',
    id: 'messaging',
    patterns: [
      exact('can i message another student'),
      exact('where can i see my messages'),
      exact('how does messaging work'),
    ],
    references: ['frontend/src/features/messaging', 'backend/src/modules/messaging'],
    topic: 'MESSAGING_NOTIFICATIONS',
  },
  {
    answer:
      'Notifications are created by supported CampusConnect events and appear in the notification bell and Notifications page. You can view unread counts and mark notifications as read.',
    availability: 'implemented',
    id: 'notifications',
    patterns: [
      exact('how do notifications work'),
      exact('can i receive updates about my listings'),
    ],
    references: ['frontend/src/features/notifications', 'backend/src/modules/notifications'],
    topic: 'MESSAGING_NOTIFICATIONS',
  },
  {
    answer:
      'Use Register to create an account with a valid email address, verify the email through Supabase, then sign in. CampusConnect uses authenticated student accounts but is not an official university identity system.',
    availability: 'implemented',
    id: 'account-signup',
    patterns: [exact('how do i sign up'), exact('how do i create an account')],
    references: ['frontend/src/features/auth', 'backend/src/modules/auth'],
    topic: 'ACCOUNTS_PROFILE',
  },
  {
    answer:
      'Open Login and enter your registered email and password. CampusConnect will never ask you to provide a password, OTP, or access token to the Campus Assistant.',
    availability: 'implemented',
    id: 'account-login',
    patterns: [exact('how do i log in'), exact('how do i login')],
    references: ['frontend/src/features/auth', 'backend/src/modules/auth'],
    topic: 'ACCOUNTS_PROFILE',
  },
  {
    answer:
      'Open Profile to edit your student details. You can manage supported profile information including skills, interests, achievements, portfolio links, and your predefined avatar.',
    availability: 'implemented',
    id: 'profile-edit',
    patterns: [exact('how do i edit my profile'), exact('can i add skills')],
    references: ['frontend/src/features/profile', 'backend/src/modules/profile'],
    topic: 'ACCOUNTS_PROFILE',
  },
  {
    answer:
      'Use Forgot password on the login screen, follow the email recovery link, and set a new password on the reset page. Never send your password or recovery token to the Campus Assistant.',
    availability: 'implemented',
    id: 'account-password-reset',
    patterns: [exact('how do i reset my password'), exact('i forgot my password')],
    references: [
      'frontend/src/features/auth/ForgotPasswordPage.tsx',
      'frontend/src/features/auth/ResetPasswordPage.tsx',
    ],
    topic: 'ACCOUNTS_PROFILE',
  },
  {
    answer:
      'Open Settings to manage the account, notification, privacy, security, and appearance options currently available to your account.',
    availability: 'implemented',
    id: 'account-settings',
    patterns: [exact('how do i change account settings'), exact('where are my account settings')],
    references: ['frontend/src/features/settings', 'backend/src/modules/settings'],
    topic: 'ACCOUNTS_PROFILE',
  },
  {
    answer:
      'Campus Assistant can answer questions about CampusConnect and search eligible public Marketplace, Lost & Found, TeamUp, and Services records. Record searches use authorized retrieval, MiniLM reranking, and grounded Gemini generation when enabled. It is read-only and cannot buy, message, claim, apply, or edit anything for you.',
    availability: 'implemented',
    id: 'assistant-capabilities',
    patterns: [
      exact('what is (?:the )?campus assistant'),
      exact('what can (?:the )?campus assistant do'),
      exact('how do you find listings'),
      exact('do you use ai'),
      exact('can you search campusconnect'),
      exact('can you send messages or buy products for me'),
    ],
    references: ['docs/campus-assistant-rag.md', 'backend/src/modules/assistant'],
    topic: 'ASSISTANT',
  },
  {
    answer:
      'Campus Assistant uses up to four previous questions for short workflow follow-ups while this page is open. Clear or New conversation resets this context. Conversations are not saved to a database or remembered between sessions.',
    availability: 'implemented',
    id: 'assistant-memory',
    patterns: [exact('do you remember previous conversations'), exact('do you remember me')],
    references: ['frontend/src/features/ai/AIAssistantPage.tsx', 'docs/campus-assistant-rag.md'],
    topic: 'ASSISTANT',
  },
  {
    answer: `You can contact the CampusConnect team at ${SUPPORT_EMAIL}. Emailing this address does not automatically create a support ticket.`,
    availability: 'implemented',
    id: 'support-contact',
    patterns: [
      exact('(?:what is|what\x27s) (?:(?:the|your) )?(?:campusconnect )?support email'),
      exact('what is the campusconnect email'),
      exact(
        'how do i contact (?:support|campusconnect|the campusconnect team|the development team)',
      ),
      exact(
        'how can i contact (?:support|campusconnect|the campusconnect team|the development team)',
      ),
      exact('how do i submit a technical support request'),
      exact('how can i submit a technical support request'),
      exact('where can i report a (?:platform problem|bug)'),
      exact('how can i report a bug'),
      exact('where can i send feedback'),
      exact('i am having trouble logging in'),
      exact('something isn\x27t working'),
      exact('contact support'),
      exact('support email'),
      exact('report a bug'),
    ],
    references: ['docs/campus-assistant-rag.md'],
    topic: 'HELP_SUPPORT',
  },
  {
    answer:
      'CampusConnect does not currently process payments, delivery, escrow, refunds, or purchase protection. Students must handle those arrangements themselves and use appropriate care.',
    availability: 'implemented',
    id: 'platform-payment-limitations',
    patterns: [
      exact('does campusconnect support payments'),
      exact('can i pay through campusconnect'),
      exact('does campusconnect offer purchase protection'),
    ],
    references: ['backend/src/modules/marketplace', 'backend/src/modules/services'],
    topic: 'OVERVIEW',
  },
] as const;

const conversationalIntents: readonly {
  readonly answer: string;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    answer:
      "Hello! I'm your CampusConnect Assistant. I can help with platform features or search eligible Marketplace, Lost & Found, TeamUp, and Services records. How can I help?",
    patterns: [exact('(?:hi|hello|hey)(?: there)?'), exact('good (?:morning|afternoon|evening)')],
  },
  {
    answer: "I'm ready to help with CampusConnect. What would you like to know?",
    patterns: [exact('how are you')],
  },
  {
    answer: "You're welcome! Let me know if you need anything else.",
    patterns: [exact('thanks'), exact('thank you'), exact('thanks a lot')],
  },
  {
    answer: 'Goodbye! You can return whenever you need help with CampusConnect.',
    patterns: [exact('bye'), exact('goodbye'), exact('see you')],
  },
  {
    answer:
      'I can explain CampusConnect features and search eligible public Marketplace, Lost & Found, TeamUp, and Services records. I cannot take actions or access private information.',
    patterns: [exact('help'), exact('what can you do'), exact('who are you')],
  },
] as const;

export const findDeterministicAssistantReply = (
  question: string,
): DeterministicAssistantReply | null => {
  const normalized = question.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const knowledge = platformKnowledgeEntries.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(normalized)),
  );
  if (knowledge !== undefined)
    return { answer: knowledge.answer, responseType: 'platform_knowledge' };
  const conversation = conversationalIntents.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(normalized)),
  );
  return conversation === undefined
    ? null
    : { answer: conversation.answer, responseType: 'conversation' };
};

export const campusConnectSupportEmail = SUPPORT_EMAIL;
