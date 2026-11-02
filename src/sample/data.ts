import type { SampleComment, SampleData } from './types';

// Pin coordinates come from scripts/samples/pins.json, measured from the
// rendered mockups by scripts/render-samples.mjs.

const DAY = 24 * 60;

const THEO = 'Theo Lindqvist';
const PRIYA = 'Priya Raman';
const JONAH = 'Jonah Bell';
const CATRIONA = 'Catriona Muir';
const EWAN = 'Ewan Rae';
const HOLLIS = 'Hollis Greer';
const ANA = 'Ana Beltran';
const RUI = 'Rui Aldaia';
const MARTA = 'Marta Neves';

type Fields = Omit<SampleComment, 'id' | 'pageNumber' | 'parentId' | 'x' | 'y'>;

const pin = (
  id: string,
  pageNumber: number,
  x: number,
  y: number,
  fields: Fields
): SampleComment => ({ id, pageNumber, x, y, ...fields });

const reply = (
  id: string,
  parent: SampleComment,
  fields: Fields
): SampleComment => ({
  id,
  pageNumber: parent.pageNumber,
  parentId: parent.id,
  ...fields
});

const guest = (authorName: string, minutesAgo: number, body: string): Fields => ({
  authorName,
  authorKind: 'guest',
  minutesAgo,
  body
});

const team = (authorName: string, minutesAgo: number, body: string): Fields => ({
  authorName,
  authorKind: 'team',
  minutesAgo,
  body
});

const internal = (authorName: string, minutesAgo: number, body: string): Fields => ({
  authorName,
  authorKind: 'team',
  internal: true,
  minutesAgo,
  body
});

const resolved = (fields: Fields, minutesAgo: number, byName: string): Fields => ({
  ...fields,
  resolvedMinutesAgo: minutesAgo,
  resolvedByName: byName
});

function homepageV1(): SampleComment[] {
  const nav = pin(
    'home1-nav',
    1,
    0.31,
    0.0127,
    resolved(
      guest(
        CATRIONA,
        12 * DAY,
        'Fourteen links plus search, log in and a basket. Nobody booking a ferry needs Sustainability and Careers up here. Can we cut this to what people actually come for?'
      ),
      3 * DAY,
      PRIYA
    )
  );
  const title = pin(
    'home1-title',
    1,
    0.2,
    0.0998,
    resolved(
      guest(
        CATRIONA,
        12 * DAY - 25,
        'I can barely read this on my laptop. Thin white type on that pale sky just disappears, and it is the first thing anyone sees.'
      ),
      3 * DAY,
      PRIYA
    )
  );
  const message = pin(
    'home1-message',
    1,
    0.4,
    0.088,
    resolved(
      guest(
        EWAN,
        11 * DAY + 300,
        "It's a nice line, but it doesn't say we're a ferry. Someone landing from a search wants to know where we go and when."
      ),
      3 * DAY,
      THEO
    )
  );
  const cta = pin(
    'home1-cta',
    1,
    0.1112,
    0.167,
    resolved(
      guest(
        CATRIONA,
        12 * DAY - 40,
        '"Discover more" of what? This should be the booking button, and right now it is the smallest thing in the hero.'
      ),
      3 * DAY,
      PRIYA
    )
  );
  const timetable = pin(
    'home1-timetable',
    1,
    0.2,
    0.9,
    resolved(
      guest(
        EWAN,
        11 * DAY + 280,
        'This is why the phones ring. Timetables are the number one thing people want, and they are at the very bottom in tiny grey type. Please bring them up right under the hero.'
      ),
      3 * DAY,
      PRIYA
    )
  );
  const fares = pin(
    'home1-fares',
    1,
    0.63,
    0.9085,
    resolved(
      guest(
        EWAN,
        11 * DAY + 260,
        'Vehicle fares are not here at all, it only says to contact the office. Cars start at £62 on every route, so let\'s just say so.'
      ),
      3 * DAY,
      PRIYA
    )
  );
  const intro = pin(
    'home1-intro',
    1,
    0.14,
    0.3255,
    resolved(
      internal(
        JONAH,
        11 * DAY,
        'Welcome, Our commitment and Travel with confidence are all the same size and weight, so there is nothing to scan. I would drop this whole block rather than restyle it. It answers no question anyone arrives with.'
      ),
      3 * DAY,
      PRIYA
    )
  );
  const actionColor = pin(
    'home1-coral',
    1,
    0.28,
    0.1392,
    internal(
      PRIYA,
      4 * DAY,
      'Plan for V2: keep the coral from the funnel as the only action colour, on a much darker sky. Navy text on coral clears 4.5:1, white does not, so the buttons stay navy text.'
    )
  );
  const crossings = pin(
    'home1-crossings',
    1,
    0.5,
    0.516,
    resolved(
      guest(
        CATRIONA,
        10 * DAY,
        "Love the beach huts. Could each island say how long the crossing takes? It's usually the next question, and Little Orn is a real trip."
      ),
      3 * DAY,
      PRIYA
    )
  );
  const lighthouse = pin(
    'home1-lighthouse',
    1,
    0.8017,
    0.4999,
    guest(
      EWAN,
      10 * DAY - 120,
      'The real Little Orn light is plain white with a black lantern, no coloured band. Islanders will notice. Can the drawing match?'
    )
  );
  const stepFree = pin(
    'home1-stepfree',
    1,
    0.175,
    0.7265,
    guest(
      CATRIONA,
      9 * DAY,
      "Step-free access is what people ask us about most, and it's buried mid-paragraph. Can it stand out more? Wheelchair users currently ring the office just to check."
    )
  );

  return [
    nav,
    reply(
      'home1-nav-r1',
      nav,
      team(
        PRIYA,
        11 * DAY + 600,
        'Agreed. Proposing Timetable, Fares, Islands, Freight and Help, with a Book button. Everything else moves to the footer.'
      )
    ),
    reply(
      'home1-nav-r2',
      nav,
      guest(CATRIONA, 11 * DAY + 400, 'Yes please. Freight has to stay, that is a third of our revenue.')
    ),
    title,
    reply(
      'home1-title-r1',
      title,
      team(
        THEO,
        11 * DAY + 590,
        "You're right. It's about 1.2:1 at the moment. We'll take the sky to dusk so the headline can carry weight."
      )
    ),
    message,
    reply(
      'home1-message-r1',
      message,
      team(
        THEO,
        11 * DAY + 100,
        'We will lead with the route and the frequency in V2 and keep this line for the brand work.'
      )
    ),
    reply(
      'home1-message-r2',
      message,
      internal(
        JONAH,
        11 * DAY + 60,
        'Search console backs Ewan up: the top queries are all "ferry to Hesker" and "Tarrow ferry times".'
      )
    ),
    cta,
    timetable,
    reply(
      'home1-timetable-r1',
      timetable,
      team(
        PRIYA,
        10 * DAY + 200,
        "Moving today's sailings directly under the hero, with departure times set large. Fares will sit right beside them."
      )
    ),
    fares,
    intro,
    actionColor,
    crossings,
    lighthouse,
    stepFree
  ];
}

function homepageV2(): SampleComment[] {
  const lighthouse = pin(
    'home2-lighthouse',
    1,
    0.8017,
    0.5432,
    {
      ...guest(
        EWAN,
        10 * DAY - 120,
        'The real Little Orn light is plain white with a black lantern, no coloured band. Islanders will notice. Can the drawing match?'
      ),
      fromVersion: 1
    }
  );
  const stepFree = pin(
    'home2-stepfree',
    1,
    0.26,
    0.7465,
    {
      ...guest(
        CATRIONA,
        9 * DAY,
        "Step-free access is what people ask us about most, and it's buried mid-paragraph. Can it stand out more? Wheelchair users currently ring the office just to check."
      ),
      fromVersion: 1
    }
  );
  const headline = pin(
    'home2-headline',
    1,
    0.2889,
    0.1049,
    guest(
      CATRIONA,
      38 * 60,
      'Huge improvement, I can read this from across the room. Is "Four sailings a day" true all winter though? Ewan, can you check?'
    )
  );
  const cta = pin(
    'home2-cta',
    1,
    0.1355,
    0.2029,
    guest(
      CATRIONA,
      37 * 60,
      'So much clearer. We say "sailing" everywhere else, so could this be "Book a sailing"?'
    )
  );
  const defaults = pin(
    'home2-booking',
    1,
    0.74,
    0.2698,
    guest(
      CATRIONA,
      36 * 60,
      '"2 adults, 1 car" as the default feels presumptuous. Most of our bookings are foot passengers.'
    )
  );
  const space = pin(
    'home2-space',
    1,
    0.585,
    0.3982,
    guest(
      EWAN,
      26 * 60,
      '"Few car spaces" is exactly what we wanted. Can it come from the live booking system? It would be wrong within an hour otherwise.'
    )
  );
  const car = pin(
    'home2-carfare',
    1,
    0.8995,
    0.3594,
    resolved(
      guest(
        EWAN,
        25 * 60,
        '£62 is right for up to 5 m, thanks. Motorhomes are the next question, can they go on the full fares page?'
      ),
      5 * 60,
      PRIYA
    )
  );
  const updates = pin(
    'home2-updates',
    1,
    0.2,
    0.8665,
    team(
      PRIYA,
      47 * 60,
      'We renamed News to Service updates and kept it to three items, since these are almost all timetable notices. Tell us if you want the full archive linked from here.'
    )
  );
  const barWrap = pin(
    'home2-barwrap',
    1,
    0.4,
    0.2698,
    internal(
      PRIYA,
      46 * 60,
      'Booking bar overlaps the hero by 54 px. If they want a fifth field it wraps below about 1100 px, so check tablet before we show them responsive.'
    )
  );
  const elevation = pin(
    'home2-elevation',
    1,
    0.66,
    0.75,
    internal(
      THEO,
      45 * 60,
      'They asked for a photo of the real vessel at kickoff. The elevation drawing is stronger and costs them nothing. Hold the line unless they raise it again.'
    )
  );
  const headlineCheck = pin(
    'home2-orn-days',
    1,
    0.095,
    0.3982,
    internal(
      JONAH,
      3 * 60,
      'If Little Orn really is Tue, Thu and Sat in winter, this table needs to filter by day. Flagging for the build estimate before we quote it.'
    )
  );

  return [
    headline,
    reply(
      'home2-headline-r1',
      headline,
      guest(
        EWAN,
        27 * 60,
        'Not quite. Little Orn only runs Tuesday, Thursday and Saturday from November. "Daily sailings to the Outer Isles" would be safe.'
      )
    ),
    reply(
      'home2-headline-r2',
      headline,
      team(PRIYA, 4 * 60, 'Thanks Ewan. We will change the line in V3 and keep the size.')
    ),
    cta,
    defaults,
    reply(
      'home2-booking-r1',
      defaults,
      team(
        PRIYA,
        7 * 60,
        'Good catch. We will default to 1 adult with no vehicle, and add a car in one click.'
      )
    ),
    space,
    reply(
      'home2-space-r1',
      space,
      team(
        JONAH,
        9 * 60,
        'Yes, it will read from your booking API, cached for five minutes. We will need a read-only key from your supplier.'
      )
    ),
    car,
    updates,
    barWrap,
    elevation,
    headlineCheck,
    lighthouse,
    reply(
      'home2-lighthouse-r1',
      lighthouse,
      team(
        PRIYA,
        46 * 60,
        'Still on my list. Could you send a photo of the light so we can match the lantern?'
      )
    ),
    stepFree
  ];
}

function brandGuidelines(): SampleComment[] {
  const coverName = pin(
    'brand-cover-name',
    1,
    0.217,
    0.6214,
    guest(
      ANA,
      5 * DAY,
      'Love this cover. Should it say "Company" here when the logo says "Seed Co."? We should pick one and stick to it.'
    )
  );
  const coverPattern = pin(
    'brand-cover-pattern',
    1,
    0.8047,
    0.5,
    internal(
      THEO,
      5 * DAY - 90,
      'The seeds run much looser here than in the sample on the packaging page. Need one rule for pattern scale before this goes anywhere near a printer.'
    )
  );
  const clear = pin(
    'brand-clearspace',
    2,
    0.275,
    0.4688,
    resolved(
      guest(
        HOLLIS,
        4 * DAY + 400,
        'That clear space looks generous. Do we really have to keep this much room on a small seed packet?'
      ),
      3 * DAY,
      THEO
    )
  );
  const min = pin(
    'brand-minsize',
    2,
    0.6355,
    0.5725,
    guest(
      ANA,
      4 * DAY + 300,
      'At this size the seed is close to a smudge. What do we use for the web shop favicon?'
    )
  );
  const donts = pin(
    'brand-donts',
    2,
    0.8725,
    0.8525,
    guest(
      HOLLIS,
      4 * DAY + 200,
      'The pattern example made me laugh, it is exactly what our printer keeps doing. Can you show the right way to pair logo and pattern as well?'
    )
  );
  const pollen = pin(
    'brand-pollen-pair',
    3,
    0.8743,
    0.8775,
    guest(
      ANA,
      2 * DAY,
      'Pollen on Field is listed as approved at 4.6:1, but the small caption in that same colour is hard work for me. Should this pairing be large text only, and say so here?'
    )
  );
  const rust = pin(
    'brand-rust',
    3,
    0.6126,
    0.4587,
    guest(
      HOLLIS,
      2 * DAY - 45,
      'Rust comes out noticeably browner on my uncoated proof than on screen. Can we see a printer drawdown before we sign this page off?'
    )
  );
  const husk = pin(
    'brand-husk',
    3,
    0.202,
    0.4587,
    internal(
      PRIYA,
      2 * DAY - 70,
      'The Pantone for Husk is my best match until the drawdowns come back. This page should not go out marked final.'
    )
  );
  const caption = pin(
    'brand-caption',
    4,
    0.7297,
    0.6823,
    guest(
      ANA,
      30 * 60,
      'Caption at this size in spaced capitals is hard going, and that is where lot numbers live. Customers do look for those.'
    )
  );
  const specimen = pin(
    'brand-specimen',
    4,
    0.2,
    0.41,
    resolved(
      guest(HOLLIS, 29 * 60, 'That big ampersand is gorgeous. Can we use this typeface on the website too?'),
      20 * 60,
      JONAH
    )
  );
  const bean = pin(
    'brand-bean',
    5,
    0.3755,
    0.4905,
    guest(
      HOLLIS,
      22 * 60,
      'Runner bean pods are long and green. These are short and yellow, and the packet copy right below says "long green pods". Any grower will spot that.'
    )
  );
  const squash = pin(
    'brand-squash',
    5,
    0.5242,
    0.42,
    guest(ANA, 21 * 60, 'This one is my favourite. Could the squash be the lead image on the launch poster?')
  );
  const pattern = pin(
    'brand-pattern-cost',
    5,
    0.7844,
    0.4138,
    internal(
      JONAH,
      20 * 60,
      'Packets are quoted at two spot colours, but this pattern uses four. Box liners will have to be CMYK or a separate run. Raise it with the printer before it surprises anyone.'
    )
  );
  const dry = pin(
    'brand-voice-dry',
    6,
    0.275,
    0.4896,
    resolved(
      guest(
        HOLLIS,
        9 * 60,
        '"Slugs adore this one" made me laugh, and then worry. Could someone read it as a complaint about the variety?'
      ),
      6 * 60,
      THEO
    )
  );
  const flap = pin(
    'brand-back-flap',
    6,
    0.8219,
    0.655,
    guest(
      ANA,
      8 * 60,
      'Could the back flap carry last frost date as well? We get asked about that more often than row spacing.'
    )
  );

  return [
    coverName,
    reply(
      'brand-cover-name-r1',
      coverName,
      team(
        THEO,
        4 * DAY + 600,
        'Our recommendation: Oxbow Seed Company in running text and on the cover, Seed Co. only inside the logo where space is tight. We will add that rule to the logo page.'
      )
    ),
    coverPattern,
    clear,
    reply(
      'brand-clearspace-r1',
      clear,
      team(
        THEO,
        3 * DAY + 200,
        'The mark on the packet is far smaller, so x shrinks with it. In practice that is about 4 mm around the small lockup.'
      )
    ),
    reply('brand-clearspace-r2', clear, guest(HOLLIS, 3 * DAY + 50, 'Oh that is fine then. Thank you.')),
    min,
    reply(
      'brand-minsize-r1',
      min,
      team(
        PRIYA,
        4 * DAY,
        'We will draw a simplified version below 24 px with a thicker loop and a bigger seed, and add it to this page.'
      )
    ),
    donts,
    pollen,
    rust,
    reply(
      'brand-rust-r1',
      rust,
      team(THEO, 40 * 60, 'Agreed, ordering drawdowns on your uncoated stock today. Back in about a week.')
    ),
    husk,
    caption,
    specimen,
    reply(
      'brand-specimen-r1',
      specimen,
      team(
        JONAH,
        24 * 60,
        'Yes, it needs a web licence. I will send options with the build estimate.'
      )
    ),
    bean,
    squash,
    pattern,
    dry,
    reply(
      'brand-voice-dry-r1',
      dry,
      team(
        THEO,
        7 * 60,
        'It reads as a joke on a packet, since slugs only bother with the good ones. Fair worry though, so we will keep lines like this off anything sold wholesale.'
      )
    ),
    flap
  ];
}

function label(): SampleComment[] {
  const volume = pin(
    'label-volume',
    1,
    0.4074,
    0.7894,
    resolved(
      guest(
        MARTA,
        24 * DAY,
        'Our importer says the e-mark has to sit right beside the quantity, with figures at least 4 mm tall for 500 mL. Is that met here?'
      ),
      22 * DAY,
      PRIYA
    )
  );
  const hills = pin(
    'label-hills',
    1,
    0.3,
    0.3,
    resolved(
      guest(
        RUI,
        24 * DAY - 60,
        'That is our hill. The long ridge with the sun behind it is the view from the mill. My mother cried, in a good way.'
      ),
      22 * DAY,
      THEO
    )
  );
  const wordmark = pin(
    'label-wordmark',
    1,
    0.2907,
    0.55,
    resolved(
      guest(
        MARTA,
        23 * DAY,
        'Is Aldaia big enough from across a shop? A lot of our stockists keep oil on a high shelf.'
      ),
      21 * DAY,
      THEO
    )
  );
  const nutrition = pin(
    'label-nutrition',
    1,
    0.7782,
    0.3184,
    resolved(
      guest(
        MARTA,
        23 * DAY - 120,
        'Checked all of these against the lab report for this harvest, and every figure matches.'
      ),
      21 * DAY,
      PRIYA
    )
  );
  const palate = pin(
    'label-palate',
    1,
    0.7655,
    0.5735,
    resolved(
      guest(
        RUI,
        22 * DAY,
        'Bitter at about half and pepper near the top is right for an early harvest. Please keep these three bars.'
      ),
      21 * DAY,
      PRIYA
    )
  );
  const barcode = pin(
    'label-barcode',
    1,
    0.5643,
    0.7584,
    resolved(
      internal(
        JONAH,
        22 * DAY - 200,
        'Barcode is a valid EAN-13 with its own white patch. The printer still needs to grade a press sample, so add it to the proof checklist.'
      ),
      19 * DAY,
      JONAH
    )
  );
  const lot = pin(
    'label-lot',
    1,
    0.7136,
    0.7747,
    resolved(
      guest(
        RUI,
        21 * DAY,
        'The lot format is the one the mill uses, and best before 31 10 2028 is right for this harvest. Confirmed.'
      ),
      20 * DAY,
      PRIYA
    )
  );
  const marks = pin(
    'label-marks',
    1,
    0.8314,
    0.7789,
    resolved(
      guest(MARTA, 21 * DAY - 90, 'Do both of these recycling marks need to be here, or just the glass one?'),
      20 * DAY,
      PRIYA
    )
  );
  const proof = pin(
    'label-proof',
    1,
    0.24,
    0.9444,
    resolved(
      internal(
        PRIYA,
        19 * DAY,
        'Ochre is printing about 5 percent warm on the wet proof. Colour bar is fine, and the printer will correct it on press.'
      ),
      18 * DAY,
      PRIYA
    )
  );

  return [
    volume,
    reply(
      'label-volume-r1',
      volume,
      team(
        PRIYA,
        22 * DAY + 120,
        'Yes. The figures print at 4.4 mm and the e-mark sits directly after the quantity. Measured on the wet proof.'
      )
    ),
    hills,
    wordmark,
    reply(
      'label-wordmark-r1',
      wordmark,
      team(
        THEO,
        22 * DAY,
        'It runs about 80 mm across the 127.5 mm front panel. We tried a printed wrap on a bottle from three metres and it holds up.'
      )
    ),
    nutrition,
    palate,
    barcode,
    lot,
    marks,
    reply(
      'label-marks-r1',
      marks,
      team(
        PRIYA,
        20 * DAY + 200,
        'Your importer asked for both on this market. We can drop the second one for domestic runs.'
      )
    ),
    proof
  ];
}

export function sampleData(): SampleData {
  return {
    studio: {
      name: 'Pellam Studio',
      accentColor: '#D92D20',
      logoSrc: '/samples/studio-logo.webp'
    },
    members: [
      { id: 'member-theo', name: THEO, email: 'theo@pellamstudio.example', role: 'owner' },
      { id: 'member-priya', name: PRIYA, email: 'priya@pellamstudio.example', role: 'member' },
      { id: 'member-jonah', name: JONAH, email: 'jonah@pellamstudio.example', role: 'member' }
    ],
    guestName: CATRIONA,
    reviews: [
      {
        id: 'review-skerry',
        name: 'Homepage redesign',
        clientName: 'Skerry Line Ferries',
        recipients: ['catriona@skerryline.example', 'ewan@skerryline.example'],
        assets: [
          {
            id: 'asset-skerry-home',
            name: 'Homepage, desktop',
            versions: [
              {
                id: 'version-skerry-1',
                number: 1,
                kind: 'image',
                originalName: 'skerry-homepage-v1.png',
                originalSize: 6_812_334,
                createdByName: PRIYA,
                minutesAgo: 13 * DAY,
                pages: [{ src: '/samples/skerry-homepage-v1.webp', width: 2880, height: 5038 }],
                comments: homepageV1()
              },
              {
                id: 'version-skerry-2',
                number: 2,
                kind: 'image',
                originalName: 'skerry-homepage-v2.png',
                originalSize: 7_240_918,
                createdByName: PRIYA,
                minutesAgo: 2 * DAY,
                pages: [{ src: '/samples/skerry-homepage-v2.webp', width: 2880, height: 5232 }],
                comments: homepageV2()
              }
            ],
            decisions: [
              {
                id: 'decision-skerry-1',
                versionNumber: 1,
                decision: 'changes_requested',
                name: CATRIONA,
                minutesAgo: 9 * DAY - 60
              }
            ]
          }
        ]
      },
      {
        id: 'review-oxbow',
        name: 'Brand guidelines, edition one',
        clientName: 'Oxbow Seed Company',
        recipients: ['hollis@oxbowseed.example', 'ana@oxbowseed.example'],
        assets: [
          {
            id: 'asset-oxbow-guidelines',
            name: 'Brand guidelines',
            versions: [
              {
                id: 'version-oxbow-1',
                number: 1,
                kind: 'pdf',
                originalName: 'oxbow-brand-guidelines.pdf',
                originalSize: 279_004,
                createdByName: THEO,
                minutesAgo: 6 * DAY,
                pages: [1, 2, 3, 4, 5, 6].map((page) => ({
                  src: `/samples/oxbow-guidelines-p${page}.webp`,
                  width: 2560,
                  height: 1600
                })),
                comments: brandGuidelines()
              }
            ],
            decisions: [
              {
                id: 'decision-oxbow-1',
                versionNumber: 1,
                decision: 'changes_requested',
                name: HOLLIS,
                minutesAgo: 5 * 60
              }
            ]
          }
        ]
      },
      {
        id: 'review-aldaia',
        name: 'Olive oil label, 500 mL',
        clientName: 'Monte Aldaia',
        recipients: ['rui@montealdaia.example', 'marta@montealdaia.example'],
        assets: [
          {
            id: 'asset-aldaia-label',
            name: 'Wrap label',
            versions: [
              {
                id: 'version-aldaia-1',
                number: 1,
                kind: 'image',
                originalName: 'MA_EVOO_500_wrap_label.png',
                originalSize: 4_201_118,
                createdByName: PRIYA,
                minutesAgo: 25 * DAY,
                pages: [{ src: '/samples/aldaia-label.webp', width: 2800, height: 1800 }],
                comments: label()
              }
            ],
            decisions: [
              {
                id: 'decision-aldaia-1',
                versionNumber: 1,
                decision: 'approved',
                name: RUI,
                minutesAgo: 18 * DAY - 300
              }
            ]
          }
        ]
      }
    ]
  };
}

/** The review the landing page opens: the homepage's latest version. */
export const landingSample = {
  reviewId: 'review-skerry',
  assetId: 'asset-skerry-home',
  versionId: 'version-skerry-2'
} as const;
