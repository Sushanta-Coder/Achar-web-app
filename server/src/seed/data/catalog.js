/**
 * Seed catalogue.
 *
 * Real Nepali pickles with real ingredients, priced in whole rupees at roughly what
 * a Kathmandu shop charges. Nothing here is lorem ipsum: the copy is what the
 * storefront will actually display, so layout problems (a long Devanagari name
 * wrapping badly, a description that overflows a card) show up during development
 * rather than after launch.
 *
 * Image URLs point at Unsplash. They are placeholders for photography the company
 * will replace, but they are real, hotlinkable images with sensible dimensions, so
 * the grid, gallery and lazy-loading all behave as they will in production.
 */

const photo = (id, width = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`;

export const categories = [
  {
    name: 'Vegetable Pickles',
    nameNp: 'तरकारीको अचार',
    slug: 'vegetable-pickles',
    description:
      'Everyday achar built on Nepali vegetables - radish, cauliflower, carrot and green chilli, cured in mustard oil with roasted fenugreek.',
    descriptionNp:
      'मुला, काउली, गाजर र हरियो खुर्सानीबाट बनेको दैनिक अचार, तोरीको तेल र भुटेको मेथीमा।',
    icon: '🥬',
    order: 1,
    isFeatured: true,
    image: { url: photo('1596040033229-a9821ebd058d'), alt: 'Mixed Nepali vegetable pickle in a glass jar' },
    seo: {
      title: 'Vegetable Pickles - Nepali Achar Made With Mustard Oil',
      description:
        'Traditional Nepali vegetable pickles: radish, cauliflower, carrot and green chilli achar in mustard oil. Delivered fresh across Nepal.',
      keywords: ['vegetable achar', 'तरकारीको अचार', 'nepali pickle', 'mula ko achar'],
    },
  },
  {
    name: 'Fruit Pickles',
    nameNp: 'फलफूलको अचार',
    slug: 'fruit-pickles',
    description:
      'Sweet-sour pickles from Nepali orchards - lapsi, mango and amala, balanced with jaggery, timur and rock salt.',
    descriptionNp: 'लप्सी, आँप र अमलाबाट बनेको गुलियो-अमिलो अचार, सख्खर र टिमुरसँग।',
    icon: '🥭',
    order: 2,
    isFeatured: true,
    image: { url: photo('1601493700631-2b16ec4b4716'), alt: 'Sweet and sour lapsi fruit pickle' },
    seo: {
      title: 'Fruit Pickles - Lapsi, Mango & Amala Achar',
      description:
        'Sweet and sour Nepali fruit pickles made with lapsi, mango and amala. No artificial colour or preservatives.',
      keywords: ['lapsi achar', 'लप्सीको अचार', 'mango pickle nepal', 'amala achar'],
    },
  },
  {
    name: 'Meat & Fish Pickles',
    nameNp: 'मासु र माछाको अचार',
    slug: 'meat-fish-pickles',
    description:
      'Slow-cooked non-vegetarian achar - buff sukuti, chicken and dried fish, heavy on timur, garlic and Jumla chilli.',
    descriptionNp: 'सुकुटी, कुखुरा र सुकेको माछाको अचार, टिमुर, लसुन र जुम्ली खुर्सानीसँग।',
    icon: '🍖',
    order: 3,
    isFeatured: true,
    image: { url: photo('1606850780554-b55ea4dd0b70'), alt: 'Buff sukuti pickle with dried red chillies' },
    seo: {
      title: 'Meat & Fish Pickles - Sukuti and Sidra Achar',
      description:
        'Nepali non-vegetarian pickles: buff sukuti achar, chicken pickle and sidra fish achar, hand-made in small batches.',
      keywords: ['sukuti achar', 'सुकुटीको अचार', 'meat pickle nepal', 'sidra achar'],
    },
  },
  {
    name: 'Fermented Pickles',
    nameNp: 'कुनाउने अचार',
    slug: 'fermented-pickles',
    description:
      'Sun-fermented classics - gundruk, sinki and mula ko sandheko, cured the way hill kitchens have done for generations.',
    descriptionNp: 'गुन्द्रुक, सिन्की र मुलाको सन्देको - पहाडी भान्साको परम्परागत तरिकाले।',
    icon: '🫙',
    order: 4,
    isFeatured: true,
    image: { url: photo('1585032226651-759b368d7246'), alt: 'Fermented gundruk pickle in a traditional bowl' },
    seo: {
      title: 'Fermented Pickles - Gundruk & Sinki Achar',
      description:
        'Traditionally sun-fermented Nepali pickles. Gundruk and sinki achar with no vinegar and no artificial fermentation.',
      keywords: ['gundruk achar', 'गुन्द्रुक', 'sinki', 'fermented nepali pickle'],
    },
  },
  {
    name: 'Chutneys & Sauces',
    nameNp: 'चटनी',
    slug: 'chutneys',
    description:
      'Fresh-style chutneys for momo and sekuwa - tomato, sesame and dalle khursani, ground rather than pickled.',
    descriptionNp: 'मम र सेकुवाका लागि गोलभेडा, तिल र डल्ले खुर्सानीको चटनी।',
    icon: '🌶️',
    order: 5,
    isFeatured: true,
    image: { url: photo('1565299624946-b28f40a0ae38'), alt: 'Tomato and sesame momo chutney in a bowl' },
    seo: {
      title: 'Nepali Chutneys - Momo Achar & Dalle Sauce',
      description:
        'Momo chutney, sesame-tomato achar and dalle khursani sauce. The Nepali table sauces, made properly.',
      keywords: ['momo chutney', 'मम अचार', 'dalle khursani sauce', 'golbheda ko achar'],
    },
  },
  {
    name: 'Gift Hampers',
    nameNp: 'उपहार सेट',
    slug: 'gift-hampers',
    description:
      'Curated sets in reusable jars, packed for Dashain, Tihar and gifting abroad. Every hamper travels with tamper-proof seals.',
    descriptionNp: 'दशैं, तिहार र उपहारका लागि मिलाइएको सेट, पुन: प्रयोगयोग्य बट्टामा।',
    icon: '🎁',
    order: 6,
    isFeatured: false,
    image: { url: photo('1549465220-1a8b9238cd48'), alt: 'Gift hamper of assorted Nepali pickle jars' },
    seo: {
      title: 'Pickle Gift Hampers - Dashain & Tihar Sets',
      description:
        'Nepali pickle gift hampers in reusable jars. Curated sets for Dashain, Tihar and sending a taste of home.',
      keywords: ['dashain gift', 'pickle hamper', 'उपहार सेट', 'nepali food gift'],
    },
  },
];

/**
 * Variant pricing.
 *
 * Every product is sold in the same three sizes, and the per-gram price falls as the
 * jar gets bigger - which is both what real shops do and what makes the size selector
 * on the product page worth having. `sku` is derived from the product's SKU so the
 * unique index on `variants.sku` cannot collide.
 */
const sizes = (base, { discount250 = null } = {}) => [
  {
    size: '250g',
    sizeNp: '२५० ग्राम',
    weightGrams: 250,
    price: base,
    discountPrice: discount250,
    stock: 60,
    lowStockThreshold: 10,
    isDefault: true,
  },
  {
    size: '500g',
    sizeNp: '५०० ग्राम',
    weightGrams: 500,
    price: Math.round((base * 1.85) / 5) * 5,
    stock: 40,
    lowStockThreshold: 8,
  },
  {
    size: '1kg',
    sizeNp: '१ केजी',
    weightGrams: 1000,
    price: Math.round((base * 3.4) / 5) * 5,
    stock: 18,
    lowStockThreshold: 5,
  },
];

export const products = [
  {
    name: 'Mula Ko Achar (Radish Pickle)',
    nameNp: 'मुलाको अचार',
    slug: 'mula-ko-achar-radish-pickle',
    sku: 'AG-VEG-MULA',
    categorySlug: 'vegetable-pickles',
    shortDescription:
      'Sun-dried radish cured in mustard oil with fenugreek and turmeric. The achar most Nepali kitchens are never without.',
    shortDescriptionNp: 'घाममा सुकाएको मुला, तोरीको तेल, मेथी र बेसारमा।',
    description:
      'Radish is sliced thin, sun-dried for two days until it turns leathery, then cured in cold-pressed mustard oil with roasted fenugreek, turmeric and Jumla chilli. Drying first is what gives the pickle its bite - a shortcut with fresh radish makes a wetter, blander achar that will not keep. Eat it with dal bhat, or with beaten rice and black tea in the afternoon.',
    descriptionNp:
      'मुलालाई पातलो काटेर दुई दिन घाममा सुकाइन्छ, त्यसपछि तोरीको तेल, भुटेको मेथी, बेसार र जुम्ली खुर्सानीमा मुछिन्छ। दाल भात वा चिउरासँग मिल्छ।',
    spiceLevel: 'medium',
    ingredients: ['Radish', 'Mustard oil', 'Fenugreek', 'Turmeric', 'Jumla chilli', 'Salt', 'Garlic'],
    ingredientsNp: ['मुला', 'तोरीको तेल', 'मेथी', 'बेसार', 'जुम्ली खुर्सानी', 'नुन', 'लसुन'],
    allergens: ['Mustard'],
    shelfLife: '9 months unopened, 6 weeks after opening',
    storageInstructions: 'Keep in a cool, dry place away from sunlight. Use a dry spoon. Refrigerate after opening.',
    nutrition: { servingSize: '15 g', calories: 48, protein: 0.6, carbohydrates: 2.1, sugar: 1.2, fat: 4.2, sodium: 310 },
    variants: sizes(295, { discount250: 260 }),
    images: [
      { url: photo('1596040033229-a9821ebd058d'), alt: 'Jar of Nepali radish pickle with mustard oil' },
      { url: photo('1590779033100-9f60a05a013d'), alt: 'Radish pickle served beside dal bhat' },
    ],
    isFeatured: true,
    isBestSeller: true,
    keywords: ['mula ko achar', 'मुलाको अचार', 'radish pickle', 'nepali achar'],
    seo: {
      title: 'Mula Ko Achar - Nepali Radish Pickle in Mustard Oil',
      description:
        'Sun-dried radish pickle cured in mustard oil with fenugreek and turmeric. 250g, 500g and 1kg jars delivered across Nepal.',
      keywords: ['mula ko achar', 'radish pickle nepal', 'मुलाको अचार'],
    },
  },
  {
    name: 'Lapsi Ko Achar (Nepali Hog Plum)',
    nameNp: 'लप्सीको अचार',
    slug: 'lapsi-ko-achar',
    sku: 'AG-FRU-LAPSI',
    categorySlug: 'fruit-pickles',
    shortDescription:
      'Sweet-sour lapsi simmered with jaggery, timur and rock salt. Nepal has no real equivalent anywhere else.',
    shortDescriptionNp: 'सख्खर, टिमुर र बिरे नुनसँग पकाइएको गुलियो-अमिलो लप्सी।',
    description:
      'Lapsi (Nepali hog plum) is steamed until the flesh loosens from the stone, then cooked down with jaggery, timur and rock salt until it thickens to a spoonable paste. Nothing is added to set it - the pectin in the fruit does that on its own, which is why the texture varies slightly between batches and why we do not correct it. Sour, sweet and faintly numbing from the timur.',
    descriptionNp:
      'लप्सीलाई बाफमा पकाएर सख्खर, टिमुर र बिरे नुनसँग बाक्लो नहुन्जेल पकाइन्छ। कुनै कृत्रिम गाढा बनाउने पदार्थ हालिँदैन।',
    spiceLevel: 'mild',
    ingredients: ['Lapsi (hog plum)', 'Jaggery', 'Timur (Sichuan pepper)', 'Rock salt', 'Cumin', 'Dried chilli'],
    ingredientsNp: ['लप्सी', 'सख्खर', 'टिमुर', 'बिरे नुन', 'जीरा', 'सुकेको खुर्सानी'],
    allergens: [],
    shelfLife: '12 months unopened, 2 months after opening',
    storageInstructions: 'Store in a cool, dry place. Refrigerate after opening and always use a dry spoon.',
    nutrition: { servingSize: '15 g', calories: 52, protein: 0.3, carbohydrates: 11.4, sugar: 9.8, fat: 0.4, sodium: 180 },
    variants: sizes(340),
    images: [
      { url: photo('1601493700631-2b16ec4b4716'), alt: 'Sweet and sour lapsi pickle in a glass jar' },
      { url: photo('1610970881699-44a5587cabec'), alt: 'Fresh lapsi fruit beside a jar of pickle' },
    ],
    isFeatured: true,
    isBestSeller: true,
    keywords: ['lapsi achar', 'लप्सीको अचार', 'hog plum pickle', 'sweet sour achar'],
    seo: {
      title: 'Lapsi Ko Achar - Sweet & Sour Nepali Hog Plum Pickle',
      description:
        'Lapsi pickle cooked with jaggery, timur and rock salt. No artificial colour, no preservatives. Delivered across Nepal.',
      keywords: ['lapsi achar', 'लप्सीको अचार', 'nepali hog plum pickle'],
    },
  },
  {
    name: 'Buff Sukuti Achar',
    nameNp: 'सुकुटीको अचार',
    slug: 'buff-sukuti-achar',
    sku: 'AG-MEA-SUKUTI',
    categorySlug: 'meat-fish-pickles',
    shortDescription:
      'Air-dried buffalo, shredded and cooked slowly with timur, garlic and Jumla chilli. Hot, and meant to be.',
    shortDescriptionNp: 'सुकाएको राँगाको मासु, टिमुर, लसुन र जुम्ली खुर्सानीसँग बिस्तारै पकाइएको।',
    description:
      'Buffalo is salted and air-dried for a week, shredded by hand, then fried slowly in mustard oil with garlic, ginger, timur and Jumla chilli until the strands darken and stiffen. Hand-shredding matters: a machine cuts across the grain and the achar turns powdery. Best with chiura and a cold drink, which is how it is eaten in the hills.',
    descriptionNp:
      'राँगाको मासुलाई नुन हालेर एक हप्ता सुकाइन्छ, हातले च्यातेर तोरीको तेलमा लसुन, अदुवा, टिमुर र जुम्ली खुर्सानीसँग बिस्तारै भुटिन्छ।',
    spiceLevel: 'hot',
    isVegetarian: false,
    ingredients: ['Buffalo meat', 'Mustard oil', 'Timur', 'Garlic', 'Ginger', 'Jumla chilli', 'Salt', 'Cumin'],
    ingredientsNp: ['राँगाको मासु', 'तोरीको तेल', 'टिमुर', 'लसुन', 'अदुवा', 'जुम्ली खुर्सानी', 'नुन', 'जीरा'],
    allergens: ['Mustard'],
    shelfLife: '6 months unopened, 3 weeks after opening',
    storageInstructions: 'Refrigerate after opening and finish within three weeks. Always use a dry spoon.',
    nutrition: { servingSize: '15 g', calories: 71, protein: 5.8, carbohydrates: 1.1, sugar: 0.4, fat: 5.1, sodium: 420 },
    variants: sizes(520),
    images: [
      { url: photo('1606850780554-b55ea4dd0b70'), alt: 'Buff sukuti pickle with dried red chillies' },
      { url: photo('1574484284002-952d92456975'), alt: 'Sukuti achar served with beaten rice' },
    ],
    isFeatured: true,
    isBestSeller: true,
    keywords: ['sukuti achar', 'सुकुटीको अचार', 'buff pickle', 'dried meat achar'],
    seo: {
      title: 'Buff Sukuti Achar - Nepali Dried Buffalo Pickle',
      description:
        'Hand-shredded air-dried buffalo cooked with timur, garlic and Jumla chilli. Hot Nepali meat pickle in 250g, 500g and 1kg jars.',
      keywords: ['sukuti achar', 'buff sukuti', 'सुकुटीको अचार'],
    },
  },
  {
    name: 'Gundruk Ko Achar',
    nameNp: 'गुन्द्रुकको अचार',
    slug: 'gundruk-ko-achar',
    sku: 'AG-FER-GUNDRUK',
    categorySlug: 'fermented-pickles',
    shortDescription:
      'Leafy greens fermented in the sun, then tempered with garlic and chilli. Sour, smoky and entirely Nepali.',
    shortDescriptionNp: 'घाममा कुहाइएको सागलाई लसुन र खुर्सानीले झानेको।',
    description:
      'Mustard and radish leaves are packed tight, left to ferment in the sun for a fortnight, dried, and then tempered with garlic, chilli and timur. There is no vinegar in this - the sourness is lactic, from the fermentation itself, and it is the reason gundruk tastes nothing like a Western pickle. Eat it with rice, or stir a spoonful into dal.',
    descriptionNp:
      'रायो र मुलाको सागलाई घाममा दुई हप्ता कुहाएर सुकाइन्छ, अनि लसुन, खुर्सानी र टिमुरले झानिन्छ। सिरका हालिँदैन।',
    spiceLevel: 'medium',
    ingredients: ['Fermented mustard leaves', 'Radish leaves', 'Mustard oil', 'Garlic', 'Dried chilli', 'Timur', 'Salt'],
    ingredientsNp: ['कुहाएको रायोको साग', 'मुलाको साग', 'तोरीको तेल', 'लसुन', 'सुकेको खुर्सानी', 'टिमुर', 'नुन'],
    allergens: ['Mustard'],
    shelfLife: '9 months unopened, 1 month after opening',
    storageInstructions: 'Cool, dry place. Refrigerate after opening.',
    nutrition: { servingSize: '15 g', calories: 39, protein: 1.4, carbohydrates: 2.6, sugar: 0.5, fat: 2.8, sodium: 350 },
    variants: sizes(275),
    images: [
      { url: photo('1585032226651-759b368d7246'), alt: 'Fermented gundruk pickle in a traditional bowl' },
      { url: photo('1596797038530-2c107229654b'), alt: 'Gundruk achar served with rice' },
    ],
    isFeatured: true,
    keywords: ['gundruk achar', 'गुन्द्रुकको अचार', 'fermented pickle', 'nepali gundruk'],
    seo: {
      title: 'Gundruk Ko Achar - Sun-Fermented Nepali Pickle',
      description:
        'Traditionally sun-fermented gundruk tempered with garlic, chilli and timur. No vinegar, no artificial fermentation.',
      keywords: ['gundruk achar', 'गुन्द्रुक', 'fermented nepali pickle'],
    },
  },
  {
    name: 'Golbheda Ko Achar (Momo Chutney)',
    nameNp: 'गोलभेडाको अचार',
    slug: 'golbheda-ko-achar-momo-chutney',
    sku: 'AG-CHU-GOLBHEDA',
    categorySlug: 'chutneys',
    shortDescription:
      'Roasted tomato ground with sesame, garlic and dried chilli. The chutney that comes with every plate of momo.',
    shortDescriptionNp: 'पोलेको गोलभेडा, तिल, लसुन र सुकेको खुर्सानी पिसेर बनाइएको।',
    description:
      'Tomatoes are roasted over open flame until the skins blister and lift, then ground on a silauto with toasted sesame, garlic, dried chilli and a little timur. Roasting rather than boiling is the whole point - it is where the smokiness comes from, and a boiled chutney tastes flat beside it. Serve with momo, sekuwa, or anything fried.',
    descriptionNp:
      'गोलभेडालाई आगोमा पोलेर छाला निकालिन्छ, अनि भुटेको तिल, लसुन, सुकेको खुर्सानी र टिमुरसँग सिलौटामा पिसिन्छ।',
    spiceLevel: 'medium',
    ingredients: ['Tomato', 'Sesame seeds', 'Garlic', 'Dried chilli', 'Timur', 'Coriander', 'Salt'],
    ingredientsNp: ['गोलभेडा', 'तिल', 'लसुन', 'सुकेको खुर्सानी', 'टिमुर', 'धनिया', 'नुन'],
    allergens: ['Sesame'],
    shelfLife: '6 months unopened, 2 weeks after opening',
    storageInstructions: 'Refrigerate after opening and finish within two weeks.',
    nutrition: { servingSize: '15 g', calories: 34, protein: 1.1, carbohydrates: 3.2, sugar: 1.8, fat: 2.1, sodium: 240 },
    variants: sizes(250, { discount250: 220 }),
    images: [
      { url: photo('1565299624946-b28f40a0ae38'), alt: 'Tomato and sesame momo chutney in a bowl' },
      { url: photo('1534422298391-e4f8c172dddb'), alt: 'Momo served with tomato chutney' },
    ],
    isFeatured: true,
    isBestSeller: true,
    keywords: ['momo chutney', 'golbheda ko achar', 'गोलभेडाको अचार', 'tomato achar'],
    seo: {
      title: 'Golbheda Ko Achar - Nepali Momo Chutney',
      description:
        'Fire-roasted tomato chutney ground with sesame, garlic and timur. The classic Nepali momo achar.',
      keywords: ['momo chutney', 'golbheda ko achar', 'tomato pickle nepal'],
    },
  },
  {
    name: 'Dalle Khursani Achar',
    nameNp: 'डल्ले खुर्सानीको अचार',
    slug: 'dalle-khursani-achar',
    sku: 'AG-CHU-DALLE',
    categorySlug: 'chutneys',
    shortDescription:
      'Whole round chillies from the eastern hills, cured in oil and salt. Genuinely hot - a quarter spoon is a serving.',
    shortDescriptionNp: 'पूर्वी पहाडको डल्ले खुर्सानी, तेल र नुनमा मुछिएको। साँच्चै पिरो।',
    description:
      'Dalle khursani from Ilam is stemmed, slit and cured whole in mustard oil with garlic and salt. We do not deseed them and we do not blend them down, because both are ways of making dalle taste like something else. Around 100,000 Scoville. Treat it as a condiment, not a side dish.',
    descriptionNp:
      'इलामको डल्ले खुर्सानीलाई चिरेर तोरीको तेल, लसुन र नुनमा मुछिन्छ। बीउ निकालिँदैन। धेरै पिरो।',
    spiceLevel: 'extra-hot',
    ingredients: ['Dalle khursani', 'Mustard oil', 'Garlic', 'Salt', 'Timur'],
    ingredientsNp: ['डल्ले खुर्सानी', 'तोरीको तेल', 'लसुन', 'नुन', 'टिमुर'],
    allergens: ['Mustard'],
    shelfLife: '12 months unopened, 3 months after opening',
    storageInstructions: 'Keep the chillies submerged in oil. Refrigerate after opening.',
    nutrition: { servingSize: '5 g', calories: 21, protein: 0.2, carbohydrates: 0.6, sugar: 0.3, fat: 2.0, sodium: 190 },
    variants: sizes(310),
    images: [
      { url: photo('1583454110551-21f2fa2afe61'), alt: 'Round red dalle khursani chillies pickled in oil' },
      { url: photo('1596040033229-a9821ebd058d'), alt: 'Dalle khursani achar jar' },
    ],
    isBestSeller: true,
    keywords: ['dalle khursani', 'डल्ले खुर्सानी', 'hot pickle nepal', 'round chilli achar'],
    seo: {
      title: 'Dalle Khursani Achar - Nepali Round Chilli Pickle',
      description:
        'Whole Ilam dalle khursani cured in mustard oil with garlic. Extremely hot Nepali chilli pickle.',
      keywords: ['dalle khursani achar', 'डल्ले खुर्सानी', 'hot nepali pickle'],
    },
  },
  {
    name: 'Aap Ko Achar (Mango Pickle)',
    nameNp: 'आँपको अचार',
    slug: 'aap-ko-achar-mango-pickle',
    sku: 'AG-FRU-AAP',
    categorySlug: 'fruit-pickles',
    shortDescription:
      'Raw Terai mango cured with mustard, fennel and nigella. Sharp and sour rather than sweet.',
    shortDescriptionNp: 'तराईको काँचो आँप, तोरी, सौंफ र मुंगरेलसँग मुछिएको।',
    description:
      'Green mangoes from the Terai are cubed with the skin on, salted overnight to draw the water out, then cured in mustard oil with split mustard seed, fennel and nigella. The overnight salting is what stops the pickle going soft in the jar. This is the sour style, not the sweet chhundo - it belongs next to dal bhat, not on bread.',
    descriptionNp:
      'तराईको काँचो आँपलाई बोक्रासहित काटेर रातभर नुनमा राखिन्छ, अनि तोरीको तेल, तोरीको दाना, सौंफ र मुंगरेलमा मुछिन्छ।',
    spiceLevel: 'medium',
    ingredients: ['Raw mango', 'Mustard oil', 'Split mustard seed', 'Fennel', 'Nigella', 'Turmeric', 'Chilli', 'Salt'],
    ingredientsNp: ['काँचो आँप', 'तोरीको तेल', 'तोरीको दाना', 'सौंफ', 'मुंगरेल', 'बेसार', 'खुर्सानी', 'नुन'],
    allergens: ['Mustard'],
    shelfLife: '12 months unopened, 2 months after opening',
    storageInstructions: 'Keep the pickle covered in oil and use a dry spoon. No refrigeration needed if sealed.',
    nutrition: { servingSize: '15 g', calories: 46, protein: 0.4, carbohydrates: 3.1, sugar: 1.9, fat: 3.6, sodium: 380 },
    variants: sizes(285),
    images: [
      { url: photo('1553279768-865429fa0078'), alt: 'Raw mango pickle in mustard oil' },
      { url: photo('1591073113125-e46713c829ed'), alt: 'Green mangoes beside a pickle jar' },
    ],
    isNewArrival: true,
    keywords: ['aap ko achar', 'आँपको अचार', 'mango pickle', 'raw mango achar'],
    seo: {
      title: 'Aap Ko Achar - Nepali Raw Mango Pickle',
      description:
        'Sour raw mango pickle from Terai mangoes, cured in mustard oil with fennel and nigella.',
      keywords: ['aap ko achar', 'mango pickle nepal', 'आँपको अचार'],
    },
  },
  {
    name: 'Kauli Ra Gajar Ko Achar',
    nameNp: 'काउली र गाजरको अचार',
    slug: 'kauli-ra-gajar-ko-achar',
    sku: 'AG-VEG-KAULI',
    categorySlug: 'vegetable-pickles',
    shortDescription:
      'Cauliflower, carrot and green pea in a turmeric-mustard cure. The mixed pickle of Nepali winters.',
    shortDescriptionNp: 'काउली, गाजर र केराउ, बेसार र तोरीको मसलामा।',
    description:
      'Cauliflower florets, carrot batons and green peas are blanched briefly, dried, and cured in mustard oil with turmeric, ginger and split mustard. Blanching keeps the cauliflower crisp rather than chalky, which is the usual failure of mixed pickles. Mild enough for a household that cooks separately for children.',
    descriptionNp:
      'काउली, गाजर र केराउलाई छोटो समय उमालेर सुकाइन्छ, अनि तोरीको तेल, बेसार, अदुवा र तोरीको दानामा मुछिन्छ।',
    spiceLevel: 'mild',
    ingredients: ['Cauliflower', 'Carrot', 'Green peas', 'Mustard oil', 'Turmeric', 'Ginger', 'Mustard seed', 'Salt'],
    ingredientsNp: ['काउली', 'गाजर', 'केराउ', 'तोरीको तेल', 'बेसार', 'अदुवा', 'तोरीको दाना', 'नुन'],
    allergens: ['Mustard'],
    shelfLife: '8 months unopened, 1 month after opening',
    storageInstructions: 'Cool, dry place. Refrigerate after opening.',
    nutrition: { servingSize: '15 g', calories: 41, protein: 0.8, carbohydrates: 2.4, sugar: 1.1, fat: 3.2, sodium: 290 },
    variants: sizes(265),
    images: [
      { url: photo('1518977676601-b53f82aba655'), alt: 'Mixed cauliflower and carrot pickle' },
      { url: photo('1590779033100-9f60a05a013d'), alt: 'Mixed vegetable achar served with rice' },
    ],
    isNewArrival: true,
    keywords: ['kauli ko achar', 'mixed vegetable pickle', 'काउलीको अचार', 'gajar achar'],
    seo: {
      title: 'Kauli Ra Gajar Ko Achar - Nepali Mixed Vegetable Pickle',
      description:
        'Cauliflower, carrot and pea pickle cured in mustard oil with turmeric and ginger. Mild Nepali mixed achar.',
      keywords: ['mixed vegetable pickle nepal', 'kauli ko achar', 'काउलीको अचार'],
    },
  },
  {
    name: 'Sidra Maacha Ko Achar',
    nameNp: 'सिद्रा माछाको अचार',
    slug: 'sidra-maacha-ko-achar',
    sku: 'AG-MEA-SIDRA',
    categorySlug: 'meat-fish-pickles',
    shortDescription:
      'Small dried fish fried crisp with garlic, tomato and chilli. A Terai and Mithila household staple.',
    shortDescriptionNp: 'सुकेको सिद्रा माछा, लसुन, गोलभेडा र खुर्सानीसँग भुटेको।',
    description:
      'Sidra are dry-roasted first to drive off moisture, then fried with garlic, tomato, turmeric and chilli until the fish holds together but crumbles under a spoon. Dry-roasting before frying is what keeps the pickle from turning fishy in the jar. Strongly flavoured; a spoonful goes a long way with rice.',
    descriptionNp:
      'सिद्रालाई पहिले सुख्खा भुटेर पानी सुकाइन्छ, अनि लसुन, गोलभेडा, बेसार र खुर्सानीसँग भुटिन्छ।',
    spiceLevel: 'hot',
    isVegetarian: false,
    ingredients: ['Dried sidra fish', 'Mustard oil', 'Garlic', 'Tomato', 'Turmeric', 'Chilli', 'Salt'],
    ingredientsNp: ['सुकेको सिद्रा माछा', 'तोरीको तेल', 'लसुन', 'गोलभेडा', 'बेसार', 'खुर्सानी', 'नुन'],
    allergens: ['Fish', 'Mustard'],
    shelfLife: '6 months unopened, 3 weeks after opening',
    storageInstructions: 'Refrigerate after opening. Use a dry spoon and keep the lid tight.',
    nutrition: { servingSize: '15 g', calories: 63, protein: 6.2, carbohydrates: 1.0, sugar: 0.4, fat: 3.9, sodium: 460 },
    variants: sizes(430),
    images: [
      { url: photo('1611143669185-af224c5e3252'), alt: 'Dried sidra fish pickle with garlic and chilli' },
      { url: photo('1574484284002-952d92456975'), alt: 'Fish achar served with rice' },
    ],
    keywords: ['sidra achar', 'सिद्रा माछाको अचार', 'dried fish pickle', 'terai achar'],
    seo: {
      title: 'Sidra Maacha Ko Achar - Nepali Dried Fish Pickle',
      description:
        'Dried sidra fish fried with garlic, tomato and chilli. A Terai and Mithila household pickle.',
      keywords: ['sidra achar', 'dried fish pickle nepal', 'सिद्रा माछाको अचार'],
    },
  },
  {
    name: 'Sinki Ko Achar',
    nameNp: 'सिन्कीको अचार',
    slug: 'sinki-ko-achar',
    sku: 'AG-FER-SINKI',
    categorySlug: 'fermented-pickles',
    shortDescription:
      'Radish root fermented underground in a pit, then dried and tempered. Sharper and more sour than gundruk.',
    shortDescriptionNp: 'खाल्डोमा कुहाएको मुला, सुकाएर झानेको। गुन्द्रुकभन्दा बढी अमिलो।',
    description:
      'Radish roots are shredded, packed into a pit lined with straw and left to ferment underground for about a month, then dried and tempered with garlic, chilli and timur. Pit fermentation is slower and colder than the sun method used for gundruk, and it is why sinki is sharper. Traditionally simmered into a thin sour soup; equally good straight with rice.',
    descriptionNp:
      'मुलालाई च्यातेर परालले छोपिएको खाल्डोमा करिब एक महिना कुहाइन्छ, अनि सुकाएर लसुन, खुर्सानी र टिमुरले झानिन्छ।',
    spiceLevel: 'medium',
    ingredients: ['Fermented radish root', 'Mustard oil', 'Garlic', 'Dried chilli', 'Timur', 'Salt'],
    ingredientsNp: ['कुहाएको मुला', 'तोरीको तेल', 'लसुन', 'सुकेको खुर्सानी', 'टिमुर', 'नुन'],
    allergens: ['Mustard'],
    shelfLife: '9 months unopened, 1 month after opening',
    storageInstructions: 'Cool, dry place. Refrigerate after opening.',
    nutrition: { servingSize: '15 g', calories: 36, protein: 1.2, carbohydrates: 2.8, sugar: 0.6, fat: 2.4, sodium: 330 },
    variants: sizes(270),
    images: [
      { url: photo('1585032226651-759b368d7246'), alt: 'Fermented sinki radish pickle' },
      { url: photo('1596797038530-2c107229654b'), alt: 'Sinki achar in a serving bowl' },
    ],
    keywords: ['sinki achar', 'सिन्कीको अचार', 'fermented radish', 'nepali sinki'],
    seo: {
      title: 'Sinki Ko Achar - Pit-Fermented Nepali Radish Pickle',
      description:
        'Radish root fermented underground, dried and tempered with garlic and timur. Sharper than gundruk.',
      keywords: ['sinki achar', 'सिन्की', 'fermented radish pickle'],
    },
  },
  {
    name: 'Amala Ko Achar (Gooseberry)',
    nameNp: 'अमलाको अचार',
    slug: 'amala-ko-achar-gooseberry',
    sku: 'AG-FRU-AMALA',
    categorySlug: 'fruit-pickles',
    shortDescription:
      'Nepali gooseberry steamed and cured with rock salt, timur and a little jaggery. Bitter, sour and bracing.',
    shortDescriptionNp: 'अमलालाई बाफमा पकाएर बिरे नुन, टिमुर र थोरै सख्खरमा मुछिएको।',
    description:
      'Amala is steamed until the segments separate, then cured with rock salt, timur, cumin and just enough jaggery to take the edge off - not enough to make it sweet. Very high in vitamin C, and traditionally eaten a segment at a time after a meal rather than as a side dish.',
    descriptionNp:
      'अमलालाई बाफमा पकाएर बिरे नुन, टिमुर, जीरा र थोरै सख्खरमा मुछिन्छ। भिटामिन सी प्रशस्त।',
    spiceLevel: 'mild',
    ingredients: ['Amala (gooseberry)', 'Rock salt', 'Timur', 'Cumin', 'Jaggery', 'Dried chilli'],
    ingredientsNp: ['अमला', 'बिरे नुन', 'टिमुर', 'जीरा', 'सख्खर', 'सुकेको खुर्सानी'],
    allergens: [],
    shelfLife: '12 months unopened, 2 months after opening',
    storageInstructions: 'Cool, dry place. Refrigerate after opening.',
    nutrition: { servingSize: '15 g', calories: 29, protein: 0.3, carbohydrates: 6.4, sugar: 4.9, fat: 0.2, sodium: 260 },
    variants: sizes(300),
    images: [
      { url: photo('1591073113125-e46713c829ed'), alt: 'Amala gooseberry pickle in a jar' },
      { url: photo('1610970881699-44a5587cabec'), alt: 'Fresh amala fruit beside pickle' },
    ],
    isNewArrival: true,
    keywords: ['amala achar', 'अमलाको अचार', 'gooseberry pickle', 'vitamin c achar'],
    seo: {
      title: 'Amala Ko Achar - Nepali Gooseberry Pickle',
      description:
        'Steamed amala cured with rock salt, timur and jaggery. High in vitamin C, no artificial preservatives.',
      keywords: ['amala achar', 'gooseberry pickle nepal', 'अमलाको अचार'],
    },
  },
  {
    name: 'Dashain Special Hamper (Set of 4)',
    nameNp: 'दशैं विशेष सेट',
    slug: 'dashain-special-hamper',
    sku: 'AG-GIF-DASHAIN',
    categorySlug: 'gift-hampers',
    shortDescription:
      'Four 250g jars - radish, lapsi, gundruk and momo chutney - boxed with tamper-proof seals for gifting.',
    shortDescriptionNp: 'चार वटा २५० ग्रामका बट्टा - मुला, लप्सी, गुन्द्रुक र मम अचार, उपहारका लागि।',
    description:
      'Our four most-ordered pickles in 250g jars, packed in a rigid box with straw padding and tamper-proof seals on each lid. Sized and cushioned to survive courier handling to any district, and the commonest order we get in the weeks before Dashain and Tihar. A gift note can be added at checkout.',
    descriptionNp:
      'सबैभन्दा धेरै अर्डर हुने चार अचार २५० ग्रामका बट्टामा, बलियो बाकसमा प्याक गरिएको। दशैं-तिहारका लागि उपयुक्त।',
    spiceLevel: 'medium',
    ingredients: ['Mula ko achar', 'Lapsi ko achar', 'Gundruk ko achar', 'Golbheda ko achar'],
    ingredientsNp: ['मुलाको अचार', 'लप्सीको अचार', 'गुन्द्रुकको अचार', 'गोलभेडाको अचार'],
    allergens: ['Mustard', 'Sesame'],
    shelfLife: 'As per the individual jars inside',
    storageInstructions: 'Store the box in a cool, dry place. Refrigerate each jar after opening.',
    nutrition: { servingSize: '15 g', calories: 44, protein: 0.7, carbohydrates: 3.9, sugar: 2.8, fat: 2.7, sodium: 295 },
    /**
     * The one product whose sizes are not weights. Its variants are hamper
     * configurations, which is exactly why `size` is a free string on the variant
     * schema rather than an enum of 250g/500g/1kg.
     */
    variants: [
      {
        size: '4 jars (250g each)',
        sizeNp: '४ बट्टा',
        weightGrams: 1000,
        price: 1150,
        discountPrice: 1050,
        stock: 25,
        lowStockThreshold: 5,
        isDefault: true,
      },
      { size: '6 jars (250g each)', sizeNp: '६ बट्टा', weightGrams: 1500, price: 1680, stock: 15, lowStockThreshold: 4 },
    ],
    images: [
      { url: photo('1549465220-1a8b9238cd48'), alt: 'Gift hamper box of four Nepali pickle jars' },
      { url: photo('1607083206968-13611e3d76db'), alt: 'Pickle gift set packed for Dashain' },
    ],
    isFeatured: true,
    keywords: ['dashain gift', 'pickle hamper', 'उपहार सेट', 'tihar gift', 'achar gift box'],
    seo: {
      title: 'Dashain Special Pickle Hamper - Set of 4 Nepali Achar',
      description:
        'Gift hamper of four 250g Nepali pickle jars, sealed and boxed for Dashain and Tihar. Delivered across Nepal.',
      keywords: ['dashain gift hamper', 'pickle gift set nepal', 'उपहार सेट'],
    },
  },
];

export default { categories, products };
