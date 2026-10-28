export const site = {
  name: "Kigezi Community Transformation Foundation",
  shortName: "KCTF",
  email: "transformationfoundationkigezi@gmail.com",
  phone: "+256 760 986 505",
  telephone: "+256760986505",
  founder: "Tushabe Isaac",
  address:
    "Bunura Cell, Rwakabengo Ward, Southern Division, Rukungiri Municipality, Uganda",
  postalAddress: {
    streetAddress: "Bunura Cell, Rwakabengo Ward, Southern Division",
    addressLocality: "Rukungiri Municipality",
    addressCountry: "UG",
  },
  /** One factual sentence reused for search snippets, structured data and llms.txt. */
  summary:
    "Kigezi Community Transformation Foundation (KCTF) is a community-led foundation in Rukungiri, Uganda, at its planning stage, whose proposed work connects wildlife conservation, environmental protection, climate action, and justice and human rights.",
  mission:
    "Work with communities and responsible public institutions to protect wildlife and habitats, strengthen climate resilience, promote environmental stewardship, and advance justice and human rights through lawful, inclusive action.",
  vision:
    "Communities enjoying a healthy environment, a stable climate, respect for human rights, and peaceful coexistence with thriving wildlife.",
};
// Map on /contact. `verifiedPin` stays false until the foundation confirms an exact office
// location (for example a Google Maps place ID). Until then the map is an address search,
// labelled as approximate, and no coordinates are published. See docs/SEO.md.
export const officeLocation = {
  query: site.address,
  verifiedPin: false,
};
// Short, factual answers to common visitor questions, shown on /about and described by
// FAQPage structured data. Every answer must match statements made elsewhere on the site.
export const aboutQuestions = [
  [
    "What is KCTF?",
    "Kigezi Community Transformation Foundation (KCTF) is a community-led foundation founded by Tushabe Isaac in Rukungiri, Uganda. Its purpose connects wildlife conservation, environmental protection, climate action, and justice and human rights.",
  ],
  [
    "Where is the foundation based?",
    "Bunura Cell, Rwakabengo Ward, Southern Division, Rukungiri Municipality, Uganda. The proposed initial operational area is Bunura Cell, subject to the scope authorised at registration.",
  ],
  [
    "Is KCTF a registered organisation?",
    "Not yet confirmed. The foundation’s constitution is proposed and subject to adoption and registration. This website does not claim that legal registration is complete, and no registration number or tax-exempt status is claimed.",
  ],
  [
    "Is the Community Lion Conservation project running?",
    "No. It is a proposed 12-month initiative at the planning stage. Its targets are planned outputs, not completed results, and delivery depends on funding, confirmed locations and the relevant approvals.",
  ],
  [
    "How can I support or get involved?",
    "You can express interest in future volunteering, start a partnership conversation or send a donation enquiry. The website does not take payments.",
  ],
] as const;
export const navigation = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Programmes", href: "/programmes" },
  { label: "Projects", href: "/projects" },
  { label: "Get Involved", href: "/get-involved" },
  { label: "Contact", href: "/contact" },
];
export const programmes = [
  {
    id: "wildlife",
    name: "Wildlife Conservation",
    short: "Wildlife",
    image: "savanna",
    summary:
      "A future where wildlife and neighbouring communities can thrive together.",
    body: "Our proposed conservation work brings community dialogue, habitat stewardship and safe incident reporting together. The initial lion conservation initiative prioritises education and non-violent responses to human-wildlife conflict.",
    activities: [
      "Community conservation education",
      "Safe reporting to competent authorities",
      "Habitat stewardship and coexistence",
    ],
  },
  {
    id: "environment",
    name: "Environmental Protection",
    short: "Environment",
    image: "forest",
    summary: "Protecting the landscapes that sustain everyday life.",
    body: "We aim to encourage responsible land use, tree growing, habitat restoration and pollution prevention through practical community education. Activities will be planned with residents and undertaken where authorised.",
    activities: [
      "Tree growing and habitat restoration",
      "Responsible land use",
      "Environmental education",
    ],
  },
  {
    id: "climate",
    name: "Climate Action",
    short: "Climate",
    image: "lake",
    summary:
      "Local knowledge. Practical adaptation. More resilient communities.",
    body: "Climate resilience begins with understanding local challenges. Our intended work connects climate education with locally appropriate adaptation and sustainable practices, informed by the people who depend on the land.",
    activities: [
      "Climate awareness and learning",
      "Locally appropriate adaptation",
      "Community resilience",
    ],
  },
  {
    id: "justice",
    name: "Justice & Human Rights",
    short: "People",
    image: "culture",
    summary: "Dignity, inclusion and a meaningful voice in the future.",
    body: "Our constitution places dignity, non-discrimination and participation at the heart of community transformation. We aim to promote environmental justice, peaceful dialogue and referral to competent institutions for lawful support.",
    activities: [
      "Inclusive community participation",
      "Environmental justice and information",
      "Rights awareness and lawful referrals",
    ],
  },
] as const;
export type PhotoKey =
  "heritage" | "hero" | "lake" | "forest" | "savanna" | "culture" | "lion";
export const photos: Record<
  PhotoKey,
  {
    src: string;
    alt: string;
    caption: string;
    author: string;
    source: string;
    license: string;
    licenseUrl: string;
  }
> = {
  hero: {
    src: "/images/rubirizi-highlands.jpg",
    alt: "Cultivated land, trees and layered hills in Rubirizi, western Uganda.",
    caption: "Rubirizi, western Uganda",
    author: "NANTUMBWEJ",
    source:
      "https://commons.wikimedia.org/wiki/File:Varied_Landscape_of_Rubirizi_Near_Queen_Elizabeth_National_Park,_Uganda.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  heritage: {
    src: "/images/kisiizi-falls.jpg",
    alt: "A heritage monument stands beside Kisiizi Falls in Rukungiri.",
    caption: "Kisiizi Falls, Rukungiri District, Uganda",
    author: "Shaayflix Dr Shaay",
    source: "https://commons.wikimedia.org/wiki/File:Kisiizi_falls_04.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  lake: {
    src: "/images/lake-rutoto.jpg",
    alt: "Green vegetation borders Lake Rutoto in western Uganda.",
    caption: "Lake Rutoto, Rubirizi District, Uganda",
    author: "Cn22760",
    source:
      "https://commons.wikimedia.org/wiki/File:Lake_Rutoto,_Rubirizi_District.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  forest: {
    src: "/images/rubirizi-landscape.jpg",
    alt: "Sunlight breaks through clouds over the green landscape of Rubirizi.",
    caption: "Rubirizi, western Uganda, Uganda",
    author: "NANTUMBWEJ",
    source:
      "https://commons.wikimedia.org/wiki/File:Sunlit_Skies_over_Rubirizi,_Near_Queen_Elizabeth_National_Park,_Uganda_01.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  savanna: {
    src: "/images/ishasha-lions.jpg",
    alt: "Lions rest in the branches of a fig tree in Ishasha, western Uganda.",
    caption: "Ishasha, Queen Elizabeth National Park, Uganda",
    author: "Charles J. Sharp",
    source:
      "https://commons.wikimedia.org/wiki/File:Tree-climbing_lions_(Panthera_leo)_in_sycamore_fig_(Ficus_sycomorus).jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  culture: {
    src: "/images/bakiga-ekizino-kanungu.jpg",
    alt: "Bakiga women perform the traditional Ekizino dance in Kanungu.",
    caption: "Bakiga Ekizino dance, Kanungu, Uganda",
    author: "Owobusingye",
    source:
      "https://commons.wikimedia.org/wiki/File:Bakiga_women_dancing_Ekizino_traditional_dance_for_guests_in_Kanungu.jpeg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  lion: {
    src: "/images/ishasha-lions.jpg",
    alt: "Lions rest in the branches of a fig tree in Ishasha, western Uganda.",
    caption: "Ishasha, Queen Elizabeth National Park, Uganda",
    author: "Charles J. Sharp",
    source:
      "https://commons.wikimedia.org/wiki/File:Tree-climbing_lions_(Panthera_leo)_in_sycamore_fig_(Ficus_sycomorus).jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
};
export const targets = [
  { value: "120", label: "Household interviews" },
  { value: "12", label: "Community dialogues" },
  { value: "20", label: "Volunteer focal persons" },
  { value: "4", label: "Radio discussions" },
];
export const projectStages = [
  [
    "01",
    "Listen & understand",
    "Months 1–2",
    "Confirm permissions, consult relevant authorities and establish a baseline through household interviews.",
  ],
  [
    "02",
    "Learn & connect",
    "Months 3–6",
    "Bring residents and local leaders together through dialogues, radio discussions and focal-person training.",
  ],
  [
    "03",
    "Reflect & strengthen",
    "Months 7–12",
    "Follow up with households, assess learning and share technical and financial reports.",
  ],
];
