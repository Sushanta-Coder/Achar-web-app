/**
 * Everything the storefront needs that is not the catalogue: delivery pricing,
 * launch coupons, homepage banners, blog articles and the five policy pages.
 *
 * The policy copy is real and specific to how this shop actually operates - a
 * consumable food business in Nepal cannot accept returns on opened jars, and saying
 * so plainly on the Returns page prevents most of the disputes it would otherwise
 * cause. Placeholder policy text would be worse than none.
 */

const photo = (id, width = 1600) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`;

/**
 * Delivery zones, narrowest first.
 *
 * `deliveryService` resolves an address by district match, then province match, then
 * the `isDefault` fallback, breaking ties on `priority` (lower wins). So the Valley
 * zone must out-rank the Bagmati zone, or a Kathmandu address would be quoted the
 * wider province rate. The remote zone deliberately turns COD off: courier partners
 * will not collect cash on a route that takes a week each way.
 */
export const deliveryZones = [
  {
    name: 'Kathmandu Valley',
    nameNp: 'काठमाडौं उपत्यका',
    description: 'Kathmandu, Lalitpur and Bhaktapur. Same-day dispatch on orders placed before 2 PM.',
    districts: ['Kathmandu', 'Lalitpur', 'Bhaktapur'],
    provinces: [],
    charge: 100,
    freeDeliveryThreshold: 2000,
    estimatedDays: { min: 1, max: 2 },
    codAvailable: true,
    codExtraCharge: 0,
    priority: 10,
    isDefault: false,
  },
  {
    name: 'Bagmati (Outside Valley)',
    nameNp: 'बागमती (उपत्यका बाहिर)',
    description: 'Chitwan, Makwanpur, Kavre, Dhading and the rest of Bagmati Province.',
    districts: [],
    provinces: ['Bagmati'],
    charge: 150,
    freeDeliveryThreshold: 2500,
    estimatedDays: { min: 2, max: 3 },
    codAvailable: true,
    codExtraCharge: 25,
    priority: 20,
    isDefault: false,
  },
  {
    name: 'Major Cities',
    nameNp: 'प्रमुख सहरहरू',
    description: 'Pokhara, Biratnagar, Birgunj, Butwal, Dharan, Nepalgunj and Itahari.',
    districts: ['Kaski', 'Morang', 'Sunsari', 'Parsa', 'Rupandehi', 'Banke', 'Jhapa'],
    provinces: [],
    charge: 180,
    freeDeliveryThreshold: 3000,
    estimatedDays: { min: 3, max: 4 },
    codAvailable: true,
    codExtraCharge: 50,
    priority: 30,
    isDefault: false,
  },
  {
    name: 'Terai & Hills',
    nameNp: 'तराई र पहाड',
    description: 'Koshi, Madhesh, Gandaki, Lumbini and Sudurpashchim province districts.',
    districts: [],
    provinces: ['Koshi', 'Madhesh', 'Gandaki', 'Lumbini', 'Sudurpashchim'],
    charge: 220,
    freeDeliveryThreshold: 3500,
    estimatedDays: { min: 4, max: 6 },
    codAvailable: true,
    codExtraCharge: 75,
    priority: 40,
    isDefault: false,
  },
  {
    /**
     * The fallback. Every district in Nepal already matches one of the zones above,
     * so in practice this catches only addresses whose district is misspelt or newly
     * renamed - quoting a high-but-real remote rate is better than the checkout
     * failing outright because nothing matched.
     */
    name: 'Remote Districts',
    nameNp: 'दुर्गम जिल्लाहरू',
    description: 'Karnali and remote mountain districts. Delivery by bus parcel service.',
    districts: [],
    provinces: ['Karnali'],
    charge: 350,
    freeDeliveryThreshold: 0,
    estimatedDays: { min: 6, max: 10 },
    codAvailable: false,
    codExtraCharge: 0,
    priority: 90,
    isDefault: true,
  },
];

/** Days from now, as a Date. Keeps seeded coupons valid whenever the seed is run. */
const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

/**
 * Launch coupons.
 *
 * `EXPIRED10` exists so the coupon-rejection path is reachable by hand in development
 * without editing the database - the checkout should say "this coupon has expired",
 * and confirming that takes an expired coupon.
 */
export const coupons = [
  {
    code: 'WELCOME10',
    description: '10% off your first order. Maximum discount Rs. 300.',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 800,
    maxDiscountAmount: 300,
    expiresAt: daysFromNow(365),
    usageLimit: 0,
    perUserLimit: 1,
    firstOrderOnly: true,
    isActive: true,
  },
  {
    code: 'NEWYEAR20',
    description: 'Nepali New Year offer - 20% off orders above Rs. 2500. Maximum Rs. 800.',
    discountType: 'percentage',
    discountValue: 20,
    minOrderAmount: 2500,
    maxDiscountAmount: 800,
    expiresAt: daysFromNow(120),
    usageLimit: 500,
    perUserLimit: 1,
    firstOrderOnly: false,
    isActive: true,
  },
  {
    code: 'ACHAR150',
    description: 'Flat Rs. 150 off orders above Rs. 1200.',
    discountType: 'fixed',
    discountValue: 150,
    minOrderAmount: 1200,
    expiresAt: daysFromNow(60),
    usageLimit: 0,
    perUserLimit: 2,
    isActive: true,
  },
  {
    code: 'DASHAIN25',
    description: 'Dashain festival offer - 25% off gift hampers. Maximum Rs. 1000.',
    discountType: 'percentage',
    discountValue: 25,
    minOrderAmount: 2000,
    maxDiscountAmount: 1000,
    expiresAt: daysFromNow(45),
    usageLimit: 300,
    perUserLimit: 1,
    /** Filled in by the seed runner once the hamper category has an id. */
    appliesToCategorySlugs: ['gift-hampers'],
    isActive: true,
  },
  {
    code: 'EXPIRED10',
    description: 'Development fixture: an expired coupon, for testing the rejection path.',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 0,
    expiresAt: daysFromNow(-7),
    perUserLimit: 1,
    isActive: true,
  },
];

export const banners = [
  {
    title: 'Authentic Nepali Pickles, Made With Love',
    titleNp: 'प्रामाणिक नेपाली अचार, मायाले बनाइएको',
    subtitle: 'Hand-made in small batches. Delivered fresh across all 77 districts.',
    subtitleNp: 'सानो परिमाणमा हातले बनाइएको। नेपालका ७७ वटै जिल्लामा डेलिभरी।',
    image: {
      desktop: { url: photo('1596040033229-a9821ebd058d', 1920) },
      mobile: { url: photo('1596040033229-a9821ebd058d', 800) },
      alt: 'Jars of traditional Nepali pickle surrounded by fresh chillies and spices',
    },
    link: '/shop',
    ctaLabel: 'Shop Pickles',
    position: 'hero',
    order: 1,
    isActive: true,
  },
  {
    title: 'Free Delivery Above Rs. 2000',
    titleNp: 'रु. २००० माथि निःशुल्क डेलिभरी',
    subtitle: 'Inside Kathmandu Valley. Dispatched the same day if you order before 2 PM.',
    subtitleNp: 'काठमाडौं उपत्यकाभित्र। दिउँसो २ बजे अघिको अर्डर सोही दिन पठाइन्छ।',
    image: {
      desktop: { url: photo('1601493700631-2b16ec4b4716', 1920) },
      mobile: { url: photo('1601493700631-2b16ec4b4716', 800) },
      alt: 'Pickle jars packed for delivery in a cardboard box',
    },
    link: '/shipping',
    ctaLabel: 'Delivery Details',
    position: 'hero',
    order: 2,
    isActive: true,
  },
  {
    title: 'Dashain Gift Hampers',
    titleNp: 'दशैं उपहार सेट',
    subtitle: 'Four jars, sealed and boxed. The easiest gift to send home.',
    subtitleNp: 'चार बट्टा, सिल गरेर बाकसमा। घर पठाउन सबैभन्दा सजिलो उपहार।',
    image: {
      desktop: { url: photo('1549465220-1a8b9238cd48', 1600) },
      mobile: { url: photo('1549465220-1a8b9238cd48', 800) },
      alt: 'Gift hamper box of assorted Nepali pickle jars',
    },
    link: '/shop?category=gift-hampers',
    ctaLabel: 'View Hampers',
    position: 'promo',
    order: 1,
    isActive: true,
  },
  {
    title: 'New: Amala & Mango Pickles',
    titleNp: 'नयाँ: अमला र आँपको अचार',
    subtitle: 'This season’s fruit pickles are in stock.',
    image: {
      desktop: { url: photo('1591073113125-e46713c829ed', 1200) },
      mobile: { url: photo('1591073113125-e46713c829ed', 800) },
      alt: 'Fresh amala and mango beside pickle jars',
    },
    link: '/shop?category=fruit-pickles',
    ctaLabel: 'Shop Fruit Pickles',
    position: 'category',
    order: 1,
    isActive: true,
  },
];

/**
 * Blog posts. Written as real articles because they are the SEO surface: a shop
 * selling gundruk ranks for "how to eat gundruk" long before it ranks for its own
 * brand name. Content is HTML, matching what the admin editor produces and what
 * `sanitizeHtml` allows through.
 */
export const blogPosts = [
  {
    title: 'How Nepali Achar Is Actually Made: From Sun-Drying to the Jar',
    titleNp: 'नेपाली अचार कसरी बन्छ',
    slug: 'how-nepali-achar-is-made',
    excerpt:
      'Every step of a traditional Nepali pickle, from choosing the vegetable to sealing the jar - and why the shortcuts most commercial pickles take are obvious in the first bite.',
    category: 'Nepali Food',
    tags: ['achar', 'traditional', 'how it is made', 'mustard oil'],
    featuredImage: {
      url: photo('1596040033229-a9821ebd058d'),
      alt: 'Vegetables drying in the sun before being made into pickle',
    },
    content: `
<p>Ask ten Nepali households how they make achar and you will get ten answers. What does not change is the sequence: dry, temper, cure, rest. Skip any of the four and you get something that tastes like a pickle for a week and then does not.</p>
<h2>1. Drying</h2>
<p>Vegetables are sliced and left in the sun for one to three days depending on their water content. Radish takes two days, cauliflower barely one. This is the step commercial producers skip most often, because it costs time and floor space. The result of skipping it is a wet pickle that ferments unpredictably in the jar and turns soft within a month.</p>
<h2>2. Tempering the spices</h2>
<p>Fenugreek, cumin and mustard seed are dry-roasted separately, not together - fenugreek burns in half the time cumin needs, and burnt fenugreek is bitter in a way nothing later can correct. They are ground only after cooling.</p>
<h2>3. The oil</h2>
<p>Cold-pressed mustard oil is heated to smoking point and then cooled before use. Heating drives off the sharpness; using it raw leaves a pungency that overwhelms everything else. This is also what preserves the pickle: the oil layer keeps air off the vegetable.</p>
<h2>4. Curing and resting</h2>
<p>The pickle is mixed, packed, and left for at least five days before it is sold. It tastes noticeably better at three weeks. Anyone who sells you achar made the same morning is selling you a salad.</p>
<h2>How to keep it</h2>
<p>Use a dry spoon, always. Water in the jar is the single most common cause of a pickle spoiling early. Keep the oil covering the top layer and refrigerate anything with meat or fish in it.</p>
`,
    authorName: 'Sunita Shrestha',
    status: 'published',
    seo: {
      title: 'How Nepali Achar Is Made - Traditional Pickle Process',
      description:
        'The four steps behind traditional Nepali pickle: sun-drying, tempering, mustard oil and resting. Why shortcuts show up in the taste.',
      keywords: ['how nepali achar is made', 'traditional pickle process', 'mustard oil pickle'],
    },
  },
  {
    title: 'Gundruk: Nepal’s Fermented Green, Explained',
    slug: 'gundruk-explained',
    excerpt:
      'What gundruk is, how the fermentation works, why it tastes nothing like sauerkraut, and five ways to eat it beyond the usual soup.',
    category: 'Food Culture',
    tags: ['gundruk', 'fermented', 'himalayan food', 'probiotic'],
    featuredImage: {
      url: photo('1585032226651-759b368d7246'),
      alt: 'Fermented gundruk leaves in a traditional Nepali bowl',
    },
    content: `
<p>Gundruk is leafy greens - usually mustard, radish or cauliflower leaves - fermented without salt, dried, and kept for months. It is one of very few fermented foods in the world made with no brine at all.</p>
<h2>How the fermentation works</h2>
<p>The leaves are wilted in the sun for a day, crushed, and packed tightly into an airtight container. Nothing is added. The moisture already in the leaves is enough for the lactic acid bacteria naturally present to take over, and packing tightly is what keeps oxygen out so they win rather than the moulds. After about two weeks the batch is sour, and it is then dried completely for storage.</p>
<h2>Why it does not taste like sauerkraut</h2>
<p>Sauerkraut is salt-brined and stays wet. Gundruk is dried after fermenting, which concentrates everything and adds a smoky, almost tea-like quality that a wet ferment never develops.</p>
<h2>Five ways to eat it</h2>
<ul>
<li><strong>Gundruk ko jhol</strong> - a thin sour soup with tomato and green chilli.</li>
<li><strong>Gundruk sadeko</strong> - tossed raw with mustard oil, chilli and onion.</li>
<li><strong>As achar</strong> - tempered with garlic and timur, kept in oil.</li>
<li><strong>With bhatmas</strong> - stirred through fried soybeans as a snack.</li>
<li><strong>In dal</strong> - a spoonful added to lentils in the last five minutes.</li>
</ul>
<h2>Is it good for you?</h2>
<p>Gundruk is high in iron and vitamin C and, because it is naturally fermented, contains live lactic acid bacteria before drying. It is also high in sodium once it has been made into achar - worth knowing if you are watching your salt.</p>
`,
    authorName: 'Ramesh Thapa',
    status: 'published',
    seo: {
      title: 'What Is Gundruk? Nepal’s Fermented Green Explained',
      description:
        'Gundruk is salt-free fermented leafy greens from Nepal. How it is made, why it differs from sauerkraut, and five ways to eat it.',
      keywords: ['gundruk', 'fermented nepali food', 'gundruk recipe', 'what is gundruk'],
    },
  },
  {
    title: 'Five Nepali Pickles That Go With Absolutely Everything',
    slug: 'five-nepali-pickles-for-every-meal',
    excerpt:
      'A short guide to pairing achar - which pickle belongs with dal bhat, which with momo, and which one you should not put near a guest without warning them.',
    category: 'Cooking Tips',
    tags: ['pairing', 'dal bhat', 'momo', 'guide'],
    featuredImage: {
      url: photo('1590779033100-9f60a05a013d'),
      alt: 'A dal bhat plate with several kinds of pickle',
    },
    content: `
<p>Achar is a condiment, not a side dish, and the pairing matters more than people assume. Here is the short version.</p>
<h2>Mula ko achar - with dal bhat</h2>
<p>Sharp and oily, it cuts through plain rice and lentils better than anything else. The default for a reason.</p>
<h2>Golbheda ko achar - with momo</h2>
<p>The tomato-sesame chutney exists for dumplings. It is also excellent with sekuwa and anything fried.</p>
<h2>Lapsi ko achar - with heavy meals</h2>
<p>Sweet, sour and slightly numbing. Serve it after a rich meat curry rather than alongside it.</p>
<h2>Sukuti achar - on its own</h2>
<p>With beaten rice and tea, in the afternoon. Putting it next to a delicate dish wastes both.</p>
<h2>Dalle khursani - carefully</h2>
<p>Around 100,000 Scoville. A quarter teaspoon is a serving, and it is polite to say so before passing the jar.</p>
<h2>A note on quantity</h2>
<p>A tablespoon of achar per person per meal is plenty. Most Nepali pickles carry 300 to 450 mg of sodium per 15 g serving, which adds up faster than the small portions suggest.</p>
`,
    authorName: 'Sunita Shrestha',
    status: 'published',
    seo: {
      title: 'Five Nepali Pickles and What to Eat Them With',
      description:
        'A pairing guide to Nepali achar: which pickle goes with dal bhat, momo, sekuwa and heavy curries.',
      keywords: ['nepali pickle pairing', 'achar with dal bhat', 'momo chutney', 'best nepali achar'],
    },
  },
  {
    title: 'Timur, Jimbu and Dalle: The Three Spices That Make Nepali Food Nepali',
    slug: 'timur-jimbu-dalle-nepali-spices',
    excerpt:
      'Sichuan pepper, Himalayan herb and the round chilli of Ilam - what each one does, and why substituting them never quite works.',
    category: 'Health & Ingredients',
    tags: ['timur', 'jimbu', 'dalle khursani', 'spices'],
    featuredImage: {
      url: photo('1583454110551-21f2fa2afe61'),
      alt: 'Timur, jimbu and dalle khursani spices laid out on a wooden board',
    },
    content: `
<p>Nepali cooking shares most of its pantry with northern India, but three ingredients set it apart, and none of them substitutes cleanly.</p>
<h2>Timur</h2>
<p>Nepali Sichuan pepper. Not hot - it is a numbing, citric tingle from a compound called hydroxy-alpha-sanshool. Black pepper is not a substitute; it adds heat where timur adds sensation. Roast it lightly and grind it fresh, because the tingle fades fast once ground.</p>
<h2>Jimbu</h2>
<p>A dried Himalayan herb from the allium family, used mostly in dal and mountain cooking. Somewhere between chive and garlic when fried in ghee. It is added to hot fat for a few seconds only; longer and it turns bitter.</p>
<h2>Dalle khursani</h2>
<p>The round red chilli of Ilam and the eastern hills. Around 100,000 Scoville, comparable to a habanero but fruitier. It is almost always pickled whole rather than powdered, which is why dalle achar is a distinct product rather than a chilli sauce.</p>
<h2>Buying and keeping them</h2>
<p>Buy timur whole, not ground. Keep jimbu in an airtight jar away from light. Dalle is easiest to keep pickled - fresh, it lasts about a week.</p>
`,
    authorName: 'Ramesh Thapa',
    status: 'published',
    seo: {
      title: 'Timur, Jimbu and Dalle Khursani - Nepali Spices Explained',
      description:
        'What timur, jimbu and dalle khursani taste like, how to use them, and why common substitutes do not work.',
      keywords: ['timur', 'jimbu', 'dalle khursani', 'nepali spices'],
    },
  },
  {
    title: 'Sending Achar Abroad: What Actually Survives the Journey',
    slug: 'sending-achar-abroad',
    excerpt:
      'Which pickles travel, how to pack them so a jar does not open in transit, and what customs rules mean for meat and fish achar.',
    category: 'Company News',
    tags: ['shipping', 'diaspora', 'packing', 'customs'],
    featuredImage: {
      url: photo('1607083206968-13611e3d76db'),
      alt: 'Pickle jars wrapped and packed for international shipping',
    },
    content: `
<p>A large share of the messages we get are from people trying to send pickle to family abroad. Some of it works well; some of it should not be attempted.</p>
<h2>What travels</h2>
<p>Oil-cured vegetable and fruit pickles travel well. They are shelf-stable, the oil layer protects them, and a sealed jar handles temperature swings without trouble.</p>
<h2>What does not</h2>
<p>Meat and fish achar are restricted or outright banned by most customs authorities, including Australia, the UK, the EU and the United States. We do not ship them internationally, and a parcel that contains them is likely to be destroyed rather than returned.</p>
<h2>Packing</h2>
<p>Tape the lid seal, bag each jar individually, and pad with newspaper rather than loose fill - loose fill compacts in transit and the jars end up touching. Glass jars need at least two centimetres of padding on every side.</p>
<h2>What we do</h2>
<p>Domestic orders ship in rigid boxes with tamper-proof lid seals. For international orders we currently ship only vegetarian pickles, and we mark the customs declaration accurately - under-declaring the contents of a food parcel is how a shipment gets seized.</p>
`,
    authorName: 'Deeva Achar Team',
    status: 'published',
    seo: {
      title: 'Sending Nepali Achar Abroad - Packing and Customs Guide',
      description:
        'Which Nepali pickles can be shipped internationally, how to pack glass jars for transit, and why meat achar is restricted.',
      keywords: ['send achar abroad', 'shipping nepali pickle', 'customs food rules nepal'],
    },
  },
  {
    title: 'Mula Ko Achar at Home: A Recipe That Keeps for Months',
    slug: 'mula-ko-achar-recipe',
    excerpt:
      'The radish pickle recipe we use, scaled to a home kitchen - with the two mistakes that cause almost every failed batch.',
    category: 'Pickle Recipes',
    tags: ['recipe', 'mula ko achar', 'radish', 'home cooking'],
    featuredImage: {
      url: photo('1518977676601-b53f82aba655'),
      alt: 'Sliced radish drying on a tray before pickling',
    },
    content: `
<p>This makes roughly one kilogram and keeps for six months in a cool cupboard.</p>
<h2>Ingredients</h2>
<ul>
<li>1.5 kg white radish (it loses about a third of its weight drying)</li>
<li>250 ml cold-pressed mustard oil</li>
<li>2 tbsp fenugreek seeds</li>
<li>1 tbsp turmeric powder</li>
<li>3 tbsp dried red chilli powder, preferably Jumla</li>
<li>1 whole garlic bulb, sliced</li>
<li>3 tbsp salt</li>
</ul>
<h2>Method</h2>
<ol>
<li>Slice the radish into strips about the thickness of a pencil. Spread on a tray and sun-dry for two full days until leathery but not brittle.</li>
<li>Dry-roast the fenugreek on low heat until it darkens by one shade and smells nutty. Do not let it blacken. Cool, then grind.</li>
<li>Heat the mustard oil until it just smokes, then take it off the heat and let it cool to warm.</li>
<li>Mix the dried radish with salt, turmeric, chilli, garlic and ground fenugreek. Pour over the warm oil and mix until every piece is coated.</li>
<li>Pack into a sterilised glass jar, pressing down so the oil covers the top. Leave in the sun for three days, shaking once a day, then move to a cupboard.</li>
</ol>
<h2>The two mistakes</h2>
<p><strong>Not drying enough.</strong> If the radish is still bendy and moist, the pickle will ferment and go slimy within weeks. It should feel like leather.</p>
<p><strong>Burning the fenugreek.</strong> It goes from nutty to bitter in about fifteen seconds, and there is no way to fix a batch once it has. Roast it alone, on low heat, and take it off early if unsure.</p>
<p>Ready in five days, better at three weeks.</p>
`,
    authorName: 'Sunita Shrestha',
    status: 'published',
    seo: {
      title: 'Mula Ko Achar Recipe - Nepali Radish Pickle at Home',
      description:
        'A tested Nepali radish pickle recipe that keeps for six months, plus the two mistakes that ruin most home batches.',
      keywords: ['mula ko achar recipe', 'radish pickle recipe', 'nepali achar recipe'],
    },
  },
];

/**
 * The five policy pages, stored as HTML on the settings singleton.
 *
 * These are commercial commitments, not filler: the returns window, the refund
 * timeline and the COD rules below are the ones the order and refund code actually
 * implements, so the page and the software agree.
 */
export const policies = {
  shipping: `
<h2>Delivery Areas</h2>
<p>We deliver to all 77 districts of Nepal. Delivery charges and timelines depend on your district and are calculated at checkout before you pay.</p>
<h2>Charges and Timelines</h2>
<table>
<tr><th>Zone</th><th>Charge</th><th>Delivery Time</th><th>Free Above</th></tr>
<tr><td>Kathmandu Valley</td><td>Rs. 100</td><td>1-2 days</td><td>Rs. 2,000</td></tr>
<tr><td>Bagmati (outside Valley)</td><td>Rs. 150</td><td>2-3 days</td><td>Rs. 2,500</td></tr>
<tr><td>Major cities</td><td>Rs. 180</td><td>3-4 days</td><td>Rs. 3,000</td></tr>
<tr><td>Terai &amp; Hills</td><td>Rs. 220</td><td>4-6 days</td><td>Rs. 3,500</td></tr>
<tr><td>Remote districts</td><td>Rs. 350</td><td>6-10 days</td><td>-</td></tr>
</table>
<h2>Dispatch</h2>
<p>Orders placed before 2:00 PM (Nepal Time) on a working day are dispatched the same day. Orders placed later, or on a public holiday, are dispatched the next working day.</p>
<h2>Cash on Delivery</h2>
<p>COD is available in most zones for orders up to Rs. 20,000. A COD handling charge of Rs. 25-75 applies outside Kathmandu Valley and is shown at checkout. COD is not available in remote districts, where couriers do not collect payment.</p>
<h2>Tracking</h2>
<p>You will receive an order number by email and SMS. Track it at any time from the Track Order page - no account required, and no login needed for orders placed as a guest.</p>
<h2>Delays</h2>
<p>Delivery timelines are working days and exclude public holidays and bandhs. Road closures during monsoon can add several days to hill and mountain routes. We will contact you if your order is materially delayed.</p>
`,
  returns: `
<h2>Food Products and Returns</h2>
<p>Because our products are consumable food items, <strong>we cannot accept returns on opened jars</strong>. This is a food safety requirement, not a commercial preference.</p>
<h2>When We Will Replace or Refund</h2>
<p>We will replace the item or refund you in full if:</p>
<ul>
<li>The jar arrived broken, leaking or with a damaged seal.</li>
<li>You received the wrong product or the wrong size.</li>
<li>The product was past its shelf life on arrival.</li>
<li>The pickle is spoiled or contaminated on opening.</li>
</ul>
<h2>How to Claim</h2>
<p>Contact us within <strong>48 hours of delivery</strong> with your order number and photographs of the item and packaging. Photographs are required - they are how we make a claim against the courier, and without them we usually cannot.</p>
<h2>Refund Timeline</h2>
<ul>
<li><strong>Khalti / eSewa:</strong> refunded to the original wallet within 5-7 working days of approval.</li>
<li><strong>Cash on Delivery:</strong> refunded by bank transfer or wallet within 7-10 working days. We will ask for the details we need.</li>
</ul>
<p>The delivery charge is refunded only when the fault was ours.</p>
<h2>Cancellation</h2>
<p>You may cancel a paid order at no cost at any time before it is dispatched, from your account or by contacting us. Once dispatched, an order cannot be cancelled - the returns process above applies instead.</p>
`,
  privacy: `
<h2>What We Collect</h2>
<p>We collect the information you give us: your name, email, phone number and delivery address; your order and payment history; and, if you create an account, your saved addresses and wishlist. We also record basic technical information such as your IP address and pages viewed.</p>
<h2>What We Do Not Collect</h2>
<p><strong>We never see or store your card, wallet or bank details.</strong> Payments are handled entirely by Khalti and eSewa on their own systems. We receive only a transaction reference and a success or failure result.</p>
<h2>How We Use It</h2>
<ul>
<li>To process, deliver and support your orders.</li>
<li>To send transactional messages: order confirmations, dispatch notices and delivery updates.</li>
<li>To send marketing email, but only if you have opted in. Every marketing email carries a one-click unsubscribe link.</li>
<li>To understand which products and pages are popular, in aggregate.</li>
</ul>
<h2>Who We Share It With</h2>
<p>Delivery partners receive your name, address and phone number so they can deliver your order. Payment gateways receive the amount and order reference. We do not sell your data to anyone, for any purpose.</p>
<h2>Cookies</h2>
<p>We use cookies for authentication (an HTTP-only session cookie), for CSRF protection, and to remember your cart. We do not use third-party advertising cookies.</p>
<h2>Your Rights</h2>
<p>You may request a copy of your data, ask us to correct it, or ask us to delete your account. Write to privacy@deevaachar.com.np. We keep order records for seven years where tax law requires it, even after an account is deleted.</p>
<h2>Security</h2>
<p>Passwords are hashed with bcrypt and are never stored or recoverable in plain text. All traffic is served over HTTPS.</p>
`,
  terms: `
<h2>Agreement</h2>
<p>By placing an order you agree to these terms. They are governed by the laws of Nepal, and disputes fall to the courts of Kathmandu.</p>
<h2>Prices and Availability</h2>
<p>All prices are in Nepali Rupees and include VAT where applicable. We may change prices at any time, but the price shown when you place an order is the price you pay. <strong>The final amount is always calculated on our server</strong> from the product price, quantity, discount and delivery charge - regardless of what your browser displays.</p>
<p>Products are subject to availability. If we cannot fulfil an item after you have paid, we will refund it in full.</p>
<h2>Orders</h2>
<p>An order is a request to buy, and is accepted when we confirm it. We may decline an order where stock has run out, the delivery address is not serviceable, we cannot verify payment, or we suspect fraud.</p>
<h2>Accounts</h2>
<p>You are responsible for keeping your password confidential and for activity on your account. Tell us immediately if you suspect unauthorised use. We may suspend an account that is used for fraud or abuse.</p>
<h2>Reviews</h2>
<p>Reviews may be published only by customers who bought the product. We moderate reviews before publication and remove those that are abusive, off-topic or fake. We do not remove reviews for being critical.</p>
<h2>Intellectual Property</h2>
<p>All content on this site - text, photography, logos and product descriptions - belongs to Deeva Achar Pvt. Ltd. and may not be reproduced commercially without written permission.</p>
<h2>Liability</h2>
<p>Please read the allergen information on every product page before ordering. Our liability for any order is limited to the amount you paid for it.</p>
`,
  payment: `
<h2>Ways to Pay</h2>
<ul>
<li><strong>Khalti</strong> - digital wallet, mobile banking and connected cards.</li>
<li><strong>eSewa</strong> - digital wallet and linked bank accounts.</li>
<li><strong>Cash on Delivery</strong> - available in most districts for orders up to Rs. 20,000.</li>
</ul>
<h2>How Payment Is Verified</h2>
<p>When you pay with Khalti or eSewa you are redirected to the gateway's own secure page. We never see your wallet PIN, card number or banking credentials.</p>
<p>When the gateway sends you back to us, <strong>we verify the payment directly with the gateway's servers before marking the order as paid</strong>. We confirm both the transaction reference and that the amount received matches the amount owed. A browser redirect alone never marks an order paid - which is why a tampered redirect cannot produce a paid order.</p>
<h2>Failed and Cancelled Payments</h2>
<p>If a payment fails or you cancel it, no order is confirmed and no money is taken. If your wallet was debited but the order did not confirm, contact us with the transaction reference - the amount is normally reversed by the gateway within 24 hours, and we will chase it with them if it is not.</p>
<h2>Cash on Delivery</h2>
<p>Pay the courier in cash when the parcel arrives. Please keep the exact amount ready. A handling charge of Rs. 25-75 applies outside Kathmandu Valley and is shown at checkout before you confirm. Repeatedly refusing COD deliveries may result in COD being disabled for your account.</p>
<h2>Refunds</h2>
<p>Wallet payments are refunded to the original wallet within 5-7 working days of approval. COD orders are refunded by bank transfer or wallet within 7-10 working days. See our Returns Policy for what qualifies.</p>
<h2>Security</h2>
<p>We do not store card details. We do not store wallet credentials. Every payment is verified server-side against the gateway.</p>
`,
};

export default { deliveryZones, coupons, banners, blogPosts, policies };
