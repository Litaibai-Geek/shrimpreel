// 英文文案。所有关键词/品牌通过 site 配置插值，上新词时通常只需改 site.ts；
// 文章与 FAQ 建议按新趋势重写，保证内容原创、贴合关键词。
import type { ArticleKey, site as Site } from '#/config/site'

type S = typeof Site
type StyleId = S['styles'][number]['id']
type StyleCopy = { name: string; tagline: string }
type ArticleContent = { title: string; description: string; intro: string; sections: Array<{ h: string; p: string[] }> }
// FAQ 答案可附一条文章链接；锚文本用与文章标题不同的长尾词
type FaqItem = { q: string; a: string; guide?: { article: ArticleKey; label: string } }
// 首页可选转化区块，设为 null 就不渲染。痛点只写不用本站时的麻烦，不提产品；对比逐行写“自己做”和“用本站”，不承诺生成效果
type ProblemBlock = { eyebrow: string; title: string; items: Array<{ title: string; body: string }> }
type WithWithoutBlock = { eyebrow: string; title: string; without: string; with: string; rows: Array<{ without: string; with: string }> }

export function en(s: S) {
  const k = s.keyword
  // 是否在卖订阅（site.subscriptionsEnabled 且有套餐），决定订阅相关文案是否出现
  const subs = s.subscriptionsEnabled && s.plans.length > 0
  const b = s.brandName
  const { uploadDays, outputDays } = s.retention
  const photoRetention = uploadDays > 0 ? `deleted automatically ${uploadDays} days after upload` : 'kept until you delete them'
  const videoRetention = outputDays > 0 ? `kept for ${outputDays} days after they finish` : 'kept until you delete them'
  const { ga4Id, cfBeaconToken, umamiWebsiteId } = s.analytics
  // 每种风格的展示名和一句话介绍；site.styles 加风格时这里补一项（缺了 typecheck 报错），zh.ts 同
  const styles: Record<StyleId, StyleCopy> = {
    'tiny-desk-v1': { name: 'Desk Session', tagline: 'A close, intimate performance setup.' },
  }
  return {
    styles,
    meta: {
      homeTitle: 'Tiny Desk AI Video Generator from a Photo',
      homeDescription: 'Create a Tiny Desk AI video from one photo. Pick 6, 12 or 15 seconds; get an original vertical desk-session clip. No video upload required.',
      pricingTitle: `Pricing – ${b}`,
      pricingDescription: subs
        ? `Credit packs and monthly or yearly plans for ${k} AI videos. Pack credits never expire, cancel a plan anytime, failed renders are refunded automatically.`
        : `Simple credit packs for ${k} AI videos. Pay once, credits never expire, failed renders are refunded automatically.`,
      contactTitle: `Contact – ${b}`,
      contactDescription: `Questions about billing, refunds, a failed render or partnerships? Reach the ${b} team, we usually reply within one business day.`,
      signInTitle: `Sign in – ${b}`,
      dashboardTitle: `My videos – ${b}`,
      privacyDescription: `How ${b} collects, uses and protects the photos, videos and account data behind your ${k} AI videos.`,
      termsDescription: `The rules for creating ${k} AI videos with ${b}: consent, acceptable use, credits and liability.`,
      refundDescription: `When ${b} returns credits or refunds a credit pack, and how long refunds take to arrive.`,
      reportTitle: `Report content – ${b}`,
      reportDescription: `Report a ${b} video that shows you without consent, involves a minor or infringes your rights. We review every report within ${s.takedownSlaHours} hours.`,
      ogImageAlt: `${b}: create a desk-session-style AI performance video from a portrait`,
      breadcrumbHome: 'Home',
    },
    alt: {
      inputPhoto: 'Portrait photo used as the visual reference for a desk-session AI video',
    },
    nav: {
      features: 'Features',
      examples: 'Examples',
      pricing: 'Pricing',
      signIn: 'Sign in',
      dashboard: 'My videos',
      billing: 'Billing',
      settings: 'Settings',
      admin: 'Admin',
      signOut: 'Sign out',
      language: 'Language',
      toggleTheme: 'Toggle theme',
      credits: (n: number) => `${n} credits`,
      menu: 'Menu',
    },
    hero: {
      title: `${k} AI Video Generator`,
      subtitle: 'Turn one authorized portrait into a Tiny Desk-inspired AI performance. Choose 6, 12 or 15 seconds; the motion reference is supplied automatically. Learn about the Outstanding Tiny Desk AI trend below.',
      badge: 'Desk-session video creator',
      original: 'Reference clip',
      aiVersion: 'Performance preview',
      chips: ['One portrait photo', 'Reference-guided motion', '6, 12 or 15 seconds'],
      creditNote: 'Licensed Pexels performance footage is shown for visual reference only. These are not AI-generated TinyDeskAI results; your video is generated from your own portrait.',
    },
    generator: {
      // 只给读屏用（sr-only），不放关键词，避免隐藏文字堆词
      title: 'Create your video',
      stepPhoto: 'Your portrait',
      dropTitle: 'Drop a photo or click to upload',
      dropHint: 'JPG, PNG or WebP · up to 10 MB',
      guidance: 'For the clearest result, use a sharp photo of one adult facing the camera, with the face unobstructed and the upper body visible. Avoid group photos, sunglasses, masks and heavy filters. No video upload is needed; the performance reference clip is provided automatically.',
      change: 'Change photo',
      uploading: 'Uploading…',
      uploaded: 'Photo uploaded',
      localPhotoReady: 'Photo selected',
      signInNote: 'After Google sign-in, please select your photo again. For privacy, local photo files are not carried across the login redirect.',
      stepStyle: 'Performance scene',
      stepLength: 'Clip length',
      seconds: (n: number) => `${n} s`,
      full: 'full',
      creditsLabel: (n: number) => `${n} credits`,
      consent: 'This photo is of me, or I have permission from the adult person in it. They are 18 or older and not a celebrity or public figure.',
      ctaSignUp: 'Sign in to continue',
      ctaGenerate: (n: number) => `Generate video · ${n} credits`,
      ctaBuy: 'Get credits to generate',
      ctaBuyPack: (credits: number, price: string) => `Get ${credits} credits · ${price}`,
      seePacks: 'See all packs',
      balance: (n: number) => `Balance: ${n} credits`,
      needMore: (n: number) => `You need ${n} more credits for this length.`,
      needPhoto: 'Add a photo first.',
      needConsent: 'Please confirm the consent box.',
      queued: 'In the queue…',
      processing: 'Your video is being rendered. Timing depends on clip length and queue; you can leave this page.',
      succeeded: 'Your video is ready',
      failed: 'This render failed.',
      refunded: 'The credits have been returned to your balance.',
      download: 'Download MP4',
      viewAll: 'Open My videos',
      makeAnother: 'Make another',
      aiNotice: 'This is an AI-generated video. Keep the AI label and disclose that it is AI when you share it.',
      expiresOn: (date: string) => `Download it before ${date}. Videos are deleted automatically after that.`,
    },
    madeWith: {
      eyebrow: `Made with ${b}`,
      title: 'From one portrait to a desk-session video',
      body: 'A reference clip guides the movement and framing while your portrait provides the person to feature. Review the result before sharing—AI-generated details can vary.',
      photoLabel: 'Uploaded portrait',
      resultLabel: 'AI-generated result',
    },
    problem: {
      eyebrow: 'The setup',
      title: 'Why filming a desk-session performance takes planning',
      items: [
        { title: 'Build the scene', body: 'A desk, microphone, instruments, soft lighting and a close camera angle all need to work together.' },
        { title: 'Get the framing right', body: 'A tight shot can crop hands or instruments; a wide shot can lose the intimate, room-scale feel.' },
        { title: 'Capture a usable take', body: 'Movement, posture and camera timing can take repeated attempts to look natural in a short clip.' },
      ],
    } as ProblemBlock | null,
    withWithout: {
      eyebrow: 'Two ways to create',
      title: `Filming a desk-session video vs. using ${b}`,
      without: 'Filming it yourself',
      with: `With ${b}`,
      rows: [
        { without: 'Set up a desk, microphone and lighting', with: 'Start with a portrait and a reference clip' },
        { without: 'Plan the camera position and framing', with: 'The reference clip guides movement and framing' },
        { without: 'Repeat takes to capture a clean performance', with: 'Generate a short AI version to review' },
        { without: 'Edit and export the final file', with: 'Download the generated MP4' },
      ],
    } as WithWithoutBlock | null,
    howTo: {
      eyebrow: 'How it works',
      title: `How to make a ${k} AI video in 3 steps`,
      steps: [
        { title: 'Upload one clear portrait', body: 'Use one adult subject, facing the camera, with the face and upper body visible. JPG, PNG or WebP up to 10 MB.' },
        { title: 'Choose a clip length', body: 'Select a 6, 12 or 15-second option. One credit covers one second of generated video.' },
        { title: 'Generate, review and download', body: 'Start the render, then review the result for visual artifacts before downloading the MP4. Processing time depends on clip length and queue.' },
      ],
      cta: 'Start with your portrait',
      guide: 'Read the step-by-step guide',
    },
    whatIs: {
      eyebrow: 'The format',
      title: `What is a ${k} AI video?`,
      paragraphs: [
        'The Outstanding Tiny Desk AI meme popularized AI edits of a tightly framed desk-band setting in October 2026. This site makes an original one-person performance-style clip rather than reproducing NPR footage or the copyrighted Outstanding recording.',
        `The Tiny Desk AI generator on ${b} uses a portrait and a reference performance clip to create a new vertical video. The reference guides movement and framing; the portrait guides the person shown. Results vary, so inspect the video before sharing. This is an independent tool, not an official concert production.`,
      ],
      guide: 'Read how the desk-session AI format works',
    },
    features: {
      eyebrow: 'Features',
      title: 'Tiny Desk AI video generator features',
      items: [
        { title: 'One portrait to start', body: 'Use a clear photo of one consenting adult as the visual reference for your clip.' },
        { title: 'Reference-guided movement', body: 'The source performance guides the motion and framing of the generated desk-session scene.' },
        { title: 'Vertical video format', body: `The output uses ${s.template.aspectRatio} framing for a compact, social-ready Tiny Desk-style AI video.` },
        { title: 'Three clip lengths', body: 'Choose 6, 12 or 15 seconds and pay according to the generated duration.' },
        { title: 'Private by default', body: `Uploads are stored privately, used only for your render and ${photoRetention}.` },
        { title: 'Clear credit rules', body: 'Credit packs are one-time purchases and never expire. If a render fails, the credits are returned automatically.' },
      ],
    },
    ideas: {
      eyebrow: 'Creative uses',
      title: 'Ideas for an AI Tiny Desk performance',
      items: [
        { title: 'A personal music-themed post', body: 'Create a playful performance visual for a social post, and label it clearly as AI-generated.' },
        { title: 'A creator concept preview', body: 'Explore a desk-session look for a channel intro or creative concept before arranging a real shoot.' },
        { title: 'A shareable fan edit', body: 'Make a lighthearted visual to send to friends. Use only your own photo or an adult photo you have permission to use.' },
      ],
      cta: 'Create a performance video',
    },
    pricing: {
      eyebrow: 'Pricing',
      title: subs ? 'Pay as you go, or subscribe' : 'Pay once, use whenever',
      subtitle: subs
        ? '1 credit = 1 second of video. Buy a pack that never expires, or subscribe for a fresh allowance every month.'
        : 'A 15-second video uses 15 credits. One-time credit packs never expire; no subscription required.',
      popular: 'Most popular',
      // 锚定价（site.packages[].anchorPriceCents）的划线原价和折扣
      was: 'Regular price',
      save: (percent: number) => `Save ${percent}%`,
      buy: 'Buy credits',
      buying: 'Opening checkout…',
      // 后台“暂停收款”打开时代替购买按钮和价格说明
      paused: 'Payments opening soon',
      pausedNote: 'We’re finishing setup with our payment partner, so purchases aren’t open yet. Check back soon.',
      credits: (n: number) => `${n} credits`,
      makes: (items: { videos: number; seconds: number }[]) =>
        `Makes ${items.map((i) => `${i.videos} × ${i.seconds}s`).join(' or ')} ${items.length === 1 && items[0]!.videos === 1 ? 'video' : 'videos'}`,
      bullets: ['Credits never expire', '6, 12 or 15-second clips', 'MP4 download', 'Automatic refund on failed renders'],
      note: 'Prices in USD. Taxes are calculated at checkout by our payment partner.',
      // 价格页底部的教程链接
      guide: 'Before you create: Tiny Desk AI photo and clip tips',
      packages: {
        starter: { name: 'Starter', tagline: 'Try a short clip' },
        party: { name: 'Creator', tagline: 'Make a few versions' },
        squad: { name: 'Studio', tagline: 'For repeat creators' },
      } as Record<string, { name: string; tagline: string }>,
      // 订阅套餐（site.plans）
      plansTitle: 'Subscriptions',
      plansBody: 'Credits are added at the start of every month of your plan and expire when that month ends. Cancel anytime and keep your plan until the period ends.',
      packsTitle: 'Credit packs',
      perMonth: '/ month',
      perYear: '/ year',
      monthlyCredits: (n: number) => `${n} credits every month`,
      yearlyMonthly: (price: string) => `${price} / month, billed yearly`,
      subscribe: 'Subscribe',
      planBullets: ['Credits refresh every month', 'All video lengths', 'HD MP4 download, no watermark', 'Cancel anytime'],
      plans: {
        monthly: { name: 'Monthly', tagline: 'Flexible, cancel anytime' },
        yearly: { name: 'Yearly', tagline: 'Best value for regular creators' },
      } as Record<string, { name: string; tagline: string }>,
      renewalNote: 'Subscriptions renew automatically at the price shown until you cancel. Unused monthly credits do not roll over.',
    },
    faq: {
      title: 'Questions, answered',
      body: 'Need help with a render or payment? Contact our team.',
      cta: 'Contact support',
      items: [
        { q: 'What is the Outstanding Tiny Desk AI trend?', a: 'It is an October 2026 AI parody trend inspired by the desk-band setting of Charlie Wilson’s 2023 NPR Tiny Desk performance of Outstanding. Our independent one-photo generator makes a new desk-session-style video rather than reproducing the original show or song.', guide: { article: 'trend', label: 'Learn the origin of the Outstanding Tiny Desk meme' } },
        { q: 'Does this use the original Outstanding song?', a: 'No. The generator requests AI-created audio and does not include the original Charlie Wilson recording or guarantee a particular song.' },
        { q: 'Can I upload five different performers?', a: 'Not yet. This generator currently supports one authorized adult portrait and a single desk-session style, with 6, 12 or 15-second output.' },
        { q: 'What photo works best?', a: 'Use a sharp, front-facing photo of one adult with the face unobstructed and the upper body visible. Avoid group photos, sunglasses, masks and heavy filters.', guide: { article: 'howTo', label: 'Photo tips for a Tiny Desk AI video' } },
        { q: 'Is Tiny Desk AI affiliated with NPR?', a: 'No. Tiny Desk AI is an independent creative tool and is not affiliated with NPR, the Tiny Desk Concert series, any artist, venue or rights holder.' },
        { q: 'Will the generated video match my photo perfectly?', a: 'No AI video can guarantee an exact result. Motion, hands, instruments, clothing and facial details may vary. Review the MP4 before sharing.' },
        { q: 'How long does a render take?', a: 'Processing time depends on the clip length, model availability and queue. You can leave the page; completed videos appear in My videos.' },
        { q: 'How do credits work?', a: 'Each second of video costs one credit. Credits are bought in one-time packs, never expire and are refunded automatically if a render fails.' },
        { q: 'Can I use someone else’s photo?', a: 'Only with explicit permission from the adult shown. Do not upload photos of minors, celebrities or public figures.' },
        { q: 'What happens to my photos?', a: `Uploads are private, used only to make your video and ${photoRetention}. Finished videos are ${videoRetention}. Deleting your account removes everything right away.` },
      ] as FaqItem[],
    },
    finalCta: {
      title: 'Make your own desk-session video',
      body: 'Start with one portrait, choose a clip length and review your AI-generated performance.',
      cta: 'Create my video',
    },
    footer: {
      statement: `${b} is an independent AI video project. It is not affiliated with NPR, the Tiny Desk Concert series, ${s.trendPlatform}, any artist, venue or rights holder.`,
      resources: 'Resources',
      legal: 'Legal',
      contact: 'Contact',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      refund: 'Refund Policy',
      report: 'Report content',
      rights: `© ${new Date().getFullYear()} ${b}. All rights reserved.`,
      agentDocs: 'AI & agent docs',
      askAi: `See what ChatGPT, Claude, Perplexity, Gemini or Grok say about ${b}.`,
      askAiLabel: (ai: string) => `Ask ${ai} about ${b}`,
      askAiPrompt: (url: string, llms: string) => `What is ${b} (${url})? Summarize what it does, how pricing works and who it is for. Site summary for AI: ${llms}`,
    },
    support: { label: 'Help & support' },
    // 统计同意横幅：只在配置了 GA4 时出现
    consent: {
      title: 'Analytics cookies',
      body: 'We use Google Analytics and a first-party referral cookie to see how the site is used. Nothing is set unless you accept; change it any time under “Cookie settings”.',
      learnMore: 'Privacy Policy',
      accept: 'Accept',
      reject: 'Reject',
      settings: 'Cookie settings',
      // × 只收起本次，不记录选择
      dismiss: 'Dismiss',
    },
    signIn: {
      title: `Sign in to ${b}`,
      body: 'Use your Google account. New here? An account is created automatically.',
      google: 'Continue with Google',
      devTitle: 'Developer login (local only)',
      devEmail: 'Email',
      devSubmit: 'Sign in as this email',
      legal: 'By continuing you agree to our Terms of Service and Privacy Policy.',
      notConfigured: 'Google sign-in is not configured yet.',
    },
    dashboard: {
      title: 'My account',
      tabs: { videos: 'Videos', billing: 'Billing', settings: 'Settings' },
      buyCredits: 'Buy credits',
      newVideo: 'New video',
      empty: 'No videos yet. Upload a photo on the home page to make your first one.',
      status: { queued: 'Queued', processing: 'Rendering', succeeded: 'Ready', failed: 'Failed', expired: 'Expired', removed: 'Removed' } as Record<string, string>,
      refundedNote: 'Credits refunded',
      delete: 'Delete',
      confirmDelete: 'Delete this video permanently?',
      download: 'Download',
      seconds: (n: number) => `${n} s`,
      expired: 'Expired and deleted',
      removed: 'Removed after a content report',
      expiresOn: (date: string) => `Available until ${date}`,
      share: 'Share',
      confirmShare: 'Create a public link to this video? Anyone with the link can watch it. Your name and email are not shown, and you can stop sharing at any time.',
      sharedNote: 'Anyone with the link can watch this video.',
      openSharePage: 'Open page',
      copyLink: 'Copy link',
      linkCopied: 'Copied',
      copyPrompt: 'Copy this link:',
      stopSharing: 'Stop sharing',
      confirmStopSharing: 'Stop sharing? The current link will stop working for everyone.',
    },
    billing: {
      orders: 'Orders',
      ledger: 'Credit history',
      noOrders: 'No orders yet.',
      noLedger: 'No credit activity yet.',
      expiring: (credits: number, date: string) => `${credits} ${credits === 1 ? 'credit expires' : 'credits expire'} on ${date}.`,
      expiringHint: 'Renders use the credits that expire soonest first.',
      columns: { date: 'Date', pack: 'Pack', amount: 'Amount', status: 'Status', change: 'Change', reason: 'Reason' },
      orderStatus: { pending: 'Pending', paid: 'Paid', partially_refunded: 'Partially refunded', failed: 'Failed', refunded: 'Refunded', canceled: 'Canceled' } as Record<string, string>,
      refundedLine: (amount: string, credits: number) => `Refunded ${amount} · ${credits} credits`,
      details: 'Details',
      loadMore: 'Load more',
      order: {
        title: 'Order details',
        back: 'Back to billing',
        orderId: 'Order ID',
        status: 'Status',
        pack: 'Pack',
        price: 'Price',
        amountPaid: 'Amount paid',
        refunded: 'Refunded',
        created: 'Created',
        paidAt: 'Paid on',
        refundedAt: 'Refunded on',
        provider: 'Payment processor',
        providers: { waffo: 'Waffo', dodo: 'Dodo Payments', stripe: 'Stripe', mock: 'Test checkout' } as Record<string, string>,
        print: 'Print',
        invoiceNote: 'Payments are handled by our payment processor as the merchant of record, and it emails your receipt or tax invoice. Can’t find it? Contact support with this order ID.',
        mockNote: 'This is a test order from the local mock checkout. No money was charged and no invoice is issued.',
        unpaidNote: 'This order was not paid. If you were charged anyway, contact support with this order ID.',
        contact: 'Contact support',
      },
      reasons: {
        purchase: 'Credit purchase',
        generation: 'Video render',
        generation_refund: 'Failed render refund',
        order_refund: 'Order refunded',
        admin_adjust: 'Adjustment by support',
        expire: 'Credits expired',
        redeem: 'Redeem code',
        referral: 'Referral reward',
        referral_refund: 'Referral reward reversed (order refunded)',
        signup_bonus: 'Welcome bonus',
        account_deleted: 'Account deleted',
        subscription: 'Subscription credits',
      } as Record<string, string>,
      subscription: {
        title: 'Subscription',
        status: { active: 'Active', past_due: 'Payment failed', canceled: 'Canceled', expired: 'Ended' } as Record<string, string>,
        monthlyCredits: (n: number) => `${n} credits every month`,
        renewsOn: (date: string, price: string) => `Renews on ${date} for ${price}.`,
        endsOn: (date: string) => `Canceled. Your plan stays active until ${date} and you won’t be charged again.`,
        ended: (date: string) => `Ended on ${date}.`,
        nextGrant: (date: string) => `Next monthly credits on ${date}.`,
        pastDue: 'Your renewal payment failed. Update your payment method to keep your plan; the payment will be retried automatically.',
        cancel: 'Cancel renewal',
        confirmCancel: 'Cancel renewal? You keep your plan and credits until the end of the current period.',
        resume: 'Keep my plan',
        resumeInPortal: 'Changed your mind? Open Manage payment to resume your plan.',
        portal: 'Manage payment',
        seePlans: 'See plans',
      },
    },
    settings: {
      profile: 'Profile',
      email: 'Email',
      memberSince: 'Member since',
      signOut: 'Sign out',
      dataTitle: 'Your data',
      dataBody: 'Download a JSON copy of your account, orders, credit history, uploads, generations, messages and reports. Video files are not included; download them from your dashboard while they are kept.',
      dataButton: 'Export my data',
      dangerTitle: 'Delete account',
      dangerBody: 'Deletes your uploads and videos and signs you out everywhere. Remaining credits are forfeited. Order records are kept for accounting. Signing up again with the same email does not include the sign-up bonus.',
      confirmLabel: 'Type DELETE to confirm',
      deleteButton: 'Delete my account',
      redeemTitle: 'Redeem a code',
      redeemBody: 'Have a promo or gift code? Enter it to add credits to your account. Each code can be used once per account.',
      redeemButton: 'Redeem',
      redeemSuccess: (credits: number, expires: string | null) =>
        `Added ${credits} ${credits === 1 ? 'credit' : 'credits'}${expires ? `, valid until ${expires}` : ''}.`,
      referralTitle: 'Invite friends',
      referralBody: (credits: number) =>
        `Share your link. When a friend signs up through it and makes their first purchase, you get ${credits} ${credits === 1 ? 'credit' : 'credits'}. If that order is refunded, the reward is taken back.`,
      referralCopy: 'Copy link',
      referralCopied: 'Copied',
      referralStats: (invited: number, rewarded: number, credits: number) =>
        `Signed up: ${invited} · Purchased: ${rewarded} · Credits earned: ${credits}`,
    },
    checkout: {
      successTitle: 'Payment received',
      pendingTitle: 'Confirming your payment…',
      pendingBody: 'This usually takes a few seconds. You can keep this tab open.',
      failedTitle: 'Payment was not completed',
      failedBody: 'No charge was made. You can try again from the pricing page.',
      added: (n: number) => `${n} credits were added to your balance.`,
      slowBody: 'Still waiting for the payment provider. Credits will appear automatically; if they don’t within an hour, contact support with your order ID.',
      orderId: 'Order ID',
      start: 'Start creating',
      backToPricing: 'Back to pricing',
      mockTitle: 'Test checkout',
      mockBody: 'This is the local mock payment provider. Nothing is charged.',
      mockPay: 'Simulate successful payment',
      mockFail: 'Simulate failed payment',
    },
    contact: {
      title: 'Contact us',
      body: `Write to ${s.supportEmail} or use the form below. Include your order ID for billing questions.`,
      email: 'Your email',
      topic: 'Topic',
      topics: { general: 'General', billing: 'Billing', bug: 'Bug report', partnership: 'Partnership' } as Record<string, string>,
      message: 'Message',
      send: 'Send message',
      sent: 'Thanks! We’ll get back to you soon.',
      guides: `Photo tips and trend background: browse the ${k} guides`,
    },
    report: {
      title: 'Report content or request removal',
      body: `If a video made with ${b} shows you without your consent, involves a minor, impersonates someone or infringes your rights, tell us here. A person reviews every report and qualifying content is removed within ${s.takedownSlaHours} hours. Removed photos are blocked from being uploaded again.`,
      name: 'Your full name (serves as your electronic signature)',
      email: 'Email we can reach you at',
      contentRef: 'Where is the content?',
      contentRefHint: 'Paste a link or the file name (downloaded files contain an ID such as gen_…), or describe where you saw it.',
      reason: 'Reason',
      reasons: {
        intimate: 'Intimate or sexual content without consent',
        impersonation: 'Impersonation or a deceptive deepfake',
        minor: 'It shows a minor',
        copyright: 'Copyright or trademark',
        other: 'Something else',
      } as Record<string, string>,
      details: 'Details (optional)',
      isDepicted: 'I am the person shown, or I am authorised to act on their behalf.',
      attest: 'I believe in good faith that this content was made or shared without the consent of the person shown, and the information in this report is accurate.',
      submit: 'Send report',
      sent: (id: string) => `Report received. Your reference is ${id}. We may contact you at the email above if we need more information.`,
      urgent: 'If someone is in immediate danger, contact local emergency services. Child sexual abuse material should also be reported to the NCMEC CyberTipline or your national hotline.',
      cybertip: 'NCMEC CyberTipline',
    },
    // 成片公开分享页 /v/<id>
    share: {
      title: `An AI video made with ${b}`,
      goneTitle: `Video unavailable – ${b}`,
      description: 'Watch this AI-generated desk-session video, then create a version from your own portrait.',
      heading: `Made with ${b}`,
      body: 'This desk-session-style video was generated from a portrait and a reference clip. It is not footage of a real live performance.',
      disclosure: 'This video is AI-generated and does not show real events.',
      cta: 'Make your own',
      reportPrompt: 'Shows you without consent or breaks our rules?',
      report: 'Report this video',
      gone: { missing: 'This link doesn’t work', expired: 'This video has expired', removed: 'This video was removed' },
      goneBody: 'The video may have been deleted or expired, or its owner stopped sharing it.',
    },
    common: {
      loading: 'Loading…',
      retry: 'Try again',
      home: 'Back to home',
      notFoundTitle: 'Page not found',
      notFoundBody: 'The page you are looking for does not exist or has moved.',
      errorTitle: 'Something went wrong',
      errorBody: `Please try again. If it keeps happening, email ${s.supportEmail}.`,
      errorRef: (id: string) => `Error ID: ${id} (include it when you contact us)`,
      signInRequired: 'Please sign in to continue.',
      lastUpdated: 'Last updated',
      aiGenerated: 'AI-generated',
      breadcrumb: 'Breadcrumb',
      maintenance: 'We’re doing some maintenance. New videos and purchases are paused for a short while; your videos and credits are safe.',
    },
    // 文章列表页 /guides
    guides: {
      nav: 'Guides',
      title: 'Tiny Desk AI guides',
      metaTitle: 'Tiny Desk AI Video Guides – Tiny Desk AI',
      description: 'Practical guides to the Tiny Desk AI video format, choosing a portrait, selecting a clip length and reviewing an AI-generated result.',
      intro: 'Explore the Outstanding Tiny Desk AI trend, then learn how to make an original desk-session clip from one photo, choose an output duration and review your result.',
      related: 'Related guides',
    },
    errors: {
      unauthorized: 'Please sign in first.',
      insufficient_credits: 'Not enough credits for this length.',
      invalid_code: 'This code is invalid or has expired.',
      code_used_up: 'This code has been fully redeemed.',
      already_redeemed: 'You have already redeemed this code.',
      too_many_active_jobs: 'You already have 3 videos rendering. Please wait for one to finish.',
      maintenance: 'We’re doing some maintenance. Please try again in a little while.',
      checkout_paused: 'Payments aren’t open yet. Please check back soon.',
      daily_limit: 'We’ve hit today’s rendering capacity. Please try again tomorrow; your credits were not used.',
      rate_limited: 'Too many requests. Please wait a minute and try again.',
      file_too_large: 'That file is larger than 10 MB.',
      length_required: 'Your browser sent the file in a way we can’t accept. Please try again in another browser.',
      unsupported_file_type: 'Please upload a JPG, PNG or WebP image.',
      invalid_upload: 'Please upload the photo again.',
      invalid_style: 'That performance template is not available. Please try again later.',
      queue_unavailable: 'Our render queue is busy. Your credits were returned; please try again.',
      payment_not_configured: 'Payments are not available right now.',
      payment_provider_error: 'The payment provider did not respond. Please try again.',
      invalid_email: 'Please enter a valid email address.',
      invalid_message: 'Please write between 10 and 5000 characters.',
      generation_in_progress: 'This video is still rendering.',
      google_not_configured: 'Google sign-in is not configured.',
      oauth_state: 'Sign-in expired. Please try again.',
      oauth_failed: 'Google sign-in failed. Please try again.',
      network_error: 'Network error. Check your connection and try again.',
      content_rejected: 'This photo can’t be used. Choose a different photo that follows our content rules.',
      moderation_unavailable: 'We couldn’t check this photo right now. Please try again in a minute.',
      moderation_not_configured: 'Uploads are temporarily unavailable.',
      captcha_required: 'Please complete the verification.',
      captcha_failed: 'Verification failed. Please try again.',
      captcha_unavailable: 'The verification service is unavailable. Please try again.',
      captcha_not_configured: `Verification is not available. Please email ${s.supportEmail} instead.`,
      media_expired: 'This video has expired and was deleted.',
      subscription_exists: 'You already have an active subscription. Manage it under My account → Billing.',
      subscription_active: 'Cancel your subscription renewal under Billing before deleting your account.',
      subscription_not_found: 'No active subscription was found.',
      subscription_resume_in_portal: 'Open Manage payment to resume your plan.',
      subscription_portal_unsupported: 'Payment management isn’t available for this subscription. Please contact support.',
      subscription_cancel_unsupported: 'This subscription can’t be canceled here. Please contact support.',
      media_removed: 'This video was removed after a content report.',
      share_rejected: 'This video can’t be shared publicly because it didn’t pass our content check.',
      invalid_report: 'Please fill in every required field and confirm the statement.',
      not_found: 'We couldn’t find that. It may belong to a different account.',
      internal_error: 'Unexpected error. Please try again.',
      account_disabled: `This account has been disabled. Email ${s.supportEmail} if you think this is a mistake.`,
      account_conflict: `This email is linked to a different Google account. Sign in with that account, or email ${s.supportEmail} for help.`,
    } as Record<string, string>,
    legal: {
      updated: '2026-10-30',
      privacy: {
        title: 'Privacy Policy',
        sections: [
          { h: 'What we collect', p: [`When you sign in we receive your name, email address and profile picture from Google. When you create a video we store the photo you upload and the video we generate. Payment details are handled by our payment partner; ${b} never sees your card number.`] },
          { h: 'How we use it', p: ['Your photo is used only to render the video you request. We use your email to operate your account, send receipts and service notices (such as when your video is ready or a report you filed is resolved) and answer support requests. We do not send marketing email. We do not sell personal data and do not use your photos to train models.'] },
          { h: 'Storage and retention', p: [`Files are stored with our infrastructure provider in encrypted form. Uploaded photos are ${photoRetention} and generated videos are ${videoRetention}, unless you delete them or your account sooner. Order and payment records are kept as required for tax and accounting. When you delete your account we keep only a one-way hash of your email address, so the same email cannot claim the sign-up bonus twice.`] },
          { h: 'Safety checks', p: ['Before a photo is used it may be checked by an automated content-safety classifier. The check runs only to enforce our rules, and its result is not used for anything else. Public forms are protected by a bot-detection service that may process your IP address and browser signals.'] },
          {
            h: 'Cookies and analytics',
            p: [
              'The site uses a few cookies and similar browser storage that it needs to work, such as your sign-in session and your light or dark theme preference.',
              'We also set a first-party cookie (vt_attr, kept for 90 days) that records how you first and most recently reached us, such as a referring website or campaign link. We use it only to see which channels lead to sign-ups and purchases, and we do not share it with advertising networks.' +
                (ga4Id ? ' It is only set after you accept analytics cookies in the banner, and withdrawing consent deletes it.' : ''),
              s.referralRewardCredits > 0
                ? 'If you open a friend’s invite link, we set a cookie (vt_ref, kept for up to 30 days and removed once you sign up) so the invite can be credited. To prevent abuse of invite rewards, we store a salted hash of your IP address with the invite, not the address itself. Neither of you can see the other’s account details.'
                : '',
              ga4Id || cfBeaconToken || umamiWebsiteId ? '' : 'We do not use third-party analytics or advertising cookies.',
              cfBeaconToken ? 'We count page views with Cloudflare Web Analytics, which does not use cookies or track you across websites.' : '',
              umamiWebsiteId
                ? 'We count visits with Umami, a cookie-free analytics tool loaded from our own domain. It does not set cookies or store your IP address; your IP address is only used to determine your country and to count unique visits.'
                : '',
              ga4Id
                ? 'If you accept analytics cookies in the banner, we also use Google Analytics. It sets cookies (such as _ga) and lets Google process your IP address and device information to produce usage reports for us. Google Analytics is not loaded until you accept. You can withdraw consent at any time under “Cookie settings” in the footer, which also deletes these cookies.'
                : '',
            ].filter(Boolean),
          },
          ...(s.share.enabled
            ? [
                {
                  h: 'Shared videos',
                  p: [
                    'If you share a video, anyone with the link can watch it. The share page does not show your name or email and asks search engines not to index it. To make link previews, your browser takes a still frame from the video and we store it with the video. Stopping sharing or deleting the video disables the link and deletes that image; the link also stops working when the video expires or is removed after a report.',
                  ],
                },
              ]
            : []),
          { h: 'Service providers', p: [`We rely on a small number of processors: cloud hosting, storage and email delivery, Kie.ai, which provides access to ByteDance's Seedance 2.0 Mini model and processes your uploaded photo plus the site's selected reference clip to render your request, a content-safety classifier, a payment provider acting as merchant of record${ga4Id || cfBeaconToken || umamiWebsiteId ? ', and the analytics services described above' : ''}.`] },
          { h: 'Your rights', p: [`You can download or delete your videos at any time. In Settings you can export a copy of your data as JSON or delete your account. For any other privacy request, email ${s.supportEmail}.`] },
        ],
      },
      terms: {
        title: 'Terms of Service',
        sections: [
          { h: 'Using the service', p: [`${b} lets you create short AI videos from a photo. You must be at least 18 years old, or the age of majority where you live, to use it.`] },
          { h: 'Your content and consent', p: ['Only upload photos of yourself or of adults who have given you permission. Do not upload photos of minors, celebrities or public figures, and do not use the service to harass, impersonate or deceive anyone. We may remove content and close accounts that break these rules.'] },
          { h: 'Generated videos', p: ['You may use the videos you create for personal and social media purposes. AI output can contain mistakes; review a video before sharing it. Videos are labelled as AI-generated: keep that label, say the video is AI-generated when you share it and never present it as real footage of an event.'] },
          { h: 'Reports and removal', p: [`Anyone can report content through our report page. We review reports and remove content that breaks these terms or someone’s rights within ${s.takedownSlaHours} hours. Removed photos are blocked from being uploaded again, and accounts involved in serious or repeated violations may be closed without a refund of used credits.`] },
          {
            h: 'Credits and payments',
            p: [
              'Credit packs are one-time purchases. Credits have no cash value, and credits from packs do not expire while the service is operating. Payments are processed by our merchant-of-record partner, whose terms also apply.',
              subs
                ? 'Subscriptions renew automatically at the end of each billing period (monthly or yearly) at the price you subscribed at, until you cancel. You can cancel at any time under Billing in your account; cancellation takes effect at the end of the current period and you keep your plan until then. Subscription credits are added once a month (yearly plans receive them month by month), expire at the end of that month and do not roll over.'
                : '',
            ].filter(Boolean),
          },
          { h: 'Availability and liability', p: ['We work to keep the service available but provide it as is. To the extent permitted by law, our liability is limited to the amount you paid in the 12 months before a claim.'] },
          { h: 'Changes', p: ['We may update these terms. Continued use after an update means you accept the new terms.'] },
        ],
      },
      refund: {
        title: 'Refund Policy',
        sections: [
          { h: 'Failed renders', p: ['If a video fails to render, the credits are returned to your balance automatically. No action is needed.'] },
          { h: 'Unused credits', p: [`You can request a refund of a credit pack within 14 days of purchase if none of its credits have been used. Email ${s.supportEmail} with your order ID.`] },
          ...(subs
            ? [
                {
                  h: 'Subscriptions',
                  p: [
                    `You can request a refund of a subscription payment within 14 days of the charge if none of its credits have been used. Email ${s.supportEmail} with the order ID from Billing. Refunded credits are removed from your balance.`,
                    'Canceling stops future renewals. The current period is not refunded automatically, and you keep your plan until it ends.',
                  ],
                },
              ]
            : []),
          { h: 'Quality issues', p: ['If a finished video is clearly broken (for example corrupted or missing the face), contact us with the video ID and we will restore the credits after review.'] },
          { h: 'How refunds are paid', p: ['Approved refunds go back to the original payment method through our payment partner and may take 5–10 business days to appear.'] },
        ],
      },
    },
    articles: {
      trend: {
        title: 'Outstanding Tiny Desk AI Trend Explained',
        description: 'Where the Outstanding Tiny Desk AI meme came from, why the desk-band edits went viral in October 2026, and what this one-photo generator can do.',
        intro: 'The Outstanding Tiny Desk AI trend is a viral AI parody format, not a new concert. It draws on a real 2023 NPR Music desk performance and uses unexpected faces in band scenes. This site offers an independent, one-photo desk-session-style AI video, not an exact copy of that concert or its soundtrack.',
        sections: [
          { h: 'What is the Outstanding Tiny Desk AI trend?', p: [
            'NPR Music published Charlie Wilson: Tiny Desk Concert on June 5, 2023. The set closes with Outstanding, a song associated with The Gap Band. The crowded room, musicians, microphones and close camera framing make that live performance memorable.',
            'In October 2026, AI parodies began circulating that put unexpected people into a desk-band scene. Sports-themed edits featuring college football coaches became a widely shared version of the joke. These clips are edited or AI-generated parodies, not recordings of those people performing at NPR.'
          ] },
          { h: 'Why the October 2026 meme spread', p: [
            'The joke comes from a contrast: people who have had a rough day appear to be joyfully performing a song called Outstanding. The tight concert setting, reactions and musician close-ups make the format easy to recognize in a short social video.',
            'Different edits highlight the lead singer, backing musicians, keyboard and saxophone. The original viral examples vary by creator, and reposted view counts or claims about the first upload should not be treated as verified facts without their original posts.'
          ] },
          { h: 'The video effect people are trying to make', p: [
            'People looking for an Outstanding Tiny Desk AI template often want the recognizable ensemble scene: a desk-side band, expressive singing close-ups, warm studio lighting, keys and a saxophone moment. A five-person face-replacement edit is a different workflow from generating a new scene with a single portrait.',
            'This website currently accepts one authorized adult portrait, offers one desk-session performance style, and lets you choose a 6, 12 or 15-second vertical output. It does not currently provide five separate cast slots, exact shot-by-shot recreation, or the original Outstanding recording.'
          ] },
          { h: 'How to make an original desk-session AI video', p: [
            'Sign in with Google, select one clear portrait of yourself or an adult who gave permission, and choose the output length. You do not need to upload an additional video: the site supplies a motion-reference clip automatically.',
            'Once rendering finishes, open My videos to play or download the MP4. The video model can change facial details, hands, instruments or timing between frames, so inspect the full result before sharing it.'
          ] },
          { h: 'Who owns the music and original concert?', p: [
            'The original NPR Tiny Desk concert and the song Outstanding belong to their respective rights holders. This independent service does not supply the concert video, claim affiliation with NPR, or promise that its AI audio reproduces the original song.',
            'Use music you are entitled to use when posting on TikTok, Instagram or elsewhere. Do not pass an AI parody off as a genuine performance, and do not upload images of minors, celebrities or public figures.'
          ] },
        ],
      },
      howTo: {
        title: 'How to Make a Tiny Desk AI Video from a Photo',
        description: 'Sign in, upload one portrait, select 6, 12 or 15 seconds, generate an original desk-session video and download your MP4. No video upload required.',
        intro: 'You need one clear, permitted adult portrait. The motion-reference video is built into this generator, so you choose the output duration rather than uploading a clip. The final result is an AI-created performance, not the original Outstanding concert.',
        sections: [
          { h: '1. Sign in, then select your photo', p: [
            'Sign in with Google to keep your uploaded photo and result in your own account. If you selected a photo before signing in, choose it again after returning; for privacy, the browser does not transfer your local file through the login redirect.',
            'Use JPG, PNG or WebP up to 10 MB. A clear, well-lit portrait with the face visible and some upper body in the frame gives the model better reference information. Only use yourself or an adult who has agreed.'
          ] },
          { h: '2. Pick a generated-video length', p: [
            'Choose 6, 12 or 15 seconds. Each output second costs one credit, so a 15-second render uses 15 credits. The reference-performance clip is selected by the site automatically; there is no separate user video-upload step.',
            'The currently supported output is vertical 9:16. This is a single-person workflow, not a multi-cast video editor.'
          ] },
          { h: '3. Start the render and check progress', p: [
            'Confirm permission to use the photo, ensure your account has sufficient credits, and submit the generation task. Video creation is asynchronous. You may leave the page and check My videos while the render is processing.',
            'The model is asked to generate audio with the performance. Audio quality, lip movement and visual consistency can vary; the service does not promise any particular licensed song or an exact recreation of a viral meme.'
          ] },
          { h: '4. Review the MP4, download and share', p: [
            'Watch the result from start to finish. Check the face, fingers, microphone, instruments, pacing and sound for visible or audible errors. A completed file can be downloaded from the generator or My videos.',
            'Generated videos are retained for 30 days under the current site policy. Label the result as AI-generated and share only when you have the necessary rights. If a render fails, spent generation credits are automatically returned.'
          ] },
        ],
      },
    } satisfies Record<ArticleKey, ArticleContent>,
  }
}

export type Content = ReturnType<typeof en>
