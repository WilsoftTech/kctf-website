export const site = {
  name: "Kigezi Community Transformation Foundation",
  shortName: "KCTF",
  email: "transformationfoundationkigezi@gmail.com",
  phone: "+256 760 986 505",
  telephone: "+256760986505",
  founder: "Tushabe Isaac",
  address:
    "Bunura Cell, Rwakabengo Ward, Southern Division, Rukungiri Municipality, Uganda",
  mission:
    "Work with communities and responsible public institutions to protect wildlife and habitats, strengthen climate resilience, promote environmental stewardship, and advance justice and human rights through lawful, inclusive action.",
  vision:
    "Communities enjoying a healthy environment, a stable climate, respect for human rights, and peaceful coexistence with thriving wildlife.",
};
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
    image: "wetland",
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
  "hero" | "lake" | "forest" | "savanna" | "wetland" | "lion";
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
    src: "/images/hero-bwindi-mist.jpg",
    alt: "Mist drifts across forested hills in Bwindi, Uganda.",
    caption: "Bwindi Impenetrable Forest, Uganda",
    author: "Giles Laurent",
    source:
      "https://commons.wikimedia.org/wiki/File:063_Mist_rising_from_the_Bwindi_Impenetrable_Forest_National_Park_Photo_by_Giles_Laurent.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  lake: {
    src: "/images/lake-bunyonyi-hills.jpg",
    alt: "Terraced green hills above Lake Bunyonyi in south-western Uganda.",
    caption: "Lake Bunyonyi, Kabale District, Uganda",
    author: "Sjoerdug",
    source:
      "https://commons.wikimedia.org/wiki/File:View_of_Lake_Bunyonyi_in_Kabaale_District.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  forest: {
    src: "/images/budongo-forest-tree.jpg",
    alt: "A tall buttressed tree reaches into the canopy of Budongo Forest.",
    caption: "Budongo Forest, Uganda",
    author: "Dror Feitelson",
    source: "https://commons.wikimedia.org/wiki/File:Budongo_forest.jpg",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
  },
  savanna: {
    src: "/images/kidepo-valley-savanna.jpg",
    alt: "Open savanna and distant mountains in Kidepo Valley National Park.",
    caption: "Kidepo Valley National Park, Uganda",
    author: "Sandra Aceng",
    source:
      "https://commons.wikimedia.org/wiki/File:Landscape_of_Kidepo_Valley_National_Park_in_Uganda.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  wetland: {
    src: "/images/papyrus-swamp-fog.jpg",
    alt: "Morning mist settles over papyrus reeds in western Uganda.",
    caption: "Papyrus wetland, western Uganda",
    author: "BalukuBrian",
    source:
      "https://commons.wikimedia.org/wiki/File:Fog_over_papyrus_reeds_in_a_swamp_in_western_Uganda.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  lion: {
    src: "/images/lion-queen-elizabeth.jpg",
    alt: "A lion rests in the vegetation of Queen Elizabeth National Park, Uganda.",
    caption: "Queen Elizabeth National Park, Uganda",
    author: "Alvinategyeka",
    source:
      "https://commons.wikimedia.org/wiki/File:Lion_in_Queen_Elizabeth_National_Park_Uganda_01.jpg",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
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
