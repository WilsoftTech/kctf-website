// Donation page content. Kept as data so a future CMS can manage it through
// `content.getDonationPage()` (see docs/CMS-ROADMAP.md).
//
// Honesty rules for editors: online giving runs only through the hosted checkouts on
// /donate/give (Stripe for cards, Pesapal for Mobile Money) and only while they are
// configured; pages show the "offline" wording otherwise. No bank account or
// mobile-money numbers have been published. Do not add impact figures, registration or
// tax-exemption claims, funding commitments or partnerships unless the foundation has
// confirmed them. Activities below are proposals, not completed work.
import type { PhotoKey } from "@/content/site";

export const donationPage = {
  eyebrow: "Donate",
  title: "Help people and nature thrive.",
  lead: "Your support could help a community-led foundation in Rukungiri begin its work for wildlife, landscapes, climate resilience and human rights.",
  seo: {
    title: "Donate: how to support the foundation",
    description:
      "Enquire about supporting KCTF’s proposed conservation, climate and human-rights work in Rukungiri, Uganda. Online giving is not yet available.",
    descriptionOnline:
      "Support KCTF’s proposed conservation, climate and human-rights work in Rukungiri, Uganda: give online by card or Mobile Money, or send a donation enquiry.",
  },
  intro: {
    eyebrow: "Why support matters",
    title: "One landscape. Connected futures.",
    photo: "savanna" as PhotoKey,
    paragraphs: [
      "In Kigezi, the wellbeing of people and the natural world are closely linked. Wildlife shares landscapes with farms and homes, a changing climate affects harvests and water, and fair, inclusive decisions shape how communities can respond.",
      "KCTF is at its planning stage. Support would help the foundation turn its four connected programmes into practical, lawful work planned with residents and the relevant authorities.",
    ],
  },
  areas: {
    eyebrow: "What support could help fund",
    title: "Where your support could go.",
    note: "Proposed activities · Not completed work. Activities depend on funding, confirmed locations and the relevant approvals.",
    items: [
      {
        programme: "wildlife",
        title: "Wildlife conservation",
        body: "Community conservation education and dialogue on living alongside wildlife, including the proposed Community Lion Conservation initiative.",
        activities: [
          "Village dialogues and household learning",
          "Guidance on safe reporting to competent authorities",
          "Radio discussions on coexistence",
        ],
      },
      {
        programme: "environment",
        title: "Environmental protection",
        body: "Practical learning that encourages responsible land use and care for the habitats communities depend on.",
        activities: [
          "Tree growing and habitat restoration, where authorised",
          "Environmental education sessions",
          "Pollution-prevention awareness",
        ],
      },
      {
        programme: "climate",
        title: "Climate action",
        body: "Climate learning grounded in local experience, so households can explore adaptation that suits their land and livelihoods.",
        activities: [
          "Community climate-awareness sessions",
          "Sharing locally appropriate adaptation practices",
          "Learning materials in accessible formats",
        ],
      },
      {
        programme: "justice",
        title: "Justice & human rights",
        body: "Inclusive participation so women, young people, elders and livestock keepers have a meaningful voice in shared decisions.",
        activities: [
          "Rights and environmental-information awareness",
          "Inclusive community meetings",
          "Referral to competent institutions for lawful support",
        ],
      },
    ],
  },
  /** Shown on /donate when at least one online payment method is available. */
  panelOnline: {
    status: "Prefer to talk first?",
    title: "Discuss a donation.",
    body: "If you would like to talk before giving, plan a larger or institutional gift, or support a specific programme, send an enquiry and the foundation will reply personally. An enquiry is not a payment.",
    steps: [
      [
        "Tell us how you’d like to help",
        "An individual gift, regular support or support for a specific programme.",
      ],
      [
        "The foundation replies by email",
        "To discuss your enquiry and how it can receive support.",
      ],
      [
        "Nothing is charged by an enquiry",
        "This form never asks for card, bank or mobile-money details. Online gifts use the separate secure checkout.",
      ],
    ],
  },
  panel: {
    status: "Online giving is not yet available",
    title: "Enquire about donating.",
    body: "The foundation cannot yet accept payments through this website, and it has not published bank, mobile-money or payment-link details. If you would like to give, send an enquiry and the foundation will reply personally.",
    steps: [
      [
        "Tell us how you’d like to help",
        "An individual gift, regular support or support for a specific programme.",
      ],
      [
        "The foundation replies by email",
        "To discuss your enquiry and whether, when and how it can receive support.",
      ],
      [
        "Nothing is charged here",
        "This website never asks for card, bank or mobile-money details.",
      ],
    ],
  },
  partnership: {
    eyebrow: "Partnership & institutional support",
    title: "Supporting the foundation as an organisation.",
    photo: "lake" as PhotoKey,
    paragraphs: [
      "Trusts, foundations, conservation organisations, businesses and public institutions who share KCTF’s purpose are welcome to start a conversation.",
      "Possible topics include grant or project funding, in-kind support, technical advice and collaboration on conservation, climate or community education. No partnership or funding commitment is in place yet; any arrangement would be agreed directly and in writing.",
    ],
    cta: "Start a partnership conversation",
  },
  faq: {
    eyebrow: "Questions",
    title: "Supporting KCTF: common questions.",
    items: [
      [
        "Can I donate online?",
        "Not yet. The website does not process payments. Please use the donation enquiry form and the foundation will reply by email.",
        "Yes. The secure donation page takes one-time gifts by card (through Stripe) or Mobile Money (MTN MoMo or Airtel Money, through Pesapal). You finish on the provider’s own page, so this website never sees your card details or PIN.",
      ],
      [
        "Where can I find bank or mobile-money details?",
        "None have been published. If anyone sends you payment details claiming to be from KCTF, check them with the foundation through the contact details on this website before sending money.",
        "The foundation has not published bank account or mobile-money numbers. Online gifts go only through the secure checkout linked from this website. If anyone sends you other payment details claiming to be from KCTF, check them with the foundation before sending money.",
      ],
      [
        "Will I receive a receipt, or can I claim tax relief?",
        "The foundation has not confirmed charitable registration or tax-exempt status, so no tax relief is implied. Any acknowledgement the foundation sends in future would confirm a payment it has received; it would not be a tax receipt unless the foundation states otherwise.",
        "Online gifts receive an email acknowledgement confirming the payment. The foundation has not confirmed charitable registration or tax-exempt status, so the acknowledgement is not a tax receipt and no tax relief is implied.",
      ],
      [
        "Does sending an enquiry commit me to anything?",
        "No. An enquiry is a conversation. It does not create a donation, pledge or agreement, and no money is requested through the form.",
      ],
      [
        "Can I support in other ways?",
        "Yes. You can express interest in future volunteering, or start a partnership conversation about technical advice, education or in-kind support.",
      ],
      [
        "What happens to the information I send?",
        "Donation enquiries are handled like other website enquiries, as described in the privacy notice. Please leave out payment details and sensitive personal information.",
      ],
    ] as readonly (readonly [string, string, string?])[],
  },
  photoNote:
    "Photographs show landscapes, wildlife and culture in western Uganda for illustration. They are not evidence of KCTF-funded activities.",
};

export const homeDonation = {
  eyebrow: "Support the foundation",
  title: "Help people and nature thrive.",
  body: "Your support could help bring the foundation’s proposed conservation, climate and community work to life in Kigezi.",
  note: "See the ways to support the foundation, including a donation enquiry if you would like to talk first.",
  photo: "heritage" as PhotoKey,
};

/** /donate/give: the online giving page. Copy only; amounts and methods come from config. */
export const givePage = {
  eyebrow: "Give online",
  // Two lines, revealed one after the other.
  headline: ["Give hope.", "Grow a shared future."],
  body: "Your gift could help a community-led foundation in Rukungiri begin its planned work for wildlife, landscapes, climate resilience and fair participation in Kigezi.",
  photo: "hero" as PhotoKey,
  photoNote:
    "Illustrative photograph of western Uganda. It does not show KCTF-funded activities.",
  seo: {
    title: "Give online to KCTF",
    description:
      "Make a one-time gift to the Kigezi Community Transformation Foundation by card or Mobile Money, on the payment provider’s secure checkout.",
  },
  trust: [
    "One-time gift. No subscription.",
    "Card via Stripe, Mobile Money via Pesapal.",
    "An email acknowledgement, not a tax receipt.",
  ],
};
