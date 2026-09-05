import type { AppLocale } from "../session/appLocale"
import {
  LEGAL_DOCUMENT_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_EFFECTIVE_DATE_TR,
  LEGAL_OPERATOR_IDENTITY
} from "./legalPolicyMetadata"
import type { LegalContent, LegalContentType } from "./legalTypes"

export type { LegalContent, LegalContentType } from "./legalTypes"

const EN: Readonly<Record<LegalContentType, LegalContent>> = Object.freeze({
  privacy: {
    title: "Privacy Notice",
    version: LEGAL_DOCUMENT_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    status: "effective",
    body: `Blumi Privacy Notice and KVKK Disclosure
Version: ${LEGAL_DOCUMENT_VERSION}
Effective date: ${LEGAL_EFFECTIVE_DATE}

1. Data Controller and Contact
Data controller: ${LEGAL_OPERATOR_IDENTITY.legalName}
Registered address: ${LEGAL_OPERATOR_IDENTITY.registeredAddress}
Privacy contact: ${LEGAL_OPERATOR_IDENTITY.privacyContact}
Support page: ${LEGAL_OPERATOR_IDENTITY.supportUrl}

The entity named above determines why and how Blumi personal data is processed. Service providers listed below process data only for their defined roles, except where their own terms or law make them an independent controller.

2. Scope; Notice Is Separate from Consent
This notice explains Blumi's processing in the mobile app, its server APIs, support and related safety operations. It is an information notice under Turkish Law No. 6698 (KVKK) and, where applicable, Articles 13–14 of the GDPR. This privacy notice is not a request for consent and is not accepted as a contract. Terms acceptance, optional analytics consent, marketing consent and any explicit consent for special-category processing must be presented separately. Refusing an optional consent does not block unrelated core functions.

3. Data We Process
Account and verification data: phone number, one-time-code request and verification status, account/user identifiers, session and security records, language, timestamps and account status. Blumi does not need your phone contacts.

Profile and discovery data: display name, age, biography, identity/gender fields you choose to provide, discovery age and gender preferences, interests, prompt answers, avatar and wardrobe selections, profile-completion state, and location coordinates or location information you choose to provide. Your exact location is not displayed to other users.

Interaction and user content: discovery decisions, likes, mutual matches, blocks, reactions, private text messages, room invitations and decisions, room chat, room configuration and decor, and content or context submitted with support, safety reports or appeals.

Safety and integrity data: report reason and details, reported account/content identifiers, moderation decisions, enforcement history, fraud and abuse signals, rate-limit events, IP address, device/app information, authentication attempts and relevant server logs. Reports are access-restricted, not promised to be absolutely confidential, and may be shared when needed for investigation, due process or law.

Purchase and virtual-economy data: store product, price/currency information shown by the store, transaction and original transaction identifiers, purchase/refund/revocation status, RevenueCat app-user identifier, coin balance and debt, wallet ledger, owned virtual items and reward history. Blumi does not receive or store full payment-card details.

Device, notification and diagnostics data: operating system and app version, device/push token, notification preferences and delivery status. When configured, privacy-reduced crash and performance diagnostics may include technical stack, screen/feature tag, device class and timing information, but Sentry is configured not to send default PII, screenshots, view hierarchy, profile content or message bodies.

Optional product analytics: only after your separate opt-in, Blumi may send limited, allow-listed product-interaction events to PostHog. The configured analytics policy excludes names, phone numbers, message bodies, profile text, URLs, location, authentication codes and tokens; session replay and automatic person profiles are disabled.

4. Sources and Collection Methods
We obtain data directly from you; from your use of Blumi; from the other participant in a match, message, room, block or report; from Apple App Store, Google Play and RevenueCat for purchase verification; from Twilio for SMS delivery and verification metadata; from Expo, Apple Push Notification service or Firebase Cloud Messaging for notification delivery; from LiveKit for real-time room connectivity; and from security, analytics and diagnostic providers when enabled. We do not buy data-broker profiles.

5. Purposes and Legal Bases
Contract formation and performance: create and secure the account; authenticate by phone; provide profiles, discovery, matching, durable text chat, accepted shared rooms, inventory, purchases, support, export and deletion tools; and keep the server-authoritative wallet accurate.

Legal obligations: meet consumer, accounting, tax, platform, safety, regulatory and lawful-authority requirements; keep legally required transaction or request records; and respond to enforceable orders.

Legitimate interests, after a balancing assessment where required: prevent fraud, spam, harassment and account takeover; investigate reports; enforce rules; maintain availability; diagnose privacy-reduced faults; protect legal claims; and improve service reliability. You may object where the law grants that right.

Separate consent: optional PostHog product analytics; electronic marketing if ever offered; permissions controlled by the device where consent is the applicable basis; and special-category processing or inferences where the law requires explicit consent. Withdrawing consent applies prospectively and does not invalidate earlier lawful processing.

We do not use contractual necessity as a label for processing that is not objectively needed for the requested service. Each processing operation is limited to a documented lawful basis and the data reasonably necessary for that purpose.

6. Gender Preferences and Potential Sensitive Inferences
Gender and the people you choose to discover can, in context, reveal or permit an inference about sex life or sexual orientation, which may be special-category data under applicable law. Blumi must not use such an inference for advertising, sale, eligibility, credit, employment or unrelated profiling. Where special-category processing cannot rely on another lawful basis, Blumi must obtain a specific, informed and separately recorded explicit consent before enabling that processing. You may change discovery preferences or withdraw that consent without losing unrelated account functions. Do not put unnecessary health, religion, political belief, biometric, criminal-history or other sensitive data in your profile or messages.

7. Matching, Recommendations and Automated Processing
Blumi filters and orders discovery candidates using factors such as age range, selected genders, blocks, prior decisions, eligibility, activity or safety restrictions and other product signals described in the service. A match occurs only after mutual interest. These recommendations do not guarantee identity, intent, compatibility or safety and are not designed to produce legal or similarly significant effects. You may change available discovery preferences and may contact us to object to or ask about applicable automated processing.

8. Messages, Shared Rooms and Live Audio
Private text messages are stored so matched users can access the conversation and so Blumi can provide safety, export and deletion functions. Recipients can copy, capture or disclose content; do not share information you cannot safely lose control of.

When you choose to join a shared room, you can use text chat. If you choose to turn on live audio, it is transmitted in real time to the other participant through LiveKit. Blumi does not request camera access and does not record or retain live audio content. LiveKit and network operators may process transient media packets and connection metadata needed to deliver and secure the session. Participants must not record, transcribe or rebroadcast another person's audio without a valid legal basis and any required consent.

9. Safety, Reports and Legal Requests
We process blocks, reports, relevant content/context, moderation decisions and limited technical evidence to protect users, investigate suspected violations, prevent repeat abuse and comply with law. Access is limited to authorized personnel and providers with a need to know. We may preserve specific evidence when reasonably necessary for an active investigation, legal claim or binding request, then delete or anonymize it when that purpose and any mandatory retention period end. We may notify authorities or emergency services when required by law or reasonably necessary to address a credible imminent threat; Blumi is not an emergency service.

10. Notifications
If you grant device permission and register a push token, Blumi uses Expo Push Service, Apple Push Notification service and/or Firebase Cloud Messaging to deliver the notification types you enable. A notification payload and token pass through the relevant services, and its preview may appear on your lock screen depending on device settings. Likes, matches, messages and discovery-watch notifications have separate in-app controls. Operational and safety notices are kept distinct from marketing. You can change app preferences or device permission at any time.

11. Purchases
Blumi uses RevenueCat and the applicable Apple or Google store to offer, process and verify native coin purchases. RevenueCat receives the store transaction, product, purchase history and app account identifier needed for verification. Blumi stores transaction, event and wallet-ledger records to prevent duplicate credits, handle reversals and operate coin balances. Payment credentials stay with the store/payment provider.

12. Recipients and Service Providers
Recipients may include: the other users to whom you intentionally expose a profile, message, room interaction or live voice; Twilio and telecom carriers for one-time SMS; LiveKit for live audio connectivity; Expo, Apple and Google for push delivery; RevenueCat, Apple and Google for in-app purchases; PostHog for separately consented analytics; Sentry for privacy-reduced diagnostics; contracted hosting, database and infrastructure providers; professional advisers bound by confidentiality; corporate successors subject to lawful notice and safeguards; and competent authorities when legally required.

Service-provider roles and material changes are reflected in this notice or the support page. SMS opt-in and verification consent records are not sold, rented or shared for third-party marketing.

13. Cross-Border Transfers
Some named technology providers may process data outside Türkiye or the country where you live. A transfer is made only through an applicable KVKK Article 9 mechanism and any other required transfer safeguard, after provider review and with supplementary security where needed. Possible mechanisms include an adequacy decision, an approved standard contract, binding corporate rules or a lawful exceptional transfer. Integrations that cannot meet an applicable transfer requirement are not enabled for the affected data.

14. What Other Users See
The discovery/profile surfaces may show your display name, age, biography, identity fields you elect to show, interests, prompts and avatar. A match can see messages and room activity you send to that match. Your phone number, exact location, reports, and private messages are not shown on your public profile. Security logs and full purchase records are also private. Blocking limits future interaction but cannot erase copies another person already lawfully received or captured.

15. Retention and Deletion Criteria
Account and profile data is kept while the account is active and then deleted or anonymized when no longer needed, subject to the verified schedule and legal holds. Messages, matches, rooms, device tokens, discovery actions and active virtual-economy records follow the account lifecycle unless a narrower safety or legal need applies. OTP secrets and challenges are short-lived; security/rate-limit logs are kept only for a documented anti-abuse window. Optional analytics follows the configured provider retention and is disconnected after opt-out. Crash diagnostics follows the configured diagnostic retention. Purchase, accounting, refund and fraud records may be segregated and retained for mandatory statutory periods. Backups are access-restricted and expire through the documented rotation rather than being restored for ordinary product use after deletion.

Retention is limited by purpose, account lifecycle, safety needs, limitation periods and mandatory accounting, tax, consumer, platform or regulatory duties. At the end of the applicable period, data is securely deleted, destroyed or anonymized unless a lawful hold applies. You may request the current category-specific retention information through the privacy contact.

16. Security and Breach Response
Blumi uses measures appropriate to risk, including encrypted transport, hashed session/verification secrets where applicable, role and access restrictions, environment-based secret management, rate limits, provider controls, logging and tested account-action confirmation. No system is absolutely secure. If a personal-data breach occurs, the controller will contain and assess it, preserve evidence, notify the KVKK Board without delay and no later than 72 hours after becoming aware where the notification duty applies, and inform affected people as soon as reasonably possible when required by law. Contact us promptly if you suspect account compromise.

17. Your Privacy Rights
Under KVKK Article 11, subject to legal conditions, you may ask whether your personal data is processed; request information about processing; learn the purpose and whether data is used accordingly; learn recipients in Türkiye or abroad; request correction; request deletion or destruction; request notice of correction/deletion to recipients; object to an adverse result arising exclusively from automated analysis; and claim compensation for unlawful processing damage.

Where GDPR or another law applies, you may also have rights of access, rectification, erasure, restriction, portability, objection, withdrawal of consent and complaint to a supervisory authority. Rights are not absolute; we may verify identity, explain a lawful refusal, and retain the minimum data needed to document the request or meet law.

18. Exercising Rights; Export and Account Deletion
You can request an account-data export or delete your account from Settings after confirming a fresh one-time code sent to your sign-in phone. The active deletion flow removes active account, profile, sessions, messages, matches, rooms, economy, safety and push-registration records, except information that must be segregated and retained by law or for a documented legal hold. A freeze or deactivation is not presented as deletion.

You may also send a signed or otherwise legally valid request to the privacy contact, registered address or another verified application channel announced by the controller. Include enough information to locate the account and identify the requested right; do not send passwords or OTPs. We respond as soon as possible and no later than 30 days, subject to the statutory procedure. After applying to the controller, you may complain to the Turkish Personal Data Protection Board within the applicable statutory period, or to another competent authority where applicable.

19. Children
Blumi is strictly for people aged 18 or older and must not be marketed to children. We may use age declarations, store/platform age tools, reports and proportionate checks to enforce this rule. If we reasonably determine that an account belongs to a minor, we suspend access and delete or lawfully preserve the minimum evidence needed for safety and compliance. Report suspected underage use through the in-app reporting tool or support page.

20. No Sale, Sensitive Advertising or Hidden Tracking
Blumi does not sell or rent personal data, share SMS opt-in data for third-party marketing, or use private messages, precise location or sensitive inferences for behavioral advertising. Blumi does not enable third-party ad tracking in the described app. Any future advertising or materially different tracking requires a new assessment, updated notice and the separate choices required by law and platform rules.

21. Changes to This Notice
We may update this notice to reflect legal, provider or product changes. The version and effective date will change, and material changes will be presented before they take effect when required. A new consent will be requested where the legal basis is consent; silence or continued use will not be treated as explicit consent. Older versions and a change summary should remain available from the support page.

22. Contact
Privacy requests: ${LEGAL_OPERATOR_IDENTITY.privacyContact}
Legal notices: ${LEGAL_OPERATOR_IDENTITY.legalContact}
Support page and privacy choices: ${LEGAL_OPERATOR_IDENTITY.supportUrl}
Controller address: ${LEGAL_OPERATOR_IDENTITY.registeredAddress}

Do not include passwords, one-time codes, payment-card data or unnecessary sensitive information in an email.`
  },
  terms: {
    title: "Terms of Service",
    version: LEGAL_DOCUMENT_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    status: "effective",
    body: `Blumi Terms of Service
Version: ${LEGAL_DOCUMENT_VERSION}
Effective date: ${LEGAL_EFFECTIVE_DATE}

Service provider and contracting party: ${LEGAL_OPERATOR_IDENTITY.legalName}
Registered address: ${LEGAL_OPERATOR_IDENTITY.registeredAddress}
Legal contact: ${LEGAL_OPERATOR_IDENTITY.legalContact}

1. Agreement and Privacy Notice
These Terms form the agreement governing your use of Blumi. You accept them by selecting the Terms checkbox and completing account creation. The Privacy Notice is provided for information and acknowledgment; it is not bundled into this contract as consent. Optional analytics, marketing and any legally required special-category consent are separate choices. If you do not agree to these Terms, do not create or use an account.

2. Eligibility and Age
You must be at least 18 years old, legally capable of entering this agreement and not prohibited from using the service. You must provide an accurate age and may not create an account for a minor. Blumi may apply proportionate age assurance, request additional verification where lawful, restrict an account during review and remove underage accounts. A previous ban may not be bypassed without written permission.

3. Account and Authentication
One person may control only the accounts permitted by the service. Keep your device and SMS access secure; never share a one-time code. You are responsible for activity you authorize and must promptly report suspected compromise. You may not sell, transfer, rent, automate or impersonate an account. Blumi may require re-verification for sensitive account actions. Phone verification confirms control of a number at that time; it does not verify identity, background, intent or safety.

4. The Service
Blumi is an anonymous-first social discovery service. It provides avatar-based profiles, discovery preferences, mutual-interest matching, durable text chat, an optional chat-initiated and accepted shared room, room customization, optional live audio that starts muted/off, safety tools and virtual items. Features may differ by device, territory, account state or lawful safety restriction. A mutual match or recommendation is not an endorsement and does not guarantee identity, compatibility, availability or any outcome.

5. User Content and License
You retain ownership of profile text, prompts, messages, reports, room choices and other user content you lawfully create. You grant the service provider a worldwide, non-exclusive, royalty-free, sublicensable-to-necessary-providers license to host, store, reproduce, transmit, format and display that content only as reasonably needed to operate, secure, moderate, improve and legally defend Blumi. The license ends when content is deleted from active systems, subject to recipient copies, backups, legal holds and lawful retention described in the Privacy Notice.

You represent that you have the rights needed to submit your content and that it does not violate law, privacy, publicity, intellectual-property or contractual rights. Do not post another person's private information or copyrighted work without authority. Reports and feedback may be used to investigate and improve safety; feedback may be used without payment, but never expands our rights in your private content beyond what is stated here.

6. Prohibited Conduct and Content
You must not: use Blumi if under 18; sexually exploit or endanger a child; solicit a minor; share child sexual abuse material; threaten, stalk, harass, hate or discriminate; send non-consensual sexual content; coerce intimacy or money; impersonate; defraud, phish, spam or commercially solicit; doxx or disclose private data; promote trafficking, illegal drugs, weapons or violent wrongdoing; encourage self-harm; record or rebroadcast live audio unlawfully; scrape, crawl or build facial/profile databases; reverse engineer except where law permits; bypass blocks, age/safety controls, rate limits or access restrictions; introduce malware; abuse payment/refund systems; manipulate matching; or use Blumi for any unlawful purpose.

7. Safety and In-Person Interaction
Blumi does not conduct a universal criminal, identity or background check and cannot guarantee another user's statements or conduct. Use report and block, keep early conversations in-app, protect financial and address information, and meet only when and where you decide it is safe. Tell a trusted person, control transport and use a public setting. Blumi is not an emergency service. For an immediate threat, contact local emergency services or law enforcement. You remain responsible for your voluntary offline or in-person decisions, subject always to liabilities that law does not allow us to exclude.

8. Shared Rooms and Live Audio
A room begins only through the supported invitation and acceptance flow. Text is durable. Live audio is optional, starts muted/off and is transmitted in real time through the configured provider. No camera, video call or voice-message feature is promised. Do not record, transcribe or broadcast another person without a valid legal basis and required consent. Leave, mute, block or report when needed. Technical controls reduce risk but cannot prevent a recipient from using another device to capture content.

9. Moderation, Reports and Appeals
Blumi may use automated signals and human review to investigate content or conduct, reduce distribution, remove content, limit features, suspend or terminate accounts, preserve evidence and make legally required reports. We do not promise to monitor every interaction or prevent every violation. Enforcement considers severity, context, recurrence, credible risk, law and platform requirements. Except where notice would create risk or is legally restricted, we will provide a meaningful reason for material enforcement and a route to appeal through support. Repeated or severe abuse may lead to permanent removal without a prior warning.

10. Intellectual Property
Blumi software, authored avatars, animations, room art, logos, interfaces, text and other service materials are owned by or licensed to the service provider and protected by law. Subject to these Terms, you receive a limited, personal, revocable, non-exclusive, non-transferable license to use the app for its intended purpose. No source code, trademark, asset or commercial-use right is transferred. Valid infringement notices and counter-notices may be sent to the legal contact with sufficient identification and supporting detail.

11. Coins, Virtual Items and Store Purchases
Blumi may offer consumable coin packs through Apple App Store or Google Play. Coins and virtual items are contractual, non-transferable features usable only inside Blumi; they are not money, deposits or securities, have no cash-redemption value and may be used only for eligible Blumi items. This description does not remove their mandatory legal treatment as digital content or service, or any mandatory consumer right. Prices, taxes, currency and required pre-contract information are shown by the store before purchase. The store processes payment; RevenueCat and Blumi verify the transaction.

We do not promise a consumer-facing purchase-restoration flow for consumable coin packs. Signing back into the same Blumi account restores the server wallet balance. If a verified store refund, revocation, chargeback or reversal occurs, Blumi may reverse only the coins credited by that transaction. If some were already spent, the wallet may become negative and further coin spending may be disabled; this accounting adjustment is not an independently collected money debt. Already owned cosmetic or room items are not removed solely because of a negative balance unless law, fraud correction or a clear transaction reversal requires otherwise.

Virtual items may be modified or retired where reasonably necessary for security, law, infringement, platform requirements or service operation. For a material adverse change to paid content, we provide reasonable advance notice where practicable and any replacement, refund or other remedy required by law. We do not arbitrarily confiscate paid content. No recurring subscription exists unless it is separately and conspicuously offered with price, period, renewal, cancellation and required pre-contract disclosures.

12. Refunds, Withdrawal and Mandatory Consumer Rights
Store billing and refund requests are generally administered under Apple or Google procedures, but those procedures do not remove rights granted by mandatory law. A statutory withdrawal right for immediately supplied digital content may be lost only when the legally required prior consent and acknowledgment were actually obtained; these Terms do not manufacture that consent. Defective, misdescribed or undelivered digital content remains subject to applicable remedies. Nothing in these Terms limits mandatory consumer rights, statutory warranties, regulator access, consumer arbitration committee rights or access to competent courts.

13. Account Deletion, Suspension and Termination
You may stop using Blumi and delete your account from Settings after fresh one-time-code confirmation. Account deletion and any future subscription cancellation must not be made materially harder than sign-up and are handled within legally required timeframes. Deletion consequences and lawful retention are described in the Privacy Notice.

We may suspend or terminate access for a material or repeated breach, credible safety risk, fraud, legal/platform requirement or threat to the service. When proportionate, we may use a warning or narrower restriction first. Terms that by nature should survive—such as accrued payment records, intellectual property, lawful content licenses, dispute terms and liability rules—survive termination.

14. Service Changes and Availability
We may maintain, secure, improve, add, remove or discontinue features. We will provide reasonable notice of a material adverse change when practicable and any remedy required by law. We do not promise uninterrupted or error-free availability; outages, device limits and provider failures can occur. We will not use this clause to avoid performing a paid obligation or to make an unfair unilateral change.

15. Third-Party Services
Blumi relies on app stores, SMS, push, live-audio, analytics, diagnostics and infrastructure providers. Their own terms may apply to their direct relationship with you. We are responsible for selecting and governing processors as required by law, but we do not control an app store, carrier or platform acting independently. External links are not endorsements. The Privacy Notice identifies data roles and transfers.

16. Disclaimers
To the extent permitted by law, Blumi is supplied with reasonable care but without a promise that a match will be suitable, that another user is truthful, or that every harmful act will be detected. Any "as available" limitation is subject to statutory conformity, consumer and digital-content guarantees. Nothing excludes an express promise stated at purchase or a duty that cannot lawfully be excluded.

17. Limitation of Liability
Liability is not excluded or limited for fraud, willful misconduct, gross negligence, death or personal injury caused by fault, unlawful personal-data processing, breach of confidentiality, mandatory product/consumer liability, or any other liability that applicable law does not allow to be excluded. Otherwise, to the maximum extent lawful, neither party is liable for loss that was not a reasonably foreseeable and direct result of its breach, including indirect loss caused by another user, an independent platform or an event outside reasonable control. Nothing here prevents injunctive relief or statutory complaints.

18. Limited Indemnity
To the extent lawful, and only to the extent caused by your intentional or grossly negligent unlawful use, infringement of a third party's rights or intentional breach of Sections 5–6, you are responsible for a final or mutually approved third-party claim and reasonable direct loss. We must give prompt notice, allow reasonable participation in the defense and may not settle an obligation admitting your fault without consent. This clause does not require advance defense funding, does not cover our fault, does not shift non-waivable duties and does not reduce mandatory consumer rights.

19. Governing Law and Disputes
These Terms are governed by the laws of the Republic of Türkiye, without depriving a consumer of mandatory protections of their habitual residence. Before litigation, contact ${LEGAL_OPERATOR_IDENTITY.legalContact} so we can try to resolve the issue, but this is not a mandatory barrier to urgent relief, a regulator or a statutory consumer remedy. Turkish consumer arbitration committees and consumer courts have jurisdiction where their statutory thresholds and rules apply; any court-of-residence or other venue right that cannot be waived remains available. No hidden mandatory arbitration or class-action waiver is created by these Terms.

20. General Terms
If a clause is invalid, it is narrowed or severed only as necessary and the rest remains effective. A delay in enforcement is not a waiver. You may not assign an account; we may assign the agreement as part of a lawful reorganization or transfer with required notice and without reducing consumer rights. The Turkish version controls to the extent of a conflict, without overriding mandatory law or the rights of a consumer who received a required local-language disclosure. These Terms, the incorporated purchase disclosure and referenced policies form the entire agreement for the covered service.

21. Changes, Notices and Contact
Material changes will receive reasonable advance notice when required. A change needing consent will not be imposed by silence. The current version and prior material versions are available through the support page. Legal notices: ${LEGAL_OPERATOR_IDENTITY.legalContact}. Support: ${LEGAL_OPERATOR_IDENTITY.supportUrl}. These Terms take effect on the effective date shown above for users who accept that version.`
  },
  guidelines: {
    title: "Community Guidelines",
    version: LEGAL_DOCUMENT_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    status: "effective",
    body: `Blumi Community Guidelines
Version: ${LEGAL_DOCUMENT_VERSION}
Effective date: ${LEGAL_EFFECTIVE_DATE}

These rules apply to profiles, prompts, messages, shared rooms, live audio, reports and conduct connected to Blumi. Context matters, but safety does not depend on clever wording or moving abuse off-platform.

Adults Only
• You must be 18 or older. Do not create or operate an account for a minor.
• Never solicit, sexualize, groom, exploit or endanger a minor.
• Child sexual abuse material, including synthetic or illustrated sexual exploitation, results in immediate removal, preservation where legally required and reporting to competent authorities.

Consent and Sexual Safety
• No sexual threat, coercion, extortion, non-consensual explicit content or pressure after a boundary is stated.
• Consent must be freely given, specific, informed, current and reversible. A match, prior message or room acceptance is not consent to sexual conduct.
• Do not record, transcribe, screenshot for abuse, or rebroadcast private messages or live audio without lawful authority and any required consent.

Respect and Inclusion
• No harassment, stalking, bullying, threats, hate speech or degrading attacks.
• Do not target people based on race, ethnicity, nationality, religion, disability, sex, gender identity, sexual orientation or another protected trait.
• A rejection is final. Do not evade a block or use another account to continue contact.

Authenticity and Privacy
• Do not impersonate a real person, organization, moderator or public figure.
• Keep age and material profile facts accurate; avatars are expressive but cannot be used to deceive or defraud.
• No doxxing: never publish another person's address, phone, workplace, precise location, financial data, login information, intimate material or other private information.
• Do not scrape profiles, build external identity databases or attempt to identify anonymous users.

Fraud and Commercial Abuse
• No scams, phishing, romance fraud, money requests, investment schemes, spam, paid sexual services, trafficking, unauthorized sales or repetitive commercial solicitation.
• Never ask for an OTP, password, payment credential, gift card, crypto transfer or account access.
• Do not manipulate purchases, refunds, rewards, matching or reports.

Violence, Crime and Self-Harm
• No credible threats, glorification or coordination of violent wrongdoing, trafficking, illegal drugs, weapons sales or other illegal activity.
• Do not encourage self-harm or suicide. If someone appears in immediate danger, contact local emergency services; Blumi is not an emergency service.

Room and Audio Etiquette
• A shared room is mutual. Do not pressure someone to enter, stay, speak or turn on audio.
• Live audio starts muted/off. Respect silence, leave requests and accessibility needs.
• No disruptive noise, sexual audio, hate, threats, unlawful recording or attempts to capture another person's environment.

Report, Block and Evidence
• Use report on the relevant profile or chat and block when contact should stop.
• Give accurate context; knowingly false or retaliatory reports violate these rules.
• Reports are access-restricted but not absolutely confidential. We may share the minimum necessary information for review, appeal, safety or law.
• Preserve your own evidence safely, but do not repost harmful or illegal content.

Enforcement and Appeal
Blumi may warn, remove content, reduce visibility, limit features, suspend or permanently remove an account, preserve evidence, or notify authorities where law or credible danger requires. Severity, context, recurrence and risk affect the response. We cannot review every interaction in advance. Except where notice creates risk or is legally restricted, a materially affected user may request the reason and appeal through ${LEGAL_OPERATOR_IDENTITY.supportUrl}. Emergency danger should go to local emergency services, not only to an in-app report.`
  }
})

const TR: Readonly<Record<LegalContentType, LegalContent>> = Object.freeze({
  privacy: {
    title: "Gizlilik ve KVKK Aydınlatma Metni",
    version: LEGAL_DOCUMENT_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE_TR,
    status: "effective",
    body: `Blumi Gizlilik ve KVKK Aydınlatma Metni
Sürüm: ${LEGAL_DOCUMENT_VERSION}
Yürürlük tarihi: ${LEGAL_EFFECTIVE_DATE_TR}

1. Veri Sorumlusu ve İletişim
Veri sorumlusu: ${LEGAL_OPERATOR_IDENTITY.legalName}
Kayıtlı adres: ${LEGAL_OPERATOR_IDENTITY.registeredAddress}
Gizlilik iletişimi: ${LEGAL_OPERATOR_IDENTITY.privacyContact}
Destek sayfası: ${LEGAL_OPERATOR_IDENTITY.supportUrl}

Yukarıda adı yazılı kişi veya kuruluş, Blumi kapsamındaki kişisel verilerin hangi amaç ve yöntemlerle işlendiğini belirler. Aşağıdaki hizmet sağlayıcılar tanımlı görevleri için veri işler; kendi koşulları veya kanun uyarınca bağımsız veri sorumlusu oldukları hâller saklıdır.

2. Kapsam; Aydınlatma ile Rızanın Ayrılığı
Bu metin Blumi mobil uygulaması, sunucu API'leri, destek ve güvenlik faaliyetlerindeki veri işleme süreçlerini açıklar. 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi ve uygulanıyorsa GDPR 13–14. maddeler kapsamında bir aydınlatma metnidir; açık rıza talebi değildir ve sözleşme olarak “kabul edilmez”. Kullanım Koşulları kabulü, isteğe bağlı analitik izni, pazarlama izni ve özel nitelikli veri için gerekebilecek açık rıza ayrı ayrı sunulur. İsteğe bağlı bir rızayı vermemek, ilgisiz temel işlevleri engellemez.

3. İşlediğimiz Veri Kategorileri
Hesap ve doğrulama: telefon numarası, tek kullanımlık kod talebi ve doğrulama durumu, hesap/kullanıcı kimlikleri, oturum ve güvenlik kayıtları, dil, zaman damgaları ve hesap durumu. Blumi telefon rehberine ihtiyaç duymaz.

Profil ve keşif: görünen ad, yaş, biyografi, paylaşmayı seçtiğin kimlik/cinsiyet alanları, keşif yaş ve cinsiyet tercihleri, ilgi alanları, profil sorularına yanıtlar, avatar ve gardırop seçimleri, profil tamamlama durumu ve sağlamayı seçtiğin konum koordinatları veya konum bilgisi. Kesin konumun diğer kullanıcılara gösterilmez.

Etkileşim ve kullanıcı içeriği: keşif kararları, beğeniler, karşılıklı eşleşmeler, engeller, tepkiler, özel yazılı mesajlar, oda davetleri ve kararları, oda sohbeti, oda düzeni/dekoru ile destek, güvenlik bildirimi veya itiraz kapsamında iletilen içerik ve bağlam.

Güvenlik ve bütünlük: bildirim nedeni ve açıklaması, bildirilen hesap/içerik kimlikleri, moderasyon kararları, yaptırım geçmişi, dolandırıcılık ve kötüye kullanım sinyalleri, hız sınırı olayları, IP adresi, cihaz/uygulama bilgisi, giriş denemeleri ve ilgili sunucu günlükleri. Bildirimlere erişim kısıtlıdır; mutlak gizlilik sözü verilmez ve inceleme, savunma hakkı veya kanun gerektiğinde paylaşılabilir.

Satın alma ve sanal ekonomi: mağaza ürünü, mağazada gösterilen fiyat/para birimi, işlem ve ilk işlem kimlikleri, satın alma/iade/iptal durumu, RevenueCat uygulama-kullanıcı kimliği, jeton bakiyesi ve borcu, cüzdan defteri, sahip olunan sanal öğeler ve ödül geçmişi. Tam ödeme kartı bilgisini almayız veya saklamayız.

Cihaz, bildirim ve tanı: işletim sistemi ve uygulama sürümü, cihaz/push belirteci, bildirim tercihleri ve teslim durumu. Yapılandırıldığında, gizliliği azaltılmış çökme/performans tanısı teknik yığın, ekran/özellik etiketi, cihaz sınıfı ve zamanlama içerebilir; ancak Sentry varsayılan kişisel veriyi, ekran görüntüsünü, görünüm ağacını, profil içeriğini veya mesaj gövdesini göndermeyecek şekilde yapılandırılmıştır.

İsteğe bağlı ürün analitiği: yalnız ayrı onayın sonrasında, sınırlı ve izin listeli ürün-etkileşim olayları PostHog'a gönderilebilir. Analitik politikası ad, telefon, mesaj gövdesi, profil metni, URL, konum, doğrulama kodu ve tokenları dışlar; oturum tekrarı ve otomatik kişi profilleri kapalıdır.

4. Kaynak ve Toplama Yöntemleri
Verileri doğrudan senden; Blumi kullanımından; eşleşme, mesaj, oda, engel veya bildirimin diğer katılımcısından; satın alma doğrulaması için Apple App Store, Google Play ve RevenueCat'ten; SMS teslim/doğrulama verisi için Twilio'dan; anlık bildirim teslimi için Expo, Apple Push Notification service veya Firebase Cloud Messaging'den; gerçek zamanlı oda bağlantısı için LiveKit'ten; etkinleştirilmiş güvenlik, analitik ve tanı sağlayıcılarından alırız. Veri simsarı profili satın almayız.

5. Amaçlar ve Hukuki Sebepler
Sözleşmenin kurulması veya ifası: hesabı oluşturmak ve korumak; telefonla doğrulamak; profil, keşif, eşleştirme, kalıcı yazılı sohbet, kabul edilmiş ortak oda, envanter, satın alma, destek, dışa aktarma ve silme işlevlerini sağlamak; sunucu tarafından yönetilen cüzdanı doğru tutmak.

Hukuki yükümlülük: tüketici, muhasebe, vergi, platform, güvenlik ve düzenleyici yükümlülüklere uymak; zorunlu işlem/talep kayıtlarını tutmak; bağlayıcı yetkili makam taleplerini karşılamak.

Gerekli olduğunda dengeleme testiyle meşru menfaat: dolandırıcılık, spam, taciz ve hesap ele geçirmeyi önlemek; bildirimleri incelemek; kuralları uygulamak; erişilebilirliği sürdürmek; gizliliği azaltılmış hataları teşhis etmek; hukuki hakları korumak ve hizmet güvenilirliğini artırmak. Kanunun tanıdığı hâllerde itiraz edebilirsin.

Ayrı rıza: isteğe bağlı PostHog ürün analitiği; ileride sunulursa elektronik pazarlama; rızanın hukuki sebep olduğu cihaz izinleri; kanunen açık rıza gereken özel nitelikli veri işleme veya çıkarımlar. Rızanın geri alınması ileriye etkili olur; önceki hukuka uygun işlemleri geçersiz kılmaz.

Talep edilen hizmet için nesnel olarak gerekli olmayan bir işleme “sözleşme” hukuki sebebi verilmez. Her işleme faaliyeti belgelenmiş bir hukuki sebeple ve o amaç için makul ölçüde gerekli veriyle sınırlandırılır.

6. Cinsiyet Tercihleri ve Hassas Çıkarım Riski
Cinsiyet bilgisi ve keşfetmeyi seçtiğin kişiler, bağlama göre cinsel hayat veya cinsel yönelim hakkında çıkarım yapılmasına imkân verebilir; bunlar uygulanabilir hukukta özel nitelikli kişisel veri olabilir. Blumi böyle bir çıkarımı reklam, satış, kredi, işe alım, hesap uygunluğu veya ilgisiz profilleme için kullanamaz. Başka bir hukuki sebep yoksa, özel nitelikli işleme etkinleşmeden önce belirli, bilgilendirilmiş ve ayrı kaydedilmiş açık rıza alınmalıdır. Keşif tercihlerini değiştirebilir veya bu rızayı geri alabilir; ilgisiz hesap işlevlerin devam eder. Profil veya mesajlara gereksiz sağlık, din, siyasi düşünce, biyometri, mahkûmiyet ya da başka hassas bilgi koyma.

7. Eşleştirme, Öneriler ve Otomatik İşleme
Blumi; yaş aralığı, seçilen cinsiyetler, engeller, önceki kararlar, uygunluk, etkinlik veya güvenlik kısıtları ve hizmette açıklanan diğer ürün sinyalleriyle keşif adaylarını filtreleyip sıralar. Eşleşme yalnız karşılıklı ilgiyle oluşur. Bu öneriler kimlik, niyet, uyumluluk veya güvenlik garantisi değildir ve hukuki ya da benzer ölçüde önemli sonuç doğurmak üzere tasarlanmamıştır. Mevcut keşif tercihlerini değiştirebilir; uygulanabilir otomatik işleme hakkında bilgi isteyebilir veya kanunun tanıdığı ölçüde itiraz edebilirsin.

8. Mesajlar, Ortak Odalar ve Canlı Ses
Özel yazılı mesajlar; eşleşen kullanıcıların konuşmaya erişebilmesi ve güvenlik, dışa aktarma, silme işlevleri için saklanır. Alıcı içeriği kopyalayabilir, kaydedebilir veya açıklayabilir; kontrolünü kaybetmenin güvenli olmayacağı bilgiyi paylaşma.

Ortak bir odaya katıldığında yazılı sohbet kullanabilirsin. Canlı sesi açmayı seçersen ses LiveKit üzerinden diğer katılımcıya gerçek zamanlı iletilir. Blumi kamera erişimi istemez; canlı ses içeriğini kaydetmez veya saklamaz. LiveKit ve ağ işletmecileri oturumu iletmek ve güvenli tutmak için geçici medya paketleri ile bağlantı meta verisini işleyebilir. Katılımcılar geçerli hukuki sebep ve gerekli rıza olmadan başkasının sesini kaydedemez, yazıya dökemez veya yeniden yayımlayamaz.

9. Güvenlik Bildirimleri ve Hukuki Talepler
Kullanıcıları korumak, şüpheli ihlalleri araştırmak, tekrar eden kötüye kullanımı önlemek ve kanuna uymak için engelleri, bildirimleri, ilgili içerik/bağlamı, moderasyon kararlarını ve sınırlı teknik kanıtı işleriz. Erişim, bilmesi gereken yetkili kişi ve sağlayıcılarla sınırlıdır. Aktif inceleme, hukuki talep veya bağlayıcı karar için belirli kanıtı makul süre koruyup amaç ve zorunlu saklama süresi sona erdiğinde siler ya da anonimleştiririz. Kanun gerektiriyorsa veya inandırıcı yakın tehlikeyi önlemek için makul biçimde gerekliyse yetkili makamlara/acil servislere bildirim yapabiliriz; Blumi acil yardım hizmeti değildir.

10. Anlık Bildirimler
Cihaz izni verir ve push belirtecini kaydedersen Blumi, etkinleştirdiğin bildirim türlerini iletmek için Expo Push Service, Apple Push Notification service ve/veya Firebase Cloud Messaging kullanır. Bildirim içeriği ve belirteç ilgili servislerden geçer; cihaz ayarlarına göre kilit ekranında önizleme görünebilir. Beğeni, eşleşme, mesaj ve keşif izleme bildirimlerinin ayrı uygulama içi kontrolleri vardır. Operasyonel/güvenlik bildirimleri pazarlamadan ayrıdır. Uygulama tercihini veya cihaz iznini dilediğin zaman değiştirebilirsin.

11. Satın Almalar
Blumi, yerel jeton satın alımlarını sunmak, işlemek ve doğrulamak için RevenueCat ile ilgili Apple veya Google mağazasını kullanır. RevenueCat; doğrulama için gerekli mağaza işlemi, ürün, satın alma geçmişi ve uygulama hesap kimliğini alır. Blumi, çift kredi vermeyi önlemek, iadeleri işlemek ve jeton bakiyesini çalıştırmak için işlem, olay ve cüzdan-defteri kayıtlarını saklar. Ödeme bilgileri mağaza/ödeme sağlayıcısında kalır.

12. Alıcılar ve Hizmet Sağlayıcılar
Alıcılar şunlar olabilir: bilerek profil, mesaj, oda etkileşimi veya canlı ses paylaştığın diğer kullanıcılar; tek kullanımlık SMS için Twilio ve telekom işletmecileri; canlı ses bağlantısı için LiveKit; anlık bildirim için Expo, Apple ve Google; uygulama içi satın alma için RevenueCat, Apple ve Google; ayrı onay verilmiş analitik için PostHog; gizliliği azaltılmış tanı için Sentry; sözleşmeli barındırma, veritabanı ve altyapı sağlayıcıları; sır saklama yükümlülüğündeki profesyonel danışmanlar; hukuka uygun bildirim ve güvenceye tabi şirket devralanları; kanunen gerekliyse yetkili makamlar.

Hizmet sağlayıcıların rolleri ve önemli değişiklikler bu metne veya destek sayfasına yansıtılır. SMS katılım ve doğrulama rıza kayıtları üçüncü taraf pazarlaması için satılmaz, kiralanmaz veya paylaşılmaz.

13. Yurt Dışına Aktarım
Adı geçen bazı teknoloji sağlayıcıları veriyi Türkiye veya yaşadığın ülke dışında işleyebilir. Aktarım yalnız uygulanabilir KVKK 9. madde mekanizması ve gerekiyorsa diğer aktarım güvenceleriyle, sağlayıcı incelemesi tamamlanarak ve gerekli ek güvenlik önlemleri alınarak yapılır. Yeterlilik kararı, onaylı standart sözleşme, bağlayıcı şirket kuralları veya kanuni istisnai aktarım kullanılabilir. Uygulanabilir aktarım şartını karşılayamayan entegrasyon, etkilenen veri için etkinleştirilmez.

14. Diğer Kullanıcıların Gördüğü Bilgiler
Keşif/profil alanları görünen adını, yaşını, biyografini, göstermeyi seçtiğin kimlik alanlarını, ilgi ve yanıtlarını, avatarını gösterebilir. Eşleşme, ona gönderdiğin mesajı ve oda etkinliğini görür. Telefon numaran, kesin konumun, raporların ve özel mesajların herkese açık profilde gösterilmez. Güvenlik günlükleri ve tam satın alma kayıtları da özeldir. Engelleme gelecekteki teması sınırlar; alıcının daha önce hukuka uygun aldığı veya kaydettiği kopyaları silemez.

15. Saklama ve Silme Ölçütleri
Hesap/profil verisi hesap aktifken tutulur; doğrulanmış plan ve hukuki muhafaza saklı olmak üzere ihtiyaç kalmadığında silinir veya anonimleştirilir. Mesaj, eşleşme, oda, cihaz belirteci, keşif kararı ve aktif sanal ekonomi kaydı, daha dar bir güvenlik/hukuk ihtiyacı yoksa hesap yaşam döngüsünü izler. OTP sırları ve doğrulama talepleri kısa ömürlüdür; güvenlik/hız sınırı günlükleri belgeli kötüye kullanım penceresi kadar tutulur. İsteğe bağlı analitik, sağlayıcının yapılandırılmış saklama süresine uyar ve ret sonrası bağlantısı kesilir. Çökme tanıları yapılandırılmış tanı süresine uyar. Satın alma, muhasebe, iade ve dolandırıcılık kayıtları ayrıştırılarak zorunlu kanuni sürelerde saklanabilir. Yedeklere erişim kısıtlıdır ve silme sonrasında olağan ürün kullanımı için geri yüklenmek yerine belgeli döngü sonunda sona erer.

Saklama; işleme amacı, hesap yaşam döngüsü, güvenlik ihtiyacı, zamanaşımı süreleri ile zorunlu muhasebe, vergi, tüketici, platform ve düzenleyici yükümlülüklerle sınırlıdır. Uygulanabilir süre sonunda, hukuki muhafaza yoksa veri güvenli biçimde silinir, yok edilir veya anonimleştirilir. Güncel kategori bazlı saklama bilgisini gizlilik iletişiminden isteyebilirsin.

16. Güvenlik ve İhlal Müdahalesi
Blumi; şifreli taşıma, uygun yerlerde hash'lenmiş oturum/doğrulama sırları, rol/erişim kısıtları, ortam değişkenli sır yönetimi, hız sınırları, sağlayıcı kontrolleri, günlükleme ve test edilmiş hesap işlemi doğrulaması gibi riske uygun önlemler uygular. Hiçbir sistem mutlak güvenli değildir. Kişisel veri ihlalinde veri sorumlusu olayı sınırlar ve değerlendirir, kanıtı korur; bildirim yükümlülüğü doğduğunda öğrendiği tarihten itibaren gecikmeksizin ve en geç 72 saat içinde Kişisel Verileri Koruma Kurulu'na, makul olan en kısa sürede etkilenen kişilere bildirim yapar. Hesap ele geçirilmesinden şüphelenirsen gecikmeden iletişime geç.

17. Hakların
KVKK 11. madde koşulları çerçevesinde kişisel verinin işlenip işlenmediğini öğrenme; işlenmişse bilgi isteme; amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme; yurt içi/yurt dışı alıcıları bilme; düzeltme; silme/yok etme; düzeltme/silmenin alıcılara bildirilmesini isteme; münhasıran otomatik analizle aleyhine çıkan sonuca itiraz etme ve kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme hakların vardır.

GDPR veya başka hukuk uygulanıyorsa erişim, düzeltme, silme, kısıtlama, taşınabilirlik, itiraz, rızayı geri alma ve denetim makamına şikâyet hakların da olabilir. Haklar mutlak değildir; kimlik doğrulayabilir, hukuka uygun ret gerekçesini açıklayabilir ve talebi belgeleme/kanuna uyma için asgari veriyi saklayabiliriz.

18. Hak Kullanımı, Dışa Aktarım ve Hesap Silme
Ayarlar'dan giriş telefonuna gönderilen yeni tek kullanımlık kodu doğruladıktan sonra hesap verisi dışa aktarımı isteyebilir veya hesabını silebilirsin. Aktif silme akışı; kanunen ayrıştırılıp saklanması gereken veya belgeli hukuki muhafazaya giren bilgi dışında aktif hesap, profil, oturum, mesaj, eşleşme, oda, ekonomi, güvenlik ve push kayıtlarını kaldırır. Dondurma veya devre dışı bırakma, silme olarak sunulmaz.

Gizlilik adresine, kayıtlı adrese veya veri sorumlusunun ilan ettiği başka bir doğrulanmış başvuru kanalına imzalı ya da hukuken geçerli taleple başvurabilirsin. Hesabı bulmaya ve hakkı belirlemeye yetecek bilgi ver; parola veya OTP gönderme. Başvuruyu en kısa sürede ve en geç 30 gün içinde kanuni usule göre yanıtlarız. Veri sorumlusuna başvurudan sonra uygulanabilir kanuni sürede Kişisel Verileri Koruma Kurulu'na veya başka yetkili makama şikâyet edebilirsin.

19. Çocuklar
Blumi yalnız 18 yaş ve üzeri kişiler içindir ve çocuklara pazarlanamaz. Yaş beyanı, mağaza/platform yaş araçları, bildirimler ve ölçülü kontroller kullanılabilir. Hesabın reşit olmayana ait olduğunu makul biçimde belirlersek erişimi askıya alır, güvenlik ve uyum için gereken asgari kanıtı hukuka uygun biçimde saklar ve kalan veriyi sileriz. Şüpheli reşit olmayan kullanımı uygulama içi bildirim aracı veya destek sayfasından bildir.

20. Satış, Hassas Reklam ve Gizli Takip Yoktur
Blumi kişisel veriyi satmaz/kiralamaz; SMS katılım bilgisini üçüncü taraf pazarlamasıyla paylaşmaz; özel mesaj, kesin konum veya hassas çıkarımı davranışsal reklam için kullanmaz. Açıklanan uygulamada üçüncü taraf reklam takibi etkin değildir. Gelecekte reklam veya esaslı farklı takip düşünülürse yeni değerlendirme, güncel metin ve kanun/platformun istediği ayrı tercihler gerekir.

21. Değişiklikler
Hukuk, sağlayıcı veya ürün değişikliğini yansıtmak için metin güncellenebilir. Sürüm ve yürürlük tarihi değişir; önemli değişiklikler gerektiğinde yürürlükten önce sunulur. Hukuki sebep rızaysa yeni rıza istenir; sessizlik veya kullanıma devam açık rıza sayılmaz. Eski sürümler ve değişiklik özeti destek sayfasında erişilebilir tutulmalıdır.

22. İletişim
Gizlilik başvuruları: ${LEGAL_OPERATOR_IDENTITY.privacyContact}
Hukuki bildirimler: ${LEGAL_OPERATOR_IDENTITY.legalContact}
Destek sayfası ve gizlilik tercihleri: ${LEGAL_OPERATOR_IDENTITY.supportUrl}
Veri sorumlusu adresi: ${LEGAL_OPERATOR_IDENTITY.registeredAddress}

E-postaya parola, tek kullanımlık kod, ödeme kartı verisi veya gereksiz hassas bilgi ekleme.`
  },
  terms: {
    title: "Kullanım Koşulları",
    version: LEGAL_DOCUMENT_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE_TR,
    status: "effective",
    body: `Blumi Kullanım Koşulları
Sürüm: ${LEGAL_DOCUMENT_VERSION}
Yürürlük tarihi: ${LEGAL_EFFECTIVE_DATE_TR}

Hizmet sağlayıcı ve sözleşme tarafı: ${LEGAL_OPERATOR_IDENTITY.legalName}
Kayıtlı adres: ${LEGAL_OPERATOR_IDENTITY.registeredAddress}
Hukuki iletişim: ${LEGAL_OPERATOR_IDENTITY.legalContact}

1. Sözleşme ve Gizlilik Metni
Bu Koşullar Blumi kullanımına ilişkin sözleşmeyi oluşturur. Kullanım Koşulları kutusunu seçip hesap oluşturmayı tamamlayarak kabul edersin. Gizlilik/KVKK Aydınlatma Metni bilgi ve bildirim içindir; rıza olarak bu sözleşmeye paketlenmez. İsteğe bağlı analitik, pazarlama ve kanunen gerekebilecek özel nitelikli veri rızası ayrı tercihlerdir. Koşulları kabul etmiyorsan hesap oluşturma veya kullanma.

2. Uygunluk ve Yaş
En az 18 yaşında, bu sözleşmeyi kurabilecek ehliyette ve hizmeti kullanması yasaklanmamış olmalısın. Yaşını doğru bildirmeli; reşit olmayan adına hesap açmamalısın. Blumi ölçülü yaş güvencesi uygulayabilir, hukuka uygun ek doğrulama isteyebilir, incelemede hesabı kısıtlayabilir ve reşit olmayan hesapları kaldırabilir. Önceki yasağı yazılı izin olmadan aşamazsın.

3. Hesap ve Doğrulama
Bir kişi yalnız hizmetin izin verdiği sayıda hesabı yönetebilir. Cihazını ve SMS erişimini koru; tek kullanımlık kodu paylaşma. Yetkilendirdiğin faaliyetten sorumlusun ve şüpheli ele geçirmeyi hemen bildirmelisin. Hesabı satamaz, devredemez, kiralayamaz, otomatikleştiremez veya başkasını taklit edemezsin. Hassas hesap işlemlerinde yeniden doğrulama istenebilir. Telefon doğrulaması yalnız o anda numaranın kontrolünü gösterir; kimlik, geçmiş, niyet veya güvenlik doğrulaması değildir.

4. Hizmetin Kapsamı
Blumi anonimlik öncelikli sosyal keşif hizmetidir. Avatar tabanlı profil, keşif tercihi, karşılıklı ilgiyle eşleşme, kalıcı yazılı sohbet, sohbetten başlatılan ve kabul edilen isteğe bağlı ortak oda, oda düzenleme, başlangıçta sessiz/kapalı isteğe bağlı canlı ses, güvenlik araçları ve sanal öğeler sunar. Özellikler cihaz, ülke, hesap durumu veya hukuka uygun güvenlik kısıtına göre değişebilir. Eşleşme veya öneri onay değildir; kimlik, uyumluluk, erişilebilirlik veya sonuç garantisi vermez.

5. Kullanıcı İçeriği ve Lisans
Hukuka uygun oluşturduğun profil metni, yanıt, mesaj, rapor, oda seçimi ve diğer kullanıcı içeriğinin mülkiyeti sende kalır. Hizmeti işletmek, korumak, moderasyon yapmak, iyileştirmek ve hukuken savunmak için makul ölçüde gerekli olmak üzere; barındırma, saklama, çoğaltma, iletme, biçimlendirme ve gösterme için dünya çapında, münhasır olmayan, bedelsiz ve yalnız gerekli sağlayıcılara alt lisanslanabilir bir lisans verirsin. Lisans aktif sistemlerden silmeyle sona erer; alıcı kopyaları, yedek, hukuki muhafaza ve Gizlilik Metni'ndeki kanuni saklama istisnadır.

İçeriği sunmak için gerekli hakka sahip olduğunu ve içeriğin kanun, gizlilik, kişilik, fikri mülkiyet veya sözleşme hakkını ihlal etmediğini beyan edersin. Yetkisiz özel bilgi veya telifli eser paylaşma. Bildirim/geri bildirim güvenlik ve ürün iyileştirmesinde kullanılabilir; geri bildirim için ücret doğmaz ama özel içeriğindeki hakkımız burada yazanı aşmaz.

6. Yasak Davranış ve İçerik
Şunlar yasaktır: 18 yaş altı kullanım; çocuğu cinsel olarak istismar veya tehlikeye atma, reşit olmayana cinsel yaklaşım, çocukların cinsel istismarı materyali; tehdit, takip, taciz, nefret veya ayrımcılık; rıza dışı cinsel içerik ve yakınlık/para baskısı; taklit, dolandırıcılık, phishing, spam veya ticari taciz; kişisel bilgi ifşası/doxxing; insan ticareti, yasa dışı uyuşturucu, silah veya şiddet eylemi; kendine zararı teşvik; canlı sesi hukuka aykırı kayıt/yayın; profil kazıma veya kimlik veri tabanı kurma; kanunun izin verdiği istisna dışında tersine mühendislik; engel, yaş/güvenlik kontrolü, hız veya erişim sınırını aşma; zararlı yazılım; ödeme/iade suistimali; eşleştirme manipülasyonu ve her türlü yasa dışı kullanım.

7. Güvenlik ve Yüz Yüze Etkileşim
Blumi herkese yönelik adli sicil, kimlik veya geçmiş kontrolü yapmaz; başkasının beyanını/davranışını garanti edemez. Bildir ve engelle araçlarını kullan, ilk konuşmaları uygulamada tut, finansal ve adres bilgini koru; çevrim dışı veya yüz yüze buluşmaya yalnız güvenli olduğuna kendin karar verdiğinde geç. Güvendiğin birine haber ver, ulaşımını kontrol et ve kamusal yer seç. Blumi acil yardım hizmeti değildir; yakın tehlikede yerel acil servis veya kolluğa ulaş. Kanunen dışlanamayan sorumluluklar saklı olmak üzere, gönüllü buluşma kararından sen sorumlusun.

8. Ortak Oda ve Canlı Ses
Oda yalnız desteklenen davet ve kabul akışıyla başlar. Yazılı sohbet kalıcıdır. Canlı ses isteğe bağlıdır, sessiz/kapalı başlar ve sağlayıcı üzerinden gerçek zamanlı iletilir. Kamera, görüntülü arama veya sesli mesaj özelliği vaat edilmez. Geçerli hukuki sebep ve gerekli rıza olmadan başkasını kaydetme, yazıya dökme veya yayınlama. Gerektiğinde ayrıl, sessize al, engelle veya bildir. Teknik kontroller alıcının başka cihazla kayıt almasını kesin engelleyemez.

9. Moderasyon, Bildirim ve İtiraz
Blumi; otomatik sinyal ve insan incelemesiyle içerik/davranışı araştırabilir, görünürlüğü azaltabilir, içerik kaldırabilir, özelliği sınırlayabilir, hesabı askıya alabilir/sonlandırabilir, kanıt koruyabilir ve kanuni bildirim yapabilir. Her etkileşimi önceden izleme veya her ihlali önleme sözü vermeyiz. Yaptırımda ağırlık, bağlam, tekrar, inandırıcı risk, kanun ve platform koşulları dikkate alınır. Bildirim risk yaratmıyor ve kanunen yasak değilse önemli yaptırımın anlamlı gerekçesi ile destek üzerinden itiraz yolu sağlanır. Ağır veya tekrarlanan ihlal ön uyarı olmadan kalıcı sonuca yol açabilir.

10. Fikri Mülkiyet
Blumi yazılımı, özgün avatarlar, animasyonlar, oda sanatı, logolar, arayüzler, metin ve diğer hizmet materyalleri hizmet sağlayıcıya aittir veya lisanslıdır ve kanunla korunur. Bu Koşullara bağlı olarak yalnız amaçlanan kişisel kullanım için sınırlı, geri alınabilir, münhasır olmayan ve devredilemez lisans alırsın. Kaynak kodu, marka, asset veya ticari kullanım hakkı devredilmez. Geçerli ihlal/karşı bildirim, yeterli kimlik ve dayanakla hukuki iletişime gönderilebilir.

11. Jetonlar, Sanal Öğeler ve Mağaza Satın Almaları
Blumi Apple App Store veya Google Play üzerinden tüketilebilir jeton paketi sunabilir. Jetonlar ve sanal öğeler yalnız Blumi içinde kullanılabilen sözleşmesel, devredilemez özelliklerdir; para, mevduat veya menkul kıymet değildir, nakde çevrilemez ve yalnız uygun Blumi öğelerinde kullanılabilir. Bu nitelendirme, dijital içerik veya hizmete ilişkin emredici hukuki niteliği ve tüketici haklarını kaldırmaz. Fiyat, vergi, para birimi ve zorunlu ön bilgilendirme satın alma öncesi mağazada gösterilir. Ödemeyi mağaza işler; RevenueCat ve Blumi işlemi doğrular.

Tüketilebilir jetonlar için kullanıcıya dönük satın alma geri yükleme akışı vaat etmeyiz. Aynı Blumi hesabına giriş sunucu cüzdan bakiyesini getirir. Doğrulanmış mağaza iadesi, iptali, ters ibraz veya ters kayıt olursa yalnız o işlemle verilen jetonlar geri alınabilir. Bir kısmı harcanmışsa bakiye negatife düşebilir ve jeton harcaması durdurulabilir; bu muhasebe düzeltmesi ayrıca tahsil edilen bir para borcu değildir. Sahip olunan kozmetik/oda öğeleri, kanun, dolandırıcılık düzeltmesi veya açık işlem ters kaydı gerektirmedikçe yalnız negatif bakiye nedeniyle alınmaz.

Sanal öğe güvenlik, hukuk, ihlal, platform şartı veya hizmet işletimi için makul ölçüde gerekirse değiştirilebilir/kaldırılabilir. Ücretli içerikte esaslı olumsuz değişiklik için uygulanabildiğinde makul ön bildirim ve kanunun gerektirdiği ikame, iade veya başka çözüm sağlanır; keyfî el koyma yapılmaz. Yinelenen abonelik ancak fiyat, dönem, yenileme, iptal ve zorunlu ön bilgilendirmeyle ayrıca açıkça sunulursa doğar.

12. İade, Cayma ve Emredici Tüketici Hakları
Mağaza faturalaması ve iade talebi genellikle Apple/Google usulüyle yürür; bu usul emredici tüketici haklarını kaldırmaz. Hemen ifa edilen dijital içerikte kanuni cayma hakkı ancak gerekli ön onay ve kabul gerçekten alındıysa kaybedilebilir; bu Koşullar o onayı varsayımsal olarak yaratmaz. Ayıplı, yanlış tanıtılmış veya teslim edilmemiş dijital içerik kanuni çözümlere tabidir. Hiçbir hüküm emredici tüketici haklarını, kanuni garantiyi, düzenleyici başvuruyu, tüketici hakem heyetini veya yetkili mahkemeye erişimi sınırlamaz.

13. Hesap Silme, Askıya Alma ve Fesih
Blumi'yi kullanmayı bırakabilir ve Ayarlar'da yeni tek kullanımlık kodu doğrulayarak hesabını silebilirsin. Hesap silme ve gelecekteki abonelik iptali kayıttan esaslı biçimde zorlaştırılamaz; kanuni sürede işlenir. Silmenin sonuçları ve kanuni saklama Gizlilik Metni'nde açıklanır.

Esaslı/tekrarlanan ihlal, inandırıcı güvenlik riski, dolandırıcılık, hukuk/platform gereği veya hizmet tehdidinde erişim askıya alınabilir ya da sonlandırılabilir. Ölçülüyse önce uyarı/dar kısıtlama uygulanabilir. Tahakkuk eden ödeme kaydı, fikri mülkiyet, hukuka uygun içerik lisansı, uyuşmazlık ve sorumluluk gibi niteliği gereği sürmesi gereken hükümler fesih sonrası sürer.

14. Hizmet Değişikliği ve Erişilebilirlik
Özellikleri bakım, güvenlik, iyileştirme, ekleme, kaldırma veya sonlandırma amacıyla değiştirebiliriz. Esaslı olumsuz değişiklikte uygulanabilir ve makulse ön bildirim ve kanunun zorunlu kıldığı çözüm sağlanır. Kesintisiz/hatasız erişim sözü verilmez; kesinti, cihaz sınırı ve sağlayıcı arızası olabilir. Bu hüküm ücretli borcu ifadan kaçınmak veya haksız tek taraflı değişiklik yapmak için kullanılamaz.

15. Üçüncü Taraf Hizmetleri
Blumi mağaza, SMS, anlık bildirim, canlı ses, analitik, tanı ve altyapı sağlayıcılarına dayanır. Doğrudan ilişkin için onların koşulları uygulanabilir. İşleyen seçimi ve yönetiminden kanunun istediği ölçüde sorumluyuz; bağımsız hareket eden mağaza, operatör veya platformu kontrol etmeyiz. Dış bağlantı onay değildir. Veri rolleri ve aktarımlar Gizlilik Metni'ndedir.

16. Garantiler Hakkında
Blumi makul özenle sunulur; eşleşmenin uygun, diğer kişinin doğru sözlü veya her zararlı eylemin tespit edileceği vaat edilmez. “Mevcut hâliyle” sınırlaması kanuni uygunluk, tüketici ve dijital içerik garantilerine tabidir. Satın almada açıkça verilen taahhüt veya kanunen dışlanamayan yükümlülük kaldırılmaz.

17. Sorumluluk Sınırı
Hile, kasıt, ağır kusur, kusurdan doğan ölüm/bedensel zarar, hukuka aykırı kişisel veri işleme, gizlilik ihlali, emredici ürün/tüketici sorumluluğu veya kanunen dışlanamayan başka sorumluluk sınırlanmaz. Bunun dışında kanunun izin verdiği azami ölçüde taraflar; ihlalinin makul ölçüde öngörülebilir ve doğrudan sonucu olmayan kayıptan, özellikle başka kullanıcı, bağımsız platform veya makul kontrol dışı olayın neden olduğu dolaylı kayıptan sorumlu değildir. İhtiyati tedbir veya kanuni şikâyet yolu engellenmez.

18. Sınırlı Tazmin
Kanunen mümkün olduğu ve yalnız kasıtlı veya ağır kusurlu yasa dışı kullanımının, üçüncü kişi hakkı ihlalinin ya da 5–6. maddeleri kasıtlı ihlalinin neden olduğu ölçüde; kesinleşmiş veya senin de onayladığın üçüncü kişi talebi ve makul doğrudan zarar için sorumlu olursun. Sana gecikmeden haber verilir, savunmaya makul katılım sağlanır ve onayın olmadan kusur kabul eden uzlaşma yapılamaz. Bu hüküm peşin savunma gideri yüklemez, bizim kusurumuzu kapsamaz, devredilemez yükümlülüğü sana yüklemez ve emredici tüketici hakkını azaltmaz.

19. Uygulanacak Hukuk ve Uyuşmazlık
Koşullara Türkiye Cumhuriyeti hukuku uygulanır; tüketicinin mutad meskenindeki emredici koruma kaldırılmaz. Dava öncesi ${LEGAL_OPERATOR_IDENTITY.legalContact} ile çözüm arayabilirsin; bu, acil tedbir, düzenleyici başvuru veya kanuni tüketici yolu önünde zorunlu engel değildir. Kanuni parasal sınır ve görev kurallarında tüketici hakem heyeti/tüketici mahkemesi; vazgeçilemeyen yerleşim yeri veya diğer yetki kuralları uygulanır. Gizli zorunlu tahkim ya da toplu dava feragati yoktur.

20. Genel Hükümler
Bir hüküm geçersizse yalnız gerektiği kadar daraltılır/ayrılır; kalanı sürer. Uygulamadaki gecikme feragat değildir. Hesabı devredemezsin; biz hukuka uygun yeniden yapılanma/devirde gerekli bildirimi yaparak ve tüketici hakkını azaltmadan sözleşmeyi devredebiliriz. Çelişki hâlinde Türkçe sürüm esas alınır; bu kural emredici hukuku veya kendisine zorunlu yerel dilde açıklama sunulan tüketicinin haklarını kaldırmaz. Bu Koşullar, dahil edilen satın alma açıklaması ve atıf yapılan politikalar kapsamdaki sözleşmenin bütünüdür.

21. Değişiklik, Bildirim ve İletişim
Önemli değişiklik için gerektiğinde makul ön bildirim yapılır. Rıza gerektiren değişiklik sessizlikle dayatılamaz. Güncel ve önceki önemli sürümler destek sayfasında erişilebilir tutulur. Hukuki bildirim: ${LEGAL_OPERATOR_IDENTITY.legalContact}. Destek: ${LEGAL_OPERATOR_IDENTITY.supportUrl}. Bu Koşullar, yukarıdaki sürümü kabul eden kullanıcı için belirtilen yürürlük tarihinde uygulanmaya başlar.`
  },
  guidelines: {
    title: "Topluluk Kuralları",
    version: LEGAL_DOCUMENT_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE_TR,
    status: "effective",
    body: `Blumi Topluluk Kuralları
Sürüm: ${LEGAL_DOCUMENT_VERSION}
Yürürlük tarihi: ${LEGAL_EFFECTIVE_DATE_TR}

Bu kurallar profil, yanıt, mesaj, ortak oda, canlı ses, bildirim ve Blumi bağlantılı davranışlara uygulanır. Bağlam önemlidir; fakat kötüye kullanımı uygulama dışına taşımak veya kelime oyunu yapmak güvenlik kuralını ortadan kaldırmaz.

Yalnız Yetişkinler
• En az 18 yaşında olmalısın; reşit olmayan adına hesap açamazsın.
• Reşit olmayana cinsel yaklaşım, onu cinselleştirme, kandırma, istismar veya tehlikeye atma kesinlikle yasaktır.
• Gerçek, sentetik ya da çizim biçimindeki çocukların cinsel istismarı materyali derhâl kaldırma, kanunen gereken kanıtı koruma ve yetkili makama bildirimle sonuçlanır.

Rıza ve Cinsel Güvenlik
• Cinsel tehdit, baskı, şantaj, rıza dışı açık içerik ve belirtilen sınırdan sonra ısrar yasaktır.
• Rıza özgür, belirli, bilgilendirilmiş, güncel ve geri alınabilir olmalıdır. Eşleşme, önceki mesaj veya oda kabulü cinsel davranışa rıza değildir.
• Geçerli yetki ve gerekli rıza olmadan özel mesajı veya canlı sesi kaydetme, yazıya dökme, kötüye kullanmak için ekran görüntüsü alma ya da yeniden yayımlama.

Saygı ve Kapsayıcılık
• Taciz, ısrarlı takip, zorbalık, tehdit, nefret söylemi ve aşağılayıcı saldırı yasaktır.
• Irk, etnik köken, milliyet, din, engellilik, cinsiyet, cinsiyet kimliği, cinsel yönelim veya korunan başka özellik nedeniyle hedef gösterme.
• Reddedilme nihaidir. Engeli aşma veya başka hesapla temasa devam etme.

Gerçeklik ve Gizlilik
• Gerçek kişiyi, kuruluşu, moderatörü veya kamuya mal olmuş kişiyi taklit etme.
• Yaş ve önemli profil bilgilerini doğru tut; avatar ifade aracıdır, aldatma veya dolandırma aracı değildir.
• Doxxing yasaktır: başkasının adres, telefon, işyeri, kesin konum, finansal veri, giriş bilgisi, mahrem içerik veya diğer kişisel bilgisini yayımlama.
• Profil kazıma, dış kimlik veri tabanı kurma veya anonim kullanıcıyı teşhis etme girişimi yapma.

Dolandırıcılık ve Ticari Kötüye Kullanım
• Dolandırıcılık, phishing, romantik dolandırıcılık, para talebi, yatırım planı, spam, ücretli cinsel hizmet, insan ticareti, izinsiz satış ve tekrarlı ticari taciz yasaktır.
• OTP, parola, ödeme bilgisi, hediye kartı, kripto transferi veya hesap erişimi isteme.
• Satın alma, iade, ödül, eşleştirme veya bildirim sistemini manipüle etme.

Şiddet, Suç ve Kendine Zarar
• İnandırıcı tehdit, şiddet eylemini övme/planlama, insan ticareti, yasa dışı uyuşturucu, silah satışı ve başka suç yasaktır.
• Kendine zarar veya intiharı teşvik etme. Birisi yakın tehlikedeyse yerel acil servise ulaş; Blumi acil yardım hizmeti değildir.

Oda ve Ses Görgüsü
• Ortak oda karşılıklıdır. Birini girmeye, kalmaya, konuşmaya veya sesi açmaya zorlama.
• Canlı ses sessiz/kapalı başlar. Sessizliğe, ayrılma isteğine ve erişilebilirlik ihtiyacına saygı duy.
• Rahatsız edici gürültü, cinsel ses, nefret, tehdit, hukuka aykırı kayıt veya başkasının ortamını yakalama girişimi yasaktır.

Bildir, Engelle ve Kanıt
• İlgili profil veya sohbette bildir aracını; temasın bitmesi gerektiğinde engelleyi kullan.
• Doğru bağlam ver; bilerek yanlış veya misilleme amaçlı bildirim ihlaldir.
• Bildirimlere erişim kısıtlıdır ama mutlak gizli değildir. İnceleme, itiraz, güvenlik veya hukuk için gerekli asgari bilgi paylaşılabilir.
• Kendi kanıtını güvenle koru; zararlı veya yasa dışı içeriği yeniden yayımlama.

Yaptırım ve İtiraz
Blumi uyarı verebilir, içeriği kaldırabilir, görünürlüğü azaltabilir, özelliği sınırlayabilir, hesabı askıya alabilir veya kalıcı kapatabilir, kanıt koruyabilir ve kanun ya da inandırıcı tehlike gerektiriyorsa yetkili makama bildirebilir. Ağırlık, bağlam, tekrar ve risk sonucu etkiler. Her etkileşimi önceden inceleyemeyiz. Bildirim risk yaratmıyor ve kanunen yasak değilse önemli yaptırımdan etkilenen kişi gerekçe isteyebilir ve ${LEGAL_OPERATOR_IDENTITY.supportUrl} üzerinden itiraz edebilir. Acil tehlikeyi yalnız uygulama içi bildirimle bırakma; yerel acil servise ulaş.`
  }
})

const COPY: Readonly<Record<AppLocale, Readonly<Record<LegalContentType, LegalContent>>>> = Object.freeze({
  en: EN,
  tr: TR
})

export function getLegalContent(locale: AppLocale, type: LegalContentType): LegalContent {
  return COPY[locale][type]
}

export function getAllLegalContent(): typeof COPY {
  return COPY
}
